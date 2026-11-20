// The Macros tab's library: warnings, import, sets, the diff, the list filter and text (fork #11).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readLibrary } from '../src/shared/macros/document'
import {
  addMacro,
  duplicateMacro,
  emptyLibrary,
  importGameMacros,
  newMacro,
  removeMacro,
  restoreMacro,
  updateMacro
} from '../src/shared/macros/library'
import {
  addSet,
  assignSlot,
  chooseSet,
  chosenSet,
  diffCounts,
  diffSetAgainstFile,
  duplicateSet,
  filledCount,
  newSet,
  pageSlots,
  removeSet,
  restoreSet,
  setFromGameMacros,
  setToGameMacros
} from '../src/shared/macros/sets'
import { parseSocials, renderSocials } from '../src/shared/macros/socials'
import { addOwnTag, filterMacros, tagList, toggleTag } from '../src/shared/macros/tags'
import { macrosToText, parseMacroText } from '../src/shared/macros/text'
import type { GameMacro, MacroLibrary, Mint } from '../src/shared/macros/types'
import { validateMacro } from '../src/shared/macros/validate'

/** Ids m1, m2 .. and a clock that ticks once per reading. */
function testMint(): Mint {
  let n = 0
  let t = 1000
  return { id: () => `m${String(++n)}`, now: () => ++t }
}

const GAME: GameMacro[] = [
  { page: 2, button: 1, name: 'Assist', color: 3, lines: ['/assist Brannoc', '/pause 5, /attack on'] },
  { page: 2, button: 2, name: 'Forage', color: 0, lines: ['/doability 3', '', '', '', '/autoinventory'] },
  { page: 3, button: 12, name: 'PetAttack', color: 19, lines: ['/pet attack', '/g Pet on %t'] }
]

function seeded(): { library: MacroLibrary; mint: Mint } {
  const mint = testMint()
  return { library: importGameMacros(emptyLibrary(), GAME, ['pet'], mint).library, mint }
}

const codes = (m: { name: string; color: number; lines: string[] }): string[] => validateMacro(m).map((w) => w.code)

test('validate: a clean macro has no warnings', () => {
  assert.deepEqual(codes(GAME[0]), [])
  assert.deepEqual(codes({ name: 'p', color: 0, lines: ['/pause 700', '/pause 20,/sit', '/pauses 3'] }), [])
})

test('validate: name, colour, line count and length', () => {
  assert.deepEqual(codes({ name: '  ', color: 20, lines: ['a', 'b', 'c', 'd', 'e', 'f'] }), ['name-empty', 'color-range', 'too-many-lines'])
  assert.deepEqual(codes({ name: 'x', color: -1, lines: [] }), ['color-range'])
  assert.deepEqual(codes({ name: 'x', color: 1.5, lines: [] }), ['color-range'])
  const long = validateMacro({ name: 'x', color: 0, lines: ['ok', 'y'.repeat(256)] })
  assert.deepEqual(long.map((w) => [w.code, w.field, w.line]), [['line-too-long', 'line', 1]])
  assert.deepEqual(codes({ name: 'x', color: 0, lines: ['y'.repeat(255)] }), [])
})

test('validate: the pause form and its ceiling', () => {
  for (const bad of ['/pause', '/pause ten', '/pause 5 /sit', '/pause 5, sit', '/pause 5.5', '/pause 5,']) {
    assert.deepEqual(codes({ name: 'x', color: 0, lines: [bad] }), ['pause-form'], bad)
  }
  assert.deepEqual(codes({ name: 'x', color: 0, lines: ['/PAUSE 701, /sit'] }), ['pause-long'])
})

