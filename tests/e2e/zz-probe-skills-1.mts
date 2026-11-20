// zz-probe-skills-1.mts: THROWAWAY. The Skills tab with a full table: default window, the app's
// minimum, 125% text, the filter, the hover reasons, a live raise, a scrolled list.
import type { Page } from 'playwright-core'
import { hoverAt, settle, sleep } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { answerNotice, bound, measure, openSkills, report, requireBuilt, resizeTo, rowCount, save, say, setScale, waitRows } from './zz-probe-skills-0.mjs'

const MIN = 60_000
const OLD = [
  '1H Blunt', '1H Slashing', '2H Blunt', '2H Slashing', 'Abjuration', 'Alteration', 'Apply Poison', 'Archery',
  'Backstab', 'Bash', 'Bind Wound', 'Block', 'Brass Instruments', 'Conjuration', 'Defense', 'Disarm Traps',
  'Divination', 'Dodge', 'Double Attack', 'Evocation', 'Feign Death', 'Hand to Hand', 'Meditate', 'Offense',
  'Percussion Instruments', 'Stringed Instruments', 'Wind Instruments', 'Specialize Transmutation',
  'Specialize Conjuration', 'Alcohol Tolerance', 'Sense Heading', 'Jewelry Making', 'Make Poison', 'Research',
  'Blacksmithing', 'Pottery', 'Fletching', 'Brewing', 'Tinkering', 'Alchemy'
]

