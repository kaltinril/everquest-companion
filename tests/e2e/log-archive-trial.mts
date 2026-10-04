/**
 * log-archive-trial.mts — THE OWNER'S TRIAL, AUTOMATED (docs/plans/log-archive, step 3.7).
 *
 * NOT PART OF THE SUITE: the name does not end `.e2e.mts`, so `run-all.mts` never picks it up. It
 * runs on a COPY of a real log that the caller names, in a temp install folder with its own
 * settings folder, so the player's live log and real settings are never touched:
 *
 *   LOG_ARCHIVE_TRIAL_LOG=<path to a copy of eqlog_<Char>_<server>.txt> \
 *   LOG_ARCHIVE_TRIAL_TABLES=<EverQuest folder, for spells_us*.txt and dbstr_us.txt; optional> \
 *   EQ_ENGINE_BIN=<engined.exe; optional> node --import tsx tests/e2e/log-archive-trial.mts
 *
 * What it does, in one app run after another on the same settings folder:
 *   1. fold the log, record every merged module, turn Keep log history on, archive the log;
 *      the same session must still show the same history (the engine's memory);
 *   2. relaunch: the fresh log plus the archive must show the same history again;
 *   3. append new lines: they must add to the history, not replace it;
 *   4. put the log back, relaunch: the log must be the original bytes plus the new lines, and the
 *      history must not be counted twice.
 */

