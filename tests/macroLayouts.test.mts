// The Macros tab's character-first flow: a character's own layout, saved layouts, the grid's
// marks against the game, moving buttons and where a macro sits (fork #11).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alsoOn, changesText, gameChanges, gridPage, macroPlaces, moveSlot, ownCopyAt, pageTabs, placeNewMacro, usedOnText } from '../src/shared/macros/buttons'
import { readLibrary } from '../src/shared/macros/document'
import {
  broughtInText,
  characterLabel,
  copyButtons,
  ensureCharacterLayouts,
  isCharacterLayout,
  otherCharacterChoices,
  resetToGame,
  saveLayout,
  savedLayoutChoices,
  savedLayoutNamed,
  savedLayouts
} from '../src/shared/macros/layouts'
import { emptyLibrary, removeMacro, updateMacro } from '../src/shared/macros/library'
import { addSet, assignSlot, chooseSet, chosenSet, newSet, setToGameMacros } from '../src/shared/macros/sets'
import type { CharacterFileMacros, GameMacro, MacroLibrary, Mint } from '../src/shared/macros/types'
import { macroSection } from '../src/renderer/src/features/macros/macroSection'

/** Ids m1, m2 .. and a clock that ticks once per reading. */
function testMint(): Mint {
  let n = 0
  let t = 1000
  return { id: () => `m${String(++n)}`, now: () => ++t }
}

const ASSIST: GameMacro = { page: 2, button: 1, name: 'Assist', color: 3, lines: ['/assist Brannoc'] }
const FORAGE: GameMacro = { page: 2, button: 2, name: 'Forage', color: 0, lines: ['/doability 3'] }
const PET: GameMacro = { page: 3, button: 12, name: 'PetAttack', color: 19, lines: ['/pet attack'] }

function file(character: string, macros: GameMacro[], loadout = 1): CharacterFileMacros {
  return {
    file: `${character}_teek_LO${String(loadout)}.ini`,
    character,
    server: 'teek',
    loadout,
    macros,
    mtimeMs: 0,
    stamp: 'x',
    backups: { original: null, last: null }
  }
}

const KAL = file('Kaltinril', [ASSIST, FORAGE, PET])
const ZED = file('Zed', [{ ...ASSIST, page: 4, button: 5 }])
const NEWBIE = file('Newbie', [])
const FILES = [KAL, NEWBIE, ZED]

function ensured(): { library: MacroLibrary; mint: Mint } {
  const mint = testMint()
  return { library: ensureCharacterLayouts(emptyLibrary(), FILES, mint).library, mint }
}

const names = (macros: readonly { name: string }[]): string[] => macros.map((m) => m.name)

test('ensure: every character file gets its own layout, an identical macro is imported once', () => {
  const { library, report } = ensureCharacterLayouts(emptyLibrary(), FILES, testMint())
  assert.deepEqual(names(library.macros), ['Assist', 'Forage', 'PetAttack'])
  assert.deepEqual(report, { macros: 3, characters: ['Kaltinril', 'Zed'] })
  assert.deepEqual(names(library.sets), ['Kaltinril', 'Newbie', 'Zed'])
  assert.deepEqual(Object.keys(library.chosen), ['kaltinril_teek_lo1', 'newbie_teek_lo1', 'zed_teek_lo1'])
  const kal = chosenSet(library, 'kaltinril_teek_lo1')
  const zed = chosenSet(library, 'zed_teek_lo1')
  assert.ok(kal && zed && kal.id !== zed.id)
  assert.deepEqual(setToGameMacros(library, kal), KAL.macros)
  assert.deepEqual(setToGameMacros(library, zed), ZED.macros)
  // One library macro on both characters.
  assert.equal(kal.slots['2:1'], zed.slots['4:5'])
  assert.deepEqual(chosenSet(library, 'newbie_teek_lo1')?.slots, {})
})

test('ensure: a second call changes nothing, and a deleted macro is not imported again', () => {
  const { library, mint } = ensured()
  const again = ensureCharacterLayouts(library, FILES, mint)
  assert.equal(again.library, library)
  assert.deepEqual(again.report, { macros: 0, characters: [] })
  const forage = library.macros.find((m) => m.name === 'Forage')
  assert.ok(forage)
  const without = removeMacro(library, forage.id).library
  const after = ensureCharacterLayouts(without, FILES, mint)
  assert.equal(after.library, without)
  assert.deepEqual(names(after.library.macros), ['Assist', 'PetAttack'])
})

