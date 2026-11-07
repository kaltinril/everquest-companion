// lootSlice.test.mts — the ledger cut that runs only when the cut could differ (shared/lootSlice.ts),
// and the slice identity hold it pairs with (timeslice.sameTimeslice).
//
// The claim under test is soundness, not speed: the effective range may move LESS often than the
// slice's own range, never admit a different set of rows. So every case here compares the clamped
// key's answer against the plain `inSlice` filter over the same rows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LootEvent } from '../src/shared/types'
import { inSlice, sameTimeslice, type Timeslice } from '../src/shared/timeslice'
import { effectiveRange, ledgerSpan, sliceCoversLedger, sliceLedger } from '../src/shared/lootSlice'

const MIN = 60_000
const T = 1_700_000_000_000

function ev(ts: number, zone: string, item = 'Rusty Dagger'): LootEvent {
  return { ts, item, zone, count: 1, source: 'mob', raw: '' } as unknown as LootEvent
}

function slice(t0: number, t1: number, zone: { key: string; exact: string | null } | null = null): Timeslice {
  return {
    id: 'custom',
    label: 'Custom',
    caption: 'the custom range',
    range: { t0, t1 },
    zoneKey: zone?.key ?? null,
    zoneName: zone ? 'Befallen' : null,
    zoneScope: zone?.exact ? 'exactTier' : 'allTiers',
    zoneExactKey: zone?.exact ?? null,
    zoneCaption: zone ? 'Befallen, every tier' : null
  }
}

const ledger = [ev(T, 'Befallen'), ev(T + 5 * MIN, 'Befallen'), ev(T + 20 * MIN, 'Qeynos Hills'), ev(T + 60 * MIN, 'Befallen')]

test('the span is the ledger’s own first and last instant, and null for an empty ledger', () => {
  assert.deepEqual(ledgerSpan(ledger), { lo: T, hi: T + 60 * MIN })
  assert.equal(ledgerSpan([]), null)
  // Order is not relied on: a merged archive can interleave.
  assert.deepEqual(ledgerSpan([ledger[3], ledger[0], ledger[2]]), { lo: T, hi: T + 60 * MIN })
})

test('a range past the rows clamps to them, so a top end that follows lastTs holds the key still', () => {
  const span = ledgerSpan(ledger)
  const a = effectiveRange(slice(T - 10 * MIN, T + 90 * MIN + 1), span)
  const b = effectiveRange(slice(T - 10 * MIN, T + 95 * MIN + 1), span)
  assert.deepEqual(a, b, 'two ranges that admit the same rows have the same effective key')
  assert.deepEqual(a, { t0: T, t1: T + 60 * MIN + 1 })
  // A range INSIDE the rows is untouched: its instants are the membership.
  assert.deepEqual(effectiveRange(slice(T + 4 * MIN, T + 30 * MIN), span), { t0: T + 4 * MIN, t1: T + 30 * MIN })
  // Never inverted: a range wholly before the rows collapses to an empty one.
  const before = effectiveRange(slice(T - 10 * MIN, T - 5 * MIN), span)
  assert.ok(before.t1 >= before.t0)
  assert.deepEqual(effectiveRange(slice(T, T + 1), null), { t0: 0, t1: 0 })
})

test('a covering range hands the ledger back by identity; any narrower one copies', () => {
  const span = ledgerSpan(ledger)
  const whole = slice(T, T + 60 * MIN + 1)
  assert.equal(sliceCoversLedger(whole, span), true)
  assert.equal(sliceLedger(ledger, whole, span), ledger, 'the very same array')
  // The top end is exclusive: a range ending AT the last row does not cover it.
  const short = slice(T, T + 60 * MIN)
  assert.equal(sliceCoversLedger(short, span), false)
  assert.notEqual(sliceLedger(ledger, short, span), ledger)
  // A zone restriction never covers, even over the whole span.
  const zoned = slice(T, T + 60 * MIN + 1, { key: 'befallen', exact: null })
  assert.equal(sliceCoversLedger(zoned, span), false)
  // An empty ledger is covered by anything (nothing to cut).
  assert.equal(sliceLedger([], short, null).length, 0)
})

test('the cut admits exactly what inSlice admits, row for row, for every shape of slice', () => {
  const span = ledgerSpan(ledger)
  const shapes = [
    slice(T - MIN, T + 61 * MIN),
    slice(T + 5 * MIN, T + 20 * MIN),
    slice(T + 5 * MIN, T + 20 * MIN + 1),
    slice(T, T + 61 * MIN, { key: 'befallen', exact: null }),
    slice(T, T + 61 * MIN, { key: 'befallen', exact: 'befallen' }),
    slice(T + 70 * MIN, T + 80 * MIN)
  ]
  for (const s of shapes) {
    const expected = ledger.filter((e) => inSlice(s, e.ts, e.zone))
    assert.deepEqual(sliceLedger(ledger, s, span), expected)
  }
})

test('sameTimeslice is every field, the range’s two instants included', () => {
  const a = slice(T, T + MIN)
  assert.equal(sameTimeslice(a, slice(T, T + MIN)), true)
  assert.equal(sameTimeslice(a, slice(T, T + MIN + 1)), false)
  assert.equal(sameTimeslice(a, slice(T + 1, T + MIN)), false)
  assert.equal(sameTimeslice(a, slice(T, T + MIN, { key: 'befallen', exact: null })), false)
  assert.equal(sameTimeslice(a, { ...slice(T, T + MIN), caption: 'session 2' }), false)
})
