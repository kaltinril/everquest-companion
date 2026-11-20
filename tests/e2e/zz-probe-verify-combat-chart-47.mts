// Throwaway skeptic probe (strip report): the Combat dashboard region height at the minimum window. Never committed.
import { sleep, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, openCombat, requireBuilt, resizeTo, setScale } from './zz-probe-combat-chart-0.mjs'

const FIXTURE = process.argv[2] ?? 'g1-group-lifecycle.log'
const STATES = [
  { name: '900x600@100', w: 900, h: 600, z: 1 },
  { name: '900x600@125', w: 900, h: 600, z: 1.25 },
  { name: '900x600@150', w: 900, h: 600, z: 1.5 },
  { name: '1366x728@125', w: 1366, h: 728, z: 1.25 },
  { name: '1280x720@100', w: 1280, h: 720, z: 1 },
  { name: '1280x860@100', w: 1280, h: 860, z: 1 }
]

const MEASURE = `(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { y: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width), sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY }; };
  const q = (s) => document.querySelector(s);
  const dash = q('[data-testid="combat-dashboard"]');
  const panels = dash ? [...dash.children].map((c) => { const b = c.getBoundingClientRect(); const d = dash.getBoundingClientRect(); const visTop = Math.max(b.top, d.top); const visBot = Math.min(b.bottom, d.bottom); return { h: Math.round(b.height), w: Math.round(b.width), visible: Math.max(0, Math.round(visBot - visTop)), head: (c.innerText || '').split('\\n')[0].slice(0, 30) }; }) : [];
  const logCard = q('[data-testid="combat-log"]');
  return { viewport: [innerWidth, innerHeight], header: r(q('[data-testid="combat-header"]')), dashboard: r(dash), log: r(logCard), panels };
})()`

async function main(): Promise<void> {
  requireBuilt()
  const { app, close } = await launchOnFixture(FIXTURE)
  const stop = bound(close, 240_000)
  try {
    const page = await mainWindow(app)
    await answerNotice(page)
    await openCombat(page)
    await waitHydrated(page)
    for (const st of STATES) {
      await setScale(page, st.z)
      await resizeTo(app, page, st.w, st.h)
      await sleep(800)
      console.log(`## [${st.name}]`, JSON.stringify(await page.evaluate(MEASURE)))
    }
    await setScale(page, 1)
  } finally {
    stop()
    await close()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
