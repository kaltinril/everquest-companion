/**
 * The Overview widgets (docs/community/plans/2026-11-27-overview-widgets.md, Phase 1), as WIRING
 * only: the default page is the six cards it always had, Customize opens the checklist, a card
 * checked on mounts with engine data, Edit layout (handles, widths, a drag, Esc), and the layout
 * survives a relaunch. The values each card shows, and the layout maths, are pinned by
 * tests/overviewCards.test.mts and tests/overviewLayout.test.mts.
 *
 * Its own file because overview.e2e.mts is already long; the spec calls these in order.
 */
import type { Page } from 'playwright-core'
import { check, countOf, settle, settleCount, waitHydrated } from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture, type FixtureLog } from './logFixture.mjs'

const TODAY = ['dps', 'leveling', 'target', 'dpsCurve', 'drops', 'kills']
const NEW = ['buffs', 'respawns', 'motes', 'coin']
const GRID = '[data-testid="overview-grid"]'

/** The widget ids on the page, in page order. */
function shownWidgets(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-overview-widget]')].map((e) => (e as HTMLElement).dataset.overviewWidget ?? '')
  )
}

function textOf(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') ?? '', sel)
}

/** A fresh install draws the page exactly as it was before widgets: the six, in their order. */
export async function stepDefaultWidgets(page: Page): Promise<void> {
  const shown = await settle(() => shownWidgets(page), (w) => w.length >= TODAY.length, { timeoutMs: 15_000 })
  check(
    'a fresh install shows the six cards Overview always had, in their order, and none of the new ones',
    shown.join(',') === TODAY.join(','),
    shown.join(' · ')
  )
}

/** A buff the player casts and three motes they loot, so the new cards have engine data to show. */
function playBuffAndMotes(log: FixtureLog): void {
  const at = Date.now()
  log.appendAt(new Date(at), 'You begin casting Valor.')
  log.appendAt(new Date(at + 1_000), 'You feel valorous.')
  for (let i = 0; i < 3; i++) {
    log.appendAt(new Date(at + 2_000 + i * 1_000), "--You have looted a Mote of Major Potential from a fire giant warrior's corpse.--")
  }
}

/** Customize opens the checklist; checking the four new cards mounts each, with engine data. */
export async function stepCustomize(page: Page, log: FixtureLog): Promise<void> {
  playBuffAndMotes(log)
  await page.click('[data-testid="overview-customize"]', { timeout: 15_000 })
  const rows = await settleCount(page, '[data-testid^="overview-customize-row-"]', TODAY.length + NEW.length, { timeoutMs: 10_000 })
  if (!check('Customize opens a checklist of every card', rows === TODAY.length + NEW.length, `${String(rows)} rows`)) return
  for (const id of NEW) await page.click(`[data-testid="overview-customize-check-${id}"]`, { timeout: 15_000 })
  await page.click('[data-testid="overview-customize-done"]', { timeout: 15_000 })

  const want = [...TODAY, ...NEW].join(',')
  const shown = await settle(() => shownWidgets(page), (w) => w.join(',') === want, { timeoutMs: 10_000 })
  check('checking the four new cards mounts them after the six', shown.join(',') === want, shown.join(' · '))

  const buffs = await settle(() => textOf(page, '[data-testid="overview-buffs"]'), (t) => t.includes('Valor'), { timeoutMs: 20_000 })
  check('Buffs running out shows the buff the log just cast', buffs.includes('Valor'), buffs.slice(0, 80))
  const motes = await settle(() => textOf(page, '[data-testid="overview-motes"]'), (t) => t.includes('Major'), { timeoutMs: 20_000 })
  check('Motes counts the motes the log just looted, by tier', motes.includes('Major'), motes.slice(0, 80))
  const coin = await settle(() => textOf(page, '[data-testid="overview-coin-session"]'), (t) => /\d(pp|gp|sp|cp)/.test(t), { timeoutMs: 20_000 })
  check('Coin states the coin the log holds', /\d(pp|gp|sp|cp)/.test(coin), coin || 'empty')
  check('Respawns here mounts (no mob is watched: its quiet state)', (await countOf(page, '[data-testid="overview-respawns"]')) === 1)
}

/** Launch 2 on the same settings: the layout (order and widths) came back from the settings store. */
export async function stepLayoutSurvivesRelaunch(log: FixtureLog, userData: string, order: readonly string[]): Promise<void> {
  console.log('launch 2: the same userData, to read the Overview layout back…')
  const { app, close } = await launchOnFixture(log, { userData })
  try {
    const page = await mainWindow(app)
    await page.waitForSelector(GRID, { timeout: 60_000 })
    await waitHydrated(page)
    const want = order.join(',')
    const shown = await settle(() => shownWidgets(page), (w) => w.join(',') === want, { timeoutMs: 15_000 })
    check('the Overview layout survives a relaunch (it is in the settings store)', shown.join(',') === want, shown.join(' · '))
    const leveling = await cardBox(page, 'leveling')
    check('…with the width set in Edit layout (Leveling at 1 column)', leveling?.span === '1', leveling?.col ?? 'absent')
  } finally {
    await close()
  }
}

