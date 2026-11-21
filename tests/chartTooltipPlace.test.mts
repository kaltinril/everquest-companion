// The shared chart tooltip's placement on one axis (`lib/chartTooltipPlace.ts`). The card is
// drawn on <body>, fixed to the window, so `limit` is the window's width or height.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { place } from '../src/renderer/src/lib/chartTooltipPlace'

test('a card that fits after the cursor sits one offset after it', () => {
  assert.equal(place(100, 80, 10, 900), 110)
})

test('a card that would pass the window edge flips to the other side of the cursor', () => {
  // 850 + 10 + 80 = 940 > 900, so it ends one offset before the cursor.
  assert.equal(place(850, 80, 10, 900), 760)
})

test('a card that ends exactly on the edge is not flipped', () => {
  assert.equal(place(810, 80, 10, 900), 820)
})

test('a card too big for either side starts at 0, never off screen', () => {
  assert.equal(place(50, 400, 12, 300), 0)
})

test('a card not measured yet (size 0) is never flipped', () => {
  assert.equal(place(895, 0, 10, 900), 905)
})

test('the readout below a clipped plot is placed by the window, not by the plot', () => {
  // The reported case: a plot 118 px tall inside a body showing 86 px of it, the window 700 tall.
  // The cursor is at window y 280 and the card is 90 tall: it goes below the cursor, past the
  // plot's own end, because the window has room.
  assert.equal(place(280, 90, 12, 700), 292)
})
