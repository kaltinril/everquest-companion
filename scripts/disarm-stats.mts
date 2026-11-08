// disarm-stats.mts — every disarm attempt in the owner's logs, archived and live (owner, 2026-11-08:
// "how many SUCCESSFUL disarms there are, spit out the unique named mobs that worked and then give
// me an approx % of success rate ... once that mob was disarmed that fight, they may or may not be
// able to be disarmed again right away"; "create a script for this so we can re-do it on the whim").
//
//   npx tsx scripts/disarm-stats.mts                       # the live log from the dev store + its companion-archive
//   npx tsx scripts/disarm-stats.mts --log <eqlog.txt>     # another character's log (archive beside it)
//   npx tsx scripts/disarm-stats.mts --archive <dir>       # another archive folder (or --archive none)
//   npx tsx scripts/disarm-stats.mts --min 5               # per-mob table only for mobs with 5+ attempts (default 10)
//   npx tsx scripts/disarm-stats.mts --json                # the same numbers as JSON
//
// WHAT THE GAME PRINTS (measured in the live log):
//   success   `You disarmed <mob>!`      preceded by `<Mob> was disarmed!` (the broadcast, printed for
//                                        anyone's disarm, so it is NOT counted; only the `You` line is)
//   failure   `Your attempt to disarm failed.`   (no target named: it is read from your own melee line
//                                        within TARGET_WINDOW_MS, else "(target not seen)")
//   no roll   `You are too far away to disarm. Get closer.` / `You must target someone to disarm first.`
//             / `You cannot disarm yourself!`  — counted as wasted presses, never as attempts.
//
// A FIGHT with a mob runs from your first line naming it to `You have slain <mob>!`, `<mob> has been
// slain by`, or FIGHT_IDLE_MS without a line of yours naming it. Per fight the attempts before the
// first success and those after it are kept apart: the after-success numbers answer "can it be
// disarmed again right away".
//
// ARCHIVES: every `*.log.gz` in the archive folder plus the live log, read oldest first; a file whose
// lines fall before the latest second already read is skipped line by line (the Aug-Oct archive was
// written twice, the second copy 18 minutes longer).
//
// Reads only. Nothing in the app depends on this; it is an owner's measurement. First run
// (2026-11-08, Aug 12 to Nov 8): 32,458 attempts, 357 successes (1.1%), 0 of 655 attempts after a
// success in the same fight — a mob disarmed once stays disarmed for that fight (MEASURED.md).

import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'

const TARGET_WINDOW_MS = 10_000
const FIGHT_IDLE_MS = 90_000

// --- arguments ---------------------------------------------------------------------------------

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const asJson = argv.includes('--json')
const minAttempts = Number(flag('--min') ?? '10')

function liveLogFromStore(): string | undefined {
  const appData = process.env.APPDATA
  if (!appData) return undefined
  for (const dir of ['everquest-companion-dev', 'everquest-companion-test', 'everquest-companion']) {
    const p = join(appData, dir, 'everquest-companion-progress.json')
    if (!existsSync(p)) continue
    try {
      const store = JSON.parse(readFileSync(p, 'utf8')) as { activeLogPath?: unknown }
      if (typeof store.activeLogPath === 'string' && existsSync(store.activeLogPath)) return store.activeLogPath
    } catch {
      /* next store */
    }
  }
  return undefined
}

const liveLog = flag('--log') ?? liveLogFromStore()
if (!liveLog || !existsSync(liveLog)) {
  console.error('No log: pass --log <eqlog_Name_server.txt> (no app store named one)')
  process.exit(2)
}
const archiveArg = flag('--archive')
const archiveDir = archiveArg === 'none' ? undefined : (archiveArg ?? join(dirname(liveLog), 'companion-archive'))

// --- the files, oldest first --------------------------------------------------------------------

const TS_RE = /^\[(\w{3}) (\w{3}) (\d\d) (\d\d):(\d\d):(\d\d) (\d{4})\] (.*)$/
const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

