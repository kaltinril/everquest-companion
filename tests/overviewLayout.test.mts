// The Overview widget layout (shared/overviewLayout.ts): the stored list, read back safely and
// migrated from Phase 1, the widths and their clamps, the drop reorder, the responsive columns,
// and the blocks the page draws. Plan: docs/community/plans/2026-11-27-overview-widgets.md.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERVIEW_FOUR_COLUMNS_MIN_PX,
  OVERVIEW_LAYOUT_VERSION,
  OVERVIEW_TWO_COLUMNS_MIN_PX,
  OVERVIEW_WIDGETS,
  clampOverviewWidth,
  defaultOverviewLayout,
  isDefaultOverviewLayout,
  moveOverviewWidget,
  moveOverviewWidgetAmongShown,
  moveOverviewWidgetTo,
  normalizeOverviewLayout,
  overviewBlocks,
  overviewColumnsFor,
  overviewDisplaySpan,
  overviewDropChanges,
  overviewDropSlot,
  setOverviewWidgetOn,
  setOverviewWidgetWidth,
  shownOverviewWidgets,
  type OverviewLayout,
  type OverviewWidgetId
} from '../src/shared/overviewLayout'

const TODAY = ['dps', 'leveling', 'target', 'dpsCurve', 'drops', 'kills']
const DEFAULT_WIDTHS = { dps: 1, leveling: 2, target: 1, dpsCurve: 4, drops: 2, kills: 2, buffs: 1, respawns: 1, motes: 1, coin: 1 }

function widths(layout: OverviewLayout): Record<string, number> {
  return Object.fromEntries(layout.widgets.map((w) => [w.id, w.width]))
}
function order(layout: OverviewLayout): string[] {
  return layout.widgets.map((w) => w.id)
}

test('nothing stored reads as the page before widgets: the six on in their order, the new four off', () => {
  for (const raw of [undefined, null, 42, 'x', {}, { widgets: 'no' }]) {
    const layout = normalizeOverviewLayout(raw)
    assert.deepEqual(shownOverviewWidgets(layout), TODAY)
    assert.equal(layout.widgets.length, OVERVIEW_WIDGETS.length)
    assert.equal(layout.version, OVERVIEW_LAYOUT_VERSION)
    assert.ok(isDefaultOverviewLayout(layout))
  }
  const off = defaultOverviewLayout().widgets.filter((w) => !w.on).map((w) => w.id)
  assert.deepEqual(off, ['buffs', 'respawns', 'motes', 'coin'])
})

test('default widths: Damage 1, Leveling 2, Target 1, the curve 4, the feeds 2, every new card 1', () => {
  assert.deepEqual(widths(defaultOverviewLayout()), DEFAULT_WIDTHS)
})

test('MIGRATION: a Phase 1 layout (no version, no widths) keeps its on/off and order and takes the default widths', () => {
  const phase1 = {
    widgets: [
      { id: 'coin', on: true },
      { id: 'kills', on: true },
      { id: 'dps', on: false },
      { id: 'motes', on: true },
      { id: 'dpsCurve', on: true }
    ]
  }
  const layout = normalizeOverviewLayout(phase1)
  assert.equal(layout.version, 2)
  assert.deepEqual(order(layout).slice(0, 5), ['coin', 'kills', 'dps', 'motes', 'dpsCurve'])
  assert.deepEqual(shownOverviewWidgets(layout), ['coin', 'kills', 'motes', 'dpsCurve'])
  assert.deepEqual(widths(layout), DEFAULT_WIDTHS)
  // A stray width on a version-1 entry is not a width that layout ever chose: it is ignored.
  assert.equal(normalizeOverviewLayout({ widgets: [{ id: 'coin', on: true, width: 3 }] }).widgets[0].width, 1)
})

