/**
 * The gear area's Void motes tab (owner ask, 2026-11-18; a tab of its own since 2026-11-19, when the
 * list left the Gear tab), driven in a real window. A module rather than more of `gear.e2e.mts` (the
 * gearReviewSteps.mts precedent). The ranking itself is unit-tested (tests/voidMotes.test.mts); what
 * only a window can prove is the CHAIN: the tab opens the list, the list reads what the staged
 * `/outputfile inventory` dump says is worn, and a pick re-ranks it.
 *
 * Runs on the committed `Primitive_freeport-Inventory.txt`, which wears `Thelvorn, Blade of Light +5`,
 * and hands the window back on the Gear tab (its filters are remembered across the visit).
 */
import type { Page } from 'playwright-core'
import { check, countOf, rectOf, settle } from './appHarness.mjs'

const MOTES_TAB = '[data-testid="tab-voidMotes"]'
const GEAR_TAB = '[data-testid="tab-gear"]'
const GEAR_VIEW = '[data-testid="gear-view"]'
const OLD_TOGGLE = '[data-testid="gear-motes-toggle"]'
const PANEL = '[data-testid="gear-motes"]'
const LIST = '[data-testid="gear-motes-list"]'
const ROW = '[data-testid="gear-motes-row"]'
const GAIN_ORDER = '[data-testid="gear-motes-order-gain"]'
const RECOMMENDED_ORDER = '[data-testid="gear-motes-order-recommended"]'

const until = (fn: () => Promise<boolean>, ms: number): Promise<boolean> => settle(fn, (ok) => ok, { timeoutMs: ms })

interface MoteRowText {
  name: string
  tier: string
  gain: number
  copies: string
  source: string
  pick: boolean
}

/** Each row's cells by testid. No named helper inside `evaluate`: tsx wraps one in a `__name` call the page lacks. */
async function rows(page: Page): Promise<MoteRowText[]> {
  const ids = ['planner-donor-name', 'gear-motes-tier', 'gear-motes-gain', 'gear-motes-copies', 'gear-motes-source']
  const read = await page.evaluate(
    ([sel, cellIds]) =>
      [...document.querySelectorAll(sel)].map((row) => ({
        cells: cellIds.map((id) => (row.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText.trim() ?? ''),
        pick: row.getAttribute('data-pick') === 'true'
      })),
    [ROW, ids] as const
  )
  return read.map(({ cells, pick }) => ({
    name: cells[0] ?? '',
    tier: cells[1] ?? '',
    gain: Number((cells[2] ?? '').replace('+', '')) || 0,
    copies: cells[3] ?? '',
    source: cells[4] ?? '',
    pick
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
    'a worn +5 item reads as one mote to +6, skipping 2^5 copies',
    sword?.tier === '+5→+6' && sword.copies === '32 copies',
    sword === undefined ? 'no Thelvorn row' : `${sword.tier} · ${sword.copies}`
  )
  check('every row states where copies come from', list.length > 0 && list.every((r) => r.source !== ''), list.map((r) => r.source).join(' | '))
  const gaining = list.filter((r) => r.gain > 0).length
  check(
    'the picks are the first rows that gain something, three at most',
    list.filter((r) => r.pick).length === Math.min(3, gaining) && list.slice(0, Math.min(3, gaining)).every((r) => r.pick),
    `${String(list.filter((r) => r.pick).length)} picks of ${String(gaining)} gaining rows`
  )

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
