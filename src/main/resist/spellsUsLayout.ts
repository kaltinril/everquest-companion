// spellsUsLayout.ts — which column layout a client's spells_us.txt is in.
//
// THE 2026-10-13 GAME PATCH INSERTED ONE COLUMN somewhere in fields 52..75. Measured on the
// owner's patched install: the icon moved 75 -> 76, the resist adjustment 78 -> 79 and the effect
// slots 172 -> 173, while everything up to the class levels (36..51) stayed put. No reader takes
// a field in 52..74, so dropping ONE column at 52 from every row of a patched file puts every field
// a reader takes back where the parsers expect it, whichever column the patch actually added. The
// exact insertion point is not needed and is not claimed.
//
// THE 2026-11-16 GAME PATCH INSERTED SIXTEEN MORE, after `aemaxtargets`. Measured on the owner's
// install against the app's own saved parse of the file before it (48,296 rows joined by id): the
// icon (76), resist adjustment (79), good-effect flag (127) and aemaxtargets (144) all stayed put,
// 100% each, and the effect slots moved 173 -> 189 on 190-field rows. No reader takes a field
// between aemaxtargets and the slots, so dropping the extra columns right after aemaxtargets puts
// the slots back at 172. Until this was read, every spell parsed with no effect slots at all.
//
// THE LAYOUT IS READ FROM THE FILE, not assumed, so an unpatched client (or a test's 173-field
// rows) parses exactly as before: the effect-slot list (`1|35|1|0|100|0$2|...`) is the first such
// field at 172 or later, and the majority over a sample of rows says how far it has moved.
// The engine's Rust reader carries the same rule (fold/src/spells_us/layout.rs).

/** Where the extra column is dropped from a patched row. Any index in 52..75 restores every read field. */
export const INSERTED_COLUMN = 52
/** Where the 2026-11-16 columns are dropped, once column 52 is gone: right after aemaxtargets (143). */
export const EXTRA_COLUMNS_AT = 144
const OLD_SLOTS = 172
/** Rows sampled to decide; the effect lists start within the first few hundred rows. */
const SAMPLE_ROWS = 4000
const SLOT_LIST = /^\d+\|/

/**
 * How many columns past 172 the effect slots sit: 0 in an unpatched file, 1 since the 2026-10-13
 * patch, 17 since 2026-11-16. The most common answer over the sample; a tie goes to the smaller.
 */
export function spellsUsShift(text: string): number {
  const votes = new Map<number, number>()
  for (const line of text.split('\n', SAMPLE_ROWS)) {
    const f = line.split('^')
    if (f.length <= OLD_SLOTS) continue
    const at = f.findIndex((field, i) => i >= OLD_SLOTS && SLOT_LIST.test(field))
    if (at >= 0) votes.set(at - OLD_SLOTS, (votes.get(at - OLD_SLOTS) ?? 0) + 1)
  }
  let shift = 0
  let most = 0
  for (const [by, n] of votes) {
    if (n > most || (n === most && by < shift)) {
      shift = by
      most = n
    }
  }
  return shift
}

/** True when the file is in a patched layout (2026-10-13 or later). */
export function spellsUsShifted(text: string): boolean {
  return spellsUsShift(text) > 0
}

/**
 * A row's fields in the layout the readers index: the column inserted at 52 dropped from a patched
 * row, and any further columns (`shift` beyond 1) dropped from before the effect slots.
 */
export function unshiftRow(f: string[], shift: number | boolean): string[] {
  const by = Number(shift)
  if (by >= 1 && f.length > INSERTED_COLUMN) f.splice(INSERTED_COLUMN, 1)
  if (by > 1 && f.length >= EXTRA_COLUMNS_AT + by) f.splice(EXTRA_COLUMNS_AT, by - 1)
  return f
}