test('version 2 reads each stored width through the clamp; junk widths read as the default', () => {
  const layout = normalizeOverviewLayout({
    version: 2,
    widgets: [
      { id: 'motes', on: true, width: 3 },
      { id: 'coin', on: true, width: 9 },
      { id: 'dpsCurve', on: true, width: 1 },
      { id: 'drops', on: true, width: 'wide' },
      { id: 'kills', on: true, width: 2.6 },
      { id: 'target', on: true, width: -4 }
    ]
  })
  const w = widths(layout)
  assert.equal(w.motes, 3)
  assert.equal(w.coin, 4, 'above 4 clamps to 4')
  assert.equal(w.dpsCurve, 2, 'the curve never goes below its minimum of 2')
  assert.equal(w.drops, 2, 'not a number: the default')
  assert.equal(w.kills, 3, 'rounded to a whole column')
  assert.equal(w.target, 1)
  // A later version is read the same way (best effort, never wiped).
  assert.equal(normalizeOverviewLayout({ version: 3, widgets: [{ id: 'motes', on: true, width: 4 }] }).widgets[0].width, 4)
})

test('clampOverviewWidth and setOverviewWidgetWidth', () => {
  assert.equal(clampOverviewWidth('dps', 0), 1)
  assert.equal(clampOverviewWidth('dpsCurve', 1), 2)
  assert.equal(clampOverviewWidth('dpsCurve', Number.NaN), 4)
  assert.equal(clampOverviewWidth('coin', undefined), 1)
  let layout = setOverviewWidgetWidth(defaultOverviewLayout(), 'leveling', 4)
  assert.equal(widths(layout).leveling, 4)
  assert.ok(!isDefaultOverviewLayout(layout), 'a width change is a customized page')
  layout = setOverviewWidgetWidth(layout, 'dpsCurve', 1)
  assert.equal(widths(layout).dpsCurve, 2)
  // Round trip: what is stored is what comes back.
  assert.deepEqual(normalizeOverviewLayout(JSON.parse(JSON.stringify(layout))), layout)
})

test('unknown ids, repeats and junk entries in the stored list are ignored', () => {
  const layout = normalizeOverviewLayout({
    version: 2,
    widgets: [
      { id: 'coin', on: true, width: 2 },
      { id: 'retiredCard', on: true },
      null,
      'dps',
      { id: 'coin', on: false },
      { id: 'dps', on: 'yes' },
      { id: 'kills', on: true }
    ]
  })
  assert.deepEqual(shownOverviewWidgets(layout), ['coin', 'kills'])
  assert.equal(new Set(order(layout)).size, OVERVIEW_WIDGETS.length)
  assert.deepEqual(layout.widgets.slice(0, 3), [
    { id: 'coin', on: true, width: 2 },
    { id: 'dps', on: false, width: 1 },
    { id: 'kills', on: true, width: 2 }
  ])
})

test('a card the stored list does not name (added in a later release) is appended unchecked, at its default width', () => {
  const saved = { widgets: [...TODAY].reverse().map((id) => ({ id, on: true })) }
  const layout = normalizeOverviewLayout(saved)
  assert.deepEqual(shownOverviewWidgets(layout), [...TODAY].reverse())
  assert.deepEqual(
    layout.widgets.slice(TODAY.length),
    ['buffs', 'respawns', 'motes', 'coin'].map((id) => ({ id, on: false, width: 1 }))
  )
})

test('order: the checklist arrows swap neighbours in the full list and stop at either end', () => {
  let layout = defaultOverviewLayout()
  layout = moveOverviewWidget(layout, 'target', -1)
  assert.deepEqual(shownOverviewWidgets(layout).slice(0, 3), ['dps', 'target', 'leveling'])
  assert.equal(moveOverviewWidget(layout, 'dps', -1), layout)
  assert.equal(moveOverviewWidget(layout, 'coin', 1), layout)
  layout = setOverviewWidgetOn(layout, 'coin', true)
  layout = moveOverviewWidget(layout, 'coin', -1)
  assert.deepEqual(order(layout).slice(-2), ['coin', 'motes'])
  assert.deepEqual(normalizeOverviewLayout(JSON.parse(JSON.stringify(layout))), layout)
  assert.ok(!isDefaultOverviewLayout(layout))
})

