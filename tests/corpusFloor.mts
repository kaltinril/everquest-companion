// A count over the committed wiki data is a FLOOR, never an equality (owner, 2026-10-29: "so that we
// are not saying 'oh, we had 400 spells, now there are 401, test failed' that's useless"). A wiki
// delta adds or drops a page or two and stays green; a scrape or a rule that lost a real share of
// the population still goes red. NOT a *.test.mts: imported by the specs that count the corpus.
//
// Imported RELATIVELY: node tests run through tsx with no `@shared` alias.

import assert from 'node:assert/strict'

/** The share of the measured count a census may lose before it is a regression, not a wiki edit. */
export const CORPUS_FLOOR_SHARE = 0.9

/** `actual` is at least 90% of `measured`, the count on the day the test was written. */
export function assertCorpusFloor(actual: number | undefined, measured: number, what: string): void {
  const floor = Math.floor(measured * CORPUS_FLOOR_SHARE)
  assert.ok(
    (actual ?? 0) >= floor,
    `${what}: ${String(actual)}, under the floor ${String(floor)} (90% of the ${String(measured)} measured)`
  )
}
