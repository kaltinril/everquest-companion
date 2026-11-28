/**
 * The e2e RUNNER: discovery, filters, a per-spec timeout, timings, and parallelism.
 *
 * It fails if ANY spec failed — unlike `a && b`, one spec's red exit cannot silently skip the
 * specs after it (which is exactly what happened while a known combat-header failure kept spec 1
 * at exit 1: `npm run test:e2e` never reached the overview spec at all).
 *
 * PARALLEL BY DEFAULT, which used to be forbidden: every spec shared one userData dir keyed by
 * the checkout, so concurrent specs deleted each other's stores and the tally from a contended
 * run was noise. The isolation unit is now ONE LAUNCH (appWindow.mts `launchApp`) and artifacts
 * are per run and per spec, so there is nothing left for two specs to fight over. `--serial`
 * stays for debugging, where interleaved output costs more than the wall clock saves.
 *
 *   npm run test:e2e                 every spec, 3 at a time (EQ_E2E_CONCURRENCY overrides)
 *   npm run test:e2e -- leveling     only the specs whose file name contains 'leveling'
 *   npm run test:e2e -- --serial     one at a time, output straight through, no retry
 *
 * LONGEST FIRST: specs start in the order of their last measured wall time (`pastTimes`), so the
 * four-minute specs are not the last ones started and the run does not end on one long spec
 * running alone. A spec never timed goes first, then alphabetical among equals.
 *
 * EVERY FAILURE IS RUN AGAIN, ALONE (2026-11-27). After the parallel pass, each spec that failed
 * is re-run once with nothing else running. Passed alone: "flaky under load", listed loudly in
 * the summary and in summary.json, and the run still exits 0. Failed both times: "red", and the
 * run exits 1. This replaces gating with `--serial`, which cost an hour for the same answer.
 *
 * Per-spec wall time is printed as a table and written to artifacts/<runId>/summary.json.
 * EQ_E2E_SPEC_TIMEOUT_MS overrides the 5-minute per-spec cap. The whole run is below normal priority.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { constants, setPriority } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reapOrphanUserData } from './appWindow.mjs'
import { buildIfStale } from './build.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const TIMEOUT_MS = Number(process.env.EQ_E2E_SPEC_TIMEOUT_MS ?? 300_000)
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const RUN_DIR = join(ROOT, 'tests', 'e2e', 'artifacts', RUN_ID)

const argv = process.argv.slice(2)
const serial = argv.includes('--serial')
const filters = argv.filter((a) => !a.startsWith('--'))

/**
 * THREE AT A TIME, overridable with EQ_E2E_CONCURRENCY (it was min(4, cores/2)). Each spec is a
 * full Electron app plus its engine; three leaves the owner's desktop room at below-normal priority
 * and keeps the engine's 10 s port announce clear of starvation (WORKFLOW.md, the CPU-starvation
 * trap), and the alone-retry below catches what load still breaks.
 */
const CONCURRENCY = serial ? 1 : Math.max(1, Number(process.env.EQ_E2E_CONCURRENCY ?? 3) || 3)

interface Result {
  spec: string
  ms: number
  status: number | null
  timedOut: boolean
}

/** A spec's verdict once the alone-retry has had its say. */
type Verdict = 'ok' | 'flaky under load' | 'red'

/** Kill the spec AND the Electron it launched — a bare kill leaves the app holding its dir. */
function killTree(pid: number): void {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'])
  else process.kill(-pid, 'SIGKILL')
}

/**
 * `attempt` 2 is the alone-retry: its evidence goes to `<spec>-retry/` so the first attempt's
 * failure dumps, the ones worth reading, are not overwritten by the run that passed.
 */
