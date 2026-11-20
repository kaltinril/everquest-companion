// zz-probe-skills-6.mts: THROWAWAY. A real play log's skills (cw1), a character switch with the
// tab open, the first-run notice over the list, and the cut-off measure at the minimum window.
import type { Page } from 'playwright-core'
import { settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { answerNotice, bound, measure, openSkills, report, requireBuilt, resizeTo, say, setScale, waitRows } from './zz-probe-skills-0.mjs'

const OTHER = 'Drywrought'
const rowsText = (page: Page): Promise<string[]> =>
  page.evaluate('Array.from(document.querySelectorAll("[data-testid=skill-row]")).map((r) => Array.from(r.querySelectorAll("td")).map((c) => c.innerText).join(" | "))') as Promise<string[]>

/** What a player can and cannot read in the list without scrolling sideways. */
const CUT = `(() => {
  const t = document.querySelector('[data-testid="skills-table"]');
  if (!t) return null;
  const sc = t.parentElement; const s = sc.getBoundingClientRect();
  const visRight = s.left + sc.clientWidth; const visBottom = s.top + sc.clientHeight;
  const out = { scrollerLeft: s.left, visibleRight: visRight, visibleBottom: visBottom, scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth, hScrollbar: sc.scrollWidth > sc.clientWidth, heads: [], firstRow: [], rowsFullyVisible: 0, rowCursor: null, rowHoverClass: null };
  for (const th of t.querySelectorAll('thead th')) { const g = document.createRange(); g.selectNodeContents(th); const r = g.getBoundingClientRect(); out.heads.push(th.innerText.replace(/\\s+/g, ' ') + ': text ' + Math.round(r.left) + '..' + Math.round(r.right) + (r.right > visRight + 0.5 ? ' CUT by ' + Math.round(r.right - visRight) + 'px' : ' ok')); }
  const rows = Array.from(t.querySelectorAll('[data-testid="skill-row"]'));
  const headBottom = t.querySelector('thead th').getBoundingClientRect().bottom;
  out.rowsFullyVisible = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= headBottom - 0.5 && b.bottom <= visBottom + 0.5; }).length;
  if (rows[0]) { out.rowCursor = getComputedStyle(rows[0]).cursor; out.rowHoverClass = rows[0].className; for (const td of rows[0].querySelectorAll('td')) { const g = document.createRange(); g.selectNodeContents(td); const r = g.getBoundingClientRect(); out.firstRow.push(JSON.stringify(td.innerText) + ': text ' + Math.round(r.left) + '..' + Math.round(r.right) + (r.right > visRight + 0.5 ? ' CUT by ' + Math.round(r.right - visRight) + 'px' : ' ok')); } }
  return out;
})()`

async function main(): Promise<void> {
  requireBuilt()
  const log = stageFixture('e2e-voice.log', { others: { [OTHER]: 'cw1-who-anchored.log' } })
  const now = Date.now()
  log.appendAt(new Date(now - 40 * 60_000), 'Welcome to EverQuest Legends!')
  log.appendAt(new Date(now - 30 * 60_000), 'You have become better at Fishing! (11)')
  log.appendAt(new Date(now - 20 * 60_000), 'You have become better at Fishing! (12)', 'You have become better at Begging! (3)')

  const launch = await launchOnFixture(log)
  const done = bound(async () => { await launch.close(); await log.dispose() }, 260_000)
  try {
    const page: Page = await mainWindow(launch.app)
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="telemetry-notice"]', { timeout: 15_000 }).catch(() => undefined)
    await page.evaluate('document.querySelector("[data-testid=nav-skills]").click()')
    await waitRows(page, 2)
    say('STEP 1 Primitive rows', (await rowsText(page)).join('\n'))

    // STEP 2: switch the character with the tab open; watch every change on the way.
    const otherPath = log.others[OTHER]
    const seen: string[] = []
    let last = ''
    const t0 = Date.now()
    const switching = page.evaluate(`window.eq.setCharacter(${JSON.stringify(otherPath)})`)
    while (Date.now() - t0 < 25_000) {
      const s = (await page.evaluate('(() => { const v = document.querySelector("[data-testid=skills-view]"); const who = document.body.innerText.split("\\n").find((l) => l.includes("freeport")) || ""; return who + " || " + (v ? v.innerText.split("\\n").slice(3, 7).join(" / ") : "<no view>") + " || rows=" + document.querySelectorAll("[data-testid=skill-row]").length + " empty=" + (document.querySelector("[data-testid=skills-empty]") ? document.querySelector("[data-testid=skills-empty]").innerText : "none"); })()')) as string
      if (s !== last) { last = s; seen.push(`[t+${String(Date.now() - t0)} ms] ${s}`) }
      if (/rows=3\d/.test(s) && Date.now() - t0 > 6000) break
      await sleep(80)
    }
    await switching
    say('STEP 2 the switch to the second character, every change on screen', seen.join('\n'))
    await sleep(1500)
    const real = await measure(page)
    report('2-real-log-with-notice', real)

    // STEP 3: the first-run notice over the list: scroll to the end, are the last rows reachable?
    await page.evaluate('(() => { const s = document.querySelector("[data-testid=skills-table]").parentElement; s.scrollTop = s.scrollHeight; })()')
    await sleep(1500)
    const end = await measure(page)
    say('STEP 3 notice rect', end.notice)
    say('STEP 3 rows under the notice (hit test at each cell centre)', end.rows.filter((r: { cells: { hit: string }[] }) => r.cells.some((c) => c.hit.startsWith('covered'))).map((r: { i: number; y: number; cells: { text: string; hit: string }[] }) => `row ${String(r.i)} y=${String(r.y)}: ${r.cells.map((c) => `${c.text} [${c.hit}]`).join(' | ')}`))
    await answerNotice(page)
    say('STEP 4 cut-off measure, default window', await page.evaluate(CUT))

    // STEP 5: the minimum window, 100% / 125% / 150%.
    await resizeTo(launch.app, page, 900, 600)
    say('STEP 5 cut-off measure, 900x600 at 100%', await page.evaluate(CUT))
    await setScale(page, 1.25)
    say('STEP 5 cut-off measure, 900x600 at 125%', await page.evaluate(CUT))
    await setScale(page, 1.5)
    say('STEP 5 cut-off measure, 900x600 at 150%', await page.evaluate(CUT))
    await resizeTo(launch.app, page, 1280, 860)
    say('STEP 5 cut-off measure, 1280x860 at 150%', await page.evaluate(CUT))
    await setScale(page, 1.25)
    say('STEP 5 cut-off measure, 1280x860 at 125%', await page.evaluate(CUT))
    await setScale(page, 1)

    // STEP 6: back to the first character.
    const back: string[] = []
    last = ''
    const t1 = Date.now()
    const again = page.evaluate(`window.eq.setCharacter(${JSON.stringify(log.logPath)})`)
    while (Date.now() - t1 < 12_000) {
      const s = (await rowsText(page)).slice(0, 3).join(' / ')
      if (s !== last) { last = s; back.push(`[t+${String(Date.now() - t1)} ms] ${s === '' ? '<no rows>' : s}`) }
      await sleep(80)
    }
    await again
    say('STEP 6 back to Primitive, every change', back.join('\n'))
    await settle(() => rowsText(page), (r) => r.length === 2, { timeoutMs: 10_000 })
    say('console errors', errors)
  } finally {
    done()
    await launch.close()
    await log.dispose()
  }
}

main().catch((err: unknown) => {
  console.error('probe error:', err)
  process.exitCode = 1
})
