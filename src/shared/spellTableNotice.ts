// spellTableNotice.ts — WHAT THE SPELLS TAB SAYS ABOUT THE CLIENT'S SPELL FILE.
//
// The owner, 2026-11-23: the app ships no spell file of its own, so when `spells_us.txt` is missing
// the Spells tab shows a notice that stays up, after the app has looked for another language's
// `spells_*.txt` in the same folder (main/resist/spellFiles.ts). When it reads one of those
// instead, a quiet line says which.
//
// WHAT IS MISSING WITHOUT IT, checked against the Spells tab's own readers, not guessed:
//   * the spell icons: a row's gem id is the client table's field 75 (`levelUnlocks.ts iconId`);
//   * the Loadout tab's stacking checks: without the table they are only a same-stat guess
//     (`SpellLoadoutView.tsx`, the `exact` / `flagged` tiers);
//   * the AE target counts: an AE spell assumes 4 targets (8 point-blank) without the client's number
//     (`aoeSpells.ts`).
// The wiki data (what a spell does, who gets it at what level) is shipped and is not affected.

/** Where the spell table stands, as main reports it (`main/resist/spellFiles.ts spellTableReport`). */
export interface SpellTableReport {
  state: 'loading' | 'ok' | 'missing' | 'unloadable'
  /** The EverQuest folder looked in. */
  folder: string
  /** The table's file name: the one read, or `spells_us.txt` when none was found. */
  file: string
  /** True when the table is another language's file, not `spells_us.txt`. */
  fallback: boolean
}

/** What the Spells tab goes without when there is no spell table. Plain and short. */
export const SPELL_TABLE_LACKS: readonly string[] = [
  'spell icons',
  'exact stacking checks on the Loadout tab (it can only guess from shared stats)',
  'AE target counts from your client (a default of 4, or 8 for point-blank, is used)'
]

export type SpellTableNotice =
  /** No table, or one that could not be read: the notice that stays up. */
  | { kind: 'missing' | 'unloadable'; folder: string; file: string; lacks: readonly string[] }
  /** Another language's table is in use: the quiet line. */
  | { kind: 'fallback'; file: string }

/** The notice to draw, or null for none (the table is read, or still loading, or not asked yet). */
export function spellTableNotice(report: SpellTableReport | null): SpellTableNotice | null {
  if (report === null || report.state === 'loading') return null
  if (report.state === 'missing' || report.state === 'unloadable') {
    return { kind: report.state, folder: report.folder, file: report.file, lacks: SPELL_TABLE_LACKS }
  }
  return report.fallback ? { kind: 'fallback', file: report.file } : null
}
