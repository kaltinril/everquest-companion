// The Overview widget layout (shared/overviewLayout.ts): the stored list, read back safely, and
// the regions the page draws from it. Plan: docs/community/plans/2026-11-27-overview-widgets.md.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERVIEW_WIDGETS,
  defaultOverviewLayout,
  isDefaultOverviewLayout,
  moveOverviewWidget,
  normalizeOverviewLayout,
  overviewBlocks,
  overviewRegions,
  setOverviewWidgetOn,
  shownOverviewWidgets
} from '../src/shared/overviewLayout'

const TODAY = ['dps', 'leveling', 'target', 'dpsCurve', 'drops', 'kills']

test('nothing stored reads as the page before widgets: the six on in their order, the new four off', () => {
  for (const raw of [undefined, null, 42, 'x', {}, { widgets: 'no' }]) {
    const layout = normalizeOverviewLayout(raw)
    assert.deepEqual(shownOverviewWidgets(layout), TODAY)
    assert.equal(layout.widgets.length, OVERVIEW_WIDGETS.length)
    assert.ok(isDefaultOverviewLayout(layout))
  }
  const off = defaultOverviewLayout().widgets.filter((w) => !w.on).map((w) => w.id)
  assert.deepEqual(off, ['buffs', 'respawns', 'motes', 'coin'])
})

test('unknown ids, repeats and junk entries in the stored list are ignored', () => {
  const layout = normalizeOverviewLayout({
    widgets: [
      { id: 'coin', on: true },
      { id: 'retiredCard', on: true },
      null,
      'dps',
      { id: 'coin', on: false },
      { id: 'dps', on: 'yes' },
      { id: 'kills', on: true }
    ]
  })
  assert.deepEqual(shownOverviewWidgets(layout), ['coin', 'kills'])
  assert.equal(new Set(layout.widgets.map((w) => w.id)).size, OVERVIEW_WIDGETS.length)
  assert.deepEqual(layout.widgets.slice(0, 3), [
    { id: 'coin', on: true },
    { id: 'dps', on: false },
    { id: 'kills', on: true }
  ])
})

test('a card the stored list does not name (added in a later release) is appended unchecked', () => {
  // A layout saved by a build that knew only the original six, all on, reordered.
  const saved = { widgets: [...TODAY].reverse().map((id) => ({ id, on: true })) }
  const layout = normalizeOverviewLayout(saved)
  assert.deepEqual(shownOverviewWidgets(layout), [...TODAY].reverse())
  assert.deepEqual(
    layout.widgets.slice(TODAY.length),
    ['buffs', 'respawns', 'motes', 'coin'].map((id) => ({ id, on: false }))
  )
})

test('order: a stored order is kept, and a move swaps neighbours and stops at either end', () => {
  let layout = defaultOverviewLayout()
  layout = moveOverviewWidget(layout, 'target', -1)
  assert.deepEqual(shownOverviewWidgets(layout).slice(0, 3), ['dps', 'target', 'leveling'])
  assert.equal(moveOverviewWidget(layout, 'dps', -1), layout)
  assert.equal(moveOverviewWidget(layout, 'coin', 1), layout)
  layout = setOverviewWidgetOn(layout, 'coin', true)
  layout = moveOverviewWidget(layout, 'coin', -1)
  assert.deepEqual(layout.widgets.slice(-2).map((w) => w.id), ['coin', 'motes'])
  // Round trip: what is stored is what comes back.
  assert.deepEqual(normalizeOverviewLayout(JSON.parse(JSON.stringify(layout))), layout)
  assert.ok(!isDefaultOverviewLayout(layout))
})

test('regions: the default order is the three regions the page always had', () => {
  assert.deepEqual(overviewRegions(TODAY as never), [
    { kind: 'rank', ids: ['dps', 'leveling', 'target'] },
    { kind: 'wide', ids: ['dpsCurve'] },
    { kind: 'feed', ids: ['drops', 'kills'] }
  ])
})

test('regions: consecutive cards of a kind share one; a split run makes two; a wide card stands alone', () => {
  assert.deepEqual(overviewRegions(['coin', 'drops', 'motes', 'buffs', 'dpsCurve', 'dpsCurve' as never]), [
    { kind: 'rank', ids: ['coin'] },
    { kind: 'feed', ids: ['drops'] },
    { kind: 'rank', ids: ['motes', 'buffs'] },
    { kind: 'wide', ids: ['dpsCurve'] },
    { kind: 'wide', ids: ['dpsCurve'] }
  ])
})

test('hydration: live regions give way to ONE placeholder where the first was; feeds still draw', () => {
  assert.deepEqual(overviewBlocks(TODAY as never, true), [
    { kind: 'hydrating' },
    { kind: 'region', region: { kind: 'feed', ids: ['drops', 'kills'] } }
  ])
  assert.deepEqual(overviewBlocks(['kills', 'coin', 'drops', 'dpsCurve'], true), [
    { kind: 'region', region: { kind: 'feed', ids: ['kills'] } },
    { kind: 'hydrating' },
    { kind: 'region', region: { kind: 'feed', ids: ['drops'] } }
  ])
  assert.deepEqual(overviewBlocks(['drops'], true), [{ kind: 'region', region: { kind: 'feed', ids: ['drops'] } }])
  assert.equal(overviewBlocks(TODAY as never, false).length, 3)
  assert.deepEqual(overviewBlocks([], false), [])
})
