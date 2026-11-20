// zz-probe-bazaar-buffs-4.mts: THROWAWAY. Buffs tab layout: the cards, the Durations table and the edit
// dialog at the default window, at 900 px, at 125% text, with and without the opt-in boxes. Also a
// "From my log" estimate that lands on a half second, against the median column beside it.
import type { Page } from 'playwright-core'
import { settle } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture, type FixtureLog } from './logFixture.mjs'
import { LIB, answerNotice, bound, ev, requireBuilt, resizeTo, save, say, setScale, sleep } from './zz-probe-bazaar-buffs-0.mjs'

const DIALOG = '[data-testid="buff-duration-dialog"]'

function cast(log: FixtureLog, spell: string, landed: string): void {
  const at = new Date()
  log.appendAt(new Date(at.getTime() - 1000), `You begin casting ${spell}.`)
  log.appendAt(at, landed)
}

function tableRows(page: Page): Promise<string[]> {
  return ev(page, `[...document.querySelectorAll('[data-testid="buff-stats-row"]')].map((r) => [...r.children].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()).join(' ; '))`)
}

async function openDialog(page: Page, spell: string): Promise<void> {
  await ev(page, `[...document.querySelectorAll('[data-testid="buff-stats-row"]')].find((r) => r.dataset.spell === ${JSON.stringify(spell)}).querySelector('[data-testid="buff-duration-edit"]').click()`)
  await page.waitForSelector(DIALOG, { timeout: 10_000 })
  await sleep(500)
}
async function pick(page: Page, mode: string): Promise<void> {
  await ev(page, `document.querySelector('${DIALOG} input[type=radio][value="${mode}"]').click()`)
  await sleep(300)
}
async function closeDialog(page: Page, how: 'save' | 'cancel'): Promise<void> {
  await page.click(`[data-testid="buff-duration-${how}"]`)
  await settle(() => ev<number>(page, `document.querySelectorAll('${DIALOG}').length`), (n) => n === 0, { timeoutMs: 8_000 })
  await sleep(600)
}