function runSpec(spec: string, attempt = 1): Promise<Result> {
  const name = spec.replace(/\.e2e\.mts$/, '') + (attempt > 1 ? '-retry' : '')
  // The default cap, unless this spec is one the default cannot honestly hold — see SPEC_TIMEOUT_MS.
  const capMs = SPEC_TIMEOUT_MS[basename(spec)] ?? TIMEOUT_MS
  const t0 = Date.now()
  return new Promise<Result>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(here, spec)], {
      // Serial mode streams straight through; in parallel, interleaved lines from four apps are
      // unreadable, so each spec's output is held and printed as one block when it finishes.
      stdio: serial ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      env: { ...process.env, EQ_E2E_RUN_ID: RUN_ID, EQ_E2E_SPEC: name }
    })
    const out: string[] = []
    child.stdout?.on('data', (b: Buffer) => out.push(b.toString()))
    child.stderr?.on('data', (b: Buffer) => out.push(b.toString()))

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid) killTree(child.pid)
    }, capMs)

    child.on('close', (status) => {
      clearTimeout(timer)
      const ms = Date.now() - t0
      if (!serial) {
        const text = out.join('')
        const label = attempt > 1 ? `${spec} (retry, alone)` : spec
        console.log(`\n${'─'.repeat(70)}\n[e2e] ${label} — ${(ms / 1000).toFixed(1)}s\n${text}`)
        try {
          mkdirSync(join(RUN_DIR, name), { recursive: true })
          writeFileSync(join(RUN_DIR, name, 'output.log'), text, 'utf8')
        } catch {
          // Evidence is a nicety here; the verdict below is what the caller acts on.
        }
      }
      if (timedOut) console.error(`[e2e] ${spec} TIMED OUT after ${String(capMs)}ms`)
      resolve({ spec, ms, status, timedOut })
    })
  })
}

/**
 * SPECS THAT MUST NOT SHARE THE MACHINE — EMPTY, AND THE EMPTINESS WAS EARNED (JOS-501).
 *
 * This list existed because every launch spawns a Rust engine beside the app and the harness built
 * that engine in DEBUG, so a full sweep meant up to four unoptimised engines folding at once. It
 * carried its own instruction: *"THE REAL FIX IS A RELEASE ENGINE FOR THE SUITE. Delete this list
 * the day it is made."* JOS-501 made it — `buildEngineIfStale` builds `--release`, and the harness
 * hands the app that binary outright (`EQ_ENGINE_BIN`) so a spec cannot quietly be given the other
 * one back. (The debug-first order that made the hand-over load-bearing is itself gone — JOS-520
 * made debug an explicit per-launch opt-in the harness never sets.)
 *
 * THE MEASUREMENT THAT EARNED THE DELETION. `bosses-week` — the only entry, and the worst case,
 * because it launches TWICE on the owner's REAL INSTALL and each launch waits on a whole-log fold:
 *
 *   debug    the go-live sentence had NOT arrived at 900 s. A timeout, not a duration.
 *   release  52.5 s per fold; the spec green end to end in 145.5 s, alone on the machine.
 *
 * The list is kept as an empty constant rather than deleted outright because `runAll` partitions on
 * it and the next spec that genuinely cannot share a machine should land here with its measurement
 * beside it — not because anything is expected to.
 *
 * ── AND THE ENTRY THAT WAS NEVER THE PROBLEM ──────────────────────────────────────────────────
 *
 * Removing the quarantine does NOT restore what put `bosses-week` here. Its two roster assertions
 * were settling on a card count through a 30 s per-step cap, and what they were really waiting for
 * was a whole-log fold that cap knew nothing about. That is fixed in the spec itself, where it
 * belongs: it now waits for the app to say it is serving from the engine before it reads a roster —
 * the condition, never the clock. A release engine made the spec finishable; the missing wait is
 * what made it pass.
 */
const SOLO_SPECS: string[] = []

// ── A CORRECTION, KEPT BECAUSE THE WRONG DIAGNOSIS IS INSTRUCTIVE (JOS-499) ────────────────────
//
// THIS LIST FIRST HELD `buffs-overlay` AND `engine-alert-fires`, on the reasoning that they passed
// standalone and failed under a full sweep, so they must be losing a race for the machine. Both
// were wrong, and running them ALONE is what proved it — they failed there too, with the real
// causes visible:
//
//   * `engine-alert-fires` was a HARNESS DEFECT I introduced: `launchOnFixture` began waiting for
//     the engine's go-live sentence by tapping the output, and `tapOutput` handed every caller a
//     FRESH buffer — so the spec's own tap started empty and could never see a line already past.
//     Fixed at the tap (`engineSteps.mts TAPS`), which also makes `said()` mean what it says.
//   * `buffs-overlay` was that same wait doing its job too well. Its subject is the MID-FOLD
//     hydrate, and a wait that guarantees the fold has landed removes the only window the defect
//     can appear in. It opts out by name now.
//
// THE LESSON, and the reason this note outlives the mistake: "green alone, red in the sweep" is
// evidence of a TIMING dependence, not of contention specifically — and after this cutover the
// commonest timing dependence is on the engine's fold, which a harness change can move in either
// direction. Diagnose the spec before quarantining it; a quarantine that hides a real defect is
// worse than the red it silenced.

