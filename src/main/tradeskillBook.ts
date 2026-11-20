// tradeskillBook.ts — the Tradeskills section's recipe book, built from the committed item
// database: every `craftedBy` recipe with its tradeskill folded to one spelling, each material
// keyed to its own record, and where that material drops or is foraged.
//
// Pure: the index and the era derivations are handed in (ipc/tradeskills.ts holds the memo), so
// tests/tradeskillBook.test.mts builds it from the committed bytes the way the app does.

import { itemKey, wornKey, type ItemDbEntry } from './itemsDb'
import { eraEvidenceOf } from './planner/eraEvidence'
import type { EraDerivation } from '../shared/planner/era'
import { tradeskillOf } from '../shared/tradeskills'
import type { WikiItemName } from '../shared/tradeskillGuide'
import {
  TRADESKILL_BOOK_VERSION,
  type BookIngredient,
  type BookMaterial,
  type BookRecipe,
  type BookWorn,
  type TradeskillBookPayload
} from '../shared/tradeskillBook'
import type { ItemCraftRecipe } from '../shared/types'

type ItemIndex = ReadonlyMap<string, ItemDbEntry>

/** The trivial, container and yield a recipe states; absent fields stay absent. */
function statedFields(recipe: ItemCraftRecipe): Partial<BookRecipe> {
  return {
    ...(recipe.trivial === undefined ? {} : { trivial: recipe.trivial }),
    ...(recipe.container === undefined ? {} : { container: recipe.container }),
    ...(recipe.yieldItem === undefined ? {} : { yieldItem: recipe.yieldItem }),
    ...(recipe.yieldQty === undefined ? {} : { yieldQty: recipe.yieldQty })
  }
}

/** The made item's own stats, saves and effects as its window words them, or null when it states none. */
function wornOf(entry: ItemDbEntry): BookWorn | null {
  const block = entry.stats
  if (block === undefined) return null
  const stats = [...block.stats, ...block.saves].map((stat) => `${stat.key} ${stat.value}`)
  if (block.ac !== undefined) stats.unshift(`AC ${String(block.ac)}`)
  const effects = block.effects.map((effect) => effect.name)
  return stats.length === 0 && effects.length === 0 ? null : { stats, effects }
}

/**
 * What the Explore route groups a recipe by, off the made item's own page: the quests that take
 * it (a quest that only hands it out is no use of it) and its own stats and effects.
 */
function madeItemFacts(entry: ItemDbEntry): Partial<BookRecipe> {
  const quests = [...new Set((entry.questUses ?? []).filter((use) => use.role !== 'reward').map((use) => use.quest))]
  const worn = wornOf(entry)
  return {
    ...(quests.length === 0 ? {} : { quests }),
    ...(worn === null ? {} : { worn })
  }
}

/** What a recipe is built against: the item index, the era derivations, and its place on its page. */
interface BuildDeps {
  index: ItemIndex
  derivations: ReadonlyMap<string, EraDerivation>
}

function bookRecipe(entry: ItemDbEntry, recipe: ItemCraftRecipe, nth: number, deps: BuildDeps): BookRecipe {
  const { index, derivations } = deps
  const item = entry.name ?? entry.page
  const tradeskill = tradeskillOf(recipe.tradeskill)
  const ingredients: BookIngredient[] = recipe.ingredients.map((i) => ({ ...i, key: wornKey(i.name, index) }))
  return {
    // By page, not by name: several pages share one in-game name (a bow's Linen, Hemp and Silk pages).
    id: `${itemKey(entry.page)}#${String(nth)}`,
    key: itemKey(item),
    item,
    // The page's own title, for the wiki link, where the item's name is not it.
    ...(entry.page === item ? {} : { page: entry.page }),
    ...(tradeskill === undefined ? {} : { tradeskill }),
    ...(tradeskill === undefined && recipe.tradeskill !== undefined ? { skillWord: recipe.tradeskill } : {}),
    ...statedFields(recipe),
    ingredients,
    // The Gear row's evidence, from the same builder, so one item has one era verdict on both tabs.
    ...eraEvidenceOf(entry.page, entry.eraTag, derivations),
    ...(entry.dropsFrom === undefined ? {} : { wikiSources: entry.dropsFrom }),
    ...madeItemFacts(entry)
  }
}

/** Where a material's own page says it comes from, or null when it states neither. */
function materialOf(entry: ItemDbEntry): BookMaterial | null {
  if (entry.dropsFrom === undefined && entry.foraged === undefined && entry.foragedNote === undefined) return null
  return {
    ...(entry.dropsFrom === undefined ? {} : { dropsFrom: entry.dropsFrom }),
    ...(entry.foraged === undefined ? {} : { foraged: entry.foraged }),
    ...(entry.foragedNote === undefined ? {} : { foragedNote: entry.foragedNote })
  }
}

/** Notes where each of a recipe's materials comes from, once per material. */
function noteMaterials(recipe: BookRecipe, index: ItemIndex, materials: Map<string, BookMaterial>, asked: Set<string>): void {
  for (const ingredient of recipe.ingredients) {
    if (asked.has(ingredient.key)) continue
    asked.add(ingredient.key)
    const record = index.get(itemKey(ingredient.name))
    const material = record === undefined ? null : materialOf(record)
    if (material !== null) materials.set(ingredient.key, material)
  }
}

/**
 * The guides' name lookup: the item a spelling names exactly (its name, its page title or one of
 * its other names, as the index keys them), in the item's own spelling. A loose guide spelling
 * finds nothing and stays the text its author wrote.
 */
export function wikiItemName(index: ItemIndex): WikiItemName {
  return (name) => {
    const record = index.get(itemKey(name))
    return record === undefined ? undefined : (record.name ?? record.page)
  }
}

/**
 * The whole book. `index` is `itemDb()`: one page sits under several keys (its title, its
 * `|itemname`, a redirect), as the same record or as a copy of it, so each PAGE is walked once.
 */
export function buildTradeskillBook(
  index: ItemIndex,
  derivations: ReadonlyMap<string, EraDerivation>
): TradeskillBookPayload {
  const recipes: BookRecipe[] = []
  const materials = new Map<string, BookMaterial>()
  const asked = new Set<string>()
  const seen = new Set<string>()
  for (const entry of index.values()) {
    if (seen.has(entry.page)) continue
    seen.add(entry.page)
    for (const [nth, recipe] of (entry.craftedBy ?? []).entries()) {
      const made = bookRecipe(entry, recipe, nth, { index, derivations })
      recipes.push(made)
      noteMaterials(made, index, materials, asked)
    }
  }
  return { version: TRADESKILL_BOOK_VERSION, recipes, materials: Object.fromEntries(materials) }
}
