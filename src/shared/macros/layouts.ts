// macros/layouts.ts — whose a layout is, and the whole-layout moves of the Characters section.
// A character file's own layout is the set `chosen[fileKey]` names: made from the game's file the
// first time the tab sees the character, and never shared. Every other set is a saved layout.
// Pure and immutable, like library.ts.

import { FIRST_EDITABLE_PAGE } from './limits'
import { importGameMacros, systemMint } from './library'
import { addSet, chooseSet, chosenSet, filledCount, findSet, renameSet, setFromGameMacros } from './sets'
import { characterFileKey, slotKey } from './socials'
import type { CharacterFile, CharacterFileMacros, GameMacro, MacroLibrary, MacroSet, Mint } from './types'

/** The one rule for "this layout is a character's own": some character file has it as its layout. */
export function isCharacterLayout(library: Pick<MacroLibrary, 'chosen'>, setId: string): boolean {
  return Object.values(library.chosen).includes(setId)
}

/** The layouts the player saved by name: every set that is not a character's own. */
export function savedLayouts(library: MacroLibrary): MacroSet[] {
  return library.sets.filter((set) => !isCharacterLayout(library, set.id))
}

/** What a character file is called: its name, with server and loadout when two files share the name. */
export function characterLabel(file: CharacterFile, files: readonly CharacterFile[]): string {
  const name = file.character.toLowerCase()
  const twins = files.filter((f) => f.character.toLowerCase() === name)
  return twins.length > 1 ? `${file.character} (${file.server}, loadout ${String(file.loadout)})` : file.character
}

/** The macros a layout can hold: page 1 is the game's own and a send leaves it as it is. */
function editable(macros: readonly GameMacro[]): GameMacro[] {
  return macros.filter((m) => m.page >= FIRST_EDITABLE_PAGE)
}

/** What `ensureCharacterLayouts` took from the game: library macros added, and from which characters. */
export interface BroughtIn {
  macros: number
  characters: string[]
}

/** A layout two files name (data the old Sets screen could save) stays the first one's; the rest get a copy. */
function splitShared(library: MacroLibrary, mint: Mint): MacroLibrary {
  const owned = new Set<string>()
  let next = library
  for (const [fileKey, setId] of Object.entries(library.chosen)) {
    const set = findSet(next, setId)
    if (set === null) continue
    if (!owned.has(setId)) {
      owned.add(setId)
      continue
    }
    const copy: MacroSet = { id: mint.id(), name: set.name, slots: { ...set.slots } }
    next = chooseSet(addSet(next, copy), fileKey, copy.id)
  }
  return next
}

/**
 * Every character file the game folder holds gets a layout of its own. A file with none yet: its
 * macros are imported (an identical one only once) and laid out as the file has them. That is the
 * only time a file is imported, so a macro the player deletes later does not come back, and a
 * second call with the same input returns the same library. An own layout is named after its
 * character.
 */
export function ensureCharacterLayouts(
  library: MacroLibrary,
  files: readonly CharacterFileMacros[],
  mint: Mint = systemMint
): { library: MacroLibrary; report: BroughtIn } {
  const report: BroughtIn = { macros: 0, characters: [] }
  let next = splitShared(library, mint)
  for (const file of files) {
    const fileKey = characterFileKey(file)
    const label = characterLabel(file, files)
    const own = chosenSet(next, fileKey)
    if (own !== null) {
      if (own.name !== label) next = renameSet(next, own.id, label)
      continue
    }
    const macros = editable(file.macros)
    const made = setFromGameMacros(next, label, macros, mint)
    next = chooseSet(made.library, fileKey, made.set.id)
    report.macros += made.added
    if (macros.length > 0) report.characters.push(label)
  }
  return { library: next, report }
}

function plural(n: number, one: string): string {
  return n === 1 ? `1 ${one}` : `${String(n)} ${one}s`
}