test('import: an identical macro is not added twice, and the counts say so', () => {
  const { library, mint } = seeded()
  assert.deepEqual(library.macros.map((m) => [m.id, m.name, m.tags]), [
    ['m1', 'Assist', ['pet']],
    ['m2', 'Forage', ['pet']],
    ['m3', 'PetAttack', ['pet']]
  ])
  const again = importGameMacros(library, [GAME[1], { ...GAME[0], color: 4 }, GAME[1]], [], mint)
  assert.equal(again.added, 1)
  assert.equal(again.skipped, 2)
  assert.deepEqual(again.ids, ['m2', 'm4', 'm2'])
  // Trailing blank lines do not make a macro different.
  const padded = importGameMacros(library, [{ ...GAME[0], lines: [...GAME[0].lines, '', ''] }], [], mint)
  assert.equal(padded.added, 0)
  // The same macro twice in one batch is added once.
  const twice = importGameMacros(emptyLibrary(), [GAME[0], GAME[0]], [], testMint())
  assert.equal(twice.added, 1)
  assert.equal(twice.skipped, 1)
})

test('add, update and duplicate leave the old library alone', () => {
  const { library, mint } = seeded()
  const fresh = newMacro(mint)
  const added = addMacro(library, fresh)
  assert.equal(library.macros.length, 3)
  assert.equal(added.macros.length, 4)
  const updated = updateMacro(added, fresh.id, { name: 'Hail', lines: ['/hail', '', ''], tags: ['Quest', 'quest', ' '] }, 5000)
  assert.deepEqual(updated.macros[3], { id: 'm4', name: 'Hail', color: 0, lines: ['/hail'], tags: ['quest'], note: '', updatedAt: 5000 })
  assert.equal(added.macros[3].name, '')
  assert.equal(updateMacro(updated, 'nope', { name: 'x' }, 1), updated)

  const dup = duplicateMacro(updated, 'm1', mint)
  assert.equal(dup.macro?.name, 'Assist copy')
  assert.deepEqual(dup.library.macros.map((m) => m.name), ['Assist', 'Assist copy', 'Forage', 'PetAttack', 'Hail'])
  assert.notEqual(dup.macro?.id, 'm1')
  assert.deepEqual(dup.macro?.lines, GAME[0].lines)
  assert.equal(duplicateMacro(updated, 'nope', mint).macro, null)
})

test('remove empties the slots that held the macro, and undo puts all of it back', () => {
  const { library, mint } = seeded()
  const made = setFromGameMacros(library, 'Main', GAME, mint)
  const removed = removeMacro(made.library, 'm2')
  assert.deepEqual(removed.library.macros.map((m) => m.id), ['m1', 'm3'])
  assert.deepEqual(removed.library.sets[0].slots, { '2:1': 'm1', '3:12': 'm3' })
  assert.deepEqual(removed.undo?.slots, [{ setId: made.set.id, slot: '2:2' }])
  assert.equal(removed.undo?.index, 1)
  assert.equal(removeMacro(made.library, 'nope').undo, null)

  assert.ok(removed.undo)
  assert.deepEqual(restoreMacro(removed.library, removed.undo), made.library)
  // A slot filled since the delete keeps its new macro.
  const refilled = assignSlot(removed.library, made.set.id, '2:2', 'm1')
  assert.equal(restoreMacro(refilled, removed.undo).sets[0].slots['2:2'], 'm1')
})

test('a set from a file reuses library macros, and goes back out as the file had it', () => {
  const { library, mint } = seeded()
  const extra: GameMacro = { page: 4, button: 5, name: 'Sit', color: 1, lines: ['/sit'] }
  const made = setFromGameMacros(library, 'From file', [...GAME, extra], mint)
  assert.equal(made.added, 1)
  assert.equal(made.skipped, 3)
  assert.equal(made.library.macros.length, 4)
  assert.deepEqual(setToGameMacros(made.library, made.set), [...GAME, extra])
  assert.equal(filledCount(made.library, made.set), 4)
  assert.deepEqual(parseSocials(renderSocials(setToGameMacros(made.library, made.set))), [...GAME, extra])

  const page = pageSlots(made.library, made.set, 2)
  assert.equal(page.length, 12)
  assert.deepEqual(page.slice(0, 3).map((s) => [s.slot, s.macro?.name ?? null]), [['2:1', 'Assist'], ['2:2', 'Forage'], ['2:3', null]])

  // A slot whose macro is gone, or whose key is not a slot, is left out.
  const odd = { ...made.set, slots: { ...made.set.slots, '9:9': 'gone', junk: 'm1' } }
  assert.equal(setToGameMacros(made.library, odd).length, 4)
  // A macro longer than the game holds goes out with five lines.
  const longLib = updateMacro(made.library, 'm1', { lines: ['1', '2', '3', '4', '5', '6'] }, 1)
  assert.deepEqual(setToGameMacros(longLib, made.set)[0].lines, ['1', '2', '3', '4', '5'])
})

