// zz-exp-slow-panel-5.mts: THROWAWAY. The cost of an answer DURING PLAY: the engine keeps a module's
// last answer until that module folds another event, so the number that matters while lines are
// arriving is the rebuild. Append a pull to the log, wait for the fold to take it, ask everything once.
//   node --import tsx tests/e2e/zz-exp-slow-panel-5.mts <logPath> <label> [outDir]
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMBAT_ASKS, MODULES, attachUntilLive, load, startEngine } from './zz-exp-slow-panel-0.mjs'

const [logPath = '', label = 'run', outDir = ''] = process.argv.slice(2)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number): string => String(n).padStart(2, '0')
const stamp = (at: Date): string => `[${DAYS[at.getDay()]} ${MONTHS[at.getMonth()]} ${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())} ${String(at.getFullYear())}]`

function pull(n: number): string {
  const s = stamp(new Date())
  const mob = 'a decaying skeleton'
  return [
    `You slash ${mob} for ${String(40 + n)} points of damage.`,
    `A decaying skeleton hits YOU for ${String(11 + n)} points of damage.`,
    `You hit ${mob} for 300 points of magic damage by Chaos Flux.`,
    `You have slain ${mob}!`,
    'Your faction standing with Inhabitants of Hate has been adjusted by -1.',
    'You gain experience! (0.123%)',
    `--You have looted a Bone Chips from ${mob}'s corpse.--`,
    'You have become better at Offense! (201)',
    "Kelmora tells the group, 'inc'"
  ].map((m) => `${s} ${m}\r\n`).join('')
}

const eng = await startEngine()
const guard = setTimeout(() => void eng.stop().then(() => process.exit(2)), Number(process.env.EXP_BOUND ?? '1500000'))
const rows: Record<string, number[]> = {}
const sizes: Record<string, number> = {}
try {
  const c = await eng.conn()
  const live = await attachUntilLive(c, logPath, 1_400_000)
  const loads = [load()]
  // Warm every answer once so the first round below is a rebuild, not a first build.
  for (const m of MODULES) await c.request('module.snapshot', { module: m }, 300_000)
  for (let round = 0; round < 3; round++) {
    const before = (await c.request('session.health', {}, 20_000, true)).reply.result.events as number
    appendFileSync(logPath, pull(round))
    const t0 = performance.now()
    for (;;) {
      const h = (await c.request('session.health', {}, 20_000, true)).reply.result
      if (h.events > before + 5 || performance.now() - t0 > 20_000) break
      await new Promise((r) => setTimeout(r, 20))
    }
    const tailMs = Math.round(performance.now() - t0)
    ;(rows['(append to folded)'] ??= []).push(tailMs)
    for (const a of COMBAT_ASKS) {
      const t = await c.request('combat.snapshot', { opts: a.opts }, 300_000)
      ;(rows[`combat.snapshot ${a.name}`] ??= []).push(t.ok ? t.ms : -t.ms)
      sizes[`combat.snapshot ${a.name}`] = t.bytes
    }
    for (const m of MODULES) {
      const t = await c.request('module.snapshot', { module: m }, 300_000)
      ;(rows[`module.snapshot ${m}`] ??= []).push(t.ok ? t.ms : -t.ms)
      sizes[`module.snapshot ${m}`] = t.bytes
      // ...and the kept answer straight after, for contrast.
      const k = await c.request('module.snapshot', { module: m }, 300_000)
      ;(rows[`  kept ${m}`] ??= []).push(k.ms)
    }
    loads.push(load())
  }
  console.log(`[${label}] rebuild after an appended pull, 3 rounds; live=${JSON.stringify(live)} load=${loads.join('/')}`)
  for (const [k, v] of Object.entries(rows)) {
    if (k.startsWith('  kept')) continue
    const kept = rows[`  kept ${k.replace('module.snapshot ', '')}`]
    if (Math.max(...v.map(Math.abs)) < 2 && (!kept || Math.max(...kept) < 2)) continue
    console.log(`${k.padEnd(60)} ms=${v.join('/')}${kept ? ` kept=${kept.join('/')}` : ''} bytes=${String(sizes[k] ?? '')}`)
  }
  c.close()
  if (outDir !== '') {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, `rebuild-${label}.json`), JSON.stringify({ label, live, loads, rows, sizes }, null, 1))
  }
} finally {
  clearTimeout(guard)
  await eng.stop()
}
