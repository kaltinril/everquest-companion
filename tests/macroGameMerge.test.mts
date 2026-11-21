// The three-way merge of a game read into a character's layout (fork #11): a macro made, edited or
// removed in game is never lost to a Send, and a change made in the app is never overwritten.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gameChanges } from '../src/shared/macros/buttons'
import { readLibrary } from '../src/shared/macros/document'
import { absorbGameRead, gameConflicts, mergeGameFiles, mergeText, slotMove } from '../src/shared/macros/gameMerge'
import { record, redo, startHistory, undo } from '../src/shared/macros/history'
import { ensureCharacterLayouts } from '../src/shared/macros/layouts'
import { emptyLibrary, newMacro, addMacro, updateMacro } from '../src/shared/macros/library'
import { assignSlot, chosenSet, setToGameMacros } from '../src/shared/macros/sets'
import type { CharacterFileMacros, GameMacro, MacroLibrary, Mint } from '../src/shared/macros/types'

function testMint(): Mint {
  let n = 0
  return { id: () => `m${String(++n)}`, now: () => 1000 }
}

const macro = (button: number, name: string, line = `/say ${name}`): GameMacro => ({ page: 2, button, name, color: 0, lines: [line] })
const A = macro(1, 'Assist')
const B = macro(2, 'Forage')
const KEY = 'dry_oggok_lo1'

function file(macros: GameMacro[]): CharacterFileMacros {
  return { file: 'Dry_oggok_LO1.ini', character: 'Dry', server: 'oggok', loadout: 1, macros, mtimeMs: 0, stamp: 'x', backups: { original: null, last: null } }
}

/** A library that has read the game once, holding these macros. */
function readOnce(macros: GameMacro[], mint = testMint()): { library: MacroLibrary; mint: Mint } {
  return { library: mergeGameFiles(emptyLibrary(), [file(macros)], mint).library, mint }
}

function buttons(library: MacroLibrary): string[] {
  const set = chosenSet(library, KEY)
  assert.ok(set)
  return setToGameMacros(library, set).map((m) => `${String(m.button)}:${m.name}`)
}

const slotId = (library: MacroLibrary, slot: string): string => {
  const set = chosenSet(library, KEY)
  assert.ok(set)
  return set.slots[slot]
}

const setId = (library: MacroLibrary): string => {
  const set = chosenSet(library, KEY)
  assert.ok(set)
  return set.id
}

const pending = (library: MacroLibrary, game: GameMacro[]): number => {
  const set = chosenSet(library, KEY)
  assert.ok(set)
  return gameChanges(library, set, game).total
}

test('the decision for one slot', () => {
  assert.equal(slotMove(A, A, null), 'keep')
  assert.equal(slotMove(null, B, null), 'take')
  assert.equal(slotMove(A, null, A), 'take')
  assert.equal(slotMove(A, B, A), 'take')
  assert.equal(slotMove(A, B, B), 'keep')
  assert.equal(slotMove(A, B, macro(1, 'Mine')), 'clash')
  assert.equal(slotMove(undefined, A, null), 'take')
  assert.equal(slotMove(undefined, null, A), 'keep')
  assert.equal(slotMove(undefined, A, B), 'clash')
})

test('added in game: it reaches the layout and a send would not delete it', () => {
  const { library, mint } = readOnce([A])
  const now = [A, B]
  const merged = mergeGameFiles(library, [file(now)], mint)
  assert.deepEqual(buttons(merged.library), ['1:Assist', '2:Forage'])
  assert.equal(pending(merged.library, now), 0)
  assert.equal(mergeText(merged.report), 'Brought in 1 new macro from the game for Dry.')
})

test('edited in game: the slot takes a new macro, keeps its tags and note, and the shared one is untouched', () => {
  const { library, mint } = readOnce([A])
  const oldId = slotId(library, '2:1')
  const tagged = updateMacro(library, oldId, { tags: ['pull'], note: 'keep me' }, 5)
  const now = [{ ...A, lines: ['/assist Other'] }]
  const merged = mergeGameFiles(tagged, [file(now)], mint)
  const newId = slotId(merged.library, '2:1')
  assert.notEqual(newId, oldId)
  const made = merged.library.macros.find((m) => m.id === newId)
  assert.deepEqual([made?.lines, made?.tags, made?.note], [['/assist Other'], ['pull'], 'keep me'])
  assert.deepEqual(merged.library.macros.find((m) => m.id === oldId)?.lines, ['/say Assist'])
  assert.equal(pending(merged.library, now), 0)
  assert.equal(mergeText(merged.report), 'From the game for Dry: 1 edited.')
})

