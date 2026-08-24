// THE CHARACTER SHEET'S PER-SLOT EXALTATION JOIN (src/renderer/src/features/character/
// slotSockets.ts; owner ask 2026-08-23 — "for each slot which exist and which I want to go for").
//
// WHAT IS PINNED: the socket line reads the wiki's own unlock table and never Ornamentation; an
// absent tier reads as BASE (the JOS-416 floor — understate, never promise); a donor wish places
// at every slot its corpus row states and a gear wish places nowhere; a wish the corpus cannot
// resolve is a silence, not an error; the cell join answers with the planner slot for a client
// token and null for the two the wiki cannot name.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotOfCell, socketStates, wishesBySlot } from '../src/renderer/src/features/character/slotSockets'
import type { GearRow } from '../src/shared/planner/gear'
import type { WishEntry } from '../src/shared/planner/wishlist'

function row(key: string, slots: GearRow['slots']): GearRow {
  return {
    key,
    name: key,
    searchKey: key,
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

function wish(over: Partial<WishEntry> & Pick<WishEntry, 'itemKey' | 'name' | 'kind'>): WishEntry {
  return { addedAt: 0, source: 'browse', ...over } as WishEntry
}

test('the socket line is the wiki unlock table at this tier — no Ornamentation, base floor for an unstated tier', () => {
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
  // +4 opens all four; base opens none.
  assert.equal(socketStates(4).every((s) => s.unlocked), true)
  assert.equal(socketStates(0).some((s) => s.unlocked), false)
  // An unstated tier reads as BASE — the floor direction: never promise a socket.
  assert.deepEqual(socketStates(undefined), socketStates(0))
})

test('a donor wish places at every slot its corpus row states; a gear wish places nowhere', () => {
  const rows = new Map([
    ['circlet of shadow', row('circlet of shadow', ['HEAD'])],
    ['band of two homes', row('band of two homes', ['FINGER', 'NECK'])],
    ['plate of the sentinel', row('plate of the sentinel', ['CHEST'])]
  ])
  const placed = wishesBySlot(
    [
      wish({ itemKey: 'circlet of shadow', name: 'Circlet of Shadow', kind: 'donor', effect: 'Gather Shadows', socket: 'click' }),
      wish({ itemKey: 'band of two homes', name: 'Band of Two Homes', kind: 'donor', effect: 'Levitate', socket: 'worn' }),
      // The gear wish: wanting the breastplate is a loot errand, not a socket answer.
      wish({ itemKey: 'plate of the sentinel', name: 'Plate of the Sentinel', kind: 'gear' }),
      // A donor the corpus no longer carries: a silence, never a guess.
      wish({ itemKey: 'lost trinket', name: 'Lost Trinket', kind: 'donor', effect: 'Alacrity', socket: 'focus' })
    ],
    rows
  )
  assert.deepEqual(placed.get('HEAD'), [{ name: 'Circlet of Shadow', effect: 'Gather Shadows', tierRequired: 2 }])
  // The two-slot donor is offered at BOTH homes — an earring raises both ears, a ring both fingers.
  assert.deepEqual(placed.get('FINGER'), [{ name: 'Band of Two Homes', effect: 'Levitate', tierRequired: 3 }])
  assert.deepEqual(placed.get('NECK'), placed.get('FINGER'))
  assert.equal(placed.has('CHEST'), false, 'the gear wish placed nowhere')
  assert.equal(placed.size, 3)
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
