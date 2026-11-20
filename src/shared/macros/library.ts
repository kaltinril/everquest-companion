// macros/library.ts — the app's macro library as a value: every change returns a new library and
// leaves the old one alone. Ids and the clock come in through a Mint, so the tests name them.

import { trimLines } from './socials'
import { cleanTags } from './tags'
import type { Macro, MacroBody, MacroLibrary, MacroSet, Mint } from './types'

export function emptyLibrary(): MacroLibrary {
  return { version: 1, macros: [], sets: [], chosen: {}, tags: [] }
}

let minted = 0

/** The running app's Mint: an id no other macro or set of this library has, and the wall clock. */
export const systemMint: Mint = {
  id: () => `${Date.now().toString(36)}-${(minted++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  now: () => Date.now()
}

/** Two macros the game could not tell apart: the same name, colour and lines. */
export function sameBody(a: MacroBody, b: MacroBody): boolean {
  if (a.name !== b.name || a.color !== b.color) return false
  const x = trimLines(a.lines)
  const y = trimLines(b.lines)
  return x.length === y.length && x.every((line, i) => line === y[i])
}

/** A new library macro from what the game stores, plus the app's own fields. */
export function newMacro(mint: Mint, body: Partial<MacroBody> = {}, tags: readonly string[] = []): Macro {
  return {
    id: mint.id(),
    name: body.name ?? '',
    color: body.color ?? 0,
    lines: trimLines(body.lines ?? []),
    tags: cleanTags(tags),
    note: '',
    updatedAt: mint.now()
  }
}

export function findMacro(library: MacroLibrary, id: string | null): Macro | null {
  return library.macros.find((m) => m.id === id) ?? null
}

/** A new macro goes on top of the list, where the player is looking. */
export function addMacro(library: MacroLibrary, macro: Macro): MacroLibrary {
  return { ...library, macros: [macro, ...library.macros] }
}

/** The first line that has text: what a list row shows under the name. '' when there is none. */
export function firstLine(macro: MacroBody): string {
  return macro.lines.find((line) => line !== '') ?? ''
}

/** Change a macro's fields. An unknown id changes nothing. */
export function updateMacro(library: MacroLibrary, id: string, patch: Partial<Omit<Macro, 'id'>>, now: number): MacroLibrary {
  if (findMacro(library, id) === null) return library
  const macros = library.macros.map((m) => {
    if (m.id !== id) return m
    const next = { ...m, ...patch, updatedAt: now }
    return { ...next, lines: trimLines(next.lines), tags: cleanTags(next.tags) }
  })
  return { ...library, macros }
}

/** A copy named "<name> copy", placed after the original. `macro` is null for an unknown id. */
export function duplicateMacro(library: MacroLibrary, id: string, mint: Mint): { library: MacroLibrary; macro: Macro | null } {
  const at = library.macros.findIndex((m) => m.id === id)
  if (at < 0) return { library, macro: null }
  const source = library.macros[at]
  const macro: Macro = { ...source, id: mint.id(), name: `${source.name} copy`, lines: [...source.lines], tags: [...source.tags], updatedAt: mint.now() }
  const macros = [...library.macros.slice(0, at + 1), macro, ...library.macros.slice(at + 1)]
  return { library: { ...library, macros }, macro }
}

/** What an Undo of a delete needs: the macro, where it sat, and the set slots that held it. */
export interface MacroRemoval {
  macro: Macro
  index: number
  slots: { setId: string; slot: string }[]
}

function withoutMacro(set: MacroSet, id: string): MacroSet {
  const slots: Record<string, string> = {}
  for (const [slot, macroId] of Object.entries(set.slots)) {
    if (macroId !== id) slots[slot] = macroId
  }
  return { ...set, slots }
}

/** Delete a macro and empty every set slot that held it. `undo` is null for an unknown id. */
export function removeMacro(library: MacroLibrary, id: string): { library: MacroLibrary; undo: MacroRemoval | null } {
  const index = library.macros.findIndex((m) => m.id === id)
  if (index < 0) return { library, undo: null }
  const slots: MacroRemoval['slots'] = []
  for (const set of library.sets) {
    for (const [slot, macroId] of Object.entries(set.slots)) {
      if (macroId === id) slots.push({ setId: set.id, slot })
    }
  }
  const next: MacroLibrary = {
    ...library,
    macros: library.macros.filter((m) => m.id !== id),
    sets: library.sets.map((s) => withoutMacro(s, id))
  }
  return { library: next, undo: { macro: library.macros[index], index, slots } }
}

/** Put a deleted macro back where it was. A slot filled since the delete keeps its new macro. */
export function restoreMacro(library: MacroLibrary, undo: MacroRemoval): MacroLibrary {
  if (findMacro(library, undo.macro.id) !== null) return library
  const at = Math.min(undo.index, library.macros.length)
  const macros = [...library.macros.slice(0, at), undo.macro, ...library.macros.slice(at)]
  const sets = library.sets.map((set) => {
    const slots = { ...set.slots }
    for (const s of undo.slots) {
      if (s.setId === set.id && !(s.slot in slots)) slots[s.slot] = undo.macro.id
    }
    return { ...set, slots }
  })
  return { ...library, macros, sets }
}

export interface ImportResult {
  library: MacroLibrary
  added: number
  skipped: number
  /** The library macro each incoming one became or matched, in the incoming order. */
  ids: string[]
}

/**
 * Add macros read from the game (a character file, or pasted text). One identical to a library
 * macro, or to an earlier one of the same batch, is skipped. `tags` go on the added ones only.
 */
export function importGameMacros(
  library: MacroLibrary,
  gameMacros: readonly MacroBody[],
  tags: readonly string[] = [],
  mint: Mint = systemMint
): ImportResult {
  const macros = [...library.macros]
  const ids: string[] = []
  let added = 0
  for (const incoming of gameMacros) {
    const match = macros.find((m) => sameBody(m, incoming))
    if (match) {
      ids.push(match.id)
      continue
    }
    const macro = newMacro(mint, incoming, tags)
    macros.push(macro)
    ids.push(macro.id)
    added++
  }
  return { library: { ...library, macros }, added, skipped: gameMacros.length - added, ids }
}