test('an identical library macro is reused rather than imported again', () => {
  const { library, mint } = readOnce([A])
  const other = newMacro(mint, B)
  const stocked = addMacro(library, other)
  const merged = mergeGameFiles(stocked, [file([A, B])], mint)
  assert.equal(slotId(merged.library, '2:2'), other.id)
  assert.equal(merged.library.macros.length, stocked.macros.length)
})

test('removed in game: the button empties and the macro stays in the library', () => {
  const { library, mint } = readOnce([A, B])
  const merged = mergeGameFiles(library, [file([A])], mint)
  assert.deepEqual(buttons(merged.library), ['1:Assist'])
  assert.ok(merged.library.macros.some((m) => m.name === 'Forage'))
  assert.equal(pending(merged.library, [A]), 0)
})

test('a removal made in the app survives a re-read and stays pending', () => {
  const { library, mint } = readOnce([A, B])
  const removed = assignSlot(library, setId(library), '2:2', null)
  const merged = mergeGameFiles(removed, [file([A, B])], mint)
  assert.equal(merged.library, removed)
  assert.deepEqual(buttons(merged.library), ['1:Assist'])
  assert.equal(pending(merged.library, [A, B]), 1)
})

test('changed on both sides: the player keeps theirs, the button is marked, and the mark outlives another read', () => {
  const { library, mint } = readOnce([A])
  const mine = updateMacro(library, slotId(library, '2:1'), { lines: ['/say mine'] }, 5)
  const game = [{ ...A, lines: ['/say theirs'] }]
  const merged = mergeGameFiles(mine, [file(game)], mint)
  assert.deepEqual(merged.library.macros.find((m) => m.id === slotId(merged.library, '2:1'))?.lines, ['/say mine'])
  assert.deepEqual(gameConflicts(merged.library, KEY), ['2:1'])
  assert.equal(mergeText(merged.report), '1 button changed in game too. Check it before you send.')
  const again = mergeGameFiles(merged.library, [file(game)], mint)
  assert.equal(again.library, merged.library)
  assert.deepEqual(gameConflicts(again.library, KEY), ['2:1'])
  assert.equal(mergeText(again.report), null)
})

test('a mark clears once the button and the game agree', () => {
  const { library, mint } = readOnce([A])
  const mine = updateMacro(library, slotId(library, '2:1'), { lines: ['/say mine'] }, 5)
  const clashed = mergeGameFiles(mine, [file([{ ...A, lines: ['/say theirs'] }])], mint).library
  const sent = [{ ...A, lines: ['/say mine'] }]
  const after = mergeGameFiles(clashed, [file(sent)], mint).library
  assert.deepEqual(gameConflicts(after, KEY), [])
  assert.equal(after.conflicts, undefined)
})

test('no earlier read: a game macro on an empty button comes in, two different macros keep the player and are marked', () => {
  const mint = testMint()
  const old = ensureCharacterLayouts(emptyLibrary(), [file([A])], mint).library
  assert.equal(old.seen, undefined)
  const mine = updateMacro(old, slotId(old, '2:1'), { lines: ['/say mine'] }, 5)
  const game = [A, B]
  const merged = mergeGameFiles(mine, [file(game)], mint)
  assert.deepEqual(buttons(merged.library), ['1:Assist', '2:Forage'])
  assert.deepEqual(merged.library.macros.find((m) => m.id === slotId(merged.library, '2:1'))?.lines, ['/say mine'])
  assert.deepEqual(gameConflicts(merged.library, KEY), ['2:1'])
  assert.deepEqual(merged.library.seen?.[KEY].map((m) => m.name), ['Assist', 'Forage'])
})