// ── Edit layout (2026-11-28): handles and widths, a drag, Esc ────────────────────────────────

interface CardBox {
  span: string
  col: string
  w: number
}

function cardBox(page: Page, id: string): Promise<CardBox | null> {
  return page.evaluate((i) => {
    const el = document.querySelector(`[data-overview-widget="${i}"]`) as HTMLElement | null
    if (!el) return null
    return { span: el.dataset.span ?? '', col: getComputedStyle(el).gridColumnStart, w: Math.round(el.getBoundingClientRect().width) }
  }, id)
}

function centre(page: Page, sel: string): Promise<{ x: number; y: number; left: number } | null> {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left }
  }, sel)
}

/** Drag a card by its handle onto the LEFT edge of another (a "before" drop), with a real pointer. */
async function dragBefore(page: Page, id: string, target: string): Promise<boolean> {
  const from = await centre(page, `[data-testid="overview-drag-${id}"]`)
  const to = await centre(page, `[data-overview-widget="${target}"]`)
  if (!from || !to) return false
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.left + 12, to.y, { steps: 8 })
  const marker = await settle(() => countOf(page, '[data-testid="overview-drop-marker"]'), (n) => n === 1, { timeoutMs: 5_000 })
  check('a drag shows a drop marker where the card would land', marker === 1, `${String(marker)} marker(s)`)
  await page.mouse.up()
  return true
}

/**
 * Edit layout shows a handle and a width control on every card; a width changes the card's span;
 * a drag moves a card; the earlier/later buttons do the same from the keyboard; Esc ends the mode.
 * Returns the order the page should now have, for the relaunch check.
 */
export async function stepEditLayout(page: Page): Promise<string[]> {
  const all = [...TODAY, ...NEW]
  check('outside Edit layout no card wears a drag handle', (await countOf(page, '[data-testid^="overview-drag-"]')) === 0)
  await page.click('[data-testid="overview-edit-layout"]', { timeout: 15_000 })
  const handles = await settleCount(page, '[data-testid^="overview-drag-"]', all.length, { timeoutMs: 10_000 })
  check('Edit layout puts a drag handle on every card', handles === all.length, `${String(handles)} of ${String(all.length)}`)
  const widths = await countOf(page, '[data-testid^="overview-width-"][role="group"]')
  check('…and a 1 2 3 4 width control on every card', widths === all.length, `${String(widths)} of ${String(all.length)}`)
  const cols = await page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.dataset.columns ?? '', GRID)

  const before = await cardBox(page, 'leveling')
  await page.click('[data-testid="overview-width-leveling-1"]', { timeout: 15_000 })
  const after = await settle(() => cardBox(page, 'leveling'), (b) => b?.span === '1', { timeoutMs: 10_000 })
  check(
    'a width of 1 makes Leveling span one column where it spanned two',
    before?.col === 'span 2' && after?.col === 'span 1' && (cols !== '4' || after.w < before.w * 0.6),
    `${before?.col ?? '?'} ${String(before?.w)}px → ${after?.col ?? '?'} ${String(after?.w)}px at ${cols} columns`
  )

  // Both in the first row, so both are on screen without scrolling the grid.
  const dragged = await dragBefore(page, 'target', 'dps')
  const moved = await settle(() => shownWidgets(page), (w) => w[0] === 'target', { timeoutMs: 10_000 })
  check('dragging Target onto the front of Damage puts it first', dragged && moved[0] === 'target', moved.join(' · '))
  check('…and the marker goes when the pointer lets go', (await countOf(page, '[data-testid="overview-drop-marker"]')) === 0)

  await page.click('[data-testid="overview-later-target"]', { timeout: 15_000 })
  const want = ['dps', 'target', ...all.filter((id) => id !== 'dps' && id !== 'target')]
  const stepped = await settle(() => shownWidgets(page), (w) => w.join(',') === want.join(','), { timeoutMs: 10_000 })
  check('the "later" button moves Target one place on, the keyboard way to drag', stepped.join(',') === want.join(','), stepped.join(' · '))

  await page.keyboard.press('Escape')
  const left = await settle(() => countOf(page, '[data-testid^="overview-drag-"]'), (n) => n === 0, { timeoutMs: 10_000 })
  check('Esc ends Edit layout: the handles are gone', left === 0, `${String(left)} handles`)
  return want
}
