// macros/gameMerge.ts — a read of the game's files merged into the character layouts, three ways:
// what the game held at the last read (`seen`), what it holds now, and what the layout holds. A
// macro made, edited or removed in game reaches the layout; a change the player made in the app is
// never overwritten. Pure and immutable, like library.ts.

import type { History } from './history'
import { type BroughtIn, broughtInText, characterLabel, ensureCharacterLayouts } from './layouts'
import { FIRST_EDITABLE_PAGE } from './limits'
import { findMacro, newMacro, sameBody, systemMint } from './library'
import { assignSlot, chosenSet, findSet, setToGameMacros } from './sets'
import { bySlot, characterFileKey, slotKey } from './socials'
import type { CharacterFileMacros, GameMacro, Macro, MacroLibrary, Mint } from './types'

type Body = GameMacro | null

/** What a read does to one slot: nothing, the game's version taken, or changed on both sides. */
export type SlotMove = 'keep' | 'take' | 'clash'

function same(a: Body, b: Body): boolean {
  return a === null || b === null ? a === b : sameBody(a, b)
}

/** One slot's three-way decision. `seen` undefined: the file has no earlier read to compare with. */
export function slotMove(seen: Body | undefined, game: Body, layout: Body): SlotMove {
  if (same(layout, game)) return 'keep'
  if (seen === undefined) {
    if (layout === null) return 'take'
    return game === null ? 'keep' : 'clash'
  }
  if (same(game, seen)) return 'keep'
  return same(layout, seen) ? 'take' : 'clash'
}

/** A slot that took the game's version: what it held, and the macro it holds now (null: emptied). */
interface SlotTake {
  setId: string
  slot: string
  before: Body
  macroId: string | null
}

/** What one merge did, for the line said to the player. */
export interface MergeReport {
  brought: BroughtIn
  added: number
  edited: number
  removed: number
  /** Slots newly changed on both sides. */
  clashes: number
  /** The characters that took something from the game. */
  characters: string[]
}

export interface GameMerge {
  /** The same object as the input when the read changes nothing. */
  library: MacroLibrary
  report: MergeReport
  taken: SlotTake[]
  /** Every macro a taken slot now holds, for the Undo history's older documents. */
  macros: Macro[]
}

type Work = GameMerge

/** The game's macros a layout can hold, cut to what is compared and sorted by slot. */
function heldByGame(macros: readonly GameMacro[]): GameMacro[] {
  return macros
    .filter((m) => m.page >= FIRST_EDITABLE_PAGE)
    .map(({ page, button, name, color, lines }) => ({ page, button, name, color, lines: [...lines] }))
    .sort(bySlot)
}

function keyed(macros: readonly GameMacro[]): Map<string, GameMacro> {
  return new Map(macros.map((m) => [slotKey(m.page, m.button), m]))
}

function sameList(a: readonly GameMacro[], b: readonly GameMacro[]): boolean {
  return a.length === b.length && a.every((m, i) => m.page === b[i].page && m.button === b[i].button && sameBody(m, b[i]))
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i])
}

/** Every slot any of the lists holds, in slot order. */
function allSlots(lists: readonly (readonly GameMacro[])[]): string[] {
  const all = new Map<string, GameMacro>()
  for (const list of lists) {
    for (const m of list) all.set(slotKey(m.page, m.button), m)
  }
  return [...all.entries()].sort(([, a], [, b]) => bySlot(a, b)).map(([key]) => key)
}

/** The library macro for what the game holds: an identical one, else a new one keeping the old tags and note. */
function macroForGame(library: MacroLibrary, game: GameMacro, previous: Macro | null, mint: Mint): { library: MacroLibrary; macro: Macro } {
  const match = library.macros.find((m) => sameBody(m, game))
  if (match !== undefined) return { library, macro: match }
  const macro: Macro = { ...newMacro(mint, game, previous?.tags ?? []), note: previous?.note ?? '' }
  return { library: { ...library, macros: [...library.macros, macro] }, macro }
}

