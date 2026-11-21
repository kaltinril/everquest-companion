// macros/sets.ts — named layouts (slot to library macro), the set chosen per character file, and
// what a set would change in a character file. Pure and immutable, like library.ts.

import { BUTTONS_PER_PAGE, LINES } from './limits'
import { findMacro, importGameMacros, sameBody, systemMint } from './library'
import { bySlot, parseSlotKey, slotKey, trimLines } from './socials'
import type { GameMacro, Macro, MacroLibrary, MacroSet, Mint } from './types'

/** A record's value, or null for a key it does not have. */
function valueAt(record: Record<string, string>, key: string): string | null {
  return key in record ? record[key] : null
}

/** A copy of a record with one key set, or dropped for null. */
function withValue(record: Record<string, string>, key: string, value: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k !== key) out[k] = v
  }
  if (value !== null) out[key] = value
  return out
}

export function newSet(mint: Mint, name: string): MacroSet {
  return { id: mint.id(), name, slots: {} }
}

export function findSet(library: MacroLibrary, id: string | null): MacroSet | null {
  return library.sets.find((s) => s.id === id) ?? null
}

export function addSet(library: MacroLibrary, set: MacroSet): MacroLibrary {
  return { ...library, sets: [...library.sets, set] }
}

function mapSet(library: MacroLibrary, id: string, change: (set: MacroSet) => MacroSet): MacroLibrary {
  if (findSet(library, id) === null) return library
  return { ...library, sets: library.sets.map((s) => (s.id === id ? change(s) : s)) }
}

export function renameSet(library: MacroLibrary, id: string, name: string): MacroLibrary {
  return mapSet(library, id, (s) => ({ ...s, name }))
}

/** A copy named "<name> copy", placed after the original. `set` is null for an unknown id. */
export function duplicateSet(library: MacroLibrary, id: string, mint: Mint): { library: MacroLibrary; set: MacroSet | null } {
  const at = library.sets.findIndex((s) => s.id === id)
  if (at < 0) return { library, set: null }
  const source = library.sets[at]
  const set: MacroSet = { id: mint.id(), name: `${source.name} copy`, slots: { ...source.slots } }
  return { library: { ...library, sets: [...library.sets.slice(0, at + 1), set, ...library.sets.slice(at + 1)] }, set }
}

/** What an Undo of a set's delete needs: the set, where it sat, and the files that had chosen it. */
export interface SetRemoval {
  set: MacroSet
  index: number
  chosenBy: string[]
}

/** Delete a set and forget it as any character file's choice. `undo` is null for an unknown id. */
export function removeSet(library: MacroLibrary, id: string): { library: MacroLibrary; undo: SetRemoval | null } {
  const index = library.sets.findIndex((s) => s.id === id)
  if (index < 0) return { library, undo: null }
  const chosen: Record<string, string> = {}
  const chosenBy: string[] = []
  for (const [file, setId] of Object.entries(library.chosen)) {
    if (setId === id) chosenBy.push(file)
    else chosen[file] = setId
  }
  const next = { ...library, sets: library.sets.filter((s) => s.id !== id), chosen }
  return { library: next, undo: { set: library.sets[index], index, chosenBy } }
}

/** Put a deleted set back. A file that chose another set since the delete keeps that choice. */
export function restoreSet(library: MacroLibrary, undo: SetRemoval): MacroLibrary {
  if (findSet(library, undo.set.id) !== null) return library
  const at = Math.min(undo.index, library.sets.length)
  const chosen = { ...library.chosen }
  for (const file of undo.chosenBy) {
    if (!(file in chosen)) chosen[file] = undo.set.id
  }
  return { ...library, sets: [...library.sets.slice(0, at), undo.set, ...library.sets.slice(at)], chosen }
}

/** Put a library macro on a slot, or empty the slot with null. */
export function assignSlot(library: MacroLibrary, setId: string, slot: string, macroId: string | null): MacroLibrary {
  return mapSet(library, setId, (set) => ({ ...set, slots: withValue(set.slots, slot, macroId) }))
}

/** Remember the set a character file uses; null forgets it. */
export function chooseSet(library: MacroLibrary, fileKey: string, setId: string | null): MacroLibrary {
  return { ...library, chosen: withValue(library.chosen, fileKey, setId) }
}

