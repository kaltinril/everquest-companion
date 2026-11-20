/**
 * The gear area's Void motes tab (owner ask, 2026-11-18; a tab of its own since 2026-11-19, when the
 * list left the Gear tab), driven in a real window. A module rather than more of `gear.e2e.mts` (the
 * gearReviewSteps.mts precedent). The ranking itself is unit-tested (tests/voidMotes.test.mts); what
 * only a window can prove is the CHAIN: the tab opens the list, the list reads what the staged
 * `/outputfile inventory` dump says is worn, the week's plan is stated above it, and a pick
 * re-ranks it.
 *
 * Runs on the committed `Primitive_freeport-Inventory.txt`, which wears `Thelvorn, Blade of Light +5`,
 * and hands the window back on the Gear tab (its filters are remembered across the visit).
 */
import type { ElectronApplication, Page } from 'playwright-core'
import { check, countOf, rectOf, settle } from './appHarness.mjs'

const MOTES_TAB = '[data-testid="tab-voidMotes"]'
const GEAR_TAB = '[data-testid="tab-gear"]'
const GEAR_VIEW = '[data-testid="gear-view"]'
const OLD_TOGGLE = '[data-testid="gear-motes-toggle"]'
const PANEL = '[data-testid="gear-motes"]'
const LIST = '[data-testid="gear-motes-list"]'
const PLAN = '[data-testid="gear-motes-plan"]'
const ROW = '[data-testid="gear-motes-row"]'
const GAIN_ORDER = '[data-testid="gear-motes-order-gain"]'
const RECOMMENDED_ORDER = '[data-testid="gear-motes-order-recommended"]'

const until = (fn: () => Promise<boolean>, ms: number): Promise<boolean> => settle(fn, (ok) => ok, { timeoutMs: ms })

interface MoteRowText {
  name: string
  tier: string
  gain: number
  hours: string
  source: string
  pick: boolean
  /** `pick`, `rare` or `early` (voidMotes.ts `MoteGate`) */
  gate: string
}

/** Each row's cells by testid. No named helper inside `evaluate`: tsx wraps one in a `__name` call the page lacks. */
async function rows(page: Page): Promise<MoteRowText[]> {
  const ids = ['planner-donor-name', 'gear-motes-tier', 'gear-motes-gain', 'gear-motes-hours', 'gear-motes-source']
  const read = await page.evaluate(
    ([sel, cellIds]) =>
      [...document.querySelectorAll(sel)].map((row) => ({
        cells: cellIds.map((id) => (row.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText.trim() ?? ''),
        pick: row.getAttribute('data-pick') === 'true',
        gate: row.getAttribute('data-gate') ?? ''
      })),
    [ROW, ids] as const
  )
  return read.map(({ cells, pick, gate }) => ({
    name: cells[0] ?? '',
    tier: cells[1] ?? '',
    gain: Number((cells[2] ?? '').replace('+', '')) || 0,
    hours: cells[3] ?? '',
    source: cells[4] ?? '',
    pick,
    gate
  }))
}

export async function stepGearVoidMotes(page: Page): Promise<void> {
  check(
    'the Gear tab carries no void mote list and no chip for one',
    (await countOf(page, PANEL)) === 0 && (await countOf(page, OLD_TOGGLE)) === 0
  )
  await page.click(MOTES_TAB, { timeout: 15_000 })
  const listed = await until(async () => (await countOf(page, ROW)) > 0, 15_000)
  const list = await rows(page)
  check('the Void motes tab lists worn items', listed, `${String(list.length)} rows`)
  // The list is the tab's body: it fills the height the tab has, where the old panel stopped at 216 px.
  const box = await rectOf(page, LIST)
  check('the list has the tab to itself', box !== null && box.h > 216, box === null ? 'no list' : `${String(Math.round(box.h))} px tall`)

  const sword = list.find((r) => r.name === 'Thelvorn, Blade of Light')
  check(
    'a worn +5 item reads from +5, with the hours a mote would save',
    sword?.tier.startsWith('+5→+') === true && /^[\d,.]+ h$/.test(sword.hours),
    sword === undefined ? 'no Thelvorn row' : `${sword.tier} · ${sword.hours}`
  )
  check('every row states where copies come from', list.length > 0 && list.every((r) => r.source !== ''), list.map((r) => r.source).join(' | '))
  // The week's motes go only on rows a mote belongs on yet: +7 or higher, or +5 and +6 when copies barely exist.
  const picks = list.filter((r) => r.pick)
  check(
    'the picks are three rows at most, none of them a "not yet" row',
    picks.length <= 3 && picks.every((r) => r.gate !== 'early' && r.gain > 0),
    `${String(picks.length)} picks: ${picks.map((r) => `${r.name} (${r.gate})`).join(', ')}`
  )
  const plan = await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement | null)?.innerText.trim() ?? '', PLAN)
  check('the line above the list states the week', (picks.length > 0 && plan.startsWith('This week: ')) || (picks.length === 0 && plan.includes('hold')), plan)

  await page.click(GAIN_ORDER, { timeout: 15_000 })
  const sorted = await until(async () => {
    const gains = (await rows(page)).map((r) => r.gain)
    return gains.every((g, i) => i === 0 || (gains[i - 1] ?? 0) >= g)
  }, 15_000)
  check('Biggest gain re-ranks the list by the gain column', sorted, (await rows(page)).map((r) => String(r.gain)).join(' '))
  await page.click(RECOMMENDED_ORDER, { timeout: 15_000 })

  await page.click(GEAR_TAB, { timeout: 15_000 })
  check('…and the Gear tab comes back without it', await until(async () => (await countOf(page, GEAR_VIEW)) === 1 && (await countOf(page, PANEL)) === 0, 15_000))
}

