// THE CHARACTER SHEET'S PER-SLOT EXALTATION JOIN (src/renderer/src/features/character/
// slotSockets.ts; owner ask 2026-08-23 — "for each slot which exist and which I want to go for").
//
// WHAT IS PINNED: the socket line reads the wiki's own unlock table and never Ornamentation; an
// UNSTATED tier draws NO line (the dump said nothing, so the grid says nothing — never "all
// locked"); a wish of EITHER kind places at every slot its corpus row states, resolved the way the
// Wish list tab resolves it (donor corpus first, then the gear index); a wish neither index carries
// is a silence, not an error; the cell join answers with the planner slot for a client token and
// null for the two the wiki cannot name; and of a PAIR of cells sharing one slot (two ears, two
// wrists, two fingers) only the first carries the slot's wishes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cellsShowingWishes,
  slotOfCell,
  socketStates,
  wishesBySlot
} from '../src/renderer/src/features/character/slotSockets'
import { SHEET_SLOTS } from '../src/shared/characterSheet'
import type { GearRow } from '../src/shared/planner/gear'
import type { WishEntry } from '../src/shared/planner/wishlist'
import { indexDonors, type DonorRow } from '../src/renderer/src/features/planner/plannerData'
import { indexGear, type WishIndices } from '../src/renderer/src/features/wishlist/wishFarm'

function gearRow(key: string, name: string, slots: GearRow['slots']): GearRow {
  return {
    key,
    name,
    searchKey: name.toLowerCase(),
    slots,
    classes: [],
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: {},
    effects: []
  }
}

function donorRow(key: string, name: string, effect: string, slots: DonorRow['slots']): DonorRow {
  return {
    key,
    name,
    searchKey: `${name} ${effect}`.toLowerCase(),
    slots,
    classes: ['WAR', 'ROG'],
    effect,
    socket: 'click',
    tierRequired: 2,
    hasteLocked: false,
    quest: false,
    playerCrafted: false,
    eraTag: 'Classic'
  }
}

function donorWish(itemKey: string, name: string, effect: string): WishEntry {
  return { itemKey, name, kind: 'donor', effect, socket: 'click', addedAt: 0, source: 'user' }
}

function gearWish(itemKey: string, name: string): WishEntry {
  return { itemKey, name, kind: 'gear', addedAt: 0, source: 'user' }
}

function indices(donors: DonorRow[] = [], gear: GearRow[] = []): WishIndices {
  return { donors: indexDonors(donors), gear: indexGear(gear) }
}

test('the socket line is the wiki unlock table at this tier — no Ornamentation, and no line for an unstated tier', () => {
  // +2: Focus and Click open, Worn and Proc still locked, each saying the tier that opens it.
  assert.deepEqual(
    socketStates(2).map((s) => [s.type, s.unlocksAt, s.unlocked]),
    [
      ['Focus', 1, true],
      ['Click', 2, true],
      ['Worn', 3, false],
      ['Proc', 4, false]
    ]
  )
  // +4 opens all four; a stated base opens none but still draws the ladder.
  assert.equal(socketStates(4).every((s) => s.unlocked), true)
  assert.equal(socketStates(0).length, 4)
  assert.equal(socketStates(0).some((s) => s.unlocked), false)
  // An UNSTATED tier draws NO line: the dump's name carried no ` +N`, and "all locked" is a claim
  // the dump never made.
  assert.deepEqual(socketStates(undefined), [])
})

test('a wish of either kind places at every slot its corpus row states, resolved as the Wish list tab resolves it', () => {
  const index = indices(
    [
      donorRow('circlet of shadow', 'Circlet of Shadow', 'Gather Shadows', ['HEAD']),
      // The donor corpus knows this earring under ANOTHER effect only; the gear index knows the
      // item. wishFarm's order: the (key, effect) row first, then the gear row, so this wish
      // lands where the gear index says and states the tier its own socket implies.
      donorRow('band of two homes', 'Band of Two Homes', 'Some Other Effect', ['WRIST'])
    ],
    [
      gearRow('band of two homes', 'Band of Two Homes', ['FINGER', 'NECK']),
      gearRow('plate of the sentinel', 'Plate of the Sentinel', ['CHEST'])
    ]
  )
  const placed = wishesBySlot(
    [
      donorWish('circlet of shadow', 'circlet of shadow', 'Gather Shadows'),
      donorWish('band of two homes', 'Band of Two Homes', 'Levitate'),
      // The gear wish: "I want this breastplate" is exactly what the chest cell should say.
      gearWish('plate of the sentinel', 'Plate of the Sentinel'),
      // A wish neither index carries: a silence, never a guess.
      donorWish('lost trinket', 'Lost Trinket', 'Alacrity')
    ],
    index
  )
  // The donor row answers: its slots, its own tier, and the CORPUS spelling of the name.
  assert.deepEqual(placed.get('HEAD'), [
    { kind: 'donor', name: 'Circlet of Shadow', effect: 'Gather Shadows', tierRequired: 2 }
  ])
  // The two-slot fallthrough is offered at BOTH homes — an earring raises both ears, a ring both
  // fingers — and never at the wrist the unrelated donor row named.
  assert.deepEqual(placed.get('FINGER'), [
    { kind: 'donor', name: 'Band of Two Homes', effect: 'Levitate', tierRequired: 2 }
  ])
  assert.deepEqual(placed.get('NECK'), placed.get('FINGER'))
  assert.equal(placed.has('WRIST'), false, 'the donor corpus row for a different effect does not place')
  // The gear wish places as a GEAR chip: item name, no effect, no merge tier.
  assert.deepEqual(placed.get('CHEST'), [{ kind: 'gear', name: 'Plate of the Sentinel' }])
  assert.equal(placed.size, 4)
})

test('a sheet cell answers with the planner slot for its client token, and null where the wiki has no name', () => {
  assert.equal(slotOfCell('Hands'), 'HANDS')
  assert.equal(slotOfCell('Primary'), 'PRIMARY')
  assert.equal(slotOfCell('Fingers'), 'FINGER')
  // The two tokens inventorySlots.ts deliberately maps to null, and anything outside the vocabulary.
  assert.equal(slotOfCell('Any Slot'), null)
  assert.equal(slotOfCell('Held'), null)
  assert.equal(slotOfCell('Charm Slot From The Future'), null)
})

test('of a pair of cells sharing one slot, only the FIRST carries the wishes — measured on the real sheet', () => {
  const cells = SHEET_SLOTS.map((s) => ({ id: s.id, location: s.token }))
  const showing = cellsShowingWishes(cells)
  // The second ear, wrist and finger defer to the first; the cells with no planner slot never show.
  for (const id of ['ear2', 'wrist2', 'finger2', 'held', 'any1', 'any2']) {
    assert.equal(showing.has(id), false, `${id} carries no wishes`)
  }
  for (const id of ['ear1', 'wrist1', 'finger1', 'head', 'primary', 'ammo']) {
    assert.equal(showing.has(id), true, `${id} carries its slot's wishes`)
  }
  // Eighteen cells: the twenty-four, less the three seconds and the three the wiki cannot name.
  assert.equal(showing.size, 18)
  // Order is the sheet's, not the pair's label: whichever cell of a slot comes first wins.
  assert.deepEqual([...cellsShowingWishes([...cells].reverse())].filter((id) => id.startsWith('ear')), ['ear2'])
})
