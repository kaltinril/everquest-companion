// planner/indexCurrent.ts — THE ONE WALK OF THE ITEM CORPUS, memoized, shared by every handler.
//
// EXTRACTED FROM `ipc/planner.ts` (2026-09-10), and that file's own comment is why. It said, of the
// gear index living beside the donor one:
//
//   > It lives in THIS file rather than a gear-only handler module because the memoization is per
//   > import of a committed corpus: two handler modules would each hold their own walk of the same
//   > 8.6 MB.
//
// Correct, and the spell page is the second handler that comment was waiting for. `knowledge.ts`
// needs the DONOR rows to answer "which items carry this spell", and importing `items.json` a
// second time would have been exactly the duplicate walk the note forbids. So the memo moves out to
// where both can reach it - the arrangement `wornFocusCurrent.ts` already made for the worn-focus
// answer, and for the same stated reason: *"the spell card's handler reads the same answer"*.
//
// NOTHING ELSE MOVED. `ipc/planner.ts` keeps every handler and its gear memo; this file holds the
// donor/item index and the spell inversion over it, both built on FIRST USE - so a launch where
// nobody opens the Exaltation board or a spell page pays for neither.

import itemsJson from '../data/items.json'
import type { ItemDbFile } from '../itemsDb'
import { buildPlannerIndex, type PlannerIndex } from './effectIndex'
import { buildSpellItemIndex, type SpellItemIndex } from './spellItemIndex'

let index: PlannerIndex | null = null
let bySpell: SpellItemIndex | null = null

/** The donor + item indices, built on first use. */
export function plannerIndex(): PlannerIndex {
  index ??= buildPlannerIndex(itemsJson as unknown as ItemDbFile)
  return index
}

/**
 * The same donor rows grouped by the SPELL each one names, built on first use over the index above.
 *
 * A second memo rather than a field on the first, because the two are wanted by different surfaces
 * at different times: the Board asks for donors and may never ask this, and a spell page asks this
 * and never walks the donor list itself. Deriving it eagerly would put a group-by on the critical
 * path of a board that does not want it.
 */
export function spellItemIndex(): SpellItemIndex {
  bySpell ??= buildSpellItemIndex(plannerIndex().donors)
  return bySpell
}
