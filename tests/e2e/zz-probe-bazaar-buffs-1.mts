// zz-probe-bazaar-buffs-1.mts: THROWAWAY. Bazaar tab: staged trade chat, watches with typed thresholds,
// the chip and field text, live alerts, then the same screen at 900 px and at 125%.
import type { Page } from 'playwright-core'
import { settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { LIB, answerNotice, bound, ev, requireBuilt, resizeTo, save, say, setScale, sleep, typeAndBlur, windowBounds } from './zz-probe-bazaar-buffs-0.mjs'

const DAY = 86_400_000
const ROW0 = '[data-testid="bazaar-row-Fleeting Quiver|0"]'
const ROW4 = '[data-testid="bazaar-row-Fleeting Quiver|4"]'
const WMAX = '[data-testid="bazaar-watch-wts-max"]'
const WMIN = '[data-testid="bazaar-watch-wtb-min"]'
const SHARE = '[data-testid="bazaar-watch-wts-share"]'

function stored(page: Page): Promise<unknown> {
  return ev(page, 'window.eq.getBazaarWatch().then((l) => l.entries)')
}

/** Click a MUI checkbox/switch by its root testid: the real input inside it. */
async function tick(page: Page, testid: string): Promise<void> {
  await ev(page, `document.querySelector('[data-testid="${testid}"] input, input[data-testid="${testid}"]').click()`)
  await sleep(500)
}

/** Click a labelled checkbox inside the watch panel by its label text. */
async function tickLabel(page: Page, label: string): Promise<void> {
  await ev(page, `[...document.querySelectorAll('[data-testid="bazaar-watch"] label')].find((l) => l.innerText.trim() === ${JSON.stringify(label)}).querySelector('input').click()`)
  await sleep(500)
}

function panel(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    const p = document.querySelector('[data-testid="bazaar-watch"]');
    if (!p) return null;
    const inputs = [...p.querySelectorAll('input')].map((i) => ({ id: i.getAttribute('data-testid'), type: i.type, checked: i.type === 'checkbox' ? i.checked : undefined, value: i.type === 'checkbox' ? undefined : i.value, label: txt(i.closest('label') || i.closest('.MuiFormControl-root')), disabled: i.disabled }));
    return { text: txt(p), inputs };
  })()`)
}

function chips(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    return [...document.querySelectorAll('[data-testid^="bazaar-row-"]')].map((r) => ({ row: r.getAttribute('data-testid').slice(11), chip: txt(r.querySelector('[data-testid="bazaar-watch-chip"]')), cells: [...r.children].map((c) => txt(c)) }));
  })()`)
}

function heard(page: Page): Promise<string | null> {
  return ev(page, `(() => { const h = document.querySelector('[data-testid="bazaar-heard"]'); return h ? h.innerText : null; })()`)
}