test('THE DROP: a card taken out and put before or after another; the cards that are off keep their places', () => {
  const d = defaultOverviewLayout()
  const a = moveOverviewWidgetTo(d, 'kills', { id: 'dps', side: 'before' })
  assert.deepEqual(order(a).slice(0, 7), ['kills', 'dps', 'leveling', 'target', 'dpsCurve', 'drops', 'buffs'])
  const b = moveOverviewWidgetTo(d, 'dps', { id: 'target', side: 'after' })
  assert.deepEqual(order(b).slice(0, 4), ['leveling', 'target', 'dps', 'dpsCurve'])
  const c = moveOverviewWidgetTo(d, 'dps', { id: 'kills', side: 'after' })
  assert.deepEqual(order(c).slice(0, 7), ['leveling', 'target', 'dpsCurve', 'drops', 'kills', 'dps', 'buffs'])
  // The off cards (buffs..coin) are still the tail, in their order.
  assert.deepEqual(order(c).slice(6), ['buffs', 'respawns', 'motes', 'coin'])
  // Widths and on/off travel with the card.
  const w = moveOverviewWidgetTo(setOverviewWidgetWidth(d, 'dps', 3), 'dps', { id: 'drops', side: 'before' })
  assert.deepEqual(w.widgets.find((x) => x.id === 'dps'), { id: 'dps', on: true, width: 3 })
})

test('THE DROP: on itself, beside its own place, or on an unknown id it returns the same layout', () => {
  const d = defaultOverviewLayout()
  assert.equal(moveOverviewWidgetTo(d, 'leveling', { id: 'leveling', side: 'after' }), d)
  assert.equal(moveOverviewWidgetTo(d, 'leveling', { id: 'dps', side: 'after' }), d)
  assert.equal(moveOverviewWidgetTo(d, 'leveling', { id: 'target', side: 'before' }), d)
  assert.equal(moveOverviewWidgetTo(d, 'leveling', { id: 'nope' as OverviewWidgetId, side: 'before' }), d)
})

test('overviewDropChanges: a drop that leaves the drawn order alone is no drop', () => {
  // Coin on, at the end; the off cards sit between kills and coin.
  const layout = setOverviewWidgetOn(defaultOverviewLayout(), 'coin', true)
  assert.ok(!overviewDropChanges(layout, 'coin', { id: 'kills', side: 'after' }), 'already right after kills on screen')
  assert.ok(overviewDropChanges(layout, 'coin', { id: 'kills', side: 'before' }))
  assert.ok(!overviewDropChanges(layout, 'dps', { id: 'leveling', side: 'before' }))
})

test('earlier and later on the page step past the neighbouring SHOWN card, never an off one', () => {
  const layout = setOverviewWidgetOn(defaultOverviewLayout(), 'coin', true)
  const earlier = moveOverviewWidgetAmongShown(layout, 'coin', -1)
  assert.deepEqual(shownOverviewWidgets(earlier), ['dps', 'leveling', 'target', 'dpsCurve', 'drops', 'coin', 'kills'])
  const later = moveOverviewWidgetAmongShown(layout, 'dps', 1)
  assert.deepEqual(shownOverviewWidgets(later).slice(0, 2), ['leveling', 'dps'])
  assert.equal(moveOverviewWidgetAmongShown(layout, 'dps', -1), layout, 'the first cannot go earlier')
  assert.equal(moveOverviewWidgetAmongShown(layout, 'coin', 1), layout, 'the last cannot go later')
  assert.equal(moveOverviewWidgetAmongShown(layout, 'motes', 1), layout, 'an off card does not move from the page')
})

