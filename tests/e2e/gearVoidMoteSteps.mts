/**
 * The Gear tab's void mote panel (owner ask, 2026-11-18), driven in a real window. A module rather
 * than more of `gear.e2e.mts` (the gearReviewSteps.mts precedent). The ranking itself is unit-tested
 * (tests/voidMotes.test.mts); what only a window can prove is the CHAIN: the chip opens the panel,
 * the panel reads what the staged `/outputfile inventory` dump says is worn, and a pick re-ranks it.
 *
 * Runs on the committed `Primitive_freeport-Inventory.txt`, which wears `Thelvorn, Blade of Light +5`,
 * and hands the tab back with the panel closed.
 */
import type { Page } from 'playwright-core'
import { check, countOf, settle } from './appHarness.mjs'

const TOGGLE = '[data-testid="gear-motes-toggle"]'
const PANEL = '[data-testid="gear-motes"]'
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
  check('the void mote panel is closed until asked for', (await countOf(page, PANEL)) === 0)
  await page.click(TOGGLE, { timeout: 15_000 })
  const listed = await until(async () => (await countOf(page, ROW)) > 0, 15_000)
  const list = await rows(page)
  check('the Void motes chip opens a panel listing worn items', listed, `${String(list.length)} rows`)

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

  await page.click(TOGGLE, { timeout: 15_000 })
  check('…and the chip closes it again', await until(async () => (await countOf(page, PANEL)) === 0, 15_000))
}