test('sets: slots, duplicate, the chosen set, delete and undo', () => {
  const { library, mint } = seeded()
  const a = newSet(mint, 'Raid')
  let lib = assignSlot(addSet(library, a), a.id, '2:1', 'm3')
  lib = assignSlot(lib, a.id, '2:2', 'm1')
  lib = assignSlot(lib, a.id, '2:1', null)
  assert.deepEqual(lib.sets[0].slots, { '2:2': 'm1' })
  assert.deepEqual(library.sets, [])

  const dup = duplicateSet(lib, a.id, mint)
  assert.equal(dup.set?.name, 'Raid copy')
  assert.deepEqual(dup.set?.slots, { '2:2': 'm1' })

  lib = chooseSet(dup.library, 'brannoc_teshfal_lo1', a.id)
  assert.equal(chosenSet(lib, 'brannoc_teshfal_lo1')?.name, 'Raid')
  assert.equal(chosenSet(lib, 'aldwyn_teshfal_lo1'), null)

  const removed = removeSet(lib, a.id)
  assert.deepEqual(removed.library.chosen, {})
  assert.equal(chosenSet(removed.library, 'brannoc_teshfal_lo1'), null)
  assert.ok(removed.undo)
  assert.deepEqual(restoreSet(removed.library, removed.undo), lib)
  assert.deepEqual(chooseSet(lib, 'brannoc_teshfal_lo1', null).chosen, {})
})

test('diff: per slot, what the set would add, change, remove or leave', () => {
  const file: GameMacro[] = [
    GAME[0],
    { ...GAME[1], lines: ['/doability 4'] },
    { page: 5, button: 1, name: 'OnlyInFile', color: 0, lines: ['/sit'] }
  ]
  const diff = diffSetAgainstFile(GAME, file)
  assert.deepEqual(diff.map((d) => [d.page, d.button, d.kind]), [
    [2, 1, 'same'],
    [2, 2, 'changed'],
    [3, 12, 'added'],
    [5, 1, 'removed']
  ])
  assert.equal(diff[2].file, null)
  assert.equal(diff[3].set, null)
  assert.deepEqual(diffCounts(diff), { added: 1, changed: 1, removed: 1, same: 1 })
  assert.deepEqual(diffSetAgainstFile([], []), [])
})

test('filter: words match the name, a line, the note or a tag; tags narrow; sorted by name', () => {
  const { library } = seeded()
  let lib = updateMacro(library, 'm2', { note: 'Use in Karana', tags: ['tradeskill'] }, 1)
  lib = updateMacro(lib, 'm3', { tags: ['pet', 'offense'] }, 1)
  const names = (q: string, tags: string[] = []): string[] => filterMacros(lib.macros, q, tags).map((m) => m.name)
  assert.deepEqual(names(''), ['Assist', 'Forage', 'PetAttack'])
  assert.deepEqual(names('ASSIST'), ['Assist'])
  assert.deepEqual(names('autoinventory'), ['Forage'])
  assert.deepEqual(names('karana'), ['Forage'])
  assert.deepEqual(names('offense'), ['PetAttack'])
  assert.deepEqual(names('pet attack'), ['Assist', 'PetAttack'])
  assert.deepEqual(names('pet %T'), ['PetAttack'])
  assert.deepEqual(names('', ['pet']), ['Assist', 'PetAttack'])
  assert.deepEqual(names('', ['pet', 'offense']), ['PetAttack'])
  assert.deepEqual(names('assist', ['tradeskill']), [])
})

