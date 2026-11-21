// macros/groups.ts — a chosen group of buttons moved between loadouts, and a tag's macros swapped
// on and off a character (fork #11). A group lands on the target's first empty buttons from page 2
// on, in its order, and never replaces anything. Pure and immutable, like library.ts.

import { type CharacterGroup, groupCharacters, loadoutLabel, loadoutText } from './characters'
import { BUTTONS_PER_PAGE, FIRST_EDITABLE_PAGE, PAGES } from './limits'
import { findMacro, updateMacro } from './library'
import { assignSlot, chosenSet, findSet, setToGameMacros } from './sets'
import { bySlot, characterFileKey, parseSlotKey, slotKey } from './socials'
import { addOwnTag, normalizeTag } from './tags'
import type { CharacterFile, Macro, MacroLibrary, MacroSet } from './types'

/** Every button the assumed limits give a character (limits.ts). */
export const TOTAL_BUTTONS = (PAGES - FIRST_EDITABLE_PAGE + 1) * BUTTONS_PER_PAGE

function heldSlots(library: MacroLibrary, set: MacroSet): Set<string> {
  return new Set(setToGameMacros(library, set).map((m) => slotKey(m.page, m.button)))
}

/** How many buttons from page 2 on hold a macro the library still has. */
export function usedButtons(library: MacroLibrary, set: MacroSet): number {
  return setToGameMacros(library, set).filter((m) => m.page >= FIRST_EDITABLE_PAGE).length
}

export function usedText(used: number): string {
  return `${String(used)} of ${String(TOTAL_BUTTONS)} buttons used`
}

/** The layout's empty buttons on the normal pages, first to last. */
export function emptyButtons(library: MacroLibrary, set: MacroSet): string[] {
  const held = heldSlots(library, set)
  const out: string[] = []
  for (let page = FIRST_EDITABLE_PAGE; page <= PAGES; page++) {
    for (let button = 1; button <= BUTTONS_PER_PAGE; button++) {
      const slot = slotKey(page, button)
      if (!held.has(slot)) out.push(slot)
    }
  }
  return out
}

/** The picked slots that still hold a macro, in button order. */
export function heldSelection(library: MacroLibrary, set: MacroSet, slots: readonly string[]): string[] {
  const held = heldSlots(library, set)
  const parsed: { key: string; page: number; button: number }[] = []
  for (const key of new Set(slots)) {
    const at = parseSlotKey(key)
    if (at !== null && held.has(key)) parsed.push({ key, ...at })
  }
  return parsed.sort(bySlot).map((p) => p.key)
}

/** The filled buttons of one page. */
export function filledOnPageSlots(library: MacroLibrary, set: MacroSet, page: number): string[] {
  return setToGameMacros(library, set)
    .filter((m) => m.page === page)
    .map((m) => slotKey(m.page, m.button))
}

/** One macro going onto one empty button. */
export interface Landing {
  slot: string
  macroId: string
}

/** What putting these macros on a layout would do. */
export interface PlacePlan {
  wanted: number
  /** How many empty buttons the layout has. */
  empty: number
  /** The macros that fit, on their buttons, in order. */
  landing: Landing[]
  /** How many do not fit. */
  left: number
}

/** The macros in order against the layout's empty buttons. Nothing is changed. */
export function planPlacement(library: MacroLibrary, target: MacroSet, macroIds: readonly string[]): PlacePlan {
  const free = emptyButtons(library, target)
  const landing = macroIds.slice(0, free.length).map((macroId, i) => ({ slot: free[i], macroId }))
  return { wanted: macroIds.length, empty: free.length, landing, left: macroIds.length - landing.length }
}

function applyLanding(library: MacroLibrary, setId: string, landing: readonly Landing[]): MacroLibrary {
  return landing.reduce((next, l) => assignSlot(next, setId, l.slot, l.macroId), library)
}

function macroIdsAt(set: MacroSet, slots: readonly string[]): string[] {
  return slots.map((slot) => set.slots[slot])
}

/** The plan for a group of this layout's buttons going to another layout. */
export function planGroup(library: MacroLibrary, from: MacroSet, slots: readonly string[], to: MacroSet): PlacePlan {
  return planPlacement(library, to, macroIdsAt(from, heldSelection(library, from, slots)))
}

export interface GroupAsk {
  fromSetId: string
  slots: readonly string[]
  toSetId: string
  /** A move also takes the macros that landed off the source. */
  move: boolean
}

/** Copy or move a group: those that fit land, and a move empties only the buttons that landed. */
export function placeGroup(library: MacroLibrary, ask: GroupAsk): MacroLibrary {
  const from = findSet(library, ask.fromSetId)
  const to = findSet(library, ask.toSetId)
  if (from === null || to === null || from.id === to.id) return library
  const slots = heldSelection(library, from, ask.slots)
  const plan = planPlacement(library, to, macroIdsAt(from, slots))
  if (plan.landing.length === 0) return library
  const placed = applyLanding(library, to.id, plan.landing)
  if (!ask.move) return placed
  return slots.slice(0, plan.landing.length).reduce((next, slot) => assignSlot(next, from.id, slot, null), placed)
}

function emptyCount(n: number): string {
  return n === 1 ? '1 empty button' : `${String(n)} empty buttons`
}

/** What the copy or move dialog says about a picked target. */
export function planText(plan: PlacePlan): string {
  const { wanted, empty, landing, left } = plan
  if (landing.length === 0) return 'No empty buttons on this loadout.'
  if (left > 0) return `Room for ${String(landing.length)} of ${String(wanted)}. ${left === 1 ? 'The other one stays where it is.' : `The other ${String(left)} stay where they are.`}`
  const macros = wanted === 1 ? '1 macro goes' : `${String(wanted)} macros go`
  return `${macros} on its ${emptyCount(empty)}. Nothing there is replaced.`
}

