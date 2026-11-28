// ============================================================================
// combatScopeOptions.test.mts — what the Combat selector may list in each scope (Task #60).
// ============================================================================
//
// Fight vs Overall is an explicit choice, and the selector's rows are the one place a scope decides
// what may be listed (`dashboardData.scopeOptions`). A zone session in the Fight list is how the
// meter used to wander into the zone aggregate; a fight id in the Overall list is the same mistake
// the other way round. These rules were checked through the real dropdown in
// tests/e2e/combat-dashboard.e2e.mts until 2026-11-27 (owner: values a pure function computes are
// unit-tested, the e2e proves the wiring); the spec still proves both scopes can be chosen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SegmentSummary, ZoneSessionSummary } from '../src/shared/combat'
import {
  LIVE_SELECTION,
  defaultSelection,
  fightScopeOptions,
  overallScopeOptions,
  scopeOptions
} from '../src/renderer/src/features/combat/dashboardData'

function seg(id: string, kind: SegmentSummary['kind'], name: string, startTs: number): SegmentSummary {
  return {
    id,
    kind,
    name,
    zone: 'Oasis',
    durationSec: 30,
    total: 900,
    dps: 30,
    activeSec: 25,
    activeDps: 36,
    startTs,
    active: kind === 'current',
    enemyHealTotal: 0
  }
}

function zs(id: string, zone: string, live: boolean): ZoneSessionSummary {
  return {
    id,
    zone,
    startTs: 1000,
    endTs: live ? 0 : 5000,
    total: 4000,
    dps: 40,
    live,
    ...(live ? {} : { closedBy: 'zone' as const })
  }
}

/** The shape a snapshot carries: newest first, the zone aggregate row among the segments. */
const SEGMENTS: SegmentSummary[] = [
  seg('e3', 'fight', 'a sand giant', 3000),
  seg('e2', 'fight', 'a spiderling', 2000),
  seg('zone', 'zone', 'Oasis', 0),
  seg('e1', 'fight', 'a madman', 1000)
]
const ZONES: ZoneSessionSummary[] = [zs('zone', 'Oasis', true), zs('zs2', 'Freeport', false), zs('zs1', 'Commonlands', false)]

const values = (o: { head: { value: string } | null; rest: { value: string }[] }): string[] => [
  ...(o.head ? [o.head.value] : []),
  ...o.rest.map((r) => r.value)
]
const isZoneValue = (v: string): boolean => v === 'zone' || /^zs\d+$/.test(v)

test('the Fight scope lists fights only — never the zone aggregate or a zone session', () => {
  const listed = values(scopeOptions('fight', SEGMENTS, ZONES))
  assert.ok(listed.length > 0)
  assert.ok(!listed.some(isZoneValue), listed.join(','))
  assert.deepEqual(listed, [LIVE_SELECTION, 'e2', 'e1'])
})

test('the Overall scope lists zone sessions only — never a fight id', () => {
  const listed = values(scopeOptions('overall', SEGMENTS, ZONES))
  assert.ok(listed.length > 0)
  assert.ok(listed.every(isZoneValue), listed.join(','))
  assert.deepEqual(listed, ['zone', 'zs2', 'zs1'])
  assert.deepEqual(values(overallScopeOptions(ZONES)), listed)
})

test('between pulls the head row is the LAST fight under the live sentinel, never labelled live', () => {
  const { head } = fightScopeOptions(SEGMENTS)
  assert.equal(head?.value, LIVE_SELECTION)
  assert.equal(head?.label, 'Last fight - a sand giant')
  assert.equal(head?.live, false)
  assert.ok(!/live/i.test(head?.label ?? ''))
})

test('with a fight open the head row is the current fight, live, and the history keeps the last one', () => {
  const open = [seg('e4', 'current', 'a desert madman', 4000), ...SEGMENTS]
  const o = fightScopeOptions(open)
  assert.equal(o.head?.label, 'Current fight (live)')
  assert.equal(o.head?.live, true)
  assert.deepEqual(
    o.rest.map((r) => r.value),
    ['e3', 'e2', 'e1']
  )
})

test('each scope starts on its own head: the live sentinel for Fight, the live zone for Overall', () => {
  assert.equal(defaultSelection('fight'), LIVE_SELECTION)
  assert.equal(defaultSelection('overall'), 'zone')
})