/** Everything about the layout a player could see wrong. */
function layout(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const scroll = document.querySelector('[data-testid="bazaar-scroll"]');
    const content = document.querySelector('[data-testid="app-content"]');
    const rows = [...document.querySelectorAll('[data-testid^="bazaar-row-"]')].map((r) => {
      const cell = r.children[0];
      const stack = cell.firstElementChild;
      const kids = [...stack.children].map((k) => ({ text: txt(k), rect: rc(k), cut: cut(k.querySelector('.MuiChip-label') || k), clip: clipBy(k) }));
      const overlaps = [];
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (inter(kids[i].rect, kids[j].rect)) overlaps.push(kids[i].text + ' x ' + kids[j].text);
      const last = r.children[r.children.length - 1];
      return { row: r.getAttribute('data-testid').slice(11), h: f(r.getBoundingClientRect().height), cell: rc(cell), stack: rc(stack), stackCut: cut(stack), kids, overlaps, lastCell: { text: txt(last), rect: rc(last), clip: clipBy(last) } };
    });
    const heads = [...document.querySelectorAll('[data-testid="bazaar-scroll"] th')].map((h) => ({ text: txt(h), rect: rc(h), clip: clipBy(h) }));
    const p = document.querySelector('[data-testid="bazaar-watch"]');
    const fields = p ? [...p.querySelectorAll('.MuiFormControl-root, label.MuiFormControlLabel-root')].map((fc) => {
      const lab = fc.querySelector('label.MuiInputLabel-root');
      const inp = fc.querySelector('input');
      return { text: txt(fc), rect: rc(fc), label: lab ? { text: txt(lab), rect: rc(lab), cut: cut(lab), shrunk: lab.getAttribute('data-shrink'), style: style(lab, ['textOverflow', 'whiteSpace', 'overflow', 'maxWidth']) } : null, input: inp ? { id: inp.getAttribute('data-testid'), value: inp.value, placeholder: inp.placeholder, rect: rc(inp), cut: cut(inp) } : null, hit: hit(inp || fc), clip: clipBy(fc), offRight: fc.getBoundingClientRect().right > vw };
    }) : [];
    const cap = p ? p.querySelector('.MuiTypography-caption') : null;
    const detail = document.querySelector('[data-testid="bazaar-detail"]');
    const heardEl = document.querySelector('[data-testid="bazaar-heard"]');
    const heardLines = heardEl ? [...heardEl.querySelectorAll('.MuiTypography-body2')].map((l) => ({ text: txt(l), rect: rc(l), cut: cut(l), clip: clipBy(l) })) : [];
    return {
      vw, vh, dpr: devicePixelRatio,
      docOverflowX: document.documentElement.scrollWidth - vw,
      content: content ? cut(content) : null,
      scroll: scroll ? { rect: rc(scroll), cut: cut(scroll), table: rc(scroll.querySelector('table')) } : null,
      heads, rows, fields,
      caption: cap ? { text: txt(cap), rect: rc(cap), cut: cut(cap), clip: clipBy(cap) } : null,
      detail: detail ? { rect: rc(detail), cut: cut(detail) } : null,
      heardLines
    };
  })()`)
}

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const now = Date.now()
  const at = (days: number, sec: number): Date => new Date(now - days * DAY + sec * 1000)
  // History: three earlier days of trade chat, written before launch so it is replay.
  log.appendAt(at(3, 0), "Leric auctions, 'WTS Fleeting Quiver 14k'", "Bront auctions, 'WTS Fleeting Quiver 16k'", "Calla auctions, 'WTB Fleeting Quiver 9k'", "Leric auctions, 'WTS Fleeting Quiver +4 30k'")
  log.appendAt(at(2, 0), "Dorn auctions, 'WTS Fleeting Quiver 15k'", "Evie auctions, 'WTS Fleeting Quiver +4 28k'", "Fenn auctions, 'WTS Cloak of Flames 1,500pp'", "Garr auctions, 'WTS Rain Caller 4k - 5k'", "Hale auctions, 'WTS 3k for Bone Chips'")
  log.appendAt(at(1, 0), "Ivor auctions, 'WTS Fleeting Quiver 15k'", "Jask auctions, 'WTS Fleeting Quiver +4 29k'", "Kell auctions, 'WTS Short Sword of the Ykesha 12,500 pp'", "Lorn tells General:1, 'WTS Runed Bolster Belt 1,250,000 plat'")

  const launch = await launchOnFixture(log)
  const unbound = bound(async () => { await launch.close(); await log.dispose() }, 330_000)
  const errors: string[] = []
  try {
    const page = await mainWindow(launch.app)
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-bazaar"]', { timeout: 60_000 })
    await answerNotice(page)
    say('window', await windowBounds(launch.app, page))
    await page.click('[data-testid="nav-bazaar"]')
    await page.waitForSelector('[data-testid="bazaar-view"]', { timeout: 30_000 })
    const rowsSeen = await settle(() => ev<number>(page, `document.querySelectorAll('[data-testid^="bazaar-row-"]').length`), (n) => n >= 5, { timeoutMs: 30_000 })
    say('STEP 1 rows mounted', rowsSeen)
    say('STEP 1 intro', await ev(page, `document.querySelector('[data-testid="bazaar-view"] > p').innerText`))
    say('STEP 1 rows', await chips(page))

    // ---- a watch on Fleeting Quiver +0 ----
    await page.click(ROW0)
    await sleep(600)
    say('STEP 2 detail head', await ev(page, `document.querySelector('[data-testid="bazaar-detail"]').innerText.split('\\n').slice(0, 14).join(' | ')`))
    say('STEP 2 panel before', await panel(page))
    await tick(page, 'bazaar-watch-on')
    say('STEP 3 panel after Watch on', await panel(page))
    say('STEP 3 chips', await chips(page))
    await tick(page, 'bazaar-watch-wts')
    say('STEP 4 panel after WTS ticked', await panel(page))
    say('STEP 4 chip', await ev(page, `(document.querySelector('${ROW0} [data-testid="bazaar-watch-chip"]') || {}).innerText`))

    // ---- typed thresholds: field text, chip, stored ----
    const typed: unknown[] = []
    for (const t of ['12500', '12,500', '13k', '12.5k', '12345', '1,500pp', '1 500', 'abc', '', '12,500', '', '1.5m', '0', '12500pp', '12499.5', '999999999']) {
      await typeAndBlur(page, WMAX, t)
      typed.push({
        typed: t,
        field: await ev(page, `document.querySelector('${WMAX}').value`),
        chip: await ev(page, `(document.querySelector('${ROW0} [data-testid="bazaar-watch-chip"]') || {}).innerText`),
        storedMax: await ev(page, `window.eq.getBazaarWatch().then((l) => l.entries.map((e) => e.wtsMax))`)
      })
    }
    say('STEP 5 typed WTS thresholds (typed -> field text / chip / stored)', typed.map((t) => JSON.stringify(t)).join('\n'))
    save('1-typed.json', typed)

    await typeAndBlur(page, WMAX, '12500')
    await tick(page, 'bazaar-watch-wtb')
    await typeAndBlur(page, WMIN, '9500')
    say('STEP 6 panel with both sides', await panel(page))
    say('STEP 6 chip', await ev(page, `(document.querySelector('${ROW0} [data-testid="bazaar-watch-chip"]') || {}).innerText`))
    say('STEP 6 stored', await stored(page))
    say('STEP 6 layout default', await layout(page).then((l) => { save('1-layout-default.json', l); return 'saved 1-layout-default.json' }))

    // ---- live offers against that watch ----
    log.append(
      "Mira auctions, 'WTS Fleeting Quiver 12,500pp'",
      "Nolt auctions, 'WTS Fleeting Quiver 12,600pp'",
      "Orin auctions, 'WTS Fleeting Quiver 4k - 5k'",
      "Pell auctions, 'WTS 3k for Fleeting Quiver'",
      "Quin auctions, 'WTB Fleeting Quiver 9,500pp'",
      "Rusk auctions, 'WTB Fleeting Quiver'"
    )
    const h1 = await settle(() => heard(page), (h) => h !== null && h.split('\n').length >= 5, { timeoutMs: 20_000 })
    say('STEP 7 heard alerts after six live offers (12,500pp / 12,600pp / 4k - 5k / 3k for / WTB 9,500pp / WTB no price)', h1 ?? 'NO bazaar-heard panel')
    say('STEP 7 banner text anywhere', await ev(page, `[...document.querySelectorAll('[data-testid*="banner"]')].map((b) => b.getAttribute('data-testid') + ': ' + b.innerText).join(' || ')`))
    say('STEP 7 rows', await chips(page))

    // ---- threshold with a % of median as well: what does the chip say ----
    await page.fill(SHARE, '80')
    await sleep(600)
    say('STEP 8 with 80% share', { panel: await panel(page), chip: await ev(page, `(document.querySelector('${ROW0} [data-testid="bazaar-watch-chip"]') || {}).innerText`), stored: await stored(page) })
    // Median asking over 7 days is ~15k, so 80% is ~12k: a sale at 11.9k alerts under both; raise the max out of the way.
    await typeAndBlur(page, WMAX, '100')
    say('STEP 8b max 100p + 80% share', { chip: await ev(page, `(document.querySelector('${ROW0} [data-testid="bazaar-watch-chip"]') || {}).innerText`), stored: await stored(page) })
    log.append("Sela auctions, 'WTS Fleeting Quiver 9k'")
    const h2 = await settle(() => heard(page), (h) => h !== null && /Sela/.test(h), { timeoutMs: 15_000 })
    say('STEP 8b heard after a 9k sale with max 100p and 80% share', h2 ?? 'none')

    // ---- every tier ----
    await page.fill(SHARE, '')
    await sleep(400)
    await typeAndBlur(page, WMAX, '31000')
    // +4 first gets its own watch with WTB only.
    await page.click(ROW4)
    await sleep(600)
    say('STEP 9 +4 panel before', await panel(page))
    await tick(page, 'bazaar-watch-on')
    await tick(page, 'bazaar-watch-wtb')
    say('STEP 9 +4 panel own watch WTB only', await panel(page))
    // back on +0: make its watch every tier
    await page.click(ROW0)
    await sleep(600)
    await tickLabel(page, 'Every tier')
    say('STEP 10 +0 panel after Every tier', await panel(page))
    say('STEP 10 stored', await stored(page))
    say('STEP 10 chips', await chips(page))
    await page.click(ROW4)
    await sleep(600)
    say('STEP 10 +4 panel while an every-tier watch exists', await panel(page))
    log.append("Tovi auctions, 'WTS Fleeting Quiver +4 25k'", "Ulla auctions, 'WTS Fleeting Quiver +2 20k'", "Vann auctions, 'WTB Fleeting Quiver +4 1k'")
    const h3 = await settle(() => heard(page), (h) => h !== null && /Ulla/.test(h) && /Vann/.test(h), { timeoutMs: 15_000 })
    say('STEP 11 heard after +4 WTS 25k, +2 WTS 20k, +4 WTB 1k', h3 ?? 'none')
    say('STEP 11 chips', await chips(page))

    // ---- all tiers as one ----
    await tick(page, 'bazaar-combine-tiers')
    await sleep(800)
    say('STEP 12 combined rows', await chips(page))
    say('STEP 12 combined panel', await panel(page))
    say('STEP 12 layout combined', await layout(page).then((l) => { save('1-layout-combined.json', l); return 'saved' }))
    await tick(page, 'bazaar-combine-tiers')
    await sleep(800)
    await page.click(ROW0)
    await sleep(500)

    // ---- sizes ----
    say('STEP 13 layout default after alerts', await layout(page).then((l) => { save('1-layout-default-2.json', l); return 'saved' }))
    say('STEP 14 resized', await resizeTo(launch.app, page, 900, 700))
    say('STEP 14 layout 900', await layout(page).then((l) => { save('1-layout-900.json', l); return 'saved' }))
    await setScale(page, 1.25)
    say('STEP 15 layout 900 @125%', await layout(page).then((l) => { save('1-layout-900-125.json', l); return 'saved' }))
    say('STEP 16 resized', await resizeTo(launch.app, page, 1280, 800))
    say('STEP 16 layout 1280 @125%', await layout(page).then((l) => { save('1-layout-1280-125.json', l); return 'saved' }))
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
