/** THROWAWAY verify probe: recovery card width vs the TelemetryNotice pin idiom. Never committed. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, countOf, settle, sleep } from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const CARD = '[data-testid="settings-recovery-notice"]'
const READ = String.raw`(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1) } };
  const cs = (el) => { if (!el) return null; const c = getComputedStyle(el); return { left: c.left, right: c.right, top: c.top, transform: c.transform } };
  const tele = document.querySelector('[data-testid="telemetry-notice"]');
  const teleRoot = tele ? tele.closest('.MuiSnackbar-root') : null;
  const snack = document.querySelector('[data-testid="settings-recovery-notice"]');
  const alert = snack ? snack.querySelector('.MuiAlert-root') : null;
  const text = snack ? snack.querySelector('[data-testid="settings-recovery-notice-text"]') : null;
  let lines = 0;
  if (text) { const g = document.createRange(); g.selectNodeContents(text); const tops = []; for (const q of g.getClientRects()) { if (q.width > 0 && !tops.some((t) => Math.abs(t - q.top) < 2)) tops.push(q.top) } lines = tops.length }
  return { vw: innerWidth, dpr: devicePixelRatio, teleRoot: { rect: R(teleRoot), cs: cs(teleRoot) }, tele: R(tele), snack: { rect: R(snack), cs: cs(snack) }, card: R(alert), lines };
})()`

async function resizeTo(app: ElectronApplication, page: Page, w: number, h: number): Promise<void> {
  const win = await app.browserWindow(page)
  await win.evaluate((bw, b) => { bw.setBounds({ ...bw.getBounds(), width: b.w, height: b.h }) }, { w, h })
  await sleep(1500)
}

async function main(): Promise<void> {
  buildIfStale()
  const userData = makeUserData()
  writeFileSync(join(userData, 'everquest-companion-progress.json'), '{\n\t"byCharacter": {\n\t\t"Primitive": {\n\t\t\t"lev', 'utf8')
  const launched = await launchOnFixture('e2e-voice.log', { userData })
  let closed = false
  const close = async (): Promise<void> => { if (closed) return; closed = true; await launched.close() }
  const bound = setTimeout(() => { console.log('bound reached'); void close().finally(() => process.exit(2)) }, 150_000)
  try {
    const page = await mainWindow(launched.app)
    await page.waitForSelector('[data-testid="nav-alerts"]', { timeout: 60_000 })
    await settle(() => countOf(page, CARD), (n) => n > 0, { timeoutMs: 15_000 })
    await sleep(1500)
    for (const [w, h] of [[1280, 860], [900, 600]] as const) {
      await resizeTo(launched.app, page, w, h)
      console.log(`AS SHIPPED ${w}x${h}`, JSON.stringify(await page.evaluate(READ)))
    }
    // The suggested fix's geometry, applied as inline style (beats every class rule).
    await page.evaluate((sel) => { const s = document.querySelector(sel) as HTMLElement; s.style.left = '16px'; s.style.right = '16px'; s.style.transform = 'none' }, CARD)
    await sleep(800)
    console.log('PINNED INLINE 900x600', JSON.stringify(await page.evaluate(READ)))
    await page.evaluate((s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s), 1.5)
    await sleep(2000)
    console.log('PINNED INLINE 900x600 150%', JSON.stringify(await page.evaluate(READ)))
    await page.evaluate((sel) => { const s = document.querySelector(sel) as HTMLElement; s.style.left = ''; s.style.right = ''; s.style.transform = '' }, CARD)
    await sleep(800)
    console.log('AS SHIPPED 900x600 150%', JSON.stringify(await page.evaluate(READ)))
    await page.evaluate((s) => (window as unknown as { eq: { setUiScale: (n: number) => Promise<number> } }).eq.setUiScale(s), 1)
  } finally {
    clearTimeout(bound)
    await close()
    await removeUserData(userData)
    console.log('closed')
  }
}
main().catch((e: unknown) => { console.error('probe error', e); process.exitCode = 1 })
