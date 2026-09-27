// spells/partyPaint.ts — WHAT EACH CASTER'S COLOUR SLOT IS PAINTED WITH.
//
// `shared/spellParty.ts` stores and validates a SLOT; which paint a slot wears is presentation and
// lives here. One entry per slot (`PARTY_COLOR_COUNT`, pinned by `tests/spellParty.test.mts`), all
// light enough to read as an outlined chip on the dark theme.

export const PARTY_PAINT = [
  '#90caf9',
  '#a5d6a7',
  '#ffcc80',
  '#ce93d8',
  '#80deea',
  '#f48fb1',
  '#fff59d',
  '#bcaaa4'
] as const

/** The paint a slot wears. An out-of-range slot wears the first. */
export function paintOf(slot: number): string {
  return PARTY_PAINT[slot] ?? PARTY_PAINT[0]
}

/** An outlined chip in a caster's colour. One style, for the strip and for the rows. */
export function casterChipSx(paint: string): { color: string; borderColor: string } {
  return { color: paint, borderColor: paint }
}
