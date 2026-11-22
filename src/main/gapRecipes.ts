// gapRecipes.ts - what the Gaps tab's recipe form reads off the committed data (owner, 2026-11-21:
// "search for and chose items to tell the app what are needed for the receipe and the containter").
// The item search, each material's icon and source words, the containers a tradeskill's recipes use,
// the materials a community guide names, and which combined items' pages state no materials.
// Read from the committed corpus; never fetched.
//
// A MATERIAL'S SOURCE WORDS are the wiki's own: the words the recipes that already use it state, the
// most common wording first. An item no recipe uses yet gets what its own page proves, in the wiki's
// order. A guide's text is other players' data, kept as plain names and counts.
//
// ELECTRON-FREE, as gapItemIcons.ts is: tests/gapRecipe.test.mts drives it under the node runner.

import { itemKey, type ItemDbEntry, type ItemDbFile } from './itemsDb'
import itemsJson from './data/items.json'
import guidesJson from './data/tradeskillGuides.json'
import { itemsByAnyName } from './itemOtherNames'
import { sourceItemKey } from '../shared/itemSources'
import { TRADESKILLS, tradeskillOf, type Tradeskill } from '../shared/tradeskills'
import type { GapRecipeHelp, GapRecipeMaterial, RecipelessPage } from '../shared/gapRecipe'
import type { GuideMaterial, TradeskillGuidesFile } from '../shared/guideData'

type Corpus = Readonly<Record<string, ItemDbEntry>>

const SEARCH_LIMIT = 12

interface CatalogRow {
  search: string
  entry: ItemDbEntry
  name: string
}

/** What the corpus says once, built on first ask: the corpus is fixed for the process. */
export interface RecipeCatalog {
  rows: CatalogRow[]
  /** Item key to the source words the recipes using it state most. */
  words: Map<string, string[]>
  trades: string[]
  containers: Record<string, string[]>
}

const bump = <K>(m: Map<K, number>, key: K): void => {
  m.set(key, (m.get(key) ?? 0) + 1)
}

/** The keys, most counted first, names as the stable tail. */
const ranked = (m: ReadonlyMap<string, number>): string[] => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k)

interface Tally {
  words: Map<string, Map<string, number>>
  spellings: Map<Tradeskill, Map<string, number>>
  containers: Map<Tradeskill, Map<string, number>>
}

function nested<K, V>(m: Map<K, Map<V, number>>, key: K): Map<V, number> {
  let inner = m.get(key)
  if (inner === undefined) {
    inner = new Map()
    m.set(key, inner)
  }
  return inner
}

function tallyEntry(entry: ItemDbEntry, t: Tally): void {
  for (const recipe of entry.craftedBy ?? []) {
    for (const i of recipe.ingredients) {
      if (i.sources !== undefined && i.sources.length > 0) bump(nested(t.words, itemKey(i.name)), i.sources.join('\n'))
    }
    const skill = tradeskillOf(recipe.tradeskill)
    if (skill === undefined || recipe.tradeskill === undefined) continue
    if (!recipe.tradeskill.startsWith(':')) bump(nested(t.spellings, skill), recipe.tradeskill)
    if (recipe.container !== undefined) bump(nested(t.containers, skill), recipe.container)
  }
}

/** Every tradeskill as the wiki spells it most, with its containers by that spelling. */
function tradeLists(t: Tally): Pick<RecipeCatalog, 'trades' | 'containers'> {
  const trades: string[] = []
  const containers: Record<string, string[]> = {}
  for (const skill of TRADESKILLS) {
    const word = ranked(t.spellings.get(skill) ?? new Map<string, number>())[0] ?? skill
    trades.push(word)
    containers[word] = ranked(t.containers.get(skill) ?? new Map<string, number>())
  }
  return { trades, containers }
}

/** The corpus's search rows and recipe words, each PAGE once (an alias keys a page twice). */
export function recipeCatalog(corpus: Corpus): RecipeCatalog {
  const seen = new Set<string>()
  const rows: CatalogRow[] = []
  const t: Tally = { words: new Map(), spellings: new Map(), containers: new Map() }
  for (const entry of Object.values(corpus)) {
    if (seen.has(entry.page)) continue
    seen.add(entry.page)
    const name = entry.name ?? entry.page
    rows.push({ search: name.toLowerCase(), entry, name })
    tallyEntry(entry, t)
  }
  const words = new Map([...t.words].map(([key, counts]): [string, string[]] => [key, (ranked(counts)[0] ?? '').split('\n')]))
  return { rows, words, ...tradeLists(t) }
}

