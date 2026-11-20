// zz-exp-slow-panel-7.mts: THROWAWAY. On one log, select EVERY fight and EVERY zone stay the way the
// Combat tab does and record the reply's size, time and row counts. Prints counts only, never a name.
//   node --import tsx tests/e2e/zz-exp-slow-panel-7.mts <logPath> <label>
import { attachUntilLive, load, startEngine } from './zz-exp-slow-panel-0.mjs'
const [logPath = '', label = 'run'] = process.argv.slice(2)
const eng = await startEngine()
const guard = setTimeout(() => void eng.stop().then(() => process.exit(2)), 600_000)
const q = (a: number[], p: number): number => a[Math.min(a.length - 1, Math.floor(a.length * p))]!
try {
  const c = await eng.conn()
  const live = await attachUntilLive(c, logPath, 500_000)
  const l0 = load()
  const all = await c.request('combat.snapshot', { opts: { maxSegments: 1_000_000 } }, 120_000, true)
  const snap = all.reply.result.snapshot
  const fights: string[] = snap.segments.filter((s: any) => s.kind !== 'zone').map((s: any) => String(s.id))
  const stays: string[] = ['zone', ...snap.zoneSessions.map((z: any) => String(z.id))]
  for (const [kind, ids] of [['fight', fights], ['zone stay', stays]] as const) {
    const bytes: number[] = []
    const ms: number[] = []
    const inc: number[] = []
    const out: number[] = []
    for (const id of ids) {
      const t = await c.request('combat.snapshot', { opts: { selectedId: id, showUnparsed: false, maxSegments: 100, timeline: true } }, 120_000, true)
      if (!t.ok) continue
      const sel = t.reply.result.snapshot.selected
      bytes.push(t.bytes)
      ms.push(t.ms)
      inc.push(Array.isArray(sel?.incoming) ? sel.incoming.length : 0)
      out.push(Array.isArray(sel?.entities) ? sel.entities.length : 0)
    }
    for (const a of [bytes, ms, inc, out]) a.sort((x, y) => x - y)
    console.log(`[${label}] ${kind}: ${String(ids.length)} selections; reply bytes p50/p99/max ${String(q(bytes, 0.5))}/${String(q(bytes, 0.99))}/${String(bytes[bytes.length - 1])}; ms p50/p99/max ${String(q(ms, 0.5))}/${String(q(ms, 0.99))}/${String(ms[ms.length - 1])}; incoming rows p50/p99/max ${String(q(inc, 0.5))}/${String(q(inc, 0.99))}/${String(inc[inc.length - 1])}; outgoing rows p50/p99/max ${String(q(out, 0.5))}/${String(q(out, 0.99))}/${String(out[out.length - 1])}`)
  }
  console.log(`[${label}] live=${JSON.stringify(live)} load=${String(l0)}/${String(load())}`)
  c.close()
} finally {
  clearTimeout(guard)
  await eng.stop()
}