/** One loadout a group can go to. */
export interface GroupTarget {
  fileKey: string
  setId: string
  label: string
  used: number
  empty: number
}

export interface TargetGroup {
  key: string
  character: string
  server: string
  targets: GroupTarget[]
}

function targetOf(library: MacroLibrary, file: CharacterFile): GroupTarget | null {
  const fileKey = characterFileKey(file)
  const set = chosenSet(library, fileKey)
  if (set === null) return null
  return { fileKey, setId: set.id, label: loadoutText(file, loadoutLabel(library, file)), used: usedButtons(library, set), empty: emptyButtons(library, set).length }
}

function targetsOf(library: MacroLibrary, group: CharacterGroup, fileKey: string): GroupTarget[] {
  const out: GroupTarget[] = []
  for (const file of group.loadouts) {
    const target = characterFileKey(file) === fileKey ? null : targetOf(library, file)
    if (target !== null) out.push(target)
  }
  return out
}

/** Every other character and loadout a group can go to, grouped by character. */
export function groupTargets(library: MacroLibrary, files: readonly CharacterFile[], fileKey: string): TargetGroup[] {
  const out: TargetGroup[] = []
  for (const group of groupCharacters(files)) {
    const targets = targetsOf(library, group, fileKey)
    if (targets.length > 0) out.push({ key: group.key, character: group.character, server: group.server, targets })
  }
  return out
}

/** The macros on these buttons, each once, in button order. */
export function macroIdsOnSlots(library: MacroLibrary, set: MacroSet, slots: readonly string[]): string[] {
  return [...new Set(macroIdsAt(set, heldSelection(library, set, slots)))]
}

export interface TagAsk {
  macroIds: readonly string[]
  tag: string
  /** True adds the tag, false takes it off. */
  on: boolean
}

function withTag(macro: Macro, tag: string, on: boolean): string[] | null {
  const has = macro.tags.includes(tag)
  if (has === on) return null
  return on ? [...macro.tags, tag] : macro.tags.filter((t) => t !== tag)
}

/** A tag added to or taken off many macros at once. No macro changing returns the same library. */
export function tagMacros(library: MacroLibrary, ask: TagAsk, now: number): MacroLibrary {
  const tag = normalizeTag(ask.tag)
  if (tag === '') return library
  let next = library
  for (const id of ask.macroIds) {
    const macro = findMacro(next, id)
    const tags = macro === null ? null : withTag(macro, tag, ask.on)
    if (tags !== null) next = updateMacro(next, id, { tags }, now)
  }
  if (next === library) return library
  return ask.on ? addOwnTag(next, tag) : next
}

/** How many of these macros carry the tag. */
export function countWithTag(library: MacroLibrary, macroIds: readonly string[], rawTag: string): number {
  const tag = normalizeTag(rawTag)
  return macroIds.filter((id) => findMacro(library, id)?.tags.includes(tag) === true).length
}

/** A tag's macros, by name with numbers in order, so "Way 2" comes before "Way 10". */
function macrosOfTag(library: MacroLibrary, tag: string): Macro[] {
  return library.macros.filter((m) => m.tags.includes(tag)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

export interface TagGroupStatus {
  /** How many library macros carry the tag. */
  total: number
  /** How many of them are on this character. */
  onCharacter: number
  plan: PlacePlan
}

/** A tag against a character: what is on it, and what putting the rest on would do. */
export function tagGroupStatus(library: MacroLibrary, set: MacroSet, rawTag: string): TagGroupStatus {
  const tagged = macrosOfTag(library, normalizeTag(rawTag))
  const here = new Set(Object.values(set.slots))
  const missing = tagged.filter((m) => !here.has(m.id)).map((m) => m.id)
  return { total: tagged.length, onCharacter: tagged.length - missing.length, plan: planPlacement(library, set, missing) }
}

/** The tag's macros not yet on this character, on its first empty buttons; those that fit. */
export function putTagOn(library: MacroLibrary, setId: string, rawTag: string): MacroLibrary {
  const set = findSet(library, setId)
  if (set === null) return library
  return applyLanding(library, setId, tagGroupStatus(library, set, rawTag).plan.landing)
}

/** Every button holding one of the tag's macros emptied; the macros stay in the library. */
export function takeTagOff(library: MacroLibrary, setId: string, rawTag: string): MacroLibrary {
  const set = findSet(library, setId)
  if (set === null) return library
  const tagged = new Set(macrosOfTag(library, normalizeTag(rawTag)).map((m) => m.id))
  const slots = Object.entries(set.slots).filter(([, id]) => tagged.has(id))
  return slots.reduce((next, [slot]) => assignSlot(next, setId, slot, null), library)
}

/** What the Tag groups dialog says about a tag. */
export function tagStatusText(status: TagGroupStatus): string {
  const { total, onCharacter, plan } = status
  const head = `${String(total)} ${total === 1 ? 'macro has' : 'macros have'} this tag, ${String(onCharacter)} on this character.`
  if (plan.wanted === 0) return head
  if (plan.left > 0) return `${head} Room for ${String(plan.landing.length)} of the other ${String(plan.wanted)}.`
  return `${head} ${plan.wanted === 1 ? 'The other one fits' : `The other ${String(plan.wanted)} fit`} on its ${emptyCount(plan.empty)}.`
}