/**
 * PER-SPEC CAPS, for the specs the 5-minute default cannot honestly hold — NONE, since JOS-501.
 *
 * `bosses-week` was the only entry, at 900 s, and that number was explicitly NOT a measured fold
 * plus margin: a probe with a DEBUG engine had not seen the go-live sentence at 900 s, so the cap
 * was sized to the configuration in which the spec COULD pass rather than to anything observed. Its
 * own docblock carried the instruction — *"the day it lands, this entry goes"* — and the release
 * engine landed in JOS-501.
 *
 * NOW THERE IS A MEASUREMENT, and it is what justifies falling back to the default rather than
 * picking a smaller special number: `bosses-week` runs GREEN in 145.5 s against the release engine
 * (52.5 s per whole-log fold, two launches), alone on the machine, which is under half the 300 s
 * default. It is deliberately no longer in `SOLO_SPECS` either, so the sweep runs it packed and the
 * default cap is the one that has to hold — re-measure here, do not re-add a cap on a hunch, if a
 * future sweep ever puts it near the edge.
 */
// `tradeskills` held the last entry, 480 s, as one launch walking the whole section (279 s at 256
// checks on 2026-11-20). It is two specs now (`tradeskills`, `tradeskills-log`), each with its own
// launch, so each is that run minus the other's steps and the default cap applies. Not yet timed.
const SPEC_TIMEOUT_MS: Record<string, number> = {}

/** Run at most CONCURRENCY specs at once, in the order given (longest first), then the solo ones alone. */
async function runAll(specs: string[]): Promise<Result[]> {
  const solo = specs.filter((s) => SOLO_SPECS.includes(basename(s)))
  const packed = specs.filter((s) => !SOLO_SPECS.includes(basename(s)))
  const results: Result[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < packed.length) results.push(await runSpec(packed[next++]))
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, packed.length) }, worker))
  // …and the ones that need the machine to themselves, strictly one at a time.
  for (const s of solo) results.push(await runSpec(s))
  return results
}

/**
 * Re-run each failed spec ONCE, strictly one at a time, so "red only when it shares the machine"
 * is told apart from "red". Skipped for `--serial` and a one-spec run, whose first attempt was
 * already alone: running it again would call a plain flake "under load".
 */
async function retryAlone(first: Result[], ranAlone: boolean): Promise<Map<string, Result>> {
  const retried = new Map<string, Result>()
  const failed = first.filter((r) => r.status !== 0)
  if (ranAlone || failed.length === 0) return retried
  console.log(`\n[e2e] ${String(failed.length)} spec(s) failed in the parallel pass; running each again, alone`)
  for (const r of failed) retried.set(r.spec, await runSpec(r.spec, 2))
  return retried
}

function verdictOf(r: Result, retry: Result | undefined): Verdict {
  if (r.status === 0) return 'ok'
  return retry?.status === 0 ? 'flaky under load' : 'red'
}

/**
 * LONGEST FIRST, from what the last runs measured. Reads the newest `summary.json` files in this
 * tree's artifacts and, for a worktree under `<clone>/.claude/worktrees/`, the clone's as well (a
 * fresh worktree has none, and the gate always runs in a fresh one). The newest time per spec
 * wins. No times at all: alphabetical, as the runner always was.
 */
function pastTimes(): Map<string, number> {
  const dirs = [join(ROOT, 'tests', 'e2e', 'artifacts')]
  const parts = ROOT.split(/[\\/]/)
  if (parts.at(-2) === 'worktrees' && parts.at(-3) === '.claude') {
    dirs.push(join(ROOT, '..', '..', '..', 'tests', 'e2e', 'artifacts'))
  }
  const runs: { id: string; file: string }[] = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const id of readdirSync(dir)) runs.push({ id, file: join(dir, id, 'summary.json') })
  }
  runs.sort((a, b) => b.id.localeCompare(a.id))
  const times = new Map<string, number>()
  for (const run of runs.slice(0, 40)) {
    for (const r of summaryRows(run.file)) if (!times.has(r.spec) && r.ms > 0) times.set(r.spec, r.ms)
  }
  return times
}

function summaryRows(file: string): Result[] {
  try {
    return (JSON.parse(readFileSync(file, 'utf8')) as { specs?: Result[] }).specs ?? []
  } catch {
    return [] // No summary (a killed run) or an older shape: the next run may have it.
  }
}

