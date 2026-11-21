// macros/where.ts — which characters, loadouts and saved layouts hold each macro: the short text
// on a list row, the words search finds it by, and the picker's "From" choices. Pure.

import { groupCharacters, loadoutLabel, loadoutText } from './characters'
import { isCharacterLayout } from './layouts'
import { characterFileKey } from './socials'
import { filterMacros } from './tags'
import type { CharacterFile, Macro, MacroLibrary, MacroSet } from './types'

export interface MacroHolder {
  /** "Drywrought", "Drywrought L2" when it has several loadouts, "layout Raid" for a saved one. */
  short: string
  /** Everything search finds the macro by for this holder. */
  words: string
  /** The "From" values this holder answers to. */
  scopes: string[]
}

export type HolderIndex = ReadonlyMap<string, MacroHolder[]>

function holderByFile(library: MacroLibrary, files: readonly CharacterFile[]): Map<string, MacroHolder> {
  const out = new Map<string, MacroHolder>()
  for (const group of groupCharacters(files)) {
    const several = group.loadouts.length > 1
    for (const file of group.loadouts) {
      const fileKey = characterFileKey(file)
      const setId = fileKey in library.chosen ? library.chosen[fileKey] : null
      if (setId === null) continue
      const short = several ? `${file.character} L${String(file.loadout)}` : file.character
      const words = `${file.character} ${file.server} ${loadoutText(file, loadoutLabel(library, file))} ${short}`
      out.set(setId, { short, words, scopes: [`char:${group.key}`, `file:${fileKey}`] })
    }
  }
  return out
}

function holderOfSet(library: MacroLibrary, set: MacroSet, known: ReadonlyMap<string, MacroHolder>): MacroHolder {
  const holder = known.get(set.id)
  if (holder !== undefined) return holder
  // A character's layout whose file is not in this read keeps the name it was last given.
  const short = isCharacterLayout(library, set.id) ? set.name : `layout ${set.name === '' ? 'unnamed' : set.name}`
  return { short, words: short, scopes: [] }
}

/** Macro id to the places holding it, characters first in the library's order of layouts. */
export function macroHolders(library: MacroLibrary, files: readonly CharacterFile[]): HolderIndex {
  const known = holderByFile(library, files)
  const out = new Map<string, MacroHolder[]>()
  for (const set of library.sets) {
    const holder = holderOfSet(library, set, known)
    for (const id of new Set(Object.values(set.slots))) out.set(id, [...(out.get(id) ?? []), holder])
  }
  return out
}

/** A row's line: "Drywrought, Kaltinril +2", or "not on a button". */
export function holdersText(index: HolderIndex, macroId: string): string {
  const holders = index.get(macroId) ?? []
  if (holders.length === 0) return 'not on a button'
  const shown = holders
    .slice(0, 2)
    .map((h) => h.short)
    .join(', ')
  return holders.length > 2 ? `${shown} +${String(holders.length - 2)}` : shown
}

export interface FromChoice {
  value: string
  label: string
}

/** The picker's "From" list: each character, and each loadout of one that has several. */
export function fromChoices(library: MacroLibrary, files: readonly CharacterFile[]): FromChoice[] {
  const groups = groupCharacters(files)
  const out: FromChoice[] = []
  for (const group of groups) {
    const twins = groups.filter((g) => g.character.toLowerCase() === group.character.toLowerCase()).length > 1
    const name = twins ? `${group.character} (${group.server})` : group.character
    if (group.loadouts.length === 1) {
      out.push({ value: `file:${characterFileKey(group.loadouts[0])}`, label: name })
      continue
    }
    out.push({ value: `char:${group.key}`, label: `${name}, all loadouts` })
    for (const file of group.loadouts) {
      out.push({ value: `file:${characterFileKey(file)}`, label: `${name}, ${loadoutText(file, loadoutLabel(library, file))}` })
    }
  }
  return out
}

export interface PickAsk {
  query: string
  tags: readonly string[]
  /** A `fromChoices` value; '' is every macro. */
  from: string
  holders: HolderIndex
}

/** The list a picker or the Library shows: the search also finds where a macro sits. */
export function pickList(macros: readonly Macro[], ask: PickAsk): Macro[] {
  const { query, tags, from, holders } = ask
  const found = filterMacros(macros, query, tags, (m) => (holders.get(m.id) ?? []).map((h) => h.words).join('\n'))
  if (from === '') return found
  return found.filter((m) => (holders.get(m.id) ?? []).some((h) => h.scopes.includes(from)))
}
