// planner/eraEvidence.ts - THE ERA EVIDENCE ONE ITEM PAGE CARRIES, built in one place.
//
// Two indexes are served to the renderer from the same item corpus: the Gear rows (`gearIndex.ts`)
// and the Exaltation donors (`effectIndex.ts`). The renderer asks one function for an era verdict
// (`plannerData.donorEra`), and that function reads these fields off whichever row it is handed.
//
// Until 2026-11-20 each index wrote its own. The Gear index attached layer 3 (`eraDerived`, the era
// read off how you GET the item: `eraDerive.ts`) and the donor index did not. So one item had two
// verdicts: Mane Attraction was in era on the Gear tab (awarded by a quest that starts in Greater
// Faydark) and "era unknown" on the Exaltations list, where the era filter then hid it. Nothing
// compared the two lists, so no audit saw it; the owner did.
//
// ONE BUILDER NOW. A row that carries era evidence takes it from `eraEvidenceOf` and from nowhere
// else, so the two indexes cannot state different evidence for one page. A third index that needs
// an era spreads the same call.

import { itemKey } from '../itemsDb'
import type { EraDerivation } from '../../shared/planner/era'

/** What a row states about its item's era. Absent means the corpus stated nothing (law 1). */
export interface EraEvidence {
  /** the page-top `{{X Era}}` banner's token, verbatim */
  eraTag?: string
  /** layer 3: the era read off the way you get the item, with the edge that says so */
  eraDerived?: EraDerivation
}

/**
 * The evidence for one page.
 *
 * `page` is the wiki page TITLE, not the item's name: layer 3 walks pages and keys its answers by
 * the page's canonical key, and the two differ on the `|itemname` alias pages. `eraTag` is handed
 * in rather than read off the record because both callers hold the researched knowledge, whose
 * banner is the one the app serves.
 */
export function eraEvidenceOf(
  page: string,
  eraTag: string | undefined,
  derivations: ReadonlyMap<string, EraDerivation>
): EraEvidence {
  const derived = derivations.get(itemKey(page))
  return {
    ...(eraTag === undefined ? {} : { eraTag }),
    ...(derived === undefined ? {} : { eraDerived: derived })
  }
}