/** Never timed first (it may be long), then longest first, then alphabetical. */
function longestFirst(specs: string[], times: Map<string, number>): string[] {
  const t = (s: string): number => times.get(s) ?? Number.POSITIVE_INFINITY
  return [...specs].sort((a, b) => (t(a) === t(b) ? a.localeCompare(b) : t(b) - t(a)))
}

function report(results: Result[], retried: Map<string, Result>, wallMs: number): number {
  const rows = [...results]
    .sort((a, b) => b.ms - a.ms)
    .map((r) => ({ ...r, verdict: verdictOf(r, retried.get(r.spec)), retryMs: retried.get(r.spec)?.ms }))
  const width = Math.max(...rows.map((r) => r.spec.length))
  console.log(`\n${'═'.repeat(70)}\n[e2e] run ${RUN_ID}`)
  for (const r of rows) {
    const first = r.timedOut ? 'TIMEOUT' : r.status === 0 ? 'ok' : `exit ${String(r.status)}`
    const then = r.retryMs === undefined ? '' : ` -> alone ${(r.retryMs / 1000).toFixed(1)}s: ${r.verdict.toUpperCase()}`
    console.log(`  ${r.spec.padEnd(width)}  ${(r.ms / 1000).toFixed(1).padStart(7)}s  ${first}${then}`)
  }
  const flaky = rows.filter((r) => r.verdict === 'flaky under load').map((r) => r.spec)
  const red = rows.filter((r) => r.verdict === 'red').map((r) => r.spec)
  try {
    mkdirSync(RUN_DIR, { recursive: true })
    writeFileSync(
      join(RUN_DIR, 'summary.json'),
      JSON.stringify({ runId: RUN_ID, concurrency: CONCURRENCY, wallMs, flaky, red, specs: rows }, null, 2),
      'utf8'
    )
  } catch (err) {
    console.log(`[e2e] could not write summary.json — ${String(err)}`)
  }
  // LOUD ON PURPOSE: a flake passes the run, so these lines are the only place it shows.
  if (flaky.length > 0) {
    console.log(`\n[e2e] FLAKY UNDER LOAD (failed in parallel, passed alone): ${flaky.join(', ')}`)
  }
  if (red.length > 0) console.log(`\n[e2e] RED (failed in parallel and again alone): ${red.join(', ')}`)
  const green = results.length - red.length - flaky.length
  console.log(
    `\n[e2e] ${String(green)}/${String(results.length)} specs green first time · ${String(flaky.length)} flaky under load · ${String(red.length)} red · ${(wallMs / 1000).toFixed(1)}s wall · artifacts/${RUN_ID}/`
  )
  return red.length
}

const specs = longestFirst(
  readdirSync(here)
    .filter((f) => f.endsWith('.e2e.mts'))
    .filter((f) => filters.length === 0 || filters.some((needle) => f.includes(needle))),
  pastTimes()
)

if (specs.length === 0) {
  console.error(`[e2e] no spec matches ${filters.join(', ')}`)
  process.exit(1)
}

// BELOW NORMAL, the runner and everything it starts (Windows hands the class down to children:
// the cargo and electron-vite builds, every spec, its Electron). The owner keeps using the machine
// while a sweep runs; the engine already runs below normal on its own.
try {
  setPriority(constants.priority.PRIORITY_BELOW_NORMAL)
} catch {
  // A platform that refuses leaves the sweep at normal priority, which is how it always ran.
}

// Build ONCE here rather than letting four specs discover staleness at the same instant (each
// still calls buildIfStale and finds the output fresh), and sweep userData dirs from runs that
// were killed before they could clean up after themselves.
//
// BOTH BINARIES SINCE JOS-490: `buildIfStale()` now asks cargo's gate as well as electron-vite's,
// because the harness launches every app with `EQC_ENGINE=1` and a spec handed a stale or missing
// `engined.exe` would take the engine's ABSENCE path and go quietly green.
buildIfStale()
const reaped = reapOrphanUserData()
if (reaped > 0) console.log(`[e2e] reaped ${String(reaped)} orphaned userData dir(s) older than 24h`)
console.log(
  `[e2e] ${String(specs.length)} spec(s), ${serial ? 'serial' : `${String(CONCURRENCY)} at a time, longest first, failures retried alone`}, ${String(TIMEOUT_MS / 1000)}s cap each`
)

const started = Date.now()
const first = await runAll(specs)
const retried = await retryAlone(first, CONCURRENCY === 1 || specs.length === 1)
const red = report(first, retried, Date.now() - started)
process.exit(red === 0 ? 0 : 1)
