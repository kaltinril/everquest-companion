// zz-probe-verify-bazaar-buffs-1.mts: THROWAWAY skeptic probe. Does the Bazaar price grid leave the
// detail panel at 900 px with 125% text, is it the only thing that does, and does a shrinkable grid fix it?
import type { Page } from 'playwright-core'
import { settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { LIB, answerNotice, bound, ev, requireBuilt, resizeTo, say, setScale, sleep } from './zz-probe-bazaar-buffs-0.mjs'

const DAY = 86_400_000

function measure(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    const d = document.querySelector('[data-testid="bazaar-detail"]');
    const g = document.querySelector('[data-testid="bazaar-prices"]');
    const c = document.querySelector('[data-testid="app-content"]');
    const dr = d.getBoundingClientRect();
    const inner = dr.right - parseFloat(getComputedStyle(d).paddingRight) - parseFloat(getComputedStyle(d).borderRightWidth);
    const kids = [...g.children].map((k) => ({ t: txt(k).slice(0, 20), right: f(k.getBoundingClientRect().right), hit: hit(k) })).filter((k) => k.right > inner + 0.5);
    const others = [];
    for (const el of d.querySelectorAll('*')) {
      if (g.contains(el) || el.contains(g)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.right <= inner + 0.5) continue;
      if ([...el.children].some((k) => k.getBoundingClientRect().right > inner + 0.5)) continue;
      others.push({ tag: el.tagName, text: txt(el).slice(0, 30), right: f(r.right) });
    }
    return { vw: document.documentElement.clientWidth, detail: rc(d), inner: f(inner), detailCut: cut(d), grid: rc(g), gridStyle: style(g, ['gridTemplateColumns', 'columnGap']), gridKidsPast: kids, otherPast: others.slice(0, 10), content: cut(c), contentOx: getComputedStyle(c).overflowX, contentSideways: c.scrollWidth - c.clientWidth };
  })()`)
}

async function tryFix(page: Page): Promise<unknown> {
  await ev(page, `(() => { const g = document.querySelector('[data-testid="bazaar-prices"]'); g.dataset.old = g.style.cssText; g.style.gridTemplateColumns = 'auto repeat(3, minmax(0, auto))'; g.style.columnGap = '16px'; })()`)
  await sleep(600)
  const m = await measure(page)
  await ev(page, `(() => { const g = document.querySelector('[data-testid="bazaar-prices"]'); g.style.cssText = g.dataset.old; })()`)
  await sleep(400)
  return m
}

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const now = Date.now()
  const at = (days: number): Date => new Date(now - days * DAY)
  log.appendAt(at(3), "Leric auctions, 'WTS Fleeting Quiver 14k'", "Bront auctions, 'WTS Fleeting Quiver 16k'", "Calla auctions, 'WTB Fleeting Quiver 9k'")
  log.appendAt(at(2), "Dorn auctions, 'WTS Fleeting Quiver 15k'", "Fenn auctions, 'WTS Cloak of Flames 1,500pp'")
  log.appendAt(at(1), "Ivor auctions, 'WTS Fleeting Quiver 15k'", "Kell auctions, 'WTS Short Sword of the Ykesha 12,500 pp'")

  const launch = await launchOnFixture(log)
  const unbound = bound(async () => { await launch.close(); await log.dispose() }, 180_000)
  try {
    const page = await mainWindow(launch.app)
    await page.waitForSelector('[data-testid="nav-bazaar"]', { timeout: 60_000 })
    await answerNotice(page)
    await page.click('[data-testid="nav-bazaar"]')
    await page.waitForSelector('[data-testid="bazaar-view"]', { timeout: 30_000 })
    await settle(() => ev<number>(page, `document.querySelectorAll('[data-testid="bazaar-prices"]').length`), (n) => n >= 1, { timeoutMs: 30_000 })

    await resizeTo(launch.app, page, 900, 700)
    say('A 900 px 100%', await measure(page))
    await setScale(page, 1.25)
    say('B 900 px 125%', await measure(page))
    say('B2 900 px 125% with minmax(0,auto) and 16px gap (in-page trial only)', await tryFix(page))
    await setScale(page, 1.5)
    say('C 900 px 150%', await measure(page))
    say('C2 900 px 150% trial', await tryFix(page))
    await resizeTo(launch.app, page, 1280, 860)
    say('D 1280 px 150%', await measure(page))
    await setScale(page, 1.25)
    say('E 1280 px 125%', await measure(page))
    await setScale(page, 1)
  } finally {
    unbound()
    await launch.close()
    await log.dispose()
  }
}

main().catch((err: unknown) => {
  console.error('probe: harness error', err)
  process.exitCode = 1
})
