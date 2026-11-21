// A chosen group of buttons copied or moved to another loadout, a tag's macros swapped on and off,
// the used-buttons count, and where a macro sits (fork #11).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOTAL_BUTTONS,
  countWithTag,
  emptyButtons,
  filledOnPageSlots,
  groupTargets,
  heldSelection,
  macroIdsOnSlots,
  placeGroup,
  planGroup,
  planText,
  putTagOn,
  tagGroupStatus,
  tagMacros,
  tagStatusText,
  takeTagOff,
  usedButtons,
  usedText
} from '../src/shared/macros/groups'
import { ensureCharacterLayouts } from '../src/shared/macros/layouts'
import { emptyLibrary, updateMacro } from '../src/shared/macros/library'
import { setLoadoutLabel } from '../src/shared/macros/characters'
import { addSet, chosenSet, newSet, assignSlot, findSet } from '../src/shared/macros/sets'
import { fromChoices, holdersText, macroHolders, pickList } from '../src/shared/macros/where'
import type { CharacterFileMacros, GameMacro, MacroLibrary, MacroSet, Mint } from '../src/shared/macros/types'

function testMint(): Mint {
  let n = 0
  return { id: () => `m${String(++n)}`, now: () => 1000 }
}

const macro = (page: number, button: number, name: string): GameMacro => ({ page, button, name, color: 0, lines: [`/say ${name}`] })

function file(character: string, macros: GameMacro[], loadout = 1): CharacterFileMacros {
  return { file: `${character}_teek_LO${String(loadout)}.ini`, character, server: 'teek', loadout, macros, mtimeMs: 0, stamp: 'x', backups: { original: null, last: null } }
}

const KAL = file('Kal', [macro(2, 1, 'One'), macro(2, 3, 'Two'), macro(3, 1, 'Three')])
const ZED = file('Zed', [macro(2, 1, 'Held'), macro(2, 2, 'Keep')])
const ZED2 = file('Zed', [], 2)
const FILES = [KAL, ZED, ZED2]

function start(): MacroLibrary {
  return ensureCharacterLayouts(emptyLibrary(), FILES, testMint()).library
}

const own = (library: MacroLibrary, key: string): MacroSet => {
  const set = chosenSet(library, key)
  assert.ok(set)
  return set
}

const nameAt = (library: MacroLibrary, set: MacroSet, slot: string): string | undefined => {
  const live = findSet(library, set.id)
  assert.ok(live)
  return library.macros.find((m) => m.id === live.slots[slot])?.name
}

/** A layout with every normal button filled except `free` of them at the end. */
function nearlyFull(library: MacroLibrary, set: MacroSet, free: number): MacroLibrary {
  const filler = library.macros[0].id
  return emptyButtons(library, set)
    .slice(0, -free || undefined)
    .reduce((next, slot) => assignSlot(next, set.id, slot, filler), library)
}

test('the count of used buttons, from the limits', () => {
  const lib = start()
  assert.equal(TOTAL_BUTTONS, 108)
  assert.equal(usedButtons(lib, own(lib, 'kal_teek_lo1')), 3)
  assert.equal(usedText(14), '14 of 108 buttons used')
})

test('a group copied lands on the first empty buttons, in button order, across pages, and replaces nothing', () => {
  const lib = start()
  const [kal, zed] = [own(lib, 'kal_teek_lo1'), own(lib, 'zed_teek_lo1')]
  const next = placeGroup(lib, { fromSetId: kal.id, slots: ['3:1', '2:1', '2:3'], toSetId: zed.id, move: false })
  assert.equal(nameAt(next, zed, '2:1'), 'Held')
  assert.equal(nameAt(next, zed, '2:2'), 'Keep')
  assert.deepEqual(['2:3', '2:4', '2:5'].map((s) => nameAt(next, zed, s)), ['One', 'Two', 'Three'])
  assert.equal(usedButtons(next, own(next, 'kal_teek_lo1')), 3)
  assert.equal(next.macros.length, lib.macros.length)
})

test('not enough room: the plan says so and only those that fit land', () => {
  const lib = start()
  const [kal, zed] = [own(lib, 'kal_teek_lo1'), own(lib, 'zed_teek_lo1')]
  const full = nearlyFull(lib, zed, 2)
  const tight = own(full, 'zed_teek_lo1')
  const plan = planGroup(full, kal, ['2:1', '2:3', '3:1'], tight)
  assert.deepEqual([plan.wanted, plan.empty, plan.landing.length, plan.left], [3, 2, 2, 1])
  assert.equal(planText(plan), 'Room for 2 of 3. The other one stays where it is.')
  const next = placeGroup(full, { fromSetId: kal.id, slots: ['2:1', '2:3', '3:1'], toSetId: tight.id, move: true })
  assert.equal(usedButtons(next, own(next, 'zed_teek_lo1')), TOTAL_BUTTONS)
  assert.deepEqual(Object.keys(own(next, 'kal_teek_lo1').slots), ['3:1'])
})

test('no room at all changes nothing', () => {
  const lib = start()
  const kal = own(lib, 'kal_teek_lo1')
  const full = nearlyFull(lib, own(lib, 'zed_teek_lo1'), 0)
  const zed = own(full, 'zed_teek_lo1')
  assert.equal(planText(planGroup(full, kal, ['2:1'], zed)), 'No empty buttons on this loadout.')
  assert.equal(placeGroup(full, { fromSetId: kal.id, slots: ['2:1'], toSetId: zed.id, move: true }), full)
})

