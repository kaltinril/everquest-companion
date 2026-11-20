// zz-probe-bazaar-buffs-2.mts: THROWAWAY. Bazaar follow-ups: the list's width with no watch at all, a
// threshold typed with a comma (what the field keeps showing against what alerts), the stale field on
// another item, the percent field typed by keyboard, and what overflows at 900 px with 125% text.
import type { Page } from 'playwright-core'
import { settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { LIB, answerNotice, bound, ev, requireBuilt, resizeTo, say, setScale, sleep, typeAndBlur } from './zz-probe-bazaar-buffs-0.mjs'

const DAY = 86_400_000
const ROW0 = '[data-testid="bazaar-row-Fleeting Quiver|0"]'
const ROW4 = '[data-testid="bazaar-row-Fleeting Quiver|4"]'
const WMAX = '[data-testid="bazaar-watch-wts-max"]'
const SHARE = '[data-testid="bazaar-watch-wts-share"]'

async function tick(page: Page, testid: string): Promise<void> {
  await ev(page, `document.querySelector('[data-testid="${testid}"] input, input[data-testid="${testid}"]').click()`)
  await sleep(500)
}
const chip = (page: Page, row: string): Promise<string | null> => ev(page, `(() => { const c = document.querySelector('${row} [data-testid="bazaar-watch-chip"]'); return c ? c.innerText : null; })()`)
const field = (page: Page, sel: string): Promise<string | null> => ev(page, `(() => { const c = document.querySelector('${sel}'); return c ? c.value : null; })()`)
const stored = (page: Page): Promise<unknown> => ev(page, 'window.eq.getBazaarWatch().then((l) => l.entries)')
const heard = (page: Page): Promise<string | null> => ev(page, `(() => { const h = document.querySelector('[data-testid="bazaar-heard"]'); return h ? h.innerText.replace(/\\n+/g, ' | ') : null; })()`)

function tableWidth(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    const s = document.querySelector('[data-testid="bazaar-scroll"]');
    const heads = [...s.querySelectorAll('th')].map((h) => { const r = h.getBoundingClientRect(); const b = s.getBoundingClientRect(); return txt(h) + '[' + f(r.left) + '-' + f(r.right) + (r.left >= b.right ? ' OUTSIDE BOX' : r.right > b.right + 0.5 ? ' CUT BY BOX' : '') + ']'; });
    return { vw: document.documentElement.clientWidth, box: rc(s), boxClient: s.clientWidth, tableScrollWidth: s.scrollWidth, hiddenRight: s.scrollWidth - s.clientWidth, heads };
  })()`)
}

/** Which descendants of the detail panel reach past its right edge. */
function overflowers(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    const d = document.querySelector('[data-testid="bazaar-detail"]');
    const c = document.querySelector('[data-testid="app-content"]');
    const dr = d.getBoundingClientRect();
    const inner = dr.right - 17;
    const out = [];
    for (const el of d.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.right <= inner + 0.5) continue;
      if ([...el.children].some((k) => k.getBoundingClientRect().right > inner + 0.5)) continue;
      out.push({ tag: el.tagName, id: el.getAttribute('data-testid') || (el.closest('[data-testid]') || d).getAttribute('data-testid'), text: txt(el).slice(0, 40), x: f(r.left), right: f(r.right), past: f(r.right - inner) });
    }
    return { vw: document.documentElement.clientWidth, dpr: devicePixelRatio, detail: rc(d), detailCut: cut(d), content: cut(c), contentScrollsSideways: c.scrollWidth - c.clientWidth, past: out.slice(0, 25) };
  })()`)
}

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const now = Date.now()
  const at = (days: number): Date => new Date(now - days * DAY)
  log.appendAt(at(3), "Leric auctions, 'WTS Fleeting Quiver 14k'", "Bront auctions, 'WTS Fleeting Quiver 16k'", "Calla auctions, 'WTB Fleeting Quiver 9k'", "Leric auctions, 'WTS Fleeting Quiver +4 30k'")
  log.appendAt(at(2), "Dorn auctions, 'WTS Fleeting Quiver 15k'", "Evie auctions, 'WTS Fleeting Quiver +4 28k'", "Fenn auctions, 'WTS Cloak of Flames 1,500pp'", "Garr auctions, 'WTS Rain Caller 4k - 5k'", "Hale auctions, 'WTS 3k for Bone Chips'")
  log.appendAt(at(1), "Ivor auctions, 'WTS Fleeting Quiver 15k'", "Jask auctions, 'WTS Fleeting Quiver +4 29k'", "Kell auctions, 'WTS Short Sword of the Ykesha 12,500 pp'")

  const launch = await launchOnFixture(log)
  const unbound = bound(async () => { await launch.close(); await log.dispose() }, 240_000)
  const errors: string[] = []
  try {
    const page = await mainWindow(launch.app)
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-bazaar"]', { timeout: 60_000 })
    await answerNotice(page)
    await page.click('[data-testid="nav-bazaar"]')
    await page.waitForSelector('[data-testid="bazaar-view"]', { timeout: 30_000 })
    await settle(() => ev<number>(page, `document.querySelectorAll('[data-testid^="bazaar-row-"]').length`), (n) => n >= 5, { timeoutMs: 30_000 })

    say('STEP 1 list width, NO watch anywhere, default window', await tableWidth(page))
    say('STEP 1 quotes of the picked item (who is offering)', await ev(page, `(() => { const q = document.querySelector('[data-testid="bazaar-quotes"]'); return q ? q.innerText.replace(/\\n+/g, ' | ').slice(0, 700) : null; })()`))

    // A threshold typed with a comma into a blank field.
    await page.click(ROW0)
    await sleep(500)
    await tick(page, 'bazaar-watch-on')
    await tick(page, 'bazaar-watch-wts')
    await typeAndBlur(page, WMAX, '12,500')
    say('STEP 2 typed "12,500" into the blank at-or-under field', { fieldShows: await field(page, WMAX), chip: await chip(page, ROW0), stored: await stored(page) })
    log.append("Mira auctions, 'WTS Fleeting Quiver 20k'")
    const h = await settle(() => heard(page), (x) => x !== null && /Mira/.test(x), { timeoutMs: 15_000 })
    say('STEP 2 a 20k sale heard while the field still reads 12,500', { fieldShows: await field(page, WMAX), heard: h })

    // The same field on another watched item.
    await page.click(ROW4)
    await sleep(500)
    await tick(page, 'bazaar-watch-on')
    await tick(page, 'bazaar-watch-wts')
    say('STEP 3 +4 picked right after, its own new watch with WTS on', { fieldShows: await field(page, WMAX), chip: await chip(page, ROW4), stored: await stored(page) })
    await page.click(ROW0)
    await sleep(500)
    say('STEP 3 back on +0', { fieldShows: await field(page, WMAX), chip: await chip(page, ROW0) })

    // The percent field, typed key by key as a player would.
    await typeAndBlur(page, WMAX, '')
    await page.click(SHARE)
    const seq: unknown[] = []
    for (const k of ['1', '2', '.', '5']) {
      await page.keyboard.press(k === '.' ? 'Period' : `Digit${k}`)
      await sleep(350)
      seq.push({ key: k, fieldShows: await field(page, SHARE), storedShare: await ev(page, 'window.eq.getBazaarWatch().then((l) => l.entries.map((e) => e.wtsShare))'), chip: await chip(page, ROW0) })
    }
    say('STEP 4 percent field typed 1,2,.,5', seq.map((s) => JSON.stringify(s)).join('\n'))
    await page.fill(SHARE, '')
    await sleep(300)
    await page.fill(SHARE, '80')
    await sleep(400)
    say('STEP 4 percent 80 only', { fieldShows: await field(page, SHARE), chip: await chip(page, ROW0), stored: await stored(page) })
    await typeAndBlur(page, WMAX, '12500')
    say('STEP 4 percent 80 and 12500', { chip: await chip(page, ROW0), stored: await stored(page) })
    say('STEP 4 list width WITH the long chip, default window', await tableWidth(page))

    // Sizes: what reaches past the detail panel.
    say('STEP 5 default 100%', await overflowers(page))
    await resizeTo(launch.app, page, 900, 700)
    say('STEP 6 900 px 100%', await overflowers(page))
    say('STEP 6 list width 900', await tableWidth(page))
    await setScale(page, 1.25)
    say('STEP 7 900 px 125%', await overflowers(page))
    await resizeTo(launch.app, page, 1280, 860)
    say('STEP 8 1280 px 125%', await overflowers(page))
    say('STEP 8 list width 1280 @125%', await tableWidth(page))
    await setScale(page, 1)
    say('console errors', errors.slice(0, 8))
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
