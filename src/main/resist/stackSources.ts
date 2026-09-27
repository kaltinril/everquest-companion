// resist/stackSources.ts — THE STACKING ROWS FOR A LIST OF NAMES, out of the parsed client table.
//
// Lifted out of `ipc/knowledge.ts` the day it grew a second job (2026-09-26): a row is no longer
// the whole of what a cast lands, and resolving the rest is a join a test has to be able to drive.
// That file imports Electron and this one does not.
//
// Pure over the table it is handed.

import { spellCanonKey } from '../../shared/spellKey'
import { triggeredSpellIds, type StackSource } from '../../shared/spellStack'
import type { SpellResistInfo, SpellResistTable } from '../../shared/resistTypes'

/**
 * The stacking rows for a validated list of names, keyed by the name AS ASKED.
 *
 * Keyed as asked so a caller can look its own strings back up without re-folding a key.
 */
export function stackViewsFor(table: SpellResistTable, names: readonly unknown[]): Record<string, StackSource> {
  const out: Record<string, StackSource> = {}
  for (const raw of names) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 128) continue
    const row = table[spellCanonKey(raw)]
    // Only rows the parser kept slots for - which is rows with a DURATION, the only ones a stacking
    // question is ever about (`SpellResistInfo.slots` states the filter and why).
    if (!row?.slots) continue
    const triggers = triggersOf(table, row)
    out[raw] = { ...stackSource(row, raw), ...(triggers.length > 0 ? { triggers } : {}) }
  }
  return out
}

function stackSource(row: SpellResistInfo, name: string): StackSource {
  return {
    // THE ID IS NOT OPTIONAL DECORATION. Without it every view the renderer builds claims to be
    // spell zero and the stacking engine reads all of them as one spell - the 2026-09-10 Loadout
    // collapse. `shared/spellStack.ts sameIdentity` carries the report.
    id: row.id,
    name,
    goodEffect: row.goodEffect ?? false,
    targetType: row.targetType,
    durationFormula: row.durationFormula ?? 0,
    durationValue: row.durationValue ?? 0,
    song: row.song ?? false,
    slots: row.slots
  }
}

/**
 * The spells this row casts with itself (`shared/spellStack.ts TRIGGER_EFFECTS`), as rows.
 *
 * ONE LEVEL DEEP, and only what the table can answer: it keeps one row a name, so a triggered
 * spell that lost its name to another row is not found and the view goes without it.
 */
function triggersOf(table: SpellResistTable, row: SpellResistInfo): StackSource[] {
  const out: StackSource[] = []
  for (const id of triggeredSpellIds(row.slots)) {
    const hit = rowsById(table).get(id)
    if (hit?.row.slots) out.push(stackSource(hit.row, hit.key))
  }
  return out
}

interface Keyed {
  key: string
  row: SpellResistInfo
}

/** The table by spell id, built once per table: it is keyed by name and a trigger names an id. */
const BY_ID = new WeakMap<SpellResistTable, Map<number, Keyed>>()

function rowsById(table: SpellResistTable): Map<number, Keyed> {
  const had = BY_ID.get(table)
  if (had !== undefined) return had
  const made = new Map<number, Keyed>()
  for (const [key, row] of Object.entries(table)) made.set(row.id, { key, row })
  BY_ID.set(table, made)
  return made
}