test('a move takes the group off the source; the macros stay shared library entries', () => {
  const lib = start()
  const [kal, zed2] = [own(lib, 'kal_teek_lo1'), own(lib, 'zed_teek_lo2')]
  const next = placeGroup(lib, { fromSetId: kal.id, slots: ['2:1', '3:1'], toSetId: zed2.id, move: true })
  assert.deepEqual(Object.keys(own(next, 'kal_teek_lo1').slots), ['2:3'])
  assert.equal(own(next, 'zed_teek_lo2').slots['2:1'], kal.slots['2:1'])
  assert.equal(own(next, 'zed_teek_lo2').slots['2:2'], kal.slots['3:1'])
  assert.equal(next.macros.length, lib.macros.length)
})

test('a picked empty or repeated slot does not count', () => {
  const lib = start()
  const kal = own(lib, 'kal_teek_lo1')
  assert.deepEqual(heldSelection(lib, kal, ['2:2', '3:1', '2:1', '2:1', 'x']), ['2:1', '3:1'])
  assert.deepEqual(filledOnPageSlots(lib, kal, 2), ['2:1', '2:3'])
})

test('targets are every other loadout, grouped by character, with their names and room', () => {
  const lib = setLoadoutLabel(start(), ZED2, 'Tank')
  const groups = groupTargets(lib, FILES, 'zed_teek_lo1')
  assert.deepEqual(groups.map((g) => g.character), ['Kal', 'Zed'])
  assert.deepEqual(groups[1].targets.map((t) => [t.label, t.used, t.empty]), [['Loadout 2: Tank', 0, 108]])
})

test('a tag is added to and taken off many macros at once', () => {
  const lib = start()
  const kal = own(lib, 'kal_teek_lo1')
  const ids = macroIdsOnSlots(lib, kal, ['2:1', '2:3'])
  const on = tagMacros(lib, { macroIds: ids, tag: 'Guk Rares', on: true }, 5)
  assert.equal(countWithTag(on, ids, 'guk rares'), 2)
  assert.ok(on.tags.includes('guk rares'))
  assert.equal(tagMacros(on, { macroIds: ids, tag: 'guk rares', on: true }, 6), on)
  assert.equal(countWithTag(tagMacros(on, { macroIds: ids, tag: 'guk rares', on: false }, 7), ids, 'guk rares'), 0)
  assert.equal(tagMacros(lib, { macroIds: ids, tag: '  ', on: true }, 5), lib)
})

test('a tag group goes on empty buttons in number order, skipping those there, and comes off with the macros kept', () => {
  let lib = start()
  const kal = own(lib, 'kal_teek_lo1')
  const named = (id: string, name: string, l: MacroLibrary): MacroLibrary => updateMacro(l, id, { name, tags: ['way'] }, 5)
  lib = named(kal.slots['2:1'], 'Way 10', lib)
  lib = named(kal.slots['2:3'], 'Way 2', lib)
  const zed2 = own(lib, 'zed_teek_lo2')
  assert.equal(tagStatusText(tagGroupStatus(lib, zed2, 'way')), '2 macros have this tag, 0 on this character. The other 2 fit on its 108 empty buttons.')
  const put = putTagOn(lib, zed2.id, 'way')
  assert.deepEqual(['2:1', '2:2'].map((s) => nameAt(put, zed2, s)), ['Way 2', 'Way 10'])
  assert.deepEqual(Object.keys(own(putTagOn(put, zed2.id, 'way'), 'zed_teek_lo2').slots), ['2:1', '2:2'])
  const off = takeTagOff(put, zed2.id, 'way')
  assert.deepEqual(own(off, 'zed_teek_lo2').slots, {})
  assert.equal(off.macros.length, put.macros.length)
  assert.equal(usedButtons(off, own(off, 'kal_teek_lo1')), 3)
})

test('where a macro sits: the short text, a saved layout, and not on a button', () => {
  let lib = start()
  const kal = own(lib, 'kal_teek_lo1')
  const shared = kal.slots['2:1']
  lib = assignSlot(lib, own(lib, 'zed_teek_lo1').id, '2:9', shared)
  lib = assignSlot(lib, own(lib, 'zed_teek_lo2').id, '2:1', shared)
  const saved = { ...newSet(testMint(), 'Raid'), id: 'raid', slots: { '2:1': shared } }
  lib = addSet(lib, saved)
  const index = macroHolders(lib, FILES)
  assert.equal(holdersText(index, shared), 'Kal, Zed L1 +2')
  assert.deepEqual(index.get(shared)?.map((h) => h.short), ['Kal', 'Zed L1', 'Zed L2', 'layout Raid'])
  assert.equal(holdersText(index, 'nobody'), 'not on a button')
})

test('the From choices and the search over where a macro sits', () => {
  const lib = setLoadoutLabel(start(), ZED2, 'Tank')
  const withShared = assignSlot(lib, own(lib, 'zed_teek_lo2').id, '2:1', own(lib, 'kal_teek_lo1').slots['2:3'])
  const holders = macroHolders(withShared, FILES)
  assert.deepEqual(fromChoices(withShared, FILES).map((c) => c.label), ['Kal', 'Zed, all loadouts', 'Zed, Loadout 1', 'Zed, Loadout 2: Tank'])
  const names = (query: string, from: string): string[] => pickList(withShared.macros, { query, tags: [], from, holders }).map((m) => m.name)
  assert.deepEqual(names('', 'file:zed_teek_lo2'), ['Two'])
  assert.deepEqual(names('', 'char:zed_teek'), ['Two', 'Held', 'Keep'])
  assert.deepEqual(names('tank', ''), ['Two'])
  assert.deepEqual(names('kal three', ''), ['Three'])
})