function parseTs(m: RegExpMatchArray): number {
  return new Date(Number(m[7]), MONTHS[m[2]] ?? 0, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime()
}

interface Source {
  path: string
  gz: boolean
}

const sources: Source[] = []
if (archiveDir && existsSync(archiveDir)) {
  for (const f of readdirSync(archiveDir)) {
    if (f.endsWith('.log.gz')) sources.push({ path: join(archiveDir, f), gz: true })
  }
}
sources.push({ path: liveLog, gz: false })
// Archive names carry `_<from>_to_<to>`; the live log is newest. Lexical order of the names is date
// order for the archives (ISO dates), and a `_2` copy sorts after its twin so the longer one reads
// first only if it is listed first: sort by first timestamp read lazily below instead.

function openLines(src: Source) {
  const stream = src.gz ? createReadStream(src.path).pipe(createGunzip()) : createReadStream(src.path)
  return createInterface({ input: stream, crlfDelay: Infinity })
}

async function firstTimestamp(src: Source): Promise<number> {
  const rl = openLines(src)
  for await (const line of rl) {
    const m = TS_RE.exec(line)
    if (m) {
      rl.close()
      return parseTs(m)
    }
  }
  return Number.MAX_SAFE_INTEGER
}

// --- the tally --------------------------------------------------------------------------------

interface Fight {
  mob: string
  lastSeen: number
  attemptsBefore: number
  successes: number
  attemptsAfter: number
  successesAfter: number
  anyAttempt: boolean
}

interface MobTally {
  mob: string
  attempts: number
  successes: number
  fights: number
  fightsWithSuccess: number
  attemptsAfter: number
  successesAfter: number
  firstSuccessAt?: string
}

const mobs = new Map<string, MobTally>()
const tallyOf = (mob: string): MobTally => {
  let t = mobs.get(mob.toLowerCase())
  if (!t) {
    t = { mob, attempts: 0, successes: 0, fights: 0, fightsWithSuccess: 0, attemptsAfter: 0, successesAfter: 0 }
    mobs.set(mob.toLowerCase(), t)
  }
  return t
}

const totals = {
  files: [] as string[],
  firstLine: undefined as string | undefined,
  lastLine: undefined as string | undefined,
  lines: 0,
  successes: 0,
  failures: 0,
  tooFar: 0,
  noTarget: 0,
  self: 0,
  othersDisarms: 0,
  unattributedFailures: 0,
  fightsWithAttempt: 0,
  fightsWithSuccess: 0,
  attemptsBeforeFirstSuccess: 0,
  attemptsAfterSuccess: 0,
  successesAfterSuccess: 0
}

const fights = new Map<string, Fight>()
let lastTarget: { mob: string; at: number } | undefined

// Your own melee: `You punch X for N points of damage.` / `You try to kick X, but miss!` /
// `You try to punch X, but X dodges!`
const OWN_MELEE_RE =
  /^You (?:try to )?(?:punch|kick|strike|bash|cleave|hit|crush|slash|pierce|backstab|bite|frenzy|maul|claw|smash|slice|gore|sting|kicks|hits) (?:on )?(.+?)\s*(?:,| for \d+ points)/
const SLAIN_BY_YOU_RE = /^You have slain (.+)!$/
const SLAIN_RE = /^(.+) has been slain by /
const SUCCESS_RE = /^You disarmed (.+)!$/
const BROADCAST_RE = /^(.+) was disarmed!$/

function closeFight(key: string): void {
  const f = fights.get(key)
  if (!f) return
  fights.delete(key)
  if (!f.anyAttempt) return
  totals.fightsWithAttempt++
  const t = tallyOf(f.mob)
  t.fights++
  if (f.successes > 0) {
    totals.fightsWithSuccess++
    t.fightsWithSuccess++
  }
  totals.attemptsBeforeFirstSuccess += f.attemptsBefore
  totals.attemptsAfterSuccess += f.attemptsAfter
  totals.successesAfterSuccess += f.successesAfter
  t.attemptsAfter += f.attemptsAfter
  t.successesAfter += f.successesAfter
}

function fightOf(mob: string, at: number): Fight {
  const key = mob.toLowerCase()
  let f = fights.get(key)
  if (f && at - f.lastSeen > FIGHT_IDLE_MS) {
    closeFight(key)
    f = undefined
  }
  if (!f) {
    f = { mob, lastSeen: at, attemptsBefore: 0, successes: 0, attemptsAfter: 0, successesAfter: 0, anyAttempt: false }
    fights.set(key, f)
  }
  f.lastSeen = at
  return f
}

function sweepIdle(at: number): void {
  for (const [key, f] of fights) if (at - f.lastSeen > FIGHT_IDLE_MS) closeFight(key)
}

let pendingBroadcast: { mob: string; at: number } | undefined

function onSuccess(mob: string, at: number, stamp: string): void {
  if (pendingBroadcast?.at === at) pendingBroadcast = undefined
  totals.successes++
  const t = tallyOf(mob)
  t.attempts++
  t.successes++
  t.firstSuccessAt ??= stamp
  const f = fightOf(mob, at)
  f.anyAttempt = true
  if (f.successes > 0) {
    f.attemptsAfter++
    f.successesAfter++
  } else {
    f.attemptsBefore++
  }
  f.successes++
  lastTarget = { mob, at }
}

function onFailure(at: number): void {
  totals.failures++
  if (!lastTarget || at - lastTarget.at > TARGET_WINDOW_MS) {
    totals.unattributedFailures++
    return
  }
  tallyOf(lastTarget.mob).attempts++
  const f = fightOf(lastTarget.mob, at)
  f.anyAttempt = true
  if (f.successes > 0) f.attemptsAfter++
  else f.attemptsBefore++
}

/** `<Mob> was disarmed!`: yours is followed by `You disarmed X!` in the same second; anyone else's stands alone. */
function onBroadcast(mob: string, at: number): void {
  if (pendingBroadcast && pendingBroadcast.at !== at) totals.othersDisarms++
  pendingBroadcast = { mob, at }
}

function onNoRoll(text: string): void {
  if (text.startsWith('You are too far away to disarm')) totals.tooFar++
  else if (text.startsWith('You must target someone to disarm')) totals.noTarget++
  else if (text === 'You cannot disarm yourself!') totals.self++
}

function onLine(at: number, stamp: string, text: string): void {
  totals.lines++
  totals.firstLine ??= stamp
  totals.lastLine = stamp
  if (totals.lines % 50_000 === 0) sweepIdle(at)

  const melee = OWN_MELEE_RE.exec(text)
  if (melee) {
    lastTarget = { mob: melee[1], at }
    fightOf(melee[1], at)
    return
  }
  const slain = SLAIN_BY_YOU_RE.exec(text) ?? SLAIN_RE.exec(text)
  if (slain) {
    const key = slain[1].toLowerCase()
    if (fights.has(key)) closeFight(key)
    return
  }
  const bc = BROADCAST_RE.exec(text)
  if (bc) { onBroadcast(bc[1], at); return; }
  const ok = SUCCESS_RE.exec(text)
  if (ok) { onSuccess(ok[1], at, stamp); return; }
  if (text === 'Your attempt to disarm failed.') { onFailure(at); return; }
  onNoRoll(text)
}

// --- run --------------------------------------------------------------------------------------

const ordered = (await Promise.all(sources.map(async (s) => ({ s, first: await firstTimestamp(s) })))).sort((a, b) => a.first - b.first)
let coveredUntil = 0
for (const { s } of ordered) {
  let kept = 0
  let skipped = 0
  for await (const line of openLines(s)) {
    const m = TS_RE.exec(line)
    if (!m) continue
    const at = parseTs(m)
    if (at < coveredUntil) {
      skipped++
      continue
    }
    kept++
    onLine(at, line.slice(1, 25), m[8])
    if (at > coveredUntil) coveredUntil = at
  }
  totals.files.push(`${basename(s.path)} (${(statSync(s.path).size / 1_048_576).toFixed(1)} MB): ${kept} lines read${skipped ? `, ${skipped} already covered` : ''}`)
}
for (const key of [...fights.keys()]) closeFight(key)
if (pendingBroadcast) totals.othersDisarms++

// --- report -----------------------------------------------------------------------------------

const attempts = totals.successes + totals.failures
const pct = (n: number, d: number): string => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : 'n/a')
const isNamed = (mob: string): boolean => /^[A-Z]/.test(mob) && !/^(A|An) [a-z]/.test(mob)