test('ensure: a character that appears later is brought in then, the others are left alone', () => {
  const mint = testMint()
  const first = ensureCharacterLayouts(emptyLibrary(), [KAL], mint).library
  const edited = updateMacro(first, first.macros[0].id, { name: 'Assist MA' }, 5)
  const second = ensureCharacterLayouts(edited, FILES, mint)
  // Zed's file still has the old Assist: it is a different macro now, so it is added.
  assert.deepEqual(second.report, { macros: 1, characters: ['Zed'] })
  assert.deepEqual(names(second.library.macros), ['Assist MA', 'Forage', 'PetAttack', 'Assist'])
  assert.deepEqual(chosenSet(second.library, 'kaltinril_teek_lo1'), chosenSet(edited, 'kaltinril_teek_lo1'))
})

test('ensure: page 1 is left to the game, and a file with no macros brings nothing in', () => {
  const builtIn: GameMacro = { page: 1, button: 1, name: 'Sit', color: 0, lines: ['/sit'] }
  const made = ensureCharacterLayouts(emptyLibrary(), [file('Solo', [builtIn, ASSIST]), NEWBIE], testMint())
  assert.deepEqual(names(made.library.macros), ['Assist'])
  assert.deepEqual(made.report, { macros: 1, characters: ['Solo'] })
  assert.equal(broughtInText(ensureCharacterLayouts(emptyLibrary(), [NEWBIE], testMint()).report), null)
})

test('ensure: a layout two files share (old data) stays the first one\'s, the second gets a copy', () => {
  const mint = testMint()
  let old = ensureCharacterLayouts(emptyLibrary(), [KAL], mint).library
  const shared = chosenSet(old, 'kaltinril_teek_lo1')
  assert.ok(shared)
  old = chooseSet(old, 'zed_teek_lo1', shared.id)
  const { library, report } = ensureCharacterLayouts(old, [KAL, ZED], mint)
  const kal = chosenSet(library, 'kaltinril_teek_lo1')
  const zed = chosenSet(library, 'zed_teek_lo1')
  assert.ok(kal && zed)
  assert.equal(kal.id, shared.id)
  assert.notEqual(zed.id, shared.id)
  assert.deepEqual(zed.slots, shared.slots)
  assert.equal(zed.name, 'Zed')
  // Zed had a layout already, so nothing is imported for it.
  assert.deepEqual(report, { macros: 0, characters: [] })
  assert.equal(ensureCharacterLayouts(library, [KAL, ZED], mint).library, library)
})

test('ensure: a set the old screen chose for a character becomes its own, named after it', () => {
  const mint = testMint()
  const raid = newSet(mint, 'Kaltinril today')
  const old = chooseSet(addSet(emptyLibrary(), raid), 'kaltinril_teek_lo1', raid.id)
  const loaded = readLibrary(JSON.parse(JSON.stringify(old)))
  assert.ok(loaded)
  const { library, report } = ensureCharacterLayouts(loaded, [KAL], mint)
  assert.deepEqual(names(library.sets), ['Kaltinril'])
  assert.deepEqual(report, { macros: 0, characters: [] })
  assert.equal(library.version, 1)
  assert.deepEqual(readLibrary(JSON.parse(JSON.stringify(library))), library)
})

test('labels and the brought-in line', () => {
  const second = file('Kaltinril', [], 2)
  assert.equal(characterLabel(KAL, FILES), 'Kaltinril')
  assert.equal(characterLabel(second, [KAL, second]), 'Kaltinril (teek, loadout 2)')
  assert.equal(broughtInText({ macros: 4, characters: ['A', 'B', 'C'] }), 'Brought in 4 macros from 3 characters.')
  assert.equal(broughtInText({ macros: 1, characters: ['Zed'] }), 'Brought in 1 macro from Zed.')
  assert.equal(broughtInText({ macros: 0, characters: ['Zed'] }), 'Brought in the buttons of Zed.')
  assert.equal(broughtInText({ macros: 0, characters: [] }), null)
})

test('saved layouts: a character\'s own layout is not one; saving copies, the same name replaces', () => {
  const { library, mint } = ensured()
  assert.deepEqual(savedLayouts(library), [])
  const saved = saveLayout(library, 'kaltinril_teek_lo1', '  Raid ', mint)
  assert.ok(saved.set)
  assert.equal(saved.set.name, 'Raid')
  assert.equal(isCharacterLayout(saved.library, saved.set.id), false)
  assert.equal(isCharacterLayout(saved.library, chosenSet(library, 'kaltinril_teek_lo1')?.id ?? ''), true)
  assert.deepEqual(savedLayoutChoices(saved.library), [{ id: saved.set.id, name: 'Raid', filled: 3 }])
  assert.equal(savedLayoutNamed(saved.library, 'raid')?.id, saved.set.id)
  assert.equal(savedLayoutNamed(saved.library, 'Kaltinril'), null)
  // The copy is its own: emptying a button of the character leaves the saved layout whole.
  const kalId = chosenSet(saved.library, 'kaltinril_teek_lo1')?.id ?? ''
  const emptied = assignSlot(saved.library, kalId, '2:1', null)
  assert.equal(savedLayoutChoices(emptied)[0].filled, 3)
  const again = saveLayout(emptied, 'kaltinril_teek_lo1', 'RAID', mint)
  assert.equal(again.set?.id, saved.set.id)
  assert.deepEqual(savedLayoutChoices(again.library), [{ id: saved.set.id, name: 'Raid', filled: 2 }])
  assert.equal(saveLayout(library, 'kaltinril_teek_lo1', '   ', mint).set, null)
  assert.equal(saveLayout(library, 'nobody_teek_lo1', 'Raid', mint).set, null)
})

