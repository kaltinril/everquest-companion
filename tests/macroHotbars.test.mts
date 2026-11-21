// Hotbars point at a macro button by number and store no name (fork #11): what they point at, and
// the warning when a send or a move would make one fire something else. Nothing here writes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gameChanges, moveSlot } from '../src/shared/macros/buttons'
import { ensureCharacterLayouts } from '../src/shared/macros/layouts'
import { emptyLibrary, updateMacro } from '../src/shared/macros/library'
import { groupMoveHotbarText, hotbarEffects, hotbarSlot, hotbarText, hotbarsAfter, parseHotbarSlots } from '../src/shared/macros/hotbars'
import { assignSlot, chosenSet } from '../src/shared/macros/sets'
import type { CharacterFileMacros, GameMacro, MacroLibrary, MacroSet, Mint } from '../src/shared/macros/types'

function testMint(): Mint {
  let n = 0
  return { id: () => `m${String(++n)}`, now: () => 1000 }
}

const macro = (button: number, name: string): GameMacro => ({ page: 2, button, name, color: 0, lines: [`/say ${name}`] })
const GAME = [macro(1, 'NeckHPTurnin'), macro(2, 'Enchant Electru'), macro(3, 'language'), macro(4, 'broughtback')]
const KEY = 'dry_oggok_lo1'

function file(hotbars: Record<string, number>, macros: GameMacro[] = GAME): CharacterFileMacros {
  return { file: 'Dry_oggok_LO1.ini', character: 'Dry', server: 'oggok', loadout: 1, macros, hotbars, mtimeMs: 0, stamp: 'x', backups: { original: null, last: null } }
}

const OTHER: CharacterFileMacros = { ...file({}, []), file: 'Zed_oggok_LO1.ini', character: 'Zed' }

function start(): { library: MacroLibrary; set: MacroSet; other: MacroSet } {
  const library = ensureCharacterLayouts(emptyLibrary(), [file({}), OTHER], testMint()).library
  const set = chosenSet(library, KEY)
  const other = chosenSet(library, 'zed_oggok_lo1')
  assert.ok(set)
  assert.ok(other)
  return { library, set, other }
}

const effectsOf = (library: MacroLibrary, set: MacroSet, bars: Record<string, number>) => {
  const live = chosenSet(library, KEY)
  assert.ok(live)
  assert.equal(live.id, set.id)
  return hotbarEffects(gameChanges(library, live, GAME), bars)
}

test('a slot number is zero-based, as measured on the owner bar', () => {
  assert.equal(hotbarSlot(12), '2:1')
  assert.equal(hotbarSlot(13), '2:2')
  assert.equal(hotbarSlot(14), '2:3')
  assert.equal(hotbarSlot(15), '2:4')
  assert.equal(hotbarSlot(0), '1:1')
  assert.equal(hotbarSlot(119), '10:12')
  for (const n of [120, 124, 229, 6120, -1, 2.5]) assert.equal(hotbarSlot(n), null)
})

test('only the hotbar sections are read, in any order, with CRLF and odd values', () => {
  const text = [
    '[Socials]',
    'Page2Button1Name=E13',
    'Page9Button9=E13,@-1,0000000000000000,0,,',
    '[HotButtons]',
    'Page10Button4=E13,@-1,0000000000000000,0,,',
    'Page1Button1=E12',
    '  page1button2=e13,@-1,0,0,,',
    'Page1Button3=E229,@-1,0,0,,',
    'Page1Button4=E6120,@-1,0,0,,',
    'Page1Button5=S12,@-1,0,0,,',
    'Page1Button6=E13x,@-1',
    'Page1Button7=',
    'not a key',
    '[HotButtons2]',
    'Page3Button1=E13,@-1,0,0,,',
    '[HotButtonsExtra]',
    'Page3Button2=E13,@-1,0,0,,',
    '[Other]',
    'Page3Button3=E14,@-1,0,0,,'
  ].join('\r\n')
  assert.deepEqual(parseHotbarSlots(text), { '2:2': 3, '2:1': 1 })
  assert.deepEqual(parseHotbarSlots(''), {})
})

test('a changed name on a hotbar button is listed, and an edit keeping the name is not', () => {
  const { library, set } = start()
  const bars = { '2:3': 1 }
  const sameName = updateMacro(library, set.slots['2:3'], { lines: ['/say other'] }, 5)
  assert.deepEqual(effectsOf(sameName, set, bars), [])
  const renamed = updateMacro(library, set.slots['2:3'], { name: 'Assist' }, 5)
  const effects = effectsOf(renamed, set, { '2:3': 2 })
  assert.deepEqual(effects, [{ page: 2, button: 3, hotbars: 2, was: 'language', now: 'Assist' }])
  assert.equal(hotbarText(effects), '2 hotbar buttons will change: page 2 button 3 was language, now Assist.')
})

test('an emptied button, and an empty one that gains a macro, are both said', () => {
  const { library, set } = start()
  const emptied = assignSlot(library, set.id, '2:4', null)
  assert.equal(hotbarText(effectsOf(emptied, set, { '2:4': 1 })), '1 hotbar button will change: page 2 button 4 was broughtback and will be empty.')
  const filled = assignSlot(library, set.id, '2:9', set.slots['2:1'])
  assert.equal(hotbarText(effectsOf(filled, set, { '2:9': 1 })), '1 hotbar button will change: page 2 button 9 was empty, now NeckHPTurnin.')
  assert.deepEqual(effectsOf(emptied, set, { '2:1': 1 }), [])
})

test('a long list is cut, the count stays whole, and nothing to say is null', () => {
  const effects = [1, 2, 3, 4, 5].map((button) => ({ page: 2, button, hotbars: 2, was: 'a', now: 'b' }))
  const text = hotbarText(effects)
  assert.ok(text?.startsWith('10 hotbar buttons will change: page 2 button 1'))
  assert.ok(text?.endsWith('; and 2 more.'))
  assert.equal(hotbarText([]), null)
})

test('a move onto an empty button says what the hotbar will do', () => {
  const { library, set } = start()
  const after = moveSlot(library, set.id, '2:3', '3:1')
  const on = file({ '2:3': 1 })
  assert.equal(hotbarText(hotbarsAfter(after, set.id, on, ['2:3', '3:1'])), '1 hotbar button will change: page 2 button 3 was language and will be empty.')
  assert.deepEqual(hotbarsAfter(after, set.id, file({ '2:1': 1 }), ['2:3', '3:1']), [])
})

test('a group Move warns for what leaves this character; a copy does not', () => {
  const { library, set, other } = start()
  const on = file({ '2:3': 1 })
  const ask = { fromSetId: set.id, slots: ['2:3', '2:4'], toSetId: other.id, move: true }
  assert.equal(groupMoveHotbarText(library, ask, on), '1 hotbar button will change: page 2 button 3 was language and will be empty.')
  assert.equal(groupMoveHotbarText(library, { ...ask, move: false }, on), null)
  assert.equal(groupMoveHotbarText(library, { ...ask, toSetId: 'nobody' }, on), null)
})