/** The cards and the tables, measured. */
function layout(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const content = document.querySelector('[data-testid="app-content"]');
    const cards = [...document.querySelectorAll('[data-testid="active-buff-name"]')].map((n) => {
      const card = n.closest('.MuiPaper-root');
      const cr = rc(card);
      const head = card.children[0];
      const kids = [...head.children].filter((k) => k.getBoundingClientRect().width > 0).map((k) => ({ text: txt(k), rect: rc(k), cut: cut(k), lines: Math.round(k.getBoundingClientRect().height / parseFloat(getComputedStyle(k).lineHeight || '20')) }));
      const overlaps = [];
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (inter(kids[i].rect, kids[j].rect)) overlaps.push(JSON.stringify(kids[i].text) + ' x ' + JSON.stringify(kids[j].text));
      const past = kids.filter((k) => k.rect.right > cr.right - 1 || k.rect.x < cr.x).map((k) => k.text + ' reaches ' + f(k.rect.right - cr.right) + ' px past the card');
      const cap = card.children[2];
      const capKids = cap ? [...cap.querySelectorAll('.MuiTypography-root, .MuiChip-root')].map((k) => ({ text: txt(k), rect: rc(k), cut: cut(k) })) : [];
      const capOver = [];
      for (let i = 0; i < capKids.length; i++) for (let j = i + 1; j < capKids.length; j++) if (inter(capKids[i].rect, capKids[j].rect)) capOver.push(JSON.stringify(capKids[i].text) + ' x ' + JSON.stringify(capKids[j].text));
      return { name: txt(n), card: cr, cardCut: cut(card), headH: f(head.getBoundingClientRect().height), kids, overlaps, past, caption: capKids, capOver, offRight: cr.right > vw };
    });
    const tables = [...document.querySelectorAll('[data-testid="buff-stats-scroll"]')].map((s) => {
      const heads = [...s.querySelectorAll('th')].map((h) => { const r = h.getBoundingClientRect(); const b = s.getBoundingClientRect(); return txt(h) + '[' + f(r.left) + '-' + f(r.right) + (r.left >= b.right - 1 ? ' OUTSIDE BOX' : r.right > b.right + 0.5 ? ' CUT BY BOX' : '') + ']'; });
      const rows = [...s.querySelectorAll('[data-testid="buff-stats-row"]')].map((r) => {
        const cells = [...r.children].map((c) => ({ text: txt(c), rect: rc(c), cut: cut(c) }));
        const edit = r.querySelector('[data-testid="buff-duration-edit"]');
        const est = r.querySelector('span[title]');
        const chip = r.querySelector('.MuiChip-root');
        return { spell: r.dataset.spell, h: f(r.getBoundingClientRect().height), cells: cells.map((c) => c.text + '[' + c.rect.x + '-' + c.rect.right + ' sw' + c.cut.sw + '/cw' + c.cut.cw + ']').join(' '), est: est ? { text: txt(est), rect: rc(est) } : null, chip: chip ? { text: txt(chip), rect: rc(chip), cut: cut(chip.querySelector('.MuiChip-label')) } : null, edit: edit ? { rect: rc(edit), hit: hit(edit), aria: edit.getAttribute('aria-label') } : null, chipOverEdit: chip && edit ? inter(rc(chip), rc(edit)) : null };
      });
      return { box: rc(s), boxCut: cut(s), heads, rows };
    });
    const search = document.querySelector('[data-testid="buff-stats-search"]');
    const sw = document.querySelector('[data-testid="buffs-allow-mode"]');
    const swLabel = sw ? sw.closest('label') : null;
    return { vw, vh, dpr: devicePixelRatio, content: cut(content), contentScrollsSideways: content.scrollWidth - content.clientWidth, cards, tables, search: search ? { rect: rc(search), hit: hit(search.querySelector('input')) } : null, allowSwitch: swLabel ? { text: txt(swLabel), rect: rc(swLabel), cut: cut(swLabel.querySelector('.MuiTypography-root')), offRight: swLabel.getBoundingClientRect().right > vw } : null };
  })()`)
}

function dialogLayout(page: Page): Promise<unknown> {
  return ev(page, `(() => { ${LIB}
    const d = document.querySelector('${DIALOG} .MuiDialog-paper');
    if (!d) return null;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const dr = rc(d);
    const parts = [...d.querySelectorAll('.MuiTypography-root, button, input[type=text], label.MuiInputLabel-root')].map((el) => ({ tag: el.tagName, text: (txt(el) || el.value || '').slice(0, 70), rect: rc(el), cut: cut(el), hit: (el.tagName === 'BUTTON' || el.tagName === 'INPUT') ? hit(el) : undefined, outside: el.getBoundingClientRect().right > dr.right + 0.5 || el.getBoundingClientRect().bottom > dr.bottom + 0.5 }));
    const content = d.querySelector('.MuiDialogContent-root');
    return { vw, vh, paper: dr, paperCut: cut(d), insideViewport: dr.x >= 0 && dr.y >= 0 && dr.right <= vw && dr.bottom <= vh, contentCut: content ? cut(content) : null, parts };
  })()`)
}

async function measureAll(page: Page, tag: string): Promise<void> {
  const l = await layout(page)
  save(`4-layout-${tag}.json`, l)
  await openDialog(page, "Jonthan's Whistling Warsong")
  await pick(page, 'fixed')
  await page.fill('[data-testid="buff-duration-input"]', 'abc')
  await sleep(300)
  save(`4-dialog-${tag}.json`, await dialogLayout(page))
  await closeDialog(page, 'cancel')
  say(`measured ${tag}`, 'saved')
}

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log')
  const launch = await launchOnFixture(log)
  const unbound = bound(async () => { await launch.close(); await log.dispose() }, 330_000)
  const errors: string[] = []
  try {
    const page = await mainWindow(launch.app)
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-buffs"]', { timeout: 60_000 })
    await answerNotice(page)
    await page.click('[data-testid="nav-buffs"]')
    await sleep(1200)

    // Two clean casts, 4 s and 5 s: "From my log" is their middle, 4.5 s.
    cast(log, "Jonthan's Whistling Warsong", 'You whistle an ancient warsong.')
    await sleep(4000)
    log.append('You stop whistling.')
    await sleep(1200)
    cast(log, "Jonthan's Whistling Warsong", 'You whistle an ancient warsong.')
    await sleep(5000)
    log.append('You stop whistling.')
    await sleep(1500)
    say('STEP 1 two casts: table', (await tableRows(page)).join('\n'))
    await openDialog(page, "Jonthan's Whistling Warsong")
    say('STEP 1 dialog', await ev(page, `document.querySelector('${DIALOG} .MuiDialog-paper').innerText.replace(/\\s*\\n\\s*/g, ' | ')`))
    await pick(page, 'log')
    await closeDialog(page, 'save')
    say('STEP 1 From my log saved: table', (await tableRows(page)).join('\n'))
    cast(log, "Jonthan's Whistling Warsong", 'You whistle an ancient warsong.')
    await sleep(1500)
    say('STEP 1 card on a 4.5 s estimate', await ev(page, `[...document.querySelectorAll('[data-testid="active-buff-name"]')].map((n) => n.closest('.MuiPaper-root').innerText.replace(/\\s*\\n\\s*/g, ' | '))`))

    // More cards: a long name, two long buffs, a typed 7.5, a debuff on an article-named mob.
    cast(log, 'Quivering Veil of Xarn', 'You are surrounded by the Quivering Veil of Xarn.')
    cast(log, 'Valor', 'You feel valorous.')
    cast(log, 'Spirit of Wolf', 'You feel the spirit of wolf enter you.')
    cast(log, 'Bounce', 'A reflective aura surrounds you.')
    cast(log, 'Flash of Light', 'a froglok ton warrior is blinded by a flash of light.')
    await sleep(2500)
    await openDialog(page, 'Bounce')
    await pick(page, 'fixed')
    await page.fill('[data-testid="buff-duration-input"]', '7.5')
    await closeDialog(page, 'save')
    say('STEP 2 table', (await tableRows(page)).join('\n'))
    say('STEP 2 cards', await ev(page, `[...document.querySelectorAll('[data-testid="active-buff-name"]')].map((n) => n.closest('.MuiPaper-root').innerText.replace(/\\s*\\n\\s*/g, ' | '))`))

    // The search's empty state.
    await page.fill('[data-testid="buff-stats-search"] input', 'zzz')
    await sleep(600)
    say('STEP 3 search zzz', await ev(page, `document.querySelector('[data-testid="buff-stats-search"]').closest('div.MuiBox-root').innerText.replace(/\\s*\\n\\s*/g, ' | ')`))
    await page.fill('[data-testid="buff-stats-search"] input', '')
    await sleep(600)

    await measureAll(page, 'default')
    await resizeTo(launch.app, page, 900, 700)
    await measureAll(page, '900')
    await setScale(page, 1.25)
    await measureAll(page, '900-125')
    // The opt-in boxes on: one more control on every card and one more column.
    await ev(page, `document.querySelector('[data-testid="buffs-allow-mode"] input, input[data-testid="buffs-allow-mode"]').click()`)
    await sleep(800)
    await measureAll(page, '900-125-boxes')
    await resizeTo(launch.app, page, 1280, 860)
    await measureAll(page, '1280-125-boxes')
    await setScale(page, 1)
    await measureAll(page, 'default-boxes')
    say('STEP 9 cards at the end', await ev(page, `[...document.querySelectorAll('[data-testid="active-buff-name"]')].map((n) => n.closest('.MuiPaper-root').innerText.replace(/\\s*\\n\\s*/g, ' | '))`))
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
