// zz-probe-verify-combat-chart-1.mts: skeptic check. Can the DPS card's hover readout ever be read
// whole at 125% in the default window (and at the minimum window at 100%), at any scroll of the
// card body? Throwaway, never committed.
import type { Page } from 'playwright-core'
import { sleep, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { answerNotice, bound, calibrateMouse, openCombat, rafFires, requireBuilt, resizeTo, say, setScale, shimRaf } from './zz-probe-combat-chart-0.mjs'

const FIXTURE = process.argv[2] ?? 'g1-group-lifecycle.log'
const STATES = [
  { name: '1280x860@100', w: 1280, h: 860, z: 1 },
  { name: '1280x860@125', w: 1280, h: 860, z: 1.25 },
  { name: '900x600@100', w: 900, h: 600, z: 1 }
]

let K = 1
async function mv(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x * K, y * K)
}

const BODY = `(() => { const card = [...document.querySelectorAll('[data-testid="dash-panel"]')].find((p) => /DPS over time/i.test(p.innerText || '')); if (!card) return null; const plot = card.querySelector('[data-testid="dps-plot"]'); let b = plot.parentElement; while (b && b !== card && getComputedStyle(b).overflowY === 'visible') b = b.parentElement; return { card, plot, body: b }; })()`

async function state(page: Page, scrollTo: 'top' | 'mid' | 'bottom'): Promise<unknown> {
  const pt = (await page.evaluate(`(() => { const o = ${BODY}; if (!o) return null; const { body, plot, card } = o; const max = body.scrollHeight - body.clientHeight; body.scrollTop = ${JSON.stringify(scrollTo)} === 'top' ? 0 : ${JSON.stringify(scrollTo)} === 'mid' ? Math.round(max / 2) : max; const r = plot.getBoundingClientRect(); const br = body.getBoundingClientRect(); const cr = card.getBoundingClientRect(); const top = Math.max(r.top, br.top, cr.top), bot = Math.min(r.bottom, br.bottom, cr.bottom); return { x: Math.round(r.left + r.width / 2), y: Math.round((top + bot) / 2), scrollTop: body.scrollTop, max, body: { top: br.top, bottom: br.bottom, sh: body.scrollHeight, ch: body.clientHeight, oy: getComputedStyle(body).overflowY }, card: card.getBoundingClientRect().toJSON(), plot: { top: r.top, bottom: r.bottom }, legend: [...card.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { t: (b.innerText || '').trim(), top: Math.round(q.top), bottom: Math.round(q.bottom), inBody: q.top >= br.top - 0.5 && q.bottom <= br.bottom + 0.5 }; }) }; })()`)) as { x: number; y: number } | null
  if (!pt) return { none: true }
  await sleep(1500)
  await mv(page, pt.x - 3, pt.y - 3)
  await mv(page, pt.x, pt.y)
  await sleep(500)
  const tip = await page.evaluate(`(() => { const o = ${BODY}; const t = document.querySelector('[data-testid="chart-tooltip"]'); if (!t) return null; const r = t.getBoundingClientRect(); const br = o.body.getBoundingClientRect(); const pr = o.card.getBoundingClientRect(); const visTop = Math.max(r.top, br.top, pr.top), visBot = Math.min(r.bottom, br.bottom, pr.bottom); const rows = [...t.children].map((c) => { const q = c.getBoundingClientRect(); return { text: (c.innerText || '').trim(), shown: q.top >= visTop - 0.5 && q.bottom <= visBot + 0.5 }; }); return { tip: { top: r.top, bottom: r.bottom, h: r.height }, visible: Math.max(0, visBot - visTop), rows }; })()`)
  await page.mouse.move(5, 5)
  await sleep(300)
  return { pt, tip }
}

async function main(): Promise<void> {
  requireBuilt()
  const { app, close } = await launchOnFixture(FIXTURE)
  const stop = bound(close, 300_000)
  try {
    const page = await mainWindow(app)
    await answerNotice(page)
    await openCombat(page)
    await waitHydrated(page)
    if (!(await rafFires(page, 2000))) await shimRaf(page)
    for (const st of STATES) {
      await setScale(page, st.z)
      const got = await resizeTo(app, page, st.w, st.h)
      K = await calibrateMouse(page)
      await sleep(600)
      for (const s of ['top', 'mid', 'bottom'] as const) say(`[${st.name}] css ${JSON.stringify(got)} scroll=${s}`, await state(page, s))
    }
    await setScale(page, 1)
  } finally {
    stop()
    await close()
  }
  console.log('\nverify done')
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
