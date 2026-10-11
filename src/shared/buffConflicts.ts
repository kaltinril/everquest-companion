// The engine's `buffConflicts` module state: your spells this session that did not take hold, and
// your buffs on someone that were overwritten. Rows arrive newest first, one per (what happened,
// spell, blocker, target), already counted.

export interface BuffConflictRow {
  kind: 'blocked' | 'overwritten'
  spell: string
  /** What the game named as the blocker; absent when the line names none. */
  blockedBy?: string
  /** Who the spell was cast on; absent when it was you. */
  target?: string
  count: number
  firstTs: number
  lastTs: number
}

export interface BuffConflictsSnap {
  rows: BuffConflictRow[]
}

/** What happened, in words: `Blocked by X`, `Did not take hold`, `Overwritten`. */
export function conflictOutcome(row: BuffConflictRow): string {
  if (row.kind === 'overwritten') return 'Overwritten'
  return row.blockedBy !== undefined ? `Blocked by ${row.blockedBy}` : 'Did not take hold'
}

/** Who it was cast on: the target's name, or `you`. */
export function conflictTarget(row: BuffConflictRow): string {
  return row.target ?? 'you'
}

/** The row's identity, stable across counts. */
export function conflictKey(row: BuffConflictRow): string {
  return `${row.kind}|${row.spell}|${row.blockedBy ?? ''}|${row.target ?? ''}`
}
