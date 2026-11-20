// zz-exp-slow-panel-3.mts: THROWAWAY. Which keys of a reply carry its bytes.
//   node --import tsx tests/e2e/zz-exp-slow-panel-3.mts <logPath> <op> <paramsJson>
import { attachUntilLive, startEngine } from './zz-exp-slow-panel-0.mjs'
const [logPath = '', op = 'combat.snapshot', paramsJson = '{"opts":{"maxSegments":1}}'] = process.argv.slice(2)
function sizes(v: unknown, path: string, depth: number, out: [string, number, string][]): void {
  if (v === null || typeof v !== 'object') return
  const entries: [string, unknown][] = Array.isArray(v) ? [['[0]', v[0]]] : Object.entries(v as Record<string, unknown>)
  if (Array.isArray(v)) out.push([`${path}[]`, JSON.stringify(v).length, `len=${String(v.length)}`])
  for (const [k, c] of entries) {
    const n = JSON.stringify(c)?.length ?? 0
    const p = Array.isArray(v) ? `${path}${k}` : `${path}.${k}`
    if (!Array.isArray(v)) out.push([p, n, Array.isArray(c) ? `array len=${String(c.length)}` : typeof c])
    if (n > 20_000 && depth > 0) sizes(c, p, depth - 1, out)
  }
}
const eng = await startEngine()
const guard = setTimeout(() => void eng.stop().then(() => process.exit(2)), 900_000)
try {
  const c = await eng.conn()
  await attachUntilLive(c, logPath, 800_000)
  const t = await c.request(op, JSON.parse(paramsJson), 300_000, true)
  console.log(`ok=${String(t.ok)} ms=${String(t.ms)} bytes=${String(t.bytes)}`)
  const out: [string, number, string][] = []
  sizes(t.reply?.result, 'result', 7, out)
  for (const [p, n, note] of out.filter((r) => r[1] > 20_000).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`${String(n).padStart(11)}  ${p}  (${note})`)
  c.close()
} finally {
  clearTimeout(guard)
  await eng.stop()
}
