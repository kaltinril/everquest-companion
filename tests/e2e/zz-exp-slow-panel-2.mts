// zz-exp-slow-panel-2.mts: THROWAWAY. Drive engined.exe directly on one log: time to live, then the
// time and size of every answer the app's windows ask for, three repeats each.
//   node --import tsx tests/e2e/zz-exp-slow-panel-2.mts <logPath> <label> [outDir]
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMBAT_ASKS, MODULES, attachUntilLive, load, startEngine, type Conn, type Timed } from './zz-exp-slow-panel-0.mjs'

const [logPath = '', label = 'run', outDir = ''] = process.argv.slice(2)
if (logPath === '') throw new Error('usage: <logPath> <label> [outDir]')
const REPS = Number(process.env.EXP_REPS ?? '3')
const LIVE_BOUND = Number(process.env.EXP_LIVE_BOUND ?? '1500000')
const ONLY = process.env.EXP_ONLY ?? '' // 'combat' | 'modules' | ''

interface Row {
  what: string
  ms: number[]
  firstMs: number[]
  bytes: number[]
  errors: string[]
  drainMs: number[]
}

/** One ask; if the engine refuses at its own 5 s patience, wait for the fold to come free and time that. */
async function timed(c: Conn, op: string, params: unknown): Promise<{ t: Timed; drain: number }> {
  const t0 = performance.now()
  const t = await c.request(op, params, 300_000)
  let drain = -1
  if (!t.ok) {
    // The ingest thread is still building the abandoned answer; a cheap ask is served only after it.
    for (;;) {
      const probe = await c.request('module.snapshot', { module: 'combo' }, 300_000)
      if (probe.ok || performance.now() - t0 > 600_000) break
    }
    drain = Math.round(performance.now() - t0)
  }
  return { t, drain }
}

async function measure(c: Conn, what: string, op: string, params: unknown): Promise<Row> {
  const row: Row = { what, ms: [], firstMs: [], bytes: [], errors: [], drainMs: [] }
  for (let i = 0; i < REPS; i++) {
    const { t, drain } = await timed(c, op, params)
    row.ms.push(t.ms)
    row.firstMs.push(t.firstMs)
    row.bytes.push(t.bytes)
    if (!t.ok) row.errors.push(String(t.reply?.error?.message ?? t.error).slice(0, 160))
    if (drain >= 0) row.drainMs.push(drain)
  }
  console.log(
    `${what.padEnd(58)} ms=${row.ms.join('/')} first=${row.firstMs.join('/')} bytes=${String(row.bytes[0])}` +
      (row.errors.length > 0 ? ` ERR x${String(row.errors.length)} "${row.errors[0]}" freeAfterMs=${row.drainMs.join('/')}` : '')
  )
  return row
}

async function main(): Promise<void> {
  const size = statSync(logPath).size
  const loadBefore = load()
  const eng = await startEngine()
  const guard = setTimeout(() => {
    console.error('BOUND HIT: stopping engine')
    void eng.stop().then(() => process.exit(2))
  }, Number(process.env.EXP_BOUND ?? '2400000'))
  const rows: Row[] = []
  let report: Record<string, unknown> = {}
  try {
    const c = await eng.conn()
    const live = await attachUntilLive(c, logPath, LIVE_BOUND)
    const rssLive = eng.rssMb()
    const loadAtLive = load()
    console.log(`[${label}] bytes=${String(size)} live=${JSON.stringify(live)} engineMB=${String(rssLive)} load=${String(loadBefore)}/${String(loadAtLive)}`)

    // What the meter says about itself, from one small parsed answer.
    const peek = await c.request('combat.snapshot', { opts: { maxSegments: 1 } }, 300_000, true)
    const snap = peek.reply?.result?.snapshot
    const facts = {
      peekOk: peek.ok,
      peekMs: peek.ms,
      peekError: peek.ok ? undefined : String(peek.reply?.error?.message ?? peek.error),
      hydrating: snap?.hydrating,
      nowSkewMs: peek.ok ? Math.round(Number(peek.reply.result.now) - Date.now()) : undefined,
      zoneSessions: Array.isArray(snap?.zoneSessions) ? snap.zoneSessions.length : undefined,
      selectedEntities: Array.isArray(snap?.selected?.entities) ? snap.selected.entities.length : undefined,
      inCombat: snap?.inCombat
    }
    if (!peek.ok) await timed(c, 'module.snapshot', { module: 'combo' })
    const search = await c.request('combat.searchFights', { query: '' }, 300_000, true)
    const corpus = search.reply?.result?.corpus
    console.log(`[${label}] facts=${JSON.stringify(facts)} fights(corpus)=${String(corpus)} searchMs=${String(search.ms)}`)

    if (ONLY === '' || ONLY === 'combat') {
      for (const a of COMBAT_ASKS) rows.push(await measure(c, `combat.snapshot ${a.name}`, 'combat.snapshot', { opts: a.opts }))
      rows.push(await measure(c, 'combat.searchFights "skeleton" limit 50', 'combat.searchFights', { query: 'skeleton', limit: 50 }))
    }
    if (ONLY === '' || ONLY === 'modules') {
      for (const m of MODULES) rows.push(await measure(c, `module.snapshot ${m}`, 'module.snapshot', { module: m }))
    }
    // A burst the way a window hydrates: every module at once on ONE connection (main has one).
    const tb = performance.now()
    const burst = await Promise.all(MODULES.map((m) => c.request('module.snapshot', { module: m }, 300_000)))
    const burstMs = Math.round(performance.now() - tb)
    const burstBytes = burst.reduce((n, t) => n + t.bytes, 0)
    const burstMax = Math.max(...burst.map((t) => t.ms))
    console.log(`[${label}] all 27 modules at once on one connection: ${String(burstMs)} ms, ${String(burstBytes)} bytes, slowest ${String(burstMax)} ms, errors ${String(burst.filter((t) => !t.ok).length)}`)
    const health = await c.request('session.health', {}, 20_000, true)
    const rssEnd = eng.rssMb()
    const loadAfter = load()
    report = {
      label, logPath, bytes: size, live, facts, corpus, engineMbAtLive: rssLive, engineMbEnd: rssEnd,
      load: { before: loadBefore, atLive: loadAtLive, after: loadAfter },
      burst: { ms: burstMs, bytes: burstBytes, slowestMs: burstMax },
      healthMs: health.ms, rows, stderr: eng.stderr.slice(-12)
    }
    console.log(`[${label}] engineMB end=${String(rssEnd)} load after=${String(loadAfter)} stderr=${JSON.stringify(eng.stderr.slice(-4))}`)
    c.close()
  } finally {
    clearTimeout(guard)
    await eng.stop()
  }
  if (outDir !== '') {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, `${label}.json`), JSON.stringify(report, null, 1))
  }
}

main().catch((err: unknown) => {
  console.error('exp error:', err)
  process.exitCode = 1
})
