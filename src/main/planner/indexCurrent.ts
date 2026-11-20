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
import { buildEraDerivations, eraDerivationSteps } from './eraDerive'
import type { EraDerivation } from '../../shared/planner/era'
import type { Steps } from '../yieldingSteps'

let index: PlannerIndex | null = null
let bySpell: SpellItemIndex | null = null
let derivations: ReadonlyMap<string, EraDerivation> | null = null

/**
 * LAYER 3 OF THE ERA JOIN FOR THE COMMITTED CORPUS, built once and handed to BOTH indexes.
 *
 * The donor index and the gear index each state an item's era evidence, through one builder
 * (`eraEvidence.ts`), and this is the one copy of the derivations that builder reads: a second
 * walk would be 50 to 80 ms of the main process for an answer already in hand, and two copies are
 * two things that can drift.
 */
export function eraDerivations(): ReadonlyMap<string, EraDerivation> {
  derivations ??= buildEraDerivations(itemsJson as unknown as ItemDbFile)
  return derivations
}

/**
 * The same map as STEPS, for the gear index's sliced build (`ipc/planner.ts`): the walk yields
 * between pages, and whichever of the two asks first fills the memo for the other.
 */
export function* eraDerivationsSteps(): Steps<ReadonlyMap<string, EraDerivation>> {
  if (derivations !== null) return derivations
  const built = yield* eraDerivationSteps(itemsJson as unknown as ItemDbFile)
  derivations ??= built
  return derivations
}

/** The donor + item indices, built on first use. */
export function plannerIndex(): PlannerIndex {
  index ??= buildPlannerIndex(itemsJson as unknown as ItemDbFile, undefined, undefined, eraDerivations())
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