interface HeaderRead {
  /** The order buttons' right edge, and the panel's. */
  orderRight: number
  panelRight: number
  /** Is the last order button the thing under the mouse at its own middle? */
  lastHit: boolean
  /** The order buttons' and the plan line's vertical middles: equal when they share a line. */
  orderMid: number
  planMid: number
  sideways: boolean
}

function readHeader(page: Page): Promise<HeaderRead | null> {
  return page.evaluate(
    ([panelSel, planSel]) => {
      const panel = document.querySelector(panelSel)
      const plan = document.querySelector(planSel)
      const order = document.querySelector('[data-testid="gear-motes-order"]')
      const last = order?.querySelector('button:last-of-type')
      if (!panel || !plan || !order || !last) return null
      const o = order.getBoundingClientRect()
      const p = plan.getBoundingClientRect()
      const b = last.getBoundingClientRect()
      const under = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      const scroller = document.scrollingElement
      return {
        orderRight: o.right,
        panelRight: panel.getBoundingClientRect().right,
        lastHit: under !== null && last.contains(under),
        orderMid: o.top + o.height / 2,
        planMid: p.top + p.height / 2,
        sideways: scroller !== null && scroller.scrollWidth > scroller.clientWidth + 1
      }
    },
    [PANEL, PLAN]
  )
}

/**
 * THE HEADER ROW AT THE MINIMUM WINDOW WITH LARGER TEXT (screen pass, 2026-11-19): the two picks ran
 * 78 px out of the panel and the last button could not be clicked. The row wraps now. Checked wide
 * first, so the wrap is shown not to have moved anything where there was room.
 */
export async function stepGearVoidMotesNarrow(app: ElectronApplication, page: Page): Promise<void> {
  await page.click(MOTES_TAB, { timeout: 15_000 })
  await until(async () => (await countOf(page, PANEL)) === 1, 15_000)
  const wide = await readHeader(page)
  check(
    'Void motes, default window: the picks share the plan line`s row, inside the panel',
    wide !== null && Math.abs(wide.orderMid - wide.planMid) < 8 && wide.orderRight <= wide.panelRight + 1,
    JSON.stringify(wide)
  )

  const win = await app.browserWindow(page)
  const before = await win.evaluate((w) => w.getBounds())
  const baseDpr = await page.evaluate(() => window.devicePixelRatio)
  const scale = (s: number): Promise<number> => page.evaluate((n) => (window as unknown as { eq: { setUiScale: (x: number) => Promise<number> } }).eq.setUiScale(n), s)
  await win.evaluate((w) => {
    w.setBounds({ ...w.getBounds(), width: 900, height: 600 })
  })
  await scale(1.25)
  await until(async () => Math.abs((await page.evaluate(() => window.devicePixelRatio)) / baseDpr - 1.25) < 0.02, 15_000)
  const narrow = await settle(
    () => readHeader(page),
    (v) => v !== null && v.orderRight <= v.panelRight + 1 && v.lastHit,
    { timeoutMs: 10_000 }
  )
  check(
    'Void motes, 900 px at 125% text: the picks stay inside the panel',
    narrow !== null && narrow.orderRight <= narrow.panelRight + 1,
    JSON.stringify(narrow)
  )
  check('…the last order button can be clicked', narrow?.lastHit === true, JSON.stringify(narrow))
  check('…and the page does not scroll sideways', narrow?.sideways === false, JSON.stringify(narrow))

  await scale(1)
  await until(async () => Math.abs((await page.evaluate(() => window.devicePixelRatio)) / baseDpr - 1) < 0.02, 15_000)
  await win.evaluate((w, b) => {
    w.setBounds(b)
  }, before)
  await until(async () => Math.abs((await page.evaluate(() => window.outerWidth)) - before.width) <= 2, 10_000)
  await page.click(GEAR_TAB, { timeout: 15_000 })
  await until(async () => (await countOf(page, GEAR_VIEW)) === 1, 15_000)
}
