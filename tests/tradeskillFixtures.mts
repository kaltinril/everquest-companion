// Fixtures for the workbench's history, money and guide folds: a small recipe book and a crafting
// snapshot in the shape of the owner's own log (Jewelry Making, the Golden Ruby Ring made 4 and
// never failed, the Gold Malachite Bracelet made 92 and failed 29 with 33 raises from 114 to 146,
// Ruby last bought for 131.25 pp from Jade in North Freeport, Gold Bar for 10.50 pp from Amber,
// the ring last sold for 141.75 pp to Amber). No log is read. NOT a *.test.mts: imported by the specs.

import type { BoughtRow, CraftedItemRow, CraftingSnap, CraftSpan, DepotRow, SoldRow } from '../src/shared/crafting'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookIndex, type BookRecipe } from '../src/shared/tradeskillBook'

export const MIN = 60_000
export const SEP_12 = Date.parse('Sep 12 2026 20:00:00')

export const recipe = (item: string, over: Partial<BookRecipe> = {}): BookRecipe => ({
  id: `${item.toLowerCase()}#0`,
  key: item.toLowerCase(),
  item,
  tradeskill: 'Jewelcrafting',
  ingredients: [],
  ...over
})

export const ing = (name: string, qty = 1, sources?: string[]): BookRecipe['ingredients'][number] => ({
  name,
  key: name.toLowerCase(),
  qty,
  ...(sources === undefined ? {} : { sources })
})

export function fixtureIndex(): BookIndex {
  return indexBook({
    version: TRADESKILL_BOOK_VERSION,
    recipes: [
      recipe('Golden Ruby Ring', { trivial: 207, ingredients: [ing('Enchanted Gold Bar', 1, ['Bought + Enchanted']), ing('Ruby')] }),
      recipe('Gold Malachite Bracelet', { trivial: 146, ingredients: [ing('Enchanted Gold Bar'), ing('Malachite')] }),
      recipe('Golden Jaded Bracelet', { trivial: 178, ingredients: [ing('Enchanted Gold Bar'), ing('Jade')] }),
      recipe('Platinum Malachite Ring', { trivial: 218 }),
      // Made by two tradeskills: the ladder order picks the lower trivial's.
      recipe('Pie Tin', { id: 'pie tin#0', tradeskill: 'Blacksmithing', trivial: 30 }),
      recipe('Pie Tin', { id: 'pie tin#1', tradeskill: 'Pottery', trivial: 60 }),
      // A combine that yields something under another name.
      recipe('Class 1 Wood Point Arrow', { tradeskill: 'Fletching', trivial: 16, yieldItem: 'Arrow', yieldQty: 5 })
    ],
    materials: {}
  })
}

export const item = (name: string, over: Partial<CraftedItemRow>): CraftedItemRow => ({
  item: name,
  made: 0,
  failed: 0,
  trivial: 0,
  raises: 0,
  firstTs: SEP_12,
  lastTs: SEP_12,
  sessionMade: 0,
  sessionFailed: 0,
  sessionRaises: 0,
  ...over
})

export const span = (startMin: number, minutes: number, combines: number, raises: Record<string, number>): CraftSpan => ({
  start: SEP_12 + startMin * MIN,
  end: SEP_12 + (startMin + minutes) * MIN,
  combines,
  made: combines,
  failed: 0,
  raises
})

export const bought = (name: string, lastQty: number, lastCopper: number, merchant: string): BoughtRow => ({
  item: name,
  qty: lastQty,
  copper: lastCopper,
  lastQty,
  lastCopper,
  merchant,
  zone: 'North Freeport',
  ts: SEP_12
})

export const sold = (name: string, lastCopper: number, merchant: string): SoldRow => ({ item: name, lines: 4, copper: lastCopper * 4, lastCopper, merchant, ts: SEP_12 })

export const depot = (name: string, left: number, ts: number): DepotRow => ({ item: name, left, ts })

/** The owner's shapes: the ring made 4 and never failed, the bracelet 92 and 29 with 33 raises. */
export function fixtureSnap(over: Partial<CraftingSnap> = {}): CraftingSnap {
  return {
    items: [
      // No raise named the ring's tradeskill: the recipe book places it.
      item('Golden Ruby Ring', { made: 4, lastTs: SEP_12 + 90 * MIN }),
      item('Gold Malachite Bracelet', { made: 92, failed: 29, raises: 33, firstRaise: 114, lastRaise: 146, tradeskill: 'Jewelry Making', lastTs: SEP_12 + 30 * MIN }),
      item('Golden Jaded Bracelet', { made: 100, failed: 21, raises: 13, firstRaise: 166, lastRaise: 178, tradeskill: 'Jewelry Making', trivial: 3, trivialTs: SEP_12 + 60 * MIN, lastTs: SEP_12 + 60 * MIN }),
      item('Arrow', { made: 5, failed: 1, raises: 1, firstRaise: 12, lastRaise: 12, tradeskill: 'Fletching' }),
      item('Mystery Stew', { made: 2, failed: 1 })
    ],
    levels: [],
    spans: [span(0, 60, 242, { 'Jewelry Making': 46 }), span(120, 30, 6, { Fletching: 1 }), span(200, 10, 4, {})],
    bought: [
      bought('Ruby', 1, 131_250, 'Jade'),
      bought('Gold Bar', 20, 210_000, 'Amber'),
      bought('Malachite', 20, 8_400, 'Jade')
    ],
    sold: [sold('Golden Ruby Ring', 141_750, 'Amber')],
    depot: [depot('Ruby', 50, SEP_12 + 90 * MIN), depot('Malachite', 68, SEP_12)],
    ...over
  }
}