test('load a layout and copy from another character: the buttons are replaced by a copy', () => {
  const { library, mint } = ensured()
  const saved = saveLayout(library, 'kaltinril_teek_lo1', 'Raid', mint)
  assert.ok(saved.set)
  const loaded = copyButtons(saved.library, 'zed_teek_lo1', saved.set.id)
  const zed = chosenSet(loaded, 'zed_teek_lo1')
  assert.ok(zed)
  assert.deepEqual(setToGameMacros(loaded, zed), KAL.macros)
  assert.notEqual(zed.id, saved.set.id)
  // The same buttons again is no change at all, so it makes no Undo step.
  assert.equal(copyButtons(loaded, 'zed_teek_lo1', saved.set.id), loaded)
  assert.deepEqual(otherCharacterChoices(library, FILES, 'zed_teek_lo1').map((c) => [c.name, c.filled]), [['Kaltinril', 3], ['Newbie', 0]])
  const kalId = chosenSet(library, 'kaltinril_teek_lo1')?.id ?? ''
  const copied = copyButtons(library, 'newbie_teek_lo1', kalId)
  assert.deepEqual(chosenSet(copied, 'newbie_teek_lo1')?.slots, chosenSet(library, 'kaltinril_teek_lo1')?.slots)
  assert.equal(copyButtons(library, 'kaltinril_teek_lo1', kalId), library)
  assert.equal(copyButtons(library, 'kaltinril_teek_lo1', 'gone'), library)
})

test('reset to what the game has: the file\'s buttons, a new macro imported, a matching layout untouched', () => {
  const { library, mint } = ensured()
  assert.equal(resetToGame(library, 'kaltinril_teek_lo1', KAL.macros, mint), library)
  const sit: GameMacro = { page: 5, button: 1, name: 'Sit', color: 0, lines: ['/sit'] }
  const reset = resetToGame(library, 'kaltinril_teek_lo1', [ASSIST, sit], mint)
  const kal = chosenSet(reset, 'kaltinril_teek_lo1')
  assert.ok(kal)
  assert.deepEqual(setToGameMacros(reset, kal), [ASSIST, sit])
  assert.deepEqual(names(reset.macros), ['Assist', 'Forage', 'PetAttack', 'Sit'])
  assert.equal(kal.id, chosenSet(library, 'kaltinril_teek_lo1')?.id)
})

test('the grid: marks against the game, and the count a send would change', () => {
  const { library } = ensured()
  const kal = chosenSet(library, 'kaltinril_teek_lo1')
  assert.ok(kal)
  assert.equal(gameChanges(library, kal, KAL.macros).total, 0)
  assert.deepEqual(gridPage(library, kal, 2, KAL.macros).map((b) => b.mark), Array.from({ length: 12 }, () => null))
  let edited = updateMacro(library, kal.slots['2:1'], { lines: ['/assist Zed'] }, 9)
  edited = assignSlot(edited, kal.id, '2:2', null)
  edited = assignSlot(edited, kal.id, '2:7', kal.slots['3:12'])
  const set = chosenSet(edited, 'kaltinril_teek_lo1')
  assert.ok(set)
  const page = gridPage(edited, set, 2, KAL.macros)
  assert.equal(page.length, 12)
  assert.deepEqual(page.slice(0, 2).map((b) => [b.button, b.macro?.name ?? null, b.mark, b.game?.name ?? null]), [
    [1, 'Assist', 'changed', 'Assist'],
    [2, null, 'removed', 'Forage']
  ])
  assert.deepEqual([page[6].macro?.name, page[6].mark, page[6].game], ['PetAttack', 'new', null])
  const changes = gameChanges(edited, set, KAL.macros)
  assert.equal(changes.total, 3)
  assert.deepEqual(changes.changed.map((d) => `${String(d.page)}:${String(d.button)} ${d.kind}`), ['2:1 changed', '2:2 removed', '2:7 added'])
  assert.deepEqual(changes.macros.map((m) => m.name), ['Assist', 'PetAttack', 'PetAttack'])
  assert.equal(changesText(3), '3 changes not in the game yet')
  assert.equal(changesText(1), '1 change not in the game yet')
})

