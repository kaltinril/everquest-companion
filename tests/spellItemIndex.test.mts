// WHICH ITEMS CARRY THIS SPELL (docs/plans/spell-upgrades-and-loadout.md §4.4 item 7) — the
// inversion of the planner's donor index, and the join key's rank rule.
//
// HAND-AUTHORED DONOR ROWS. The real inversion is exercised end to end by the corpus run at the
// bottom, which builds the actual index over the committed item corpus - but every RULE is pinned
// on rows written here, so a change to the corpus can break the measurement without also breaking
// the grammar and leaving nobody able to tell which moved.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PlannerDonor } from '../src/shared/planner/types'
import {
  buildSpellItemIndex,
  itemsForSpell,
  spellItemKey
} from '../src/main/planner/spellItemIndex'

/** A donor row with only the fields this file reads. */
function donor(over: Partial<PlannerDonor> & { name: string; effect: string }): PlannerDonor {
  return {
    key: over.name.toLowerCase(),
    slots: [],
    classes: [],
    socket: 'worn',
    tierRequired: 3,
    hasteLocked: false,
    quest: false,
    playerCrafted: false,
    ...over
  } as PlannerDonor
}

// =================================================================================================
// THE JOIN KEY
// =================================================================================================

test('the key folds case and whitespace and KEEPS the rank', () => {
  assert.equal(spellItemKey('Improved Healing III'), 'improved healing iii')
  assert.equal(spellItemKey('  Improved   Healing III  '), 'improved healing iii')
  // THE LOAD-BEARING HALF: the numeral is identity here, not noise. Folding it would make an item
  // carrying tier I answer for tier III, and the focus families are ranked BY NAME.
  assert.notEqual(spellItemKey('Improved Healing III'), spellItemKey('Improved Healing'))
  assert.notEqual(spellItemKey('Bind Sight II'), spellItemKey('Bind Sight'))
})

test("an apostrophe is identity here, not something to forgive", () => {
  // Unlike the SEARCH vocabulary's fold, which exists to forgive what a person types. Both corpora
  // came from one wiki with one set of punctuation, so widening this key could only be wrong.
  assert.notEqual(spellItemKey("Ghoulbane's Touch"), spellItemKey('Ghoulbanes Touch'))
})

// =================================================================================================
// THE INVERSION
// =================================================================================================

test('every item naming a spell is grouped under it', () => {
  const index = buildSpellItemIndex([
    donor({ name: 'Ghoulbane', effect: 'Nullify Undead', socket: 'proc' }),
    donor({ name: 'Aegis of Life', effect: 'Nullify Undead', socket: 'click' }),
    donor({ name: 'Cloak of Flames', effect: 'Flame Shield', socket: 'worn' })
  ])
  const undead = itemsForSpell(index, 'Nullify Undead')
  assert.deepEqual(
    undead.flatMap((g) => g.items.map((i) => i.name)),
    ['Aegis of Life', 'Ghoulbane']
  )
  assert.deepEqual(itemsForSpell(index, 'Flame Shield').flatMap((g) => g.items.map((i) => i.name)), [
    'Cloak of Flames'
  ])
})

test('groups arrive in socket order, and an empty group is not sent', () => {
  const index = buildSpellItemIndex([
    donor({ name: 'P', effect: 'X', socket: 'proc' }),
    donor({ name: 'W', effect: 'X', socket: 'worn' }),
    donor({ name: 'F', effect: 'X', socket: 'focus' })
  ])
  // Worn first (always on), then click, then focus, then proc - the order a player asks in. `click`
  // has no rows and is simply absent: a heading over nothing reads as a claim.
  assert.deepEqual(itemsForSpell(index, 'X').map((g) => g.socket), ['worn', 'focus', 'proc'])
})

test('items sort by name inside a group, so the page is stable across launches', () => {
  const index = buildSpellItemIndex([
    donor({ name: 'Zircon Band', effect: 'X' }),
    donor({ name: 'Amber Ring', effect: 'X' }),
    donor({ name: 'Malachite Loop', effect: 'X' })
  ])
  assert.deepEqual(itemsForSpell(index, 'X')[0].items.map((i) => i.name), [
    'Amber Ring',
    'Malachite Loop',
    'Zircon Band'
  ])
})

test('one item is listed once per socket, never twice', () => {
  // The donor index de-duplicates on (key, effect, socket), but one item can carry two ranks of a
  // focus family across two wiki pages. Listing it twice reads as a defect rather than as a fact.
  const index = buildSpellItemIndex([
    donor({ name: 'Mask', key: 'mask', effect: 'X', socket: 'focus' }),
    donor({ name: 'Mask', key: 'mask', effect: 'X', socket: 'focus' }),
    // …but the SAME item in a DIFFERENT socket is a different fact and survives.
    donor({ name: 'Mask', key: 'mask', effect: 'X', socket: 'worn' })
  ])
  const groups = itemsForSpell(index, 'X')
  assert.deepEqual(groups.map((g) => g.socket), ['worn', 'focus'])
  for (const g of groups) assert.equal(g.items.length, 1)
})

test('a spell nothing carries answers an EMPTY array, never undefined', () => {
  // "No item carries this" is the common answer and a real one, so the page draws its section and
  // says so - rather than having to distinguish silence from "not looked up".
  const index = buildSpellItemIndex([donor({ name: 'A', effect: 'X' })])
  assert.deepEqual(itemsForSpell(index, 'Nothing Carries This'), [])
})

test('a donor whose effect is blank is dropped rather than filed under an empty key', () => {
  const index = buildSpellItemIndex([donor({ name: 'A', effect: '' }), donor({ name: 'B', effect: 'X' })])
  assert.deepEqual(itemsForSpell(index, '').length, 0)
  assert.equal(itemsForSpell(index, 'X').length, 1)
})

test('the row is TRIMMED to what a page draws, and optionals stay absent', () => {
  const index = buildSpellItemIndex([
    donor({ name: 'Plain', effect: 'X' }),
    donor({ name: 'Detailed', effect: 'X', detail: 'Casting Time: Instant', iconId: 42 })
  ])
  // The group already arrives sorted by name, so `Detailed` leads `Plain`.
  const [detailed, plain] = itemsForSpell(index, 'X')[0].items
  assert.deepEqual(Object.keys(plain).sort(), ['effect', 'key', 'name', 'socket'])
  assert.equal(detailed.detail, 'Casting Time: Instant')
  assert.equal(detailed.iconId, 42)
})

// =================================================================================================
// THE REAL CORPUS
// =================================================================================================

test('the committed item corpus inverts, and a known spell finds its items', async () => {
  // Imported inside the test so the 8.6 MB corpus is only paid for by the suite that wants it -
  // the arrangement `effectIndex.ts`'s own header describes.
  const { plannerIndex, spellItemIndex } = await import('../src/main/planner/indexCurrent')
  const donors = plannerIndex().donors
  assert.ok(donors.length > 500, `donor corpus is ${String(donors.length)} rows`)
  const index = spellItemIndex()
  // Every group the index can produce is one of the four sockets, in order, and never empty.
  let withItems = 0
  for (const d of donors.slice(0, 400)) {
    const groups = itemsForSpell(index, d.effect)
    if (groups.length === 0) continue
    withItems++
    for (const g of groups) assert.ok(g.items.length > 0, `${d.effect}: empty ${g.socket} group`)
    assert.ok(groups.some((g) => g.items.some((i) => i.key === d.key)), d.effect)
  }
  assert.ok(withItems > 300, `only ${String(withItems)} of 400 donors found themselves`)
})