test('responsive columns: 4 when wide, 2 in between, 1 when narrow; unmeasured reads as 4', () => {
  assert.equal(overviewColumnsFor(1400), 4)
  assert.equal(overviewColumnsFor(OVERVIEW_FOUR_COLUMNS_MIN_PX), 4)
  assert.equal(overviewColumnsFor(OVERVIEW_FOUR_COLUMNS_MIN_PX - 1), 2)
  assert.equal(overviewColumnsFor(OVERVIEW_TWO_COLUMNS_MIN_PX), 2)
  assert.equal(overviewColumnsFor(OVERVIEW_TWO_COLUMNS_MIN_PX - 1), 1)
  assert.equal(overviewColumnsFor(300), 1)
  assert.equal(overviewColumnsFor(0), 4)
  assert.equal(overviewColumnsFor(Number.NaN), 4)
})

test('display span: the stored width cut to the columns there are; the stored width is untouched', () => {
  assert.equal(overviewDisplaySpan(4, 4), 4)
  assert.equal(overviewDisplaySpan(3, 2), 2)
  assert.equal(overviewDisplaySpan(1, 2), 1)
  assert.equal(overviewDisplaySpan(4, 1), 1)
  const layout = defaultOverviewLayout()
  const shownAt2 = layout.widgets.filter((w) => w.on).map((w) => overviewDisplaySpan(w.width, 2))
  assert.deepEqual(shownAt2, [1, 2, 1, 2, 2, 2])
  assert.deepEqual(widths(layout), DEFAULT_WIDTHS)
})

test('drop slot: the card under the pointer, its left half before and right half after; the nearest in a gap', () => {
  const rects = [
    { id: 'dps' as const, left: 0, top: 0, right: 100, bottom: 100 },
    { id: 'leveling' as const, left: 112, top: 0, right: 312, bottom: 100 },
    { id: 'kills' as const, left: 0, top: 112, right: 200, bottom: 200 }
  ]
  assert.deepEqual(overviewDropSlot(rects, { x: 130, y: 50 }, 'dps'), { id: 'leveling', side: 'before' })
  assert.deepEqual(overviewDropSlot(rects, { x: 300, y: 50 }, 'dps'), { id: 'leveling', side: 'after' })
  assert.deepEqual(overviewDropSlot(rects, { x: 150, y: 150 }, 'dps'), { id: 'kills', side: 'after' })
  // In the gap between dps and leveling, nearer leveling's left edge.
  assert.deepEqual(overviewDropSlot(rects, { x: 108, y: 50 }, 'kills'), { id: 'leveling', side: 'before' })
  // Below everything: the nearest card.
  assert.deepEqual(overviewDropSlot(rects, { x: 20, y: 400 }, 'dps'), { id: 'kills', side: 'before' })
  assert.equal(overviewDropSlot(rects, { x: 50, y: 50 }, 'dps'), null, 'over itself: no slot')
  assert.equal(overviewDropSlot([], { x: 50, y: 50 }, 'dps'), null)
})

test('blocks: the default page is its six cards with their widths', () => {
  assert.deepEqual(overviewBlocks(defaultOverviewLayout(), false), [
    { kind: 'card', id: 'dps', width: 1 },
    { kind: 'card', id: 'leveling', width: 2 },
    { kind: 'card', id: 'target', width: 1 },
    { kind: 'card', id: 'dpsCurve', width: 4 },
    { kind: 'card', id: 'drops', width: 2 },
    { kind: 'card', id: 'kills', width: 2 }
  ])
  const none = { version: 2 as const, widgets: defaultOverviewLayout().widgets.map((w) => ({ ...w, on: false })) }
  assert.deepEqual(overviewBlocks(none, false), [])
})

test('hydration: live cards give way to ONE placeholder where the first was; feeds still draw', () => {
  assert.deepEqual(overviewBlocks(defaultOverviewLayout(), true), [
    { kind: 'hydrating' },
    { kind: 'card', id: 'drops', width: 2 },
    { kind: 'card', id: 'kills', width: 2 }
  ])
  const picked = normalizeOverviewLayout({
    widgets: ['kills', 'coin', 'drops', 'dpsCurve'].map((id) => ({ id, on: true }))
  })
  assert.deepEqual(overviewBlocks(picked, true), [
    { kind: 'card', id: 'kills', width: 2 },
    { kind: 'hydrating' },
    { kind: 'card', id: 'drops', width: 2 }
  ])
})
