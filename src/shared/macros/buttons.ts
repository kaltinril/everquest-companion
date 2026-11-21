// macros/buttons.ts — one layout's buttons as the Characters grid draws and changes them: each
// button with its mark against the game's file, what a send would change, moving and swapping,
// and where else a macro sits. Pure and immutable, like library.ts.

import { BUTTONS_PER_PAGE, FIRST_EDITABLE_PAGE, PAGES } from './limits'
import { addMacro, findMacro, newMacro, systemMint } from './library'
import { isCharacterLayout } from './layouts'
import { assignSlot, diffCounts, diffSetAgainstFile, findSet, setToGameMacros, type SlotChange, type SlotDiff } from './sets'
import { bySlot, parseSlotKey, slotKey } from './socials'
import type { GameMacro, Macro, MacroLibrary, MacroSet, Mint } from './types'

/** How a button differs from the game's file. */
export type ButtonMark = 'new' | 'changed' | 'removed'

const MARKS: Record<SlotChange, ButtonMark | null> = { added: 'new', changed: 'changed', removed: 'removed', same: null }

/** What sending a layout to a character file would do. */
export interface GameChanges {
  /** The layout as the game would hold it: what a send writes. */
  macros: GameMacro[]
  /** The slots that differ from the file, sorted by slot. */
  changed: SlotDiff[]
  counts: Record<SlotChange, number>
  /** Added, changed and removed together: 0 when the layout matches the game. */
  total: number
}

export function gameChanges(library: MacroLibrary, set: MacroSet, fileMacros: readonly GameMacro[]): GameChanges {
  const macros = setToGameMacros(library, set)
  const diff = diffSetAgainstFile(macros, fileMacros)
  const counts = diffCounts(diff)
  return { macros, changed: diff.filter((d) => d.kind !== 'same'), counts, total: counts.added + counts.changed + counts.removed }
}

/** The bottom bar's count: "3 changes not in the game yet". */
export function changesText(total: number): string {
  return total === 1 ? '1 change not in the game yet' : `${String(total)} changes not in the game yet`
}

/** One button of a page as the grid draws it. */
export interface GridButton {
  button: number
  slot: string
  macro: Macro | null
  mark: ButtonMark | null
  /** What the game's file holds on the slot; null when it holds nothing. */
  game: GameMacro | null
}

/** One page: its twelve buttons (more when the layout or the file holds a higher one), each with its mark. */
export function gridPage(library: MacroLibrary, set: MacroSet, page: number, fileMacros: readonly GameMacro[]): GridButton[] {
  const diff = diffSetAgainstFile(setToGameMacros(library, set), fileMacros).filter((d) => d.page === page)
  const bySlotKey = new Map(diff.map((d) => [slotKey(d.page, d.button), d]))
  const count = diff.reduce((max, d) => Math.max(max, d.button), BUTTONS_PER_PAGE)
  return Array.from({ length: count }, (_, i) => {
    const slot = slotKey(page, i + 1)
    const d = bySlotKey.get(slot) ?? null
    const macroId = slot in set.slots ? set.slots[slot] : null
    return { button: i + 1, slot, macro: findMacro(library, macroId), mark: d === null ? null : MARKS[d.kind], game: d?.file ?? null }
  })
}

/** A page of the page row, with how many of its buttons are filled. */
export interface PageTab {
  page: number
  filled: number
}

/** Pages 2 to 10, and any higher page the layout or the game's file holds a macro on. */
export function pageTabs(library: MacroLibrary, set: MacroSet, fileMacros: readonly GameMacro[]): PageTab[] {
  const held = setToGameMacros(library, set)
  const last = [...held, ...fileMacros].reduce((max, m) => Math.max(max, m.page), PAGES)
  return Array.from({ length: last - FIRST_EDITABLE_PAGE + 1 }, (_, i) => {
    const page = FIRST_EDITABLE_PAGE + i
    return { page, filled: held.filter((m) => m.page === page).length }
  })
}