async function main(): Promise<void> {
  requireBuilt()
  const now = Date.now()
  const log = stageFixture('e2e-voice.log')
  const ev: { t: number; m: string }[] = []
  const at = (minsAgo: number, ...m: string[]): void => { for (const x of m) ev.push({ t: now - minsAgo * MIN, m: x }) }
  // Yesterday's session: its rows must carry no session columns today.
  const y = 26 * 60
  at(y, 'Welcome to EverQuest Legends!')
  at(y - 1, 'You have entered The Nektulos Forest.')
  OLD.forEach((s, i) => at(y - 2 - i, `You have become better at ${s}! (${String(i % 3 === 0 ? 252 : i % 3 === 1 ? 7 : 48)})`))
  at(y - 50, 'You have become better at Fishing! (100)', 'You have become better at Baking! (4)', 'You have become better at Forage! (52)')
  // Today's session.
  at(45, 'Welcome to EverQuest Legends!')
  at(44, 'You have entered The Nektulos Forest.')
  at(35, 'You have become better at Fishing! (101)')
  for (let i = 0; i <= 30; i++) at(34 - i, `You have become better at Channeling! (${String(10 + i)})`) // 31 raises, 30 min: 60.0/hr
  at(25, 'You have become better at Fishing! (102)') // 2 raises, 10 min: 6.00/hr
  at(24.5, 'You have become better at Baking! (5)') // 1 raise: needs a second
  at(10, 'You have become better at Tailoring! (10)')
  at(9, 'You have become better at Tailoring! (11)') // 2 raises, 1 min: too short
  at(8, 'You have become better at Forage! (50)') // the level went DOWN from 52
  at(7, 'You have become better at Specialize Transmutation! (252)') // repeats yesterday's level: not a raise
  for (let i = 0; i < 30; i++) ev.push({ t: now - 6 * MIN + i * 12_000, m: `You have become better at Dual Wield! (${String(i + 1)})` }) // 30 raises in 5:48: 300/hr
  ev.sort((p, q) => p.t - q.t)
  for (const e of ev) log.appendAt(new Date(e.t), e.m)

  const launch = await launchOnFixture(log)
  const done = bound(async () => { await launch.close(); await log.dispose() }, 240_000)
  try {
    const page: Page = await mainWindow(launch.app)
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForSelector('[data-testid="nav-skills"]', { timeout: 60_000 })
    await answerNotice(page)

    // STEP 1: the menu row before it is clicked.
    report('1-before-click', await measure(page))
    await openSkills(page)
    await waitRows(page, 40)
    await sleep(800)
    const snap = await page.evaluate('window.eq.getModuleSnapshot("skills")')
    save('1-snapshot.json', snap)
    say('STEP 2 engine snapshot rows', (snap as { state: { rows: unknown[] } }).state.rows.length)

    // STEP 2: default window.
    const m2 = await measure(page)
    report('2-default', m2)
    say('STEP 2 nav rows', m2.navRows.join('\n'))

    // STEP 3: hover the header tips and the withheld dashes.
    for (const [label, sel, nth] of [['Level', 'thead th:nth-child(2) span', 0], ['Per hour', 'thead th:nth-child(4) span', 0]] as const) {
      await page.hover(sel, { timeout: 10_000 }).catch((e: unknown) => say(`hover ${label} failed`, String(e)))
      const tip = await settle(() => page.evaluate('Array.from(document.querySelectorAll("[role=tooltip]")).map((t) => t.innerText + " @" + JSON.stringify(t.getBoundingClientRect().toJSON()))') as Promise<string[]>, (t) => t.length > 0, { timeoutMs: 4000 })
      say(`STEP 3 tooltip on ${label} (${String(nth)})`, tip)
      await page.mouse.move(2, 2)
      await sleep(500)
    }
    const dashes = await page.evaluate('Array.from(document.querySelectorAll("[data-testid=skill-rate-withheld]")).map((d) => d.closest("tr").innerText.replace(/\\s+/g, " "))') as string[]
    say('STEP 3 rows with a withheld pace', dashes)
    for (let i = 0; i < dashes.length; i++) {
      await page.locator('[data-testid="skill-rate-withheld"]').nth(i).hover({ timeout: 10_000 }).catch((e: unknown) => say('hover dash failed', String(e)))
      const tip = await settle(() => page.evaluate('Array.from(document.querySelectorAll("[role=tooltip]")).map((t) => t.innerText + " @" + JSON.stringify(t.getBoundingClientRect().toJSON()))') as Promise<string[]>, (t) => t.length > 0, { timeoutMs: 4000 })
      say(`STEP 3 tooltip on the dash of "${dashes[i]}"`, tip)
      await page.mouse.move(2, 2)
      await sleep(500)
    }

    // STEP 4: scroll the list to its end; the header must stay, the last row must be reachable.
    await page.evaluate('(() => { const s = document.querySelector("[data-testid=skills-table]").parentElement; s.scrollTop = s.scrollHeight; })()')
    await sleep(1500)
    const m4 = await measure(page)
    report('4-scrolled-end', m4)
    await page.evaluate('(() => { const s = document.querySelector("[data-testid=skills-table]").parentElement; s.scrollTop = 0; })()')
    await sleep(1000)

    // STEP 5: a live raise, stamped now.
    log.append('You have become better at Fishing! (103)', 'You have become better at Sense Traps! (1)')
    const fishing = await settle(() => page.evaluate('Array.from(document.querySelectorAll("[data-testid=skill-row]")).slice(0, 4).map((r) => r.innerText.replace(/\\s+/g, " "))') as Promise<string[]>, (r) => r.some((x) => x.startsWith('Fishing 103')), { timeoutMs: 20_000 })
    say('STEP 5 top rows after a live Fishing 103 and a new Sense Traps 1', fishing)
    say('STEP 5 row count', await rowCount(page))

    // STEP 6: Tradeskills only.
    await page.click('[data-testid="skills-tradeskills-only"]')
    await sleep(800)
    const m6 = await measure(page)
    report('6-tradeskills-only', m6)
    // the label is a control too
    await page.click('[data-testid="skills-view"] label >> text=Tradeskills only')
    await sleep(600)
    say('STEP 6 clicking the label turns it back off: rows', await rowCount(page))

    // STEP 7: the app's minimum window.
    say('STEP 7 resized to', await resizeTo(launch.app, page, 900, 600))
    const m7 = await measure(page)
    report('7-min-900x600', m7)
    say('STEP 7 nav rows', m7.navRows.join('\n'))
    await page.evaluate('(() => { const p = document.querySelector(".MuiDrawer-paper"); p.scrollTop = p.scrollHeight; })()')
    await sleep(1200)
    const m7b = await measure(page)
    say('STEP 7 drawer scrolled to its end: nav-skills', { nav: m7b.nav, drawer: m7b.drawer })

    // STEP 8: 125% text at the minimum window, then at the default window.
    say('STEP 8 dpr at 125%', await setScale(page, 1.25))
    const m8 = await measure(page)
    report('8-min-125pct', m8)
    say('STEP 8 nav rows', m8.navRows.join('\n'))
    await page.evaluate('(() => { const s = document.querySelector("[data-testid=skills-table]").parentElement; s.scrollTop = s.scrollHeight; })()')
    await sleep(1500)
    report('8b-min-125pct-scrolled-end', await measure(page))
    await page.evaluate('(() => { const s = document.querySelector("[data-testid=skills-table]").parentElement; s.scrollTop = 0; })()')
    say('STEP 9 resized to', await resizeTo(launch.app, page, 1280, 860))
    const m9 = await measure(page)
    report('9-default-125pct', m9)
    say('STEP 9 nav rows', m9.navRows.join('\n'))
    await hoverAt(page, '[data-testid="skill-rate-withheld"]', 0.5, 0.5)
    await sleep(1200)
    say('STEP 9 dash tooltip at 125%', (await measure(page)).tooltips)
    await page.mouse.move(2, 2)
    say('STEP 10 dpr at 150%', await setScale(page, 1.5))
    say('STEP 10 resized to', await resizeTo(launch.app, page, 900, 600))
    const m10 = await measure(page)
    report('10-min-150pct', m10)
    await setScale(page, 1)
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