const byMob = [...mobs.values()].sort((a, b) => b.successes - a.successes || b.attempts - a.attempts || a.mob.localeCompare(b.mob))
const disarmed = byMob.filter((m) => m.successes > 0)
const named = disarmed.filter((m) => isNamed(m.mob))
const common = disarmed.filter((m) => !isNamed(m.mob))

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ...totals,
        attempts,
        successRate: attempts > 0 ? totals.successes / attempts : null,
        firstSuccessRate: totals.attemptsBeforeFirstSuccess > 0 ? totals.fightsWithSuccess / totals.attemptsBeforeFirstSuccess : null,
        reDisarmRate: totals.attemptsAfterSuccess > 0 ? totals.successesAfterSuccess / totals.attemptsAfterSuccess : null,
        mobs: byMob
      },
      null,
      2
    )
  )
  process.exit(0)
}

console.log(`Disarm attempts in ${totals.files.length} file(s), ${totals.firstLine ?? '?'} .. ${totals.lastLine ?? '?'}:`)
for (const f of totals.files) console.log(`  ${f}`)
console.log()
console.log(`Attempts (a roll was made):      ${attempts}   = ${totals.successes} succeeded + ${totals.failures} failed`)
console.log(`Overall success rate:            ${pct(totals.successes, attempts)}`)
console.log(`Wasted presses (no roll):        ${totals.tooFar} too far away, ${totals.noTarget} no target, ${totals.self} on yourself`)
console.log(`Failures with no target seen:    ${totals.unattributedFailures} (no melee line of yours within ${TARGET_WINDOW_MS / 1000} s; counted above, not per mob)`)
console.log(`Someone else's disarms:          ${totals.othersDisarms} ("<Mob> was disarmed!" with no "You disarmed" line)`)
console.log()
console.log(`Fights with at least one attempt: ${totals.fightsWithAttempt}; fights where it worked: ${totals.fightsWithSuccess} (${pct(totals.fightsWithSuccess, totals.fightsWithAttempt)} of fights)`)
console.log(`  Per attempt, before the first success of a fight: ${pct(totals.fightsWithSuccess, totals.attemptsBeforeFirstSuccess)}  (${totals.fightsWithSuccess} of ${totals.attemptsBeforeFirstSuccess} attempts)`)
console.log(`  Per attempt, AFTER a success in the same fight:    ${pct(totals.successesAfterSuccess, totals.attemptsAfterSuccess)}  (${totals.successesAfterSuccess} of ${totals.attemptsAfterSuccess} attempts)`)
console.log()
console.log(`Unique mobs disarmed: ${disarmed.length} (${named.length} named, ${common.length} common)`)
console.log(`  Named:  ${named.map((m) => `${m.mob} x${m.successes}`).join(', ') || '(none)'}`)
console.log(`  Common: ${common.map((m) => `${m.mob} x${m.successes}`).join(', ') || '(none)'}`)
console.log()
console.log(`Per mob (${minAttempts}+ attempts), by successes:`)
console.log('  attempts  ok   rate    fights  ok-fights  after-ok(att/ok)  mob')
for (const m of byMob) {
  if (m.attempts < minAttempts) continue
  console.log(
    `  ${String(m.attempts).padStart(8)}  ${String(m.successes).padStart(3)}  ${pct(m.successes, m.attempts).padStart(6)}  ${String(m.fights).padStart(6)}  ${String(m.fightsWithSuccess).padStart(9)}  ${`${m.attemptsAfter}/${m.successesAfter}`.padStart(16)}  ${m.mob}${m.firstSuccessAt ? `   (first ${m.firstSuccessAt})` : ''}`
  )
}