import type { ElectronApplication, Page } from 'playwright-core'
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { buildIfStale } from './build.mjs'
import { check, note, reportRun } from './appHarness.mjs'
import { launchApp, mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { settleEngineServing } from './engineSteps.mjs'

const SOURCE = process.env.LOG_ARCHIVE_TRIAL_LOG
const TABLES = process.env.LOG_ARCHIVE_TRIAL_TABLES
const MODULES = ['kills', 'loot', 'leveling', 'consider', 'itemTiers', 'classUnlocks', 'turnins', 'respawn', 'progression']

type Snaps = Record<string, unknown>

interface Reply {
  ok: boolean
  message: string
  status: { segments: { id: string; state: string }[]; held: { id: string; text: string }[]; newestSealedId: string | null }
}

function sha(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function stage(): { installDir: string; logPath: string } {
  if (SOURCE === undefined || !existsSync(SOURCE)) throw new Error('set LOG_ARCHIVE_TRIAL_LOG to a COPY of a real log')
  const installDir = mkdtempSync(join(tmpdir(), 'log-archive-trial-'))
  mkdirSync(join(installDir, 'Logs'))
  // A backup named `eqlog_<Char>_<server>.<anything>` is staged under the live name the app expects.
  const stem = /^(eqlog_[^.]+)/i.exec(basename(SOURCE))?.[1] ?? 'eqlog_Trial_server'
  const logPath = join(installDir, 'Logs', `${stem}.txt`)
  copyFileSync(SOURCE, logPath)
  for (const t of ['spells_us.txt', 'spells_us_str.txt', 'dbstr_us.txt']) {
    if (TABLES !== undefined && existsSync(join(TABLES, t))) copyFileSync(join(TABLES, t), join(installDir, t))
  }
  return { installDir, logPath }
}

async function snaps(page: Page): Promise<Snaps> {
  return page.evaluate(async (ids) => {
    const out: Record<string, unknown> = {}
    for (const id of ids) out[id] = (await window.eq.getModuleSnapshot(id))?.state ?? null
    return out
  }, MODULES)
}

/** A one-line size of each module, so a difference reads at a glance. */
function shape(s: Snaps): string {
  const size = (v: unknown): string => {
    if (Array.isArray(v)) return String(v.length)
    if (v === null || typeof v !== 'object') return String(v)
    const o = v as Record<string, unknown>
    if (o.mobs !== undefined) return `${Object.keys(o.mobs as object).length} mobs`
    if (Array.isArray(o.levels)) return `${(o.levels as unknown[]).length} levels/${(o.aaGains as unknown[]).length} aa`
    return `${Object.keys(o).length} keys`
  }
  return MODULES.map((m) => `${m}=${size(s[m])}`).join(' ')
}

/** Where the trial writes each snapshot set, for diffing a failure. */
const DUMP = process.env.LOG_ARCHIVE_TRIAL_DUMP

function dump(name: string, s: Snaps): void {
  if (DUMP !== undefined) writeFileSync(join(DUMP, `${name}.json`), JSON.stringify(s))
}

/** One log line stamped now, the way the game prints it. */
function line(text: string): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `[${days[d.getDay()]} ${months[d.getMonth()]} ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${d.getFullYear()}] ${text}\r\n`
}

function killsOf(s: Snaps, key: string): number {
  return ((s.kills as { mobs: Record<string, { count: number }> }).mobs[key] ?? { count: 0 }).count
}

/** JSON with object keys sorted, so two maps holding the same entries in another order compare equal. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x !== null && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([p], [q]) => p.localeCompare(q)))
      : x
  )
}

/**
 * Fields a fresh log cannot know until the game prints them again, so they may differ after an
 * archive (the plan's "what is lost"): the zone the respawn card is showing, and the zone of a kill
 * made in the fresh log before its first zone line (filed under "unknown zone", counted all the
 * same, on the respawn card's recent row and in the kill's tier key).
 */
function withoutLiveContext(s: Snaps): Snaps {
  const out = structuredClone(s)
  const respawn = out.respawn as { zone?: unknown; recent?: { key: string; zone?: string }[] } | null
  if (respawn !== null && typeof respawn === 'object') {
    delete respawn.zone
    for (const r of respawn.recent ?? []) if (r.key.endsWith(' rat')) delete r.zone
  }
  const mobs = (out.kills as { mobs?: Record<string, unknown> } | null)?.mobs ?? {}
  for (const key of Object.keys(mobs)) if (key.endsWith(' rat')) delete mobs[key]
  return out
}

function compare(label: string, a0: Snaps, b0: Snaps): void {
  const a = withoutLiveContext(a0)
  const b = withoutLiveContext(b0)
  for (const m of MODULES) {
    const same = canon(a[m]) === canon(b[m])
    check(`${label}: ${m} matches`, same, same ? '' : `before ${shape({ [m]: a[m] } as Snaps).split(' ').find((x) => x.startsWith(m))} / after ${shape({ [m]: b[m] } as Snaps).split(' ').find((x) => x.startsWith(m))}`)
  }
}

async function open(installDir: string, userData: string): Promise<{ app: ElectronApplication; page: Page; close: () => Promise<void> }> {
  const env: Record<string, string> = {}
  if (process.env.EQ_ENGINE_BIN !== undefined) env.EQ_ENGINE_BIN = process.env.EQ_ENGINE_BIN
  const began = Date.now()
  const launched = await launchApp({ installDir, userData, env })
  const page = await mainWindow(launched.app)
  const served = await settleEngineServing(launched.app, 600_000)
  note(`engine ${served ? 'serving' : 'NOT serving'} after ${((Date.now() - began) / 1000).toFixed(0)} s`)
  return { app: launched.app, page, close: launched.close }
}

function call<T>(page: Page, fn: string, arg?: string | boolean): Promise<T> {
  return page.evaluate(async ([f, a]) => {
    const api = window.eq as unknown as Record<string, (x?: unknown) => Promise<unknown>>
    return (a === undefined ? api[f as string]() : api[f as string](a)) as Promise<never>
  }, [fn, arg] as const) as Promise<T>
}

async function main(): Promise<void> {
  buildIfStale()
  const { installDir, logPath } = stage()
  const userData = makeUserData()
  const originalSha = sha(logPath)
  note(`staged ${statSync(logPath).size.toLocaleString()} bytes at ${logPath}`)

  // 1. Fold, record, archive.
  let run = await open(installDir, userData)
  const before = await snaps(run.page)
  note(`before: ${shape(before)}`)
  check('the switch starts off', (await call<{ enabled: boolean }>(run.page, 'logArchiveStatus')).enabled === false)
  await call(run.page, 'setLogArchiveEnabled', true)
  const rotated = await call<Reply>(run.page, 'logArchiveRotate')
  check('archive succeeds', rotated.ok, rotated.message)
  check('the live log is fresh', statSync(logPath).size < 1024, `${statSync(logPath).size} bytes`)
  const archives = readdirSync(join(userData, 'log-archive')).filter((f) => f.endsWith('.log.gz'))
  check('one compressed archive exists', archives.length === 1, archives.join(', '))
  if (archives.length === 1) note(`archive ${statSync(join(userData, 'log-archive', archives[0])).size.toLocaleString()} bytes`)
  await new Promise((r) => setTimeout(r, 3000))
  compare('same session after archiving', before, await snaps(run.page))
  // The game's next line is the FIRST line of the fresh log. Is it counted while the app runs?
  appendFileSync(logPath, line('You have slain a first rat!'))
  await new Promise((r) => setTimeout(r, 4000))
  const firstLive = await snaps(run.page)
  dump('1-before', before)
  dump('1b-first-line-live', firstLive)
  check('the first line of the fresh log is counted live', killsOf(firstLive, 'a first rat') === 1, `${killsOf(firstLive, 'a first rat')}`)
  await run.close()

  // 2. Relaunch on the fresh log.
  run = await open(installDir, userData)
  const after = await snaps(run.page)
  dump('2-after-relaunch', after)
  note(`after relaunch: ${shape(after)}`)
  check('the first line of the fresh log is counted at the next launch', killsOf(after, 'a first rat') === 1, `${killsOf(after, 'a first rat')}`)
  // Against the running session just after the first line was counted: both hold the same lines.
  compare('next launch, archive + fresh log', firstLive, after)

  // 3. New lines add to the history.
  appendFileSync(logPath, line('You have slain a trial rat!') + line('You have gained a level! Welcome to level 61!'))
  await new Promise((r) => setTimeout(r, 4000))
  const grown = await snaps(run.page)
  dump('3-grown', grown)
  const ratKills = killsOf(grown, 'a trial rat')
  check('a new kill is counted on top of the archived history', ratKills >= 1, `${ratKills}`)
  const mobsBefore = Object.keys((before.kills as { mobs: object }).mobs).length
  const mobsNow = Object.keys((grown.kills as { mobs: object }).mobs).length
  check('archived kills are still there', mobsNow >= mobsBefore, `${mobsBefore} -> ${mobsNow}`)

  // 4. Put the log back. The app restarts itself after a restore; the trial closes it first.
  const st = await call<Reply['status']>(run.page, 'logArchiveStatus')
  const restored = await call<Reply>(run.page, 'logArchiveRestore', st.newestSealedId ?? '')
  check('put back succeeds', restored.ok, restored.message)
  await run.app.close().catch(() => undefined)
  const appended = readFileSync(logPath)
  const original = readFileSync(SOURCE as string)
  check('the log is the original bytes followed by the new lines', appended.subarray(0, original.length).equals(original) && sha(logPath) !== originalSha, `${appended.length.toLocaleString()} bytes`)
  run = await open(installDir, userData)
  const back = await snaps(run.page)
  dump('4-restored', back)
  const backKills = (back.kills as { mobs: Record<string, { count: number }> }).mobs
  const grownKills = (grown.kills as { mobs: Record<string, { count: number }> }).mobs
  const doubled = Object.keys(grownKills).filter((k) => (backKills[k]?.count ?? 0) > grownKills[k].count)
  check('nothing is counted twice after putting it back', doubled.length === 0, doubled.slice(0, 5).join(', '))
  note(`after restore: ${shape(back)}`)
  await run.close()

  await removeUserData(userData)
  await removeUserData(installDir)
  reportRun()
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