test('no earlier read: a button only the app holds stays', () => {
  const mint = testMint()
  const old = ensureCharacterLayouts(emptyLibrary(), [file([A])], mint).library
  const extra = newMacro(mint, B)
  const added = assignSlot(addMacro(old, extra), setId(old), '2:2', extra.id)
  const merged = mergeGameFiles(added, [file([A])], mint)
  assert.deepEqual(buttons(merged.library), ['1:Assist', '2:Forage'])
  assert.deepEqual(gameConflicts(merged.library, KEY), [])
})

test('a merge is idempotent', () => {
  const { library, mint } = readOnce([A])
  const once = mergeGameFiles(library, [file([A, B])], mint)
  const twice = mergeGameFiles(once.library, [file([A, B])], mint)
  assert.equal(twice.library, once.library)
  assert.equal(mergeText(twice.report), null)
})

test('a file missing from a read is left alone', () => {
  const { library, mint } = readOnce([A, B])
  assert.equal(mergeGameFiles(library, [], mint).library, library)
})

test('a send followed by a re-read matches the game', () => {
  const { library, mint } = readOnce([A])
  const extra = newMacro(mint, B)
  const edited = assignSlot(addMacro(library, extra), setId(library), '2:2', extra.id)
  const set = chosenSet(edited, KEY)
  assert.ok(set)
  const sent = gameChanges(edited, set, [A]).macros
  const after = mergeGameFiles(edited, [file(sent)], mint)
  assert.equal(pending(after.library, sent), 0)
  assert.equal(mergeText(after.report), null)
  assert.deepEqual(after.library.seen?.[KEY].map((m) => m.name), ['Assist', 'Forage'])
})

test('a merge makes no Undo step and keeps the history', () => {
  const { library, mint } = readOnce([A])
  const stepped = record(startHistory(library), updateMacro(library, slotId(library, '2:1'), { note: 'n' }, 5), { field: null, at: 1 })
  const absorbed = absorbGameRead(stepped, [file([A, B])], mint)
  assert.equal(absorbed.past.length, 1)
  assert.deepEqual(buttons(absorbed.present), ['1:Assist', '2:Forage'])
  assert.equal(absorbGameRead(absorbed, [file([A, B])], mint), absorbed)
})

test('an Undo past a merge keeps the macro the game brought', () => {
  const { library, mint } = readOnce([A])
  const stepped = record(startHistory(library), updateMacro(library, slotId(library, '2:1'), { note: 'n' }, 5), { field: null, at: 1 })
  const absorbed = absorbGameRead(stepped, [file([A, B])], mint)
  const back = undo(absorbed)
  assert.deepEqual(buttons(back.present), ['1:Assist', '2:Forage'])
  assert.equal(pending(back.present, [A, B]), 0)
  assert.deepEqual(buttons(redo(back).present), ['1:Assist', '2:Forage'])
})

test('an Undo after a send stays a change to send, and is not merged away', () => {
  const { library, mint } = readOnce([A])
  const edited = updateMacro(library, slotId(library, '2:1'), { lines: ['/say new'] }, 5)
  const stepped = record(startHistory(library), edited, { field: null, at: 1 })
  const sent = [{ ...A, lines: ['/say new'] }]
  const afterSend = absorbGameRead(stepped, [file(sent)], mint)
  const back = undo(afterSend)
  assert.equal(absorbGameRead(back, [file(sent)], mint), back)
  assert.deepEqual(back.present.macros.find((m) => m.id === slotId(back.present, '2:1'))?.lines, ['/say Assist'])
  assert.equal(pending(back.present, sent), 1)
})

test('what the game held is stored, read back, and an old library still loads without it', () => {
  const { library } = readOnce([A])
  assert.deepEqual(readLibrary(JSON.parse(JSON.stringify(library))), library)
  const none = readOnce([]).library
  assert.deepEqual(readLibrary(JSON.parse(JSON.stringify(none)))?.seen, { [KEY]: [] })
  assert.equal(readLibrary(emptyLibrary())?.seen, undefined)
  assert.deepEqual(readLibrary({ ...emptyLibrary(), seen: { a: [{ page: 'x' }, 7], b: 3 }, conflicts: { a: [1] } }), { ...emptyLibrary(), seen: { a: [] } })
})