/** What a page itself proves of where an item comes from, in the order the wiki lists them. */
function ownSources(e: ItemDbEntry): string[] {
  return [
    ...((e.foraged?.length ?? 0) > 0 || e.foragedCategory === true ? ['Foraged'] : []),
    ...((e.craftedBy?.length ?? 0) > 0 ? ['Crafted'] : []),
    ...((e.questUses ?? []).some((u) => u.role === 'reward') ? ['Quested'] : []),
    ...((e.dropsFrom?.length ?? 0) > 0 ? ['Dropped'] : [])
  ]
}

function materialOf(c: RecipeCatalog, entry: ItemDbEntry, qty?: number): GapRecipeMaterial {
  const name = entry.name ?? entry.page
  const sources = c.words.get(itemKey(name)) ?? ownSources(entry)
  return {
    name,
    ...(qty === undefined ? {} : { qty }),
    ...(entry.iconId === undefined ? {} : { iconId: entry.iconId }),
    ...(sources.length === 0 ? {} : { sources })
  }
}

/** Items by name: names that start with the text first, then the shortest, capped. */
export function searchRecipeItems(c: RecipeCatalog, query: string, limit = SEARCH_LIMIT): GapRecipeMaterial[] {
  const q = query.trim().toLowerCase()
  if (q === '') return []
  const hits: { row: CatalogRow; rank: number }[] = []
  for (const row of c.rows) {
    const at = row.search.indexOf(q)
    if (at >= 0) hits.push({ row, rank: at === 0 ? 0 : 1 })
  }
  hits.sort((a, b) => a.rank - b.rank || a.row.name.length - b.row.name.length || a.row.search.localeCompare(b.row.search))
  return hits.slice(0, limit).map(({ row }) => materialOf(c, row.entry))
}

/** The materials the guides name for an item: the recipe guide's, else the leveling route's. */
function guideMaterials(file: TradeskillGuidesFile, item: string): readonly Pick<GuideMaterial, 'name' | 'qty'>[] {
  const key = sourceItemKey(item)
  for (const list of Object.values(file.recipes.tradeskills)) {
    const found = list.recipes.find((r) => sourceItemKey(r.item) === key && r.materials.length > 0)
    if (found !== undefined) return found.materials
  }
  for (const ladder of Object.values(file.leveling.tradeskills)) {
    const found = [...ladder.steps, ...ladder.alternates].find((s) => sourceItemKey(s.item) === key && s.materials.length > 0)
    if (found !== undefined) return found.materials
  }
  return []
}

/** What the form offers for one item. A guide's name that is no wiki item stays as the guide wrote it. */
export function recipeHelpFor(c: RecipeCatalog, corpus: Corpus, file: TradeskillGuidesFile, item: string): GapRecipeHelp {
  const guide = guideMaterials(file, item).map((m): GapRecipeMaterial => {
    const entry = corpus[itemKey(m.name)]
    if (entry !== undefined) return materialOf(c, entry, m.qty)
    return { name: m.name, ...(m.qty === undefined ? {} : { qty: m.qty }) }
  })
  return { trades: c.trades, containers: c.containers, guide }
}

/**
 * Of the named items, the pages that state no materials: no recipe, or recipes with an empty
 * list. A page with words in place of a recipe (`Non-Tradeskill (Quest)`) has said how it is made.
 */
export function recipelessOf(corpus: Corpus, names: readonly string[]): RecipelessPage[] {
  const out = new Map<string, RecipelessPage>()
  for (const name of names) {
    const e = corpus[itemKey(name)]
    if (e === undefined || e.craftedNote !== undefined) continue
    if ((e.craftedBy ?? []).some((r) => r.ingredients.length > 0)) continue
    const stated = e.craftedBy?.find((r) => tradeskillOf(r.tradeskill) !== undefined)?.tradeskill
    out.set(e.page, { name: e.name ?? e.page, page: e.page, ...(stated === undefined ? {} : { tradeskill: stated }) })
  }
  return [...out.values()]
}

// ---- the committed data ------------------------------------------------------------------------

const corpus = (): Corpus => itemsByAnyName((itemsJson as unknown as ItemDbFile).items)
let held: RecipeCatalog | null = null
const catalog = (): RecipeCatalog => (held ??= recipeCatalog((itemsJson as unknown as ItemDbFile).items))

export const recipelessItems = (names: readonly string[]): RecipelessPage[] => recipelessOf(corpus(), names)
export const recipeItemSearch = (query: string): GapRecipeMaterial[] => searchRecipeItems(catalog(), query)
export const recipeHelp = (item: string): GapRecipeHelp => recipeHelpFor(catalog(), corpus(), guidesJson as unknown as TradeskillGuidesFile, item)
