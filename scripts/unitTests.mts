/**
 * unitTests.mts — the unit suite's runner (`npm test`, under scripts/testGate.mts).
 *
 * WHY: every test file used to get its own process, and each of the ~140 files that touch the big
 * catalogs (items.json 9 MB, mobs.json 6 MB, spells.json 1 MB) parsed them again: 1.5-1.9 s per
 * such file against 0.3 s for a pure one. Here most files run POOLED: a few long-lived processes,
 * each importing its share of the files one after another, so a pool loads each catalog once.
 *
 * HOW: node's own runner (`run()` from node:test, the spec reporter, one summary), with
 * `concurrency` processes at most, as before. Each pool is one generated wrapper module that
 * imports its files in turn; a file that throws while loading becomes a failing test named after
 * it, so nothing is lost silently (`--test-isolation=none` drops such a throw when the file had
 * already registered a test, which is why it is not used). The ISOLATED files run one process
 * each, exactly as before. Pools and isolated files start longest first, by the last run's
 * per-file times (TIMES_FILE); a file never timed starts first.
 *
 * WHICH FILES ARE ISOLATED: the ones whose source matches a rule in ISOLATION_RULES (each rule
 * names the shared-process hazard it guards), plus the files named in scripts/unit-isolated.txt
 * (a leak a pattern cannot express, each with its reason). `--list` prints the split and the rule
 * behind each isolated file. `EQC_UNIT_ISOLATE_ALL=1` runs every file in its own process (the old
 * way), to tell a pooling leak from a real failure.
 *
 *   node --import tsx scripts/unitTests.mts [--test-concurrency=N] [--list] [tests/x.test.mts ...]
 *
 * The runner and every test process it starts run at below-normal priority (Windows children
 * inherit the class), so the PC stays usable while the suite runs.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, constants, setPriority, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { run } from 'node:test'
import { spec } from 'node:test/reporters'
import { pathToFileURL } from 'node:url'

/** A file whose source matches any of these runs in its own process. Keep each rule's reason. */
export const ISOLATION_RULES: readonly { name: string; re: RegExp; why: string }[] = [
  { name: 'mock-timers', re: /\bmock\.timers\b/, why: 'fake timers are process-wide while enabled' },
  {
    name: 'env-write',
    re: /process\.env(\.[\w$]+|\[[^\]]+\])\s*=(?!=)|delete\s+process\.env|Object\.assign\(\s*process\.env/,
    why: 'process.env is shared by every file in a process'
  },
  { name: 'globalThis', re: /\bglobalThis\b|\bglobal\.[\w$]+\s*=(?!=)/, why: 'stubs a global (window, fetch, localStorage ...)' },
  { name: 'child-process', re: /child_process|worker_threads|new Worker\(/, why: 'spawns processes or threads' },
  { name: 'top-level-hook', re: /^(before|beforeEach|after|afterEach)\(/m, why: 'a top-level hook would run around every pooled file' },
  {
    name: 'process-hooks',
    re: /process\.(on|once|off|removeListener|removeAllListeners|exit|exitCode|chdir|emitWarning|setUncaughtExceptionCaptureCallback)\b|process\.(stdout|stderr)\.write\s*=(?!=)/,
    why: 'process listeners, exit code or cwd outlive the file'
  },
  { name: 'bare-mock', re: /(^|[^.\w])mock\.(method|fn|getter|setter|property|module)\(/m, why: 'a mock not tied to a test context is never restored' }
]

const LIST_FILE = 'scripts/unit-isolated.txt'
/**
 * Pools: the suite with every pooled file in ONE process took 84 s, no longer than the OCR files'
 * long pole alone, so 4 pools
 * leave headroom for the suite to grow while loading each catalog only 4 times (2026-11-27).
 */
const POOLS = 4

function namedIsolated(root: string): Map<string, string> {
  const named = new Map<string, string>()
  let why = ''
  for (const raw of readFileSync(join(root, LIST_FILE), 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('#')) why = line.replace(/^#\s*/, '')
    else if (line) named.set(line, why)
  }
  return named
}

/** Each test file with the reason it must run alone, or null when it may be pooled. */
export function classify(root: string, files: readonly string[]): Map<string, string | null> {
  const named = namedIsolated(root)
  const out = new Map<string, string | null>()
  for (const f of files) {
    const name = base(f)
    if (process.env.EQC_UNIT_ISOLATE_ALL === '1') out.set(f, 'EQC_UNIT_ISOLATE_ALL')
    else if (named.has(name)) out.set(f, `${LIST_FILE}: ${named.get(name) ?? ''}`)
    else {
      const src = readFileSync(join(root, f), 'utf8')
      const hits = ISOLATION_RULES.filter((r) => r.re.test(src)).map((r) => r.name)
      out.set(f, hits.length ? hits.join(', ') : null)
    }
  }
  return out
}

/** Last run's time per file (ms, by base name): orders the run longest first and balances pools. */
const TIMES_FILE = 'node_modules/.cache/eqc-unit-times.json'
/** A process and tsx cost about this much before a file's first test (measured 230-350 ms). */
const STARTUP_MS = 300

function readTimes(root: string): Record<string, number> {
  try {
    return JSON.parse(readFileSync(join(root, TIMES_FILE), 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}

function writeTimes(root: string, measured: Map<string, number>): void {
  if (measured.size === 0) return
  try {
    const path = join(root, TIMES_FILE)
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${String(process.pid)}`
    writeFileSync(tmp, JSON.stringify({ ...readTimes(root), ...Object.fromEntries(measured) }))
    renameSync(tmp, path)
  } catch {
    /* a hint only: the next run orders by name instead */
  }
}

const base = (f: string): string => f.replace(/^.*[\\/]/, '')

/** Deal the pooled files, longest first, onto the lightest pool (deterministic). */
export function deal(files: readonly string[], pools: number, times: Record<string, number>): string[][] {
  const cost = (f: string): number => times[base(f)] ?? STARTUP_MS
  const sorted = [...files].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1))
  const bins = Array.from({ length: Math.min(pools, files.length) }, () => ({ ms: 0, files: [] as string[] }))
  for (const f of sorted) {
    const bin = bins.reduce((lo, b) => (b.ms < lo.ms ? b : lo))
    bin.files.push(f)
    bin.ms += cost(f)
  }
  return bins.map((b) => b.files.sort())
}

function wrapper(root: string, files: readonly string[]): string {
  const lines = [
    "import { test } from 'node:test'",
    `const files = ${JSON.stringify(files.map((f) => [f, pathToFileURL(resolve(root, f)).href]))}`,
    'for (const [name, url] of files) {',
    '  try {',
    '    await import(url)',
    '  } catch (err) {',
    '    test(name, () => { throw err })',
    '  }',
    '}'
  ]
  return lines.join('\n') + '\n'
}

function concurrencyArg(args: readonly string[]): number {
  const a = args.find((x) => x.startsWith('--test-concurrency='))
  const n = a ? Number(a.split('=')[1]) : NaN
  return Number.isFinite(n) && n > 0 ? n : Math.min(10, availableParallelism())
}

function lowerPriority(): void {
  try {
    setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL)
  } catch {
    /* not permitted here: run at the priority we were given */
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const root = process.cwd()
  const named = args.filter((a) => !a.startsWith('--'))
  const files = named.length
    ? named.map((f) => relative(root, resolve(root, f)))
    : readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.mts')).sort().map((f) => join('tests', f))
  const times = readTimes(root)
  const split = classify(root, files)
  const pools = deal(files.filter((f) => !split.get(f)), POOLS, times)
  // Longest first, so a long file never starts last; a file never timed counts as longest.
  const isolated = files.filter((f) => split.get(f)).map((f) => ({ f, ms: (times[base(f)] ?? Infinity) + STARTUP_MS }))
  const poolMs = (p: string[]): number => p.reduce((s, f) => s + (times[base(f)] ?? STARTUP_MS), STARTUP_MS)

  if (args.includes('--list')) {
    pools.forEach((p, i) => console.log(`pool ${String(i + 1)} (${String(p.length)} files, ~${String(Math.round(poolMs(p) / 1000))} s): ${p.join(' ')}`))
    console.log(`isolated (${String(isolated.length)} files):`)
    for (const { f } of isolated) console.log(`  ${f}  [${split.get(f) ?? ''}]`)
    return
  }

  lowerPriority()
  const dir = mkdtempSync(join(tmpdir(), 'eqc-unit-pools-'))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  const pooled = pools.map((p, i) => {
    const path = join(dir, `pool-${String(i + 1)}.mjs`)
    writeFileSync(path, wrapper(root, p))
    return { f: path, ms: poolMs(p) }
  })
  const entries = [...pooled, ...isolated].sort((a, b) => b.ms - a.ms).map((e) => e.f)

  const measured = new Map<string, number>()
  const stream = run({ files: entries, concurrency: concurrencyArg(args), cwd: root })
  const timed = (d: { nesting: number; file?: string; details: { duration_ms: number } }): void => {
    if (d.nesting !== 0 || !d.file) return
    measured.set(base(d.file), (measured.get(base(d.file)) ?? 0) + d.details.duration_ms)
  }
  stream.on('test:pass', timed)
  stream.on('test:fail', timed)
  stream.on('test:summary', (d: { file?: string; success: boolean }) => {
    if (d.file === undefined && !d.success) process.exitCode = 1
  })
  process.on('exit', () => writeTimes(root, measured))
  stream.pipe(new spec()).pipe(process.stdout)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
