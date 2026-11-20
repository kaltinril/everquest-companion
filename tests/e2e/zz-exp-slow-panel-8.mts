// zz-exp-slow-panel-8.mts: THROWAWAY. After main has refused an oversize combat reply, does the meter
// come back when the answer becomes small again (a NEW fight becomes the default selection)?
//   node --import tsx tests/e2e/zz-exp-slow-panel-8.mts <logPath> <label>
import { linkSync, unlinkSync } from 'node:fs'
import type { Page } from 'playwright-core'
import { sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { tapOutput } from './engineSteps.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { load } from './zz-exp-slow-panel-0.mjs'

const [src = '', label = 'unblock'] = process.argv.slice(2)
const ASK = `(async () => { const t = performance.now(); const c = await window.eq.getCombatSnapshot({ timeline: true, maxSegments: 1 }); const r = await window.eq.logReadReport();
  return { hydrating: c.hydrating, ms: Math.round(performance.now() - t), name: c.selected ? String(c.selected.name).length : -1, rows: c.selected && c.selected.incoming ? c.selected.incoming.length : -1, wait: r.wait, lastError: r.lastError }; })()`
const log = stageFixture('e2e-voice.log')
unlinkSync(log.logPath)
linkSync(src, log.logPath)
const launch = await launchOnFixture(log, { waitForEngine: false })
const out = tapOutput(launch.app)
const guard = setTimeout(() => void launch.close().then(() => log.dispose()).then(() => process.exit(2)), 240_000)
try {
  const page: Page = await mainWindow(launch.app)
  await page.waitForSelector('[data-testid="nav-overview"]', { timeout: 120_000 })
  const t0 = Date.now()
  let s: Record<string, any> = {}
  while (Date.now() - t0 < 90_000) {
    s = (await page.evaluate(ASK)) as Record<string, any>
    if (s.wait === 'replyTooLarge') break
    await sleep(300)
  }
  console.log(`[${label}] before the new fight: ${JSON.stringify(s)} load=${String(load())}`)
  const dev0 = out.text().length
  // A new pull, stamped now: an hour after the log's last line, so the old fight closes on it.
  const at = Date.now()
  for (let i = 0; i < 6; i++) {
    log.appendAt(new Date(at + i * 1000), `You slash a fire giant warrior for ${String(100 + i)} points of damage.`, `A fire giant warrior hits YOU for ${String(20 + i)} points of damage.`)
    await sleep(1000)
  }
  log.appendAt(new Date(), 'You have slain a fire giant warrior!')
  let served = 0
  let hyd = 0
  let last = ''
  const t1 = Date.now()
  while (Date.now() - t1 < 40_000) {
    s = (await page.evaluate(ASK)) as Record<string, any>
    if (s.hydrating === true) hyd += 1
    else served += 1
    const key = JSON.stringify([s.hydrating, s.wait, s.lastError, s.rows])
    if (key !== last) {
      last = key
      console.log(`   [+${String(Date.now() - t1)} ms after the new fight] ${JSON.stringify(s)}`)
    }
    await sleep(400)
  }
  // The same question on an options key main has never asked before (so nothing is blocked for it).
  const fresh = await page.evaluate(`(async () => { const c = await window.eq.getCombatSnapshot({ maxSegments: 7 }); return { hydrating: c.hydrating, rows: c.selected && c.selected.incoming ? c.selected.incoming.length : -1, segments: c.segments.length }; })()`)
  const skills = await page.evaluate(`window.eq.getModuleSnapshot('kills').then((k) => k === null ? 'null' : JSON.stringify(k).length)`)
  console.log(`[${label}] 40 s after the new fight: served ${String(served)}, hydrating ${String(hyd)}; a never-asked options key now: ${JSON.stringify(fresh)}; kills module chars ${String(skills)}; load=${String(load())}`)
  for (const l of out.text().slice(dev0).split(/\r?\n/).filter((x) => /data-server (shim|client)|too large/i.test(x)).slice(0, 8)) console.log(`      | ${l.slice(0, 240)}`)
} finally {
  clearTimeout(guard)
  await launch.close()
  await log.dispose()
}