/** The set a character file uses, or null: none chosen, or the chosen one is gone. */
export function chosenSet(library: MacroLibrary, fileKey: string): MacroSet | null {
  return findSet(library, valueAt(library.chosen, fileKey))
}

/** How many of a set's slots hold a macro the library still has. */
export function filledCount(library: MacroLibrary, set: MacroSet): number {
  return setToGameMacros(library, set).length
}

/** How many of one page's buttons hold a macro the library still has. */
export function filledOnPage(library: MacroLibrary, set: MacroSet, page: number): number {
  return setToGameMacros(library, set).filter((m) => m.page === page).length
}

/** The names of the sets that have a macro on a slot, in the sets' order. */
export function setsUsing(library: MacroLibrary, macroId: string): string[] {
  return library.sets.filter((set) => Object.values(set.slots).includes(macroId)).map((set) => set.name)
}

/** One page of a set as the grid draws it: every button, with its macro or null. */
export function pageSlots(library: MacroLibrary, set: MacroSet, page: number): { button: number; slot: string; macro: Macro | null }[] {
  return Array.from({ length: BUTTONS_PER_PAGE }, (_, i) => {
    const slot = slotKey(page, i + 1)
    return { button: i + 1, slot, macro: findMacro(library, valueAt(set.slots, slot)) }
  })
}

/**
 * A new set laid out as a character file is: its macros are imported (one the library already has
 * is reused, not added twice) and each sits on the slot the file has it on.
 */
export function setFromGameMacros(
  library: MacroLibrary,
  name: string,
  gameMacros: readonly GameMacro[],
  mint: Mint = systemMint
): { library: MacroLibrary; set: MacroSet; added: number; skipped: number } {
  const imported = importGameMacros(library, gameMacros, [], mint)
  const set = newSet(mint, name)
  gameMacros.forEach((m, i) => {
    set.slots[slotKey(m.page, m.button)] = imported.ids[i]
  })
  return { library: addSet(imported.library, set), set, added: imported.added, skipped: imported.skipped }
}

/** A set as the game would hold it, sorted by slot. A slot whose macro is gone is left out. */
export function setToGameMacros(library: MacroLibrary, set: MacroSet): GameMacro[] {
  const out: GameMacro[] = []
  for (const [key, macroId] of Object.entries(set.slots)) {
    const slot = parseSlotKey(key)
    const macro = findMacro(library, macroId)
    if (slot === null || macro === null) continue
    // The file holds LINES lines; a longer macro is cut the way the game's own editor would.
    out.push({ ...slot, name: macro.name, color: macro.color, lines: trimLines(macro.lines.slice(0, LINES)) })
  }
  return out.sort(bySlot)
}

export type SlotChange = 'added' | 'changed' | 'removed' | 'same'

export interface SlotDiff {
  page: number
  button: number
  kind: SlotChange
  /** What the set puts on the slot; null when the set leaves it empty. */
  set: GameMacro | null
  /** What the file holds on the slot now; null when it holds nothing. */
  file: GameMacro | null
}

/** Per slot, what sending the set to the file would do. Sorted by slot. */
export function diffSetAgainstFile(setMacros: readonly GameMacro[], fileMacros: readonly GameMacro[]): SlotDiff[] {
  const inFile = new Map(fileMacros.map((m) => [slotKey(m.page, m.button), m]))
  const out: SlotDiff[] = []
  for (const set of setMacros) {
    const key = slotKey(set.page, set.button)
    const file = inFile.get(key) ?? null
    inFile.delete(key)
    const kind: SlotChange = file === null ? 'added' : sameBody(set, file) ? 'same' : 'changed'
    out.push({ page: set.page, button: set.button, kind, set, file })
  }
  for (const file of inFile.values()) out.push({ page: file.page, button: file.button, kind: 'removed', set: null, file })
  return out.sort(bySlot)
}

/** How many slots of a diff are of each kind. */
export function diffCounts(diff: readonly SlotDiff[]): Record<SlotChange, number> {
  const counts: Record<SlotChange, number> = { added: 0, changed: 0, removed: 0, same: 0 }
  for (const d of diff) counts[d.kind]++
  return counts
}
