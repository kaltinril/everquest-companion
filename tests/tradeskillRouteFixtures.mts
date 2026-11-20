// Fixtures for the goal routes and the shopping list: the owner's real case (2026-11-20).
// Jewelcrafting at 205; the log last paid 10.50 pp for a Gold Bar and 105 pp for a Platinum Bar
// (Amber), 131.25 pp for a Ruby and 0.06 pp for a Malachite (Jade), and sold a Golden Ruby Ring
// for 141.75 pp; the inventory dump holds 54 Ruby and 23 Enchanted Gold Bar. The recipes are the
// in-era stretch of the wiki's ladder as it stood that day, with the wiki's own source words.
// No log and no committed data is read. NOT a *.test.mts: imported by the specs.

import type { GuideStep, TradeskillGuidesFile } from '../src/shared/guideData'
import { ownershipIndexFrom, type OwnershipIndex, type OwnershipRow } from '../src/shared/planner/ownership'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookIndex, type BookMaterial, type BookRecipe } from '../src/shared/tradeskillBook'
import { LEVELING_GUIDE_ID, RECIPE_GUIDE_ID, guidePayload, indexGuides, type GuideIndex } from '../src/shared/tradeskillGuide'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import { haveLookup } from '../src/shared/tradeskillMaterials'
import { moneyBook } from '../src/shared/tradeskillMoney'
import type { RouteFacts } from '../src/shared/tradeskillRouteStep'
import type { ShoppingFacts } from '../src/shared/tradeskillShopping'
import type { CraftingSnap } from '../src/shared/crafting'
import { bought, fixtureSnap, ing, item, recipe, sold, SEP_12 } from './tradeskillFixtures.mts'

export const OWNER_LEVEL = 205

const BOUGHT = ['Bought', 'Dropped']
const DROPPED = ['Dropped']
const ENCHANTED = ['Bought + Enchanted']

const gold = (): BookRecipe['ingredients'][number] => ing('Enchanted Gold Bar', 1, ENCHANTED)
const platinum = (): BookRecipe['ingredients'][number] => ing('Enchanted Platinum Bar', 1, ENCHANTED)

/** A jewel: a bar and a gem in a Jeweler's Kit, with the made item's own stats. */
function jewel(name: string, trivial: number, parts: BookRecipe['ingredients'], over: Partial<BookRecipe> = {}): BookRecipe {
  return recipe(name, { trivial, container: "Jeweler's Kit", ingredients: parts, worn: { stats: ['SV POISON +7'], effects: [] }, ...over })
}

export function ownerRecipes(): BookRecipe[] {
  return [
    jewel('Gold Malachite Bracelet', 146, [gold(), ing('Malachite', 1, BOUGHT)]),
    jewel('Golden Jaded Bracelet', 178, [gold(), ing('Jade', 1, BOUGHT)]),
    jewel('Fire Emerald Golden Bracelet', 202, [gold(), ing('Fire Emerald', 1, BOUGHT)]),
    jewel('Golden Sapphire Earring', 204, [gold(), ing('Sapphire', 1, BOUGHT)]),
    jewel('Golden Ruby Ring', 207, [gold(), ing('Ruby', 1, BOUGHT)], { worn: { stats: ['STR +2', 'WIS +4'], effects: [] } }),
    jewel('Golden Jacinth Wedding Ring', 210, [gold(), ing('Jacinth', 1, DROPPED)]),
    jewel('Golden Black Sapphire Earring', 212, [gold(), ing('Black Sapphire', 1, DROPPED)]),
    jewel('Golden Diamond Mask', 215, [gold(), ing('Diamond', 1, DROPPED)]),
    jewel('Platinum Malachite Ring', 218, [platinum(), ing('Malachite', 1, BOUGHT)]),
    jewel('Platinum Topaz Necklace', 255, [platinum(), ing('Topaz', 1, BOUGHT)]),
    jewel('Platinum Ruby Veil', 279, [platinum(), ing('Ruby', 1, BOUGHT)]),
    jewel('Platinum Jacinth Wedding Ring', 282, [platinum(), ing('Jacinth', 1, DROPPED)]),
    jewel('Black Sapphire Platinum Necklace', 284, [platinum(), ing('Black Sapphire', 1, DROPPED)], { quests: ['White Dragonscale Cloak Quest'] }),
    jewel('Platinum Diamond Wedding Ring', 287, [platinum(), ing('Diamond', 1, DROPPED)], { quests: ['White Dragonscale Cloak Quest'] }),
    // The wiki gives the tiara a trivial and no materials.
    jewel('Platinum Blue Diamond Tiara', 295, [], { worn: { stats: ['MANA +25', 'SV FIRE +8', 'SV DISEASE +8', 'SV COLD +8', 'SV MAGIC +8', 'SV POISON +8'], effects: [] } })
  ]
}

const MATERIALS: Record<string, BookMaterial> = {
  jacinth: { dropsFrom: [{ mob: 'a spectre', zone: 'The Ocean of Tears' }] },
  diamond: { dropsFrom: [{ mob: 'a fire giant', zone: "Nagafen's Lair" }] }
}

export function ownerIndex(extra: BookRecipe[] = []): BookIndex {
  return indexBook({ version: TRADESKILL_BOOK_VERSION, recipes: [...ownerRecipes(), ...extra], materials: MATERIALS })
}

