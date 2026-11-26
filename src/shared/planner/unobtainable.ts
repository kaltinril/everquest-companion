// planner/unobtainable.ts — ITEMS NO PLAYER CAN GET IN EVERQUEST LEGENDS, kept out of the Best in slot
// sheet's candidates (owner, 2026-11-25: *"Oakwynd is not obtainable in EverQuest Legends"*).
//
// Oakwynd, and the eight whose wiki summary says they were given out in a GM event. Shield of Hatred
// is not here: its page only says "Possibly a GM Event item?".
//
// PURE, no imports (the shared/planner house rule).

/** GM-event gifts, by item key: nobody can farm, buy or craft them. */
export const UNOBTAINABLE_KEYS: ReadonlySet<string> = new Set([
  'oakwynd',
  'breastplate of afflation',
  'essence of gukta',
  'howling werewolf claws',
  'obtenebrate claymore',
  'pendant of salvation',
  'slippers of the silent stalker',
  'staff of endless adventure',
  'the butcherblock hammer',
  'writ of innoruuk'
])

export function isUnobtainable(row: { key: string }): boolean {
  return UNOBTAINABLE_KEYS.has(row.key)
}