/** Move a button's macro onto another button; when that one is filled the two swap. */
export function moveSlot(library: MacroLibrary, setId: string, from: string, to: string): MacroLibrary {
  const set = findSet(library, setId)
  if (set === null || from === to || !(from in set.slots)) return library
  const moved = set.slots[from]
  const displaced = to in set.slots ? set.slots[to] : null
  return assignSlot(assignSlot(library, setId, from, displaced), setId, to, moved)
}

/** A new library macro put straight on a button. `macro` is null for an unknown layout. */
export function placeNewMacro(library: MacroLibrary, setId: string, slot: string, mint: Mint = systemMint): { library: MacroLibrary; macro: Macro | null } {
  if (findSet(library, setId) === null) return { library, macro: null }
  const macro = newMacro(mint, { name: 'New macro' })
  return { library: assignSlot(addMacro(library, macro), setId, slot, macro.id), macro }
}

/**
 * "Change only here": the button gets a copy of its macro (same name, listed after the original),
 * so an edit no longer reaches the other places the macro sits. `macro` is null for an empty slot.
 */
export function ownCopyAt(library: MacroLibrary, setId: string, slot: string, mint: Mint = systemMint): { library: MacroLibrary; macro: Macro | null } {
  const set = findSet(library, setId)
  const at = set === null || !(slot in set.slots) ? -1 : library.macros.findIndex((m) => m.id === set.slots[slot])
  if (at < 0) return { library, macro: null }
  const source = library.macros[at]
  const macro: Macro = { ...source, id: mint.id(), lines: [...source.lines], tags: [...source.tags], updatedAt: mint.now() }
  const macros = [...library.macros.slice(0, at + 1), macro, ...library.macros.slice(at + 1)]
  return { library: assignSlot({ ...library, macros }, setId, slot, macro.id), macro }
}

/** A layout that holds a macro, and the buttons it holds it on. */
export interface MacroPlace {
  setId: string
  /** A character's name for its own layout; "the layout Raid" for a saved one. */
  name: string
  slots: { page: number; button: number }[]
}

function placeName(library: MacroLibrary, set: MacroSet): string {
  if (isCharacterLayout(library, set.id)) return set.name
  return set.name === '' ? 'an unnamed layout' : `the layout ${set.name}`
}

/** Every layout a macro sits in, in the library's order, each with its buttons sorted by slot. */
export function macroPlaces(library: MacroLibrary, macroId: string): MacroPlace[] {
  const out: MacroPlace[] = []
  for (const set of library.sets) {
    const slots: MacroPlace['slots'] = []
    for (const [key, id] of Object.entries(set.slots)) {
      const slot = parseSlotKey(key)
      if (id === macroId && slot !== null) slots.push(slot)
    }
    if (slots.length > 0) out.push({ setId: set.id, name: placeName(library, set), slots: slots.sort(bySlot) })
  }
  return out
}

/** The Library editor's line: which characters and layouts carry the macro. */
export function usedOnText(library: MacroLibrary, macroId: string): string {
  const places = macroPlaces(library, macroId)
  return places.length === 0 ? 'Not on any button yet.' : `Used on: ${places.map((p) => p.name).join(', ')}.`
}

/**
 * Where a button's macro also sits, besides that button: other buttons of the same layout
 * ("page 3 button 1"), then other characters and saved layouts by name. Empty: only here.
 */
export function alsoOn(library: MacroLibrary, macroId: string, setId: string, slot: string): string[] {
  const here: string[] = []
  const elsewhere: string[] = []
  for (const place of macroPlaces(library, macroId)) {
    if (place.setId !== setId) {
      elsewhere.push(place.name)
      continue
    }
    for (const s of place.slots) {
      if (slotKey(s.page, s.button) !== slot) here.push(`page ${String(s.page)} button ${String(s.button)}`)
    }
  }
  return [...here, ...elsewhere]
}