interface TakeAt {
  setId: string
  slot: string
  game: Body
  layout: Body
}

function takeSlot(work: Work, at: TakeAt, mint: Mint): void {
  const { setId, slot, game, layout } = at
  let macroId: string | null = null
  if (game !== null) {
    const set = findSet(work.library, setId)
    const previous = set !== null && slot in set.slots ? findMacro(work.library, set.slots[slot]) : null
    const made = macroForGame(work.library, game, previous, mint)
    work.library = made.library
    work.macros.push(made.macro)
    macroId = made.macro.id
  }
  work.library = assignSlot(work.library, setId, slot, macroId)
  work.taken.push({ setId, slot, before: layout, macroId })
  if (game === null) work.report.removed++
  else if (layout === null) work.report.added++
  else work.report.edited++
}

/** The library with one file's last read and its clashes remembered. */
function remember(library: MacroLibrary, fileKey: string, game: GameMacro[], clashes: string[]): MacroLibrary {
  const seen = { ...(library.seen ?? {}), [fileKey]: game }
  const conflicts = { ...(library.conflicts ?? {}) }
  if (clashes.length > 0) conflicts[fileKey] = clashes
  else Reflect.deleteProperty(conflicts, fileKey)
  const next: MacroLibrary = { ...library, seen, conflicts }
  if (Object.keys(conflicts).length === 0) Reflect.deleteProperty(next, 'conflicts')
  return next
}

/** The slots of a character file changed both in the game and in the app. */
export function gameConflicts(library: Pick<MacroLibrary, 'conflicts'>, fileKey: string): string[] {
  return library.conflicts?.[fileKey] ?? []
}

/** One file's read beside its layout. */
interface FileRead {
  fileKey: string
  setId: string
  prior: GameMacro[] | undefined
  game: GameMacro[]
  held: GameMacro[]
  priorClashes: string[]
}

/** What there is to merge for a file; null when the game is as last read and nothing is marked. */
function fileRead(library: MacroLibrary, file: CharacterFileMacros): FileRead | null {
  const fileKey = characterFileKey(file)
  const game = heldByGame(file.macros)
  const prior = library.seen?.[fileKey]
  const priorClashes = gameConflicts(library, fileKey)
  if (prior !== undefined && priorClashes.length === 0 && sameList(prior, game)) return null
  const set = chosenSet(library, fileKey)
  return set === null ? null : { fileKey, setId: set.id, prior, game, held: setToGameMacros(library, set), priorClashes }
}

/** Every slot of a file decided and the takes applied. Returns the slots that are marked now. */
function mergeSlots(work: Work, read: FileRead, mint: Mint): string[] {
  const { setId, prior, game, held, priorClashes } = read
  const seenAt = prior === undefined ? null : keyed(prior)
  const gameAt = keyed(game)
  const layoutAt = keyed(held)
  const clashes: string[] = []
  for (const slot of allSlots([prior ?? [], game, held])) {
    const now = gameAt.get(slot) ?? null
    const layout = layoutAt.get(slot) ?? null
    const seen = seenAt === null ? undefined : (seenAt.get(slot) ?? null)
    const move = slotMove(seen, now, layout)
    if (move === 'take') takeSlot(work, { setId, slot, game: now, layout }, mint)
    else if (move === 'clash' || (priorClashes.includes(slot) && !same(layout, now))) clashes.push(slot)
  }
  return clashes
}

/** One character file merged and its read remembered. Nothing is written when nothing moved. */
function mergeFile(work: Work, file: CharacterFileMacros, label: string, mint: Mint): void {
  const read = fileRead(work.library, file)
  if (read === null) return
  const takenBefore = work.taken.length
  const clashes = mergeSlots(work, read, mint)
  work.report.clashes += clashes.filter((slot) => !read.priorClashes.includes(slot)).length
  if (work.taken.length > takenBefore) work.report.characters.push(label)
  const unchanged = read.prior !== undefined && sameList(read.prior, read.game) && sameStrings(read.priorClashes, clashes)
  if (!unchanged) work.library = remember(work.library, read.fileKey, read.game, clashes)
}