test('tags: the starter list, then the player\'s own, with use counts', () => {
  const { library } = seeded()
  let lib = addOwnTag(addOwnTag(library, '  Kunark  Camps '), 'PET')
  assert.deepEqual(lib.tags, ['kunark camps'])
  lib = updateMacro(lib, 'm1', { tags: toggleTag(toggleTag(lib.macros[0].tags, 'Alt'), 'pet') }, 1)
  const list = tagList(lib)
  assert.deepEqual(list.slice(0, 2), [
    { tag: 'tradeskill', count: 0, own: false },
    { tag: 'quest', count: 0, own: false }
  ])
  assert.deepEqual(list.find((t) => t.tag === 'pet'), { tag: 'pet', count: 2, own: false })
  assert.deepEqual(list.slice(12), [
    { tag: 'alt', count: 1, own: true },
    { tag: 'kunark camps', count: 0, own: true }
  ])
})

test('text: the app form round-trips, a blank line between macros', () => {
  const text = macrosToText(GAME)
  assert.equal(
    text.split('\r\n').slice(0, 5).join('|'),
    'Name=Assist|Color=3|Line1=/assist Brannoc|Line2=/pause 5, /attack on|'
  )
  const body = GAME.map((m) => ({ name: m.name, color: m.color, lines: m.lines }))
  assert.deepEqual(parseMacroText(text), body)
  assert.deepEqual(parseMacroText(text.replace(/\r\n/g, '\n')), body)
})

test('text: pasted game lines round-trip with the slot numbers dropped', () => {
  const body = GAME.map((m) => ({ name: m.name, color: m.color, lines: m.lines }))
  assert.deepEqual(parseMacroText(renderSocials(GAME)), body)
  // Without the header, keys out of order, and a whole file's other sections around it.
  const loose = 'Page2Button7Line1=/sit\nPage2Button8Name=Stand\nPage2Button7Name=Sit\nPage2Button8Line2=/stand'
  assert.deepEqual(parseMacroText(loose), [
    { name: 'Sit', color: 0, lines: ['/sit'] },
    { name: 'Stand', color: 0, lines: ['', '/stand'] }
  ])
  const whole = `[HotButtons]\r\nName=NotAMacro\r\nPage1Button9=E13\r\n${renderSocials(GAME)}[Defaults]\r\nName=Nor this\r\n`
  assert.deepEqual(parseMacroText(whole), body)
})

test('text: both forms mixed, a second Name starts the next macro, plain text has none', () => {
  const mixed = 'Name=One\nLine1=/one\nName=Two\nColor=7\n\nLine1=/orphan\n\nPage2Button1Name=Three\nPage2Button1Line1=/three'
  assert.deepEqual(parseMacroText(mixed), [
    { name: 'One', color: 0, lines: ['/one'] },
    { name: 'Two', color: 7, lines: [] },
    { name: '', color: 0, lines: ['/orphan'] },
    { name: 'Three', color: 0, lines: ['/three'] }
  ])
  assert.deepEqual(parseMacroText('just some words\n/say hello'), [])
  assert.deepEqual(parseMacroText(''), [])
})

test('the stored document: read back whole, refused when it is not a version 1 library', () => {
  const { library, mint } = seeded()
  const made = setFromGameMacros(library, 'Main', GAME, mint)
  const lib = chooseSet(addOwnTag(made.library, 'camps'), 'brannoc_teshfal_lo1', made.set.id)
  assert.deepEqual(readLibrary(JSON.parse(JSON.stringify(lib))), lib)
  assert.deepEqual(readLibrary(emptyLibrary()), emptyLibrary())
  assert.equal(readLibrary({ version: 2, macros: [], sets: [] }), null)
  assert.equal(readLibrary({ version: 1, macros: {} }), null)
  assert.equal(readLibrary([]), null)
  assert.equal(readLibrary(null), null)
  // Entries that are not macros are dropped; missing fields get their defaults.
  const loose = readLibrary({ version: 1, macros: [{ id: 'a' }, { name: 'no id' }, 7], sets: [{ id: 's', slots: { '2:1': 'a', '2:2': 5 } }] })
  assert.deepEqual(loose, {
    version: 1,
    macros: [{ id: 'a', name: '', color: 0, lines: [], tags: [], note: '', updatedAt: 0 }],
    sets: [{ id: 's', name: '', slots: { '2:1': 'a' } }],
    chosen: {},
    tags: []
  })
})
