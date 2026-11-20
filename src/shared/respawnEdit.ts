// shared/respawnEdit.ts — what the respawn edit dialog's field shows and what its Save writes
// (`features/timers/RespawnEditDialog.tsx`). Pure; tests/respawnEdit.test.mts.

import { formatRespawnDuration, parseRespawnDuration, type RespawnRow } from './respawn'

/** What the field shows until it is typed in: the duration in force, in the shorthand the field itself accepts. */
export function respawnPrefill(row: Pick<RespawnRow, 'estimateMs'>): string {
  return row.estimateMs === undefined ? '' : formatRespawnDuration(Math.round(row.estimateMs / 1000))
}

/** Under the field of a row the player has not overruled: what saving a number does. */
export const RESPAWN_SAVE_NOTE = 'A number you save replaces what your kills teach, until you choose Use calculated.'

/**
 * What Save writes as the player's own number, in seconds; null when there is nothing to save.
 *
 * `typed` is null until the field is typed in, and `inForce` is what it shows meanwhile. A field
 * still holding the number in force is not an edit: saving it would turn a learned or wiki number
 * into "your number", which outranks every later kill, on a press that changed nothing. The number
 * in force typed another way (`525` for `8m 45s`) is a choice to keep it, and is saved.
 */
export function respawnDraftToSave(typed: string | null, inForce: string): number | null {
  if (typed === null || typed.trim() === inForce.trim()) return null
  const parsed = parseRespawnDuration(typed)
  return parsed.ok ? parsed.sec : null
}