/**
 * A read of the game's files merged into the library. Every file gets its layout (layouts.ts), then
 * each slot follows `slotMove`, and `seen` becomes what the game holds now. A file missing from the
 * read (locked, or the read failed) is left alone. A second call with the same read changes nothing.
 */
export function mergeGameFiles(library: MacroLibrary, files: readonly CharacterFileMacros[], mint: Mint = systemMint): GameMerge {
  const ensured = ensureCharacterLayouts(library, files, mint)
  const report: MergeReport = { brought: ensured.report, added: 0, edited: 0, removed: 0, clashes: 0, characters: [] }
  const work: Work = { library: ensured.library, report, taken: [], macros: [] }
  for (const file of files) mergeFile(work, file, characterLabel(file, files), mint)
  return work
}

/** An older or newer document of the Undo history, given the same read. */
function rebase(doc: MacroLibrary, merge: GameMerge): MacroLibrary {
  const known = new Set(doc.macros.map((m) => m.id))
  const missing = [...new Map(merge.macros.map((m) => [m.id, m])).values()].filter((m) => !known.has(m.id))
  let next: MacroLibrary = missing.length === 0 ? doc : { ...doc, macros: [...doc.macros, ...missing] }
  for (const take of merge.taken) {
    const set = findSet(next, take.setId)
    if (set === null) continue
    const at = keyed(setToGameMacros(next, set)).get(take.slot) ?? null
    if (same(at, take.before)) next = assignSlot(next, take.setId, take.slot, take.macroId)
  }
  const out: MacroLibrary = { ...next, seen: merge.library.seen }
  if (merge.library.conflicts === undefined) Reflect.deleteProperty(out, 'conflicts')
  else out.conflicts = merge.library.conflicts
  return out
}

/**
 * A read taken into the Undo history without making a step. The macros the game brought go into
 * every kept document, so an Undo cannot turn them into a removal, and every document shares the
 * new `seen`, so an Undo after a send stays a change to send instead of being merged away.
 */
export function absorbGameRead(history: History<MacroLibrary>, files: readonly CharacterFileMacros[], mint: Mint = systemMint): History<MacroLibrary> {
  const merge = mergeGameFiles(history.present, files, mint)
  if (merge.library === history.present) return history
  return {
    ...history,
    past: history.past.map((doc) => rebase(doc, merge)),
    present: merge.library,
    future: history.future.map((doc) => rebase(doc, merge))
  }
}

function takenText(report: MergeReport): string | null {
  const { added, edited, removed, characters } = report
  if (added + edited + removed === 0) return null
  const who = characters.length === 1 ? characters[0] : `${String(characters.length)} characters`
  const fresh = added === 1 ? '1 new macro' : `${String(added)} new macros`
  if (edited + removed === 0) return `Brought in ${fresh} from the game for ${who}.`
  const parts = [...(added > 0 ? [fresh] : []), ...(edited > 0 ? [`${String(edited)} edited`] : []), ...(removed > 0 ? [`${String(removed)} removed`] : [])]
  return `From the game for ${who}: ${parts.join(', ')}.`
}

/** The one line said after a merge; null when it brought nothing the player should hear about. */
export function mergeText(report: MergeReport): string | null {
  const clash = report.clashes === 1 ? '1 button changed in game too. Check it before you send.' : `${String(report.clashes)} buttons changed in game too. Check them before you send.`
  const parts = [broughtInText(report.brought), takenText(report), report.clashes > 0 ? clash : null]
  const said = parts.filter((p): p is string => p !== null)
  return said.length === 0 ? null : said.join(' ')
}