test('the page row: pages 2 to 10 with their counts, and a higher page the file holds', () => {
  const { library } = ensured()
  const kal = chosenSet(library, 'kaltinril_teek_lo1')
  assert.ok(kal)
  const tabs = pageTabs(library, kal, KAL.macros)
  assert.deepEqual(tabs.map((t) => t.page), [2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(tabs.slice(0, 3).map((t) => t.filled), [2, 1, 0])
  const high: GameMacro = { page: 11, button: 14, name: 'Far', color: 0, lines: ['/who'] }
  assert.equal(pageTabs(library, kal, [...KAL.macros, high]).at(-1)?.page, 11)
  assert.equal(gridPage(library, kal, 11, [...KAL.macros, high]).length, 14)
})

test('move: onto an empty button it moves, onto a filled one the two swap', () => {
  const { library } = ensured()
  const kal = chosenSet(library, 'kaltinril_teek_lo1')
  assert.ok(kal)
  const moved = moveSlot(library, kal.id, '2:1', '2:9')
  assert.deepEqual(chosenSet(moved, 'kaltinril_teek_lo1')?.slots, { '2:2': kal.slots['2:2'], '3:12': kal.slots['3:12'], '2:9': kal.slots['2:1'] })
  const swapped = moveSlot(library, kal.id, '2:1', '2:2')
  const slots = chosenSet(swapped, 'kaltinril_teek_lo1')?.slots
  assert.deepEqual([slots?.['2:1'], slots?.['2:2']], [kal.slots['2:2'], kal.slots['2:1']])
  assert.equal(moveSlot(library, kal.id, '2:5', '2:6'), library)
  assert.equal(moveSlot(library, kal.id, '2:1', '2:1'), library)
  assert.equal(library.sets.find((s) => s.id === kal.id), kal)
})

test('a new macro on a button, and "Change only here"', () => {
  const { library, mint } = ensured()
  const kal = chosenSet(library, 'kaltinril_teek_lo1')
  assert.ok(kal)
  const placed = placeNewMacro(library, kal.id, '2:5', mint)
  assert.ok(placed.macro)
  assert.equal(placed.library.macros[0].id, placed.macro.id)
  assert.equal(chosenSet(placed.library, 'kaltinril_teek_lo1')?.slots['2:5'], placed.macro.id)
  assert.equal(placeNewMacro(library, 'gone', '2:5', mint).macro, null)

  const own = ownCopyAt(library, kal.id, '2:1', mint)
  assert.ok(own.macro)
  assert.notEqual(own.macro.id, kal.slots['2:1'])
  assert.deepEqual(names(own.library.macros), ['Assist', 'Assist', 'Forage', 'PetAttack'])
  assert.equal(chosenSet(own.library, 'kaltinril_teek_lo1')?.slots['2:1'], own.macro.id)
  // Zed keeps the original.
  assert.equal(chosenSet(own.library, 'zed_teek_lo1')?.slots['4:5'], kal.slots['2:1'])
  // Nothing differs from the game yet: the copy has the same name, colour and lines.
  const after = chosenSet(own.library, 'kaltinril_teek_lo1')
  assert.ok(after)
  assert.equal(gameChanges(own.library, after, KAL.macros).total, 0)
  assert.equal(ownCopyAt(library, kal.id, '2:6', mint).macro, null)
})

test('where a macro sits: characters by name, saved layouts as "the layout X"', () => {
  const { library, mint } = ensured()
  const kal = chosenSet(library, 'kaltinril_teek_lo1')
  assert.ok(kal)
  const assist = kal.slots['2:1']
  let lib = saveLayout(library, 'kaltinril_teek_lo1', 'Raid', mint).library
  lib = assignSlot(lib, kal.id, '3:1', assist)
  assert.deepEqual(macroPlaces(lib, assist).map((p) => [p.name, p.slots.length]), [['Kaltinril', 2], ['Zed', 1], ['the layout Raid', 1]])
  assert.equal(usedOnText(lib, assist), 'Used on: Kaltinril, Zed, the layout Raid.')
  assert.deepEqual(alsoOn(lib, assist, kal.id, '2:1'), ['page 3 button 1', 'Zed', 'the layout Raid'])
  const pet = kal.slots['3:12']
  assert.deepEqual(alsoOn(library, pet, kal.id, '3:12'), [])
  const lonely = placeNewMacro(library, kal.id, '9:9', mint)
  assert.equal(usedOnText(assignSlot(lonely.library, kal.id, '9:9', null), lonely.macro?.id ?? ''), 'Not on any button yet.')
})

test('the remembered section: Characters unless Library was the one left open', () => {
  assert.equal(macroSection(null), 'characters')
  assert.equal(macroSection('sets'), 'characters')
  assert.equal(macroSection('characters'), 'characters')
  assert.equal(macroSection('library'), 'library')
  assert.equal(macroSection('nonsense'), 'characters')
})