/** The owner's log: the four prices, the ring's sale, and the combines the workbench history shows. */
export function ownerSnap(over: Partial<CraftingSnap> = {}): CraftingSnap {
  return fixtureSnap({
    items: [
      item('Golden Ruby Ring', { made: 4 }),
      item('Gold Malachite Bracelet', { made: 92, failed: 29, raises: 33, firstRaise: 114, lastRaise: 146, tradeskill: 'Jewelry Making' }),
      item('Golden Jaded Bracelet', { made: 100, failed: 21, raises: 13, firstRaise: 166, lastRaise: 178, tradeskill: 'Jewelry Making' }),
      item('Fire Emerald Golden Bracelet', { made: 32, failed: 0, raises: 6, firstRaise: 197, lastRaise: 202, tradeskill: 'Jewelry Making' })
    ],
    bought: [
      bought('Gold Bar', 20, 210_000, 'Amber'),
      bought('Ruby', 1, 131_250, 'Jade'),
      bought('Platinum Bar', 1, 105_000, 'Amber'),
      // 20 for 1.2 pp: 0.06 pp each.
      bought('Malachite', 20, 1_200, 'Jade')
    ],
    sold: [sold('Golden Ruby Ring', 141_750, 'Amber')],
    depot: [],
    ...over
  })
}

const heldRow = (name: string, count: number): [string, OwnershipRow[]] => [
  name.toLowerCase(),
  [{ key: name.toLowerCase(), name, rawName: name, place: 'personalDepot', location: '', count, section: '', exaltation: false, containment: 'top', itemId: 1, line: 1 }]
]

/** The owner's dump: 54 Ruby and 23 Enchanted Gold Bar, plus whatever a test adds. */
export function ownerHeld(extra: Record<string, number> = {}): OwnershipIndex {
  return ownershipIndexFrom(Object.entries({ Ruby: 54, 'Enchanted Gold Bar': 23, ...extra }).map(([name, count]) => heldRow(name, count)))
}

const credit = (id: string, title: string): { id: string; title: string; author: string; sourceUrl: string; pulledAt: string } => ({
  id,
  title,
  author: 'a player',
  sourceUrl: 'https://example.invalid/guide',
  pulledAt: '2026-11-20T00:00:00.000Z'
})

const step = (from: number, to: number, name: string, over: Partial<GuideStep> = {}): GuideStep => ({ from, to, item: name, materials: [], ...over })

const AMBER = { merchant: 'Amber', zone: 'North Freeport', loc: '-176, 207, 17' }
const JADE = { merchant: 'Jade', zone: 'North Freeport', loc: '-179,197, 3' }

/** The two guides' Jewelcrafting, as they read on 2026-11-20: loose names on the route, merchants with locs in the recipes. */
function ownerGuideFile(): TradeskillGuidesFile {
  return {
    about: 'fixture',
    leveling: {
      ...credit(LEVELING_GUIDE_ID, 'Leveling'),
      overview: [],
      tradeskills: {
        Jewelcrafting: {
          notes: ['Ruby is the highest gem available on merchants.'],
          steps: [
            step(192, 202, 'Gold fire emerald'),
            step(203, 228, "Platinum cat's eye agate"),
            step(229, 255, 'Platinum Topaz Necklace'),
            step(256, 279, 'Platinum ruby', { note: 'Last store bought gem' }),
            step(280, 282, 'Platinum jacinth'),
            step(288, 295, 'Platinum blue diamond')
          ],
          alternates: []
        }
      }
    },
    recipes: {
      ...credit(RECIPE_GUIDE_ID, 'Recipes'),
      tradeskills: {
        Jewelcrafting: {
          recipes: [
            { trivial: 218, item: 'Platinum Malachite Ring', notes: ['Can use regular platinum bars but sells for less'], materials: [{ name: 'Enchanted Platinum Bar', ...AMBER }, { name: 'Malachite', ...JADE }] },
            { trivial: 279, item: 'Platinum Ruby Veil', notes: ['Magical'], materials: [{ name: 'Enchanted Platinum Bar', ...AMBER }, { name: 'Ruby', ...JADE }] }
          ]
        }
      }
    }
  }
}

/** Every name the fixture guides write that is a wiki item's own. */
const WIKI = new Set(['platinum malachite ring', 'platinum ruby veil', 'platinum topaz necklace', 'enchanted platinum bar', 'malachite', 'ruby'])

const titled = (name: string): string => name.replace(/\b[a-z]/g, (c) => c.toUpperCase())

export function ownerGuides(): GuideIndex {
  return indexGuides(guidePayload(ownerGuideFile(), (name) => (WIKI.has(name.trim().toLowerCase()) ? titled(name.trim()) : undefined)))
}

export interface OwnerCase {
  index?: BookIndex
  snap?: CraftingSnap | null
  held?: OwnershipIndex | null
}

/** The owner's case as the routes read it. `held: null` is a character with no inventory dump. */
export function ownerFacts(over: OwnerCase = {}): RouteFacts {
  const index = over.index ?? ownerIndex()
  const craft = indexCrafting(over.snap === undefined ? ownerSnap() : over.snap, index)
  const held = over.held === undefined ? ownerHeld() : over.held
  return { index, craft, guides: ownerGuides(), money: moneyBook(craft, index), have: haveLookup({ index: held, dumpedAt: SEP_12 }, craft) }
}

/** The same, for the shopping list: the item pages' own drops, nothing hidden by era. */
export function ownerShopping(over: OwnerCase = {}): ShoppingFacts {
  const facts = ownerFacts(over)
  return {
    ...facts,
    drops: (key) => (facts.index.materials.get(key)?.dropsFrom ?? []).map((d) => ({ mob: d.mob, zones: d.zone === undefined ? [] : [d.zone] })),
    eraOnly: false
  }
}