/** The one line said when something was brought in; null when nothing was. */
export function broughtInText(report: BroughtIn): string | null {
  if (report.characters.length === 0) return null
  const from = report.characters.length === 1 ? report.characters[0] : plural(report.characters.length, 'character')
  return report.macros === 0 ? `Brought in the buttons of ${from}.` : `Brought in ${plural(report.macros, 'macro')} from ${from}.`
}

function sameSlots(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && a[key] === b[key])
}

/** A set's buttons replaced whole. The same buttons change nothing (no empty Undo step). */
function withSlots(library: MacroLibrary, setId: string, slots: Record<string, string>): MacroLibrary {
  const set = findSet(library, setId)
  if (set === null || sameSlots(set.slots, slots)) return library
  return { ...library, sets: library.sets.map((s) => (s.id === setId ? { ...s, slots } : s)) }
}

/** A character's buttons replaced by a copy of another layout's (a saved one, or another character's). */
export function copyButtons(library: MacroLibrary, fileKey: string, fromSetId: string): MacroLibrary {
  const own = chosenSet(library, fileKey)
  const from = findSet(library, fromSetId)
  if (own === null || from === null || own.id === from.id) return library
  return withSlots(library, own.id, { ...from.slots })
}

/** A character's buttons replaced by what its game file holds; a macro the library lacks is imported. */
export function resetToGame(library: MacroLibrary, fileKey: string, gameMacros: readonly GameMacro[], mint: Mint = systemMint): MacroLibrary {
  const own = chosenSet(library, fileKey)
  if (own === null) return library
  const macros = editable(gameMacros)
  const imported = importGameMacros(library, macros, [], mint)
  const slots: Record<string, string> = {}
  macros.forEach((m, i) => {
    slots[slotKey(m.page, m.button)] = imported.ids[i]
  })
  return withSlots(imported.added === 0 ? library : imported.library, own.id, slots)
}

/** The saved layout a name already belongs to (case folded, outer spaces cut), or null. */
export function savedLayoutNamed(library: MacroLibrary, name: string): MacroSet | null {
  const wanted = name.trim().toLowerCase()
  return savedLayouts(library).find((set) => set.name.trim().toLowerCase() === wanted) ?? null
}

/**
 * A character's buttons kept as a saved layout. A name a saved layout already has replaces that
 * layout's buttons. `set` is null when the character has no layout or the name is blank.
 */
export function saveLayout(library: MacroLibrary, fileKey: string, name: string, mint: Mint = systemMint): { library: MacroLibrary; set: MacroSet | null } {
  const own = chosenSet(library, fileKey)
  const clean = name.trim()
  if (own === null || clean === '') return { library, set: null }
  const existing = savedLayoutNamed(library, clean)
  if (existing !== null) return { library: withSlots(library, existing.id, { ...own.slots }), set: existing }
  const set: MacroSet = { id: mint.id(), name: clean, slots: { ...own.slots } }
  return { library: addSet(library, set), set }
}

/** A layout as a dialog lists it: whose it is, and how many buttons it fills. */
export interface LayoutChoice {
  id: string
  name: string
  filled: number
}

function asChoice(library: MacroLibrary, set: MacroSet, name: string): LayoutChoice {
  return { id: set.id, name, filled: filledCount(library, set) }
}

export function savedLayoutChoices(library: MacroLibrary): LayoutChoice[] {
  return savedLayouts(library).map((set) => asChoice(library, set, set.name === '' ? 'Unnamed layout' : set.name))
}

/** The other character files of the game folder, each with its own layout. */
export function otherCharacterChoices(library: MacroLibrary, files: readonly CharacterFile[], fileKey: string): LayoutChoice[] {
  const out: LayoutChoice[] = []
  for (const file of files) {
    const key = characterFileKey(file)
    const set = chosenSet(library, key)
    if (key !== fileKey && set !== null) out.push(asChoice(library, set, characterLabel(file, files)))
  }
  return out
}
