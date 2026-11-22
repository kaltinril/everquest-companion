// shared/gapRecipeRows.ts - the Items rows for pages that exist and do not state a recipe the
// player has combined (owner, 2026-11-21: Picnic Basket, posted with `* [[Tailoring]]` and nothing
// under it). Once its page is in the wiki data the item is no longer a new-page row, and without
// this it would leave the tab with its recipe still missing. Main answers which of the combined
// items those are (`main/gapRecipes.ts`); the row is an update to that page (`gapJob.ts`).
//
// EVIDENCE, AS EVERY GAPS ROW HAS: the engine's `crafting` module, the player's own combines.

import { logStamp } from './gapExtraItems'
import { iconKey } from './gapIcons'
import type { CraftedItemRow } from './crafting'
import { pageRecipeFacts, type RecipelessPage } from './gapRecipe'
import type { GapKind, GapRow } from './gaps'

const stamp = (ts: number): string => logStamp(new Date(ts).toISOString())

function recipeRow(page: RecipelessPage, c: CraftedItemRow): GapRow {
  const kinds: GapKind[] = [...(c.made > 0 ? (['crafted'] as const) : []), ...(c.failed > 0 ? (['failed-combine'] as const) : [])]
  const trade = c.tradeskill ?? page.tradeskill
  const combines = Math.max(1, c.made + c.failed)
  return {
    domain: 'item',
    name: page.name,
    kinds,
    count: combines,
    first: stamp(c.firstTs),
    last: stamp(c.lastTs),
    details: { ...(trade === undefined ? {} : { tradeskills: { entries: [{ name: trade, n: combines }], distinct: 1, all: [trade] } }), samples: [] },
    recipeUpdate: { page: page.page, ...pageRecipeFacts(page) }
  }
}

/**
 * One Items row per recipeless page the player has combined, none for an item an Items row already
 * names. `rows` is the snapshot's; `more` is the rows added beside it.
 */
export function recipeRows(pages: readonly RecipelessPage[], crafted: readonly CraftedItemRow[], rows: readonly GapRow[], more: readonly GapRow[] = []): GapRow[] {
  if (pages.length === 0) return []
  const combined = new Map(crafted.map((c) => [iconKey(c.item), c]))
  const named = new Set([...rows, ...more].filter((r) => r.domain === 'item').map((r) => iconKey(r.name)))
  const out: GapRow[] = []
  for (const page of pages) {
    const key = iconKey(page.name)
    const c = combined.get(key)
    if (c !== undefined && !named.has(key)) out.push(recipeRow(page, c))
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** The names to ask main about: every item the player combined, sorted so one list asks once. */
export function combinedNames(crafted: readonly CraftedItemRow[]): string[] {
  return [...new Set(crafted.map((c) => c.item))].sort((a, b) => a.localeCompare(b))
}
