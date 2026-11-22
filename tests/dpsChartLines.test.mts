// Pure unit tests for WHICH LINES THE DPS CURVE DRAWS (JOS-264)
// — `buildDpsChart`'s hidden set, plus the two readers that must agree with it.
//
// No log, no fixture, no DOM, so this file never skips. The vocabulary half (what a stored hidden
// set means, and how it degrades) is pinned in tests/combatPrefs.test.mts; what is pinned HERE is
// the geometry, which is where hiding a line could quietly change something it has no business
// changing:
//   1. HIDING SUBTRACTS A LINE AND NOTHING ELSE. The time base, the vertex count, the marker X
//      positions and the axis are byte-identical with a line switched off — a toggle that re-timed
//      the chart would move every tick under the cursor and reopen the marker-swim bug the
//      one-time-base shape exists to prevent.
//   2. THE Y SCALE IS THE DRAWN LINES'. Hiding the headline curve is asked for precisely when it
//      dwarfs everything else, so what is left has to fill the plot rather than stay flattened
//      against the floor by a line that is no longer on screen.
//   3. …BUT THE PEAK IS STILL THE OUTGOING SERIES'. `peakVis` describes the fight, not the
//      drawing, so it does not move; the card reads `outLine === null` to decide whether quoting
//      it still makes sense.
//   4. AN ABSENT LINE AND A HIDDEN ONE ARE THE SAME SHAPE (`null`), so the SVG asks one question
//      per line and a fight without a pet cannot be told from a pet you put away.
//   5. ALL LINES OFF IS A STATE, NOT A CRASH: the chart still builds, with a valid time base, and
//      says so through `hasDrawnLine` — which is what lets the card show a note and keep the
//      legend that switches one back on.
//   6. THE HIDDEN MARKER KINDS COME OFF THE DRAWING, NOT OFF THE LEGEND. `placeMarkers` still
//      returns them (the legend is built from it, and an entry that deleted itself would be a
//      one-way door); `drawnMarkers` is the filtered view the ticks and the hover share.
//   7. THE PET DRAWN APART (`petApart`, upstream #91) takes the pet out of the gold line, its peak
//      and the scale, and moves nothing else. Absent or false is the chart as it always was.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TimelineMarker, TimelineView } from '../src/shared/combat'
import type { DpsSeries } from '../src/renderer/src/features/combat/dashboardData'
import { PET_LAYOUTS, petDrawnApart, type ChartLineKey } from '../src/renderer/src/features/combat/combatPrefs'
import {
  CHART_H,
  PAD_B,
  PAD_T,
  buildDpsChart,
  drawnMarkers,
  hasDrawnLine,
  placeMarkers,
  xAtT,
  yAt,
  type DpsChart
} from '../src/renderer/src/features/combat/dpsChart'
import { ROW_KIND, bandLabel, curveRows, outLabel, peakTitle, rateRows, withPetApart } from '../src/renderer/src/features/combat/dpsAt'
import { formatRate } from '../src/renderer/src/lib/formatRate'

const BUCKET = 1000

/** you / pet / group / inc per bucket. `out` (the headline line) is you+pet+group, so this
 *  fixture's outgoing curve towers over each of its own components — which is the shape the
 *  feature was reported against. */
const YOU = [100, 200]
const PET = [50, 50]
const GROUP = [20, 80]
const INC = [10, 10]
/** out = you + pet + group, bucket by bucket. */
const OUT = [170, 330]

function mkSeries(): DpsSeries {
  return {
    bucketMs: BUCKET,
    smoothMs: 5 * BUCKET,
    n: YOU.length,
    you: Float64Array.from(YOU),
    pet: Float64Array.from(PET),
    group: Float64Array.from(GROUP),
    inc: Float64Array.from(INC),
    peakOut: Math.max(...OUT),
    hasPet: true,
    hasGroup: true,
    hasInc: true,
    hasAny: true,
    durationMs: YOU.length * BUCKET,
    estimated: false
  }
}

function mkChart(hidden: ChartLineKey[] = [], series: DpsSeries = mkSeries()): DpsChart {
  const chart = buildDpsChart(series, false, hidden)
  assert.ok(chart, 'the fixture must produce a drawable chart')
  return chart
}

/** The polyline point string, back as numbers — the drawing, read as data. */
function parsePts(s: string | null): { x: number; y: number }[] {
  assert.ok(s, 'the fixture must draw this line')
  return s.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number)
    return { x, y }
  })
}

function mkView(markers: TimelineMarker[]): TimelineView {
  return {
    id: 'enc-1',
    name: 'a froglok tad',
    startTs: 0,
    durationMs: YOU.length * BUCKET,
    lanes: [],
    events: [],
    stanceSpans: [],
    markers,
    downsampled: false,
    rawCount: 0,
    totalCount: 0,
    truncated: false
  }
}

// ── 1. hiding subtracts a line and nothing else ──────────────────────────────────────────

test('hiding a line drops exactly that line, and leaves the other three untouched', () => {
  const all = mkChart()
  const noPet = mkChart(['pet'])
  assert.ok(all.petLine, 'the fixture has a pet line to hide')
  assert.equal(noPet.petLine, null)
  // The other lines are byte-identical: nothing about the pet's absence may re-place a vertex,
  // and here the Y scale is unchanged too (the pet was never what set it).
  assert.equal(noPet.outLine, all.outLine)
  assert.equal(noPet.groupLine, all.groupLine)
  assert.equal(noPet.incLine, all.incLine)
  assert.equal(noPet.outArea, all.outArea)
})

test('the OUTGOING line takes its area fill with it, and nothing else with that', () => {
  const noOut = mkChart(['out'])
  assert.equal(noOut.outLine, null)
  assert.equal(noOut.outArea, null, 'the fill is the outgoing line shaded, not a fifth line')
  assert.ok(noOut.petLine)
  assert.ok(noOut.groupLine)
  assert.ok(noOut.incLine)
})

test('hiding a line does not re-time the chart — the axis, the vertices and the ticks do not move', () => {
  const all = mkChart()
  const markers: TimelineMarker[] = [
    { t: 0, kind: 'stance', label: 'Berserker' },
    { t: 1400, kind: 'slow', label: 'a froglok tad' }
  ]
  const before = placeMarkers(mkView(markers), all)
  for (const hidden of [['out'], ['pet', 'inc'], ['out', 'pet', 'group']] as ChartLineKey[][]) {
    const chart = mkChart(hidden)
    assert.equal(chart.t0, all.t0, `t0 must not move (hidden: ${hidden.join()})`)
    assert.equal(chart.t1, all.t1, `t1 must not move (hidden: ${hidden.join()})`)
    assert.equal(chart.i0, all.i0)
    assert.equal(chart.count, all.count)
    assert.equal(chart.bucketMs, all.bucketMs)
    assert.equal(chart.scrolling, all.scrolling)
    // The X mapping is the axis, the markers and the hover's inverse all at once.
    for (const t of [0, 700, 1400, chart.t1]) assert.equal(xAtT(chart, t), xAtT(all, t))
    assert.deepEqual(placeMarkers(mkView(markers), chart), before)
  }
})

// ── 2 & 3. the scale is the drawn lines'; the peak is the fight's ────────────────────────

test('the Y scale is measured over the DRAWN lines, so what is left fills the plot', () => {
  const all = mkChart()
  assert.equal(all.yMax, Math.max(...OUT), 'with everything visible the outgoing peak sets the ceiling')

  // Hide the headline curve and the ceiling drops to the tallest line still on screen — the group
  // at 80, an inch off the floor at the old scale.
  const noOut = mkChart(['out'])
  assert.equal(noOut.yMax, Math.max(...GROUP))
  const group = parsePts(noOut.groupLine)
  assert.equal(group[1].y, yAt(noOut.yMax, Math.max(...GROUP)))
  assert.ok(Math.abs(group[1].y - PAD_T) < 1e-9, 'the tallest visible sample now reaches the top of the plot')

  // Hiding a line that never set the ceiling changes nothing about the scale.
  assert.equal(mkChart(['inc']).yMax, all.yMax)
  // And with the two tallest gone, the next one down sets it.
  assert.equal(mkChart(['out', 'group']).yMax, Math.max(...PET))
})

test('the PEAK is the outgoing series own number and does not move when its line is hidden', () => {
  // It describes the fight, not the drawing — so it stays put, and the card decides whether to
  // quote a figure for a line that is not on the plot (it does not: `outLine === null`).
  const all = mkChart()
  assert.equal(all.peakVis, Math.max(...OUT))
  for (const hidden of [['out'], ['out', 'pet', 'group', 'inc']] as ChartLineKey[][]) {
    assert.equal(mkChart(hidden).peakVis, all.peakVis, `hidden: ${hidden.join()}`)
  }
})

// ── 4. absent and hidden are the same shape ──────────────────────────────────────────────

test('a line the fight never had reads exactly like a line you put away', () => {
  const solo: DpsSeries = { ...mkSeries(), hasPet: false, hasGroup: false, hasInc: false }
  const chart = mkChart([], solo)
  assert.equal(chart.petLine, null)
  assert.equal(chart.groupLine, null)
  assert.equal(chart.incLine, null)
  // …and hiding what was never there is a no-op rather than a second kind of absent.
  assert.deepEqual(mkChart(['pet', 'group', 'inc'], solo), chart)
})

// ── 5. all lines off is a state ──────────────────────────────────────────────────────────

test('every line hidden still builds a chart — with a time base, and no line on it', () => {
  const chart = mkChart(['out', 'pet', 'group', 'inc'])
  assert.equal(hasDrawnLine(chart), false)
  assert.equal(chart.outLine, null)
  assert.equal(chart.outArea, null)
  assert.equal(chart.petLine, null)
  assert.equal(chart.groupLine, null)
  assert.equal(chart.incLine, null)
  // The time base survives, which is what keeps the empty state from being a different chart: the
  // markers a hidden plot still holds are placed on the same X they always were.
  assert.equal(chart.t0, 0)
  assert.equal(chart.t1, YOU.length * BUCKET)
  assert.equal(placeMarkers(mkView([{ t: 500, kind: 'coat', label: 'Neurotoxic' }]), chart).length, 1)
  // A degenerate scale must still be a usable number rather than 0 or NaN — `yAt` divides by it.
  assert.ok(chart.yMax > 0)
  assert.ok(Number.isFinite(yAt(chart.yMax, 0)))
  assert.equal(yAt(chart.yMax, 0), CHART_H - PAD_B)
})

test('all-but-one hidden draws that one, at its own full height', () => {
  const chart = mkChart(['out', 'pet', 'group'])
  assert.equal(hasDrawnLine(chart), true)
  assert.equal(chart.outLine, null)
  assert.equal(chart.yMax, Math.max(...INC))
  for (const p of parsePts(chart.incLine)) assert.ok(Math.abs(p.y - PAD_T) < 1e-9, 'a flat line at its own peak')
})

// ── 6. hidden marker kinds ───────────────────────────────────────────────────────────────

test('a hidden marker kind comes off the ticks, and stays in the set the legend is built from', () => {
  const chart = mkChart(['coat'])
  const markers: TimelineMarker[] = [
    { t: 100, kind: 'coat', label: 'Neurotoxic' },
    { t: 900, kind: 'slow', label: 'a froglok tad' },
    { t: 1500, kind: 'coat', label: 'Neurotoxic' }
  ]
  const placed = placeMarkers(mkView(markers), chart)
  assert.equal(placed.length, 3, 'placeMarkers still answers for the legend — hidden is not gone')
  const drawn = drawnMarkers(placed, ['coat'])
  assert.deepEqual(
    drawn.map(({ m }) => m.kind),
    ['slow']
  )
  // The survivors keep their own X: filtering is not re-placing.
  assert.equal(drawn[0].x, placed[1].x)
})

test('nothing hidden hands the placed markers straight back, same array', () => {
  // The ticks and the hover share this list through a memo; a fresh array on every render would
  // re-derive both for a set that did not change.
  const placed = placeMarkers(mkView([{ t: 100, kind: 'slow', label: 'x' }]), mkChart())
  assert.equal(drawnMarkers(placed, []), placed)
  // A curve key in the hidden set is not a marker kind, so it takes no tick with it.
  assert.equal(drawnMarkers(placed, ['out', 'pet']).length, 1)
})

// ── 7. the pet drawn apart ("Its own bar", upstream #91) ─────────────────────────────────

/** you + group, bucket by bucket: the gold line once the pet is left out of it. */
const APART = [120, 280]

test('a petApart series draws the gold line without the pet, and moves nothing else', () => {
  // The incoming band sets the ceiling here, so the scale is the same with and without the flag.
  const tall: DpsSeries = { ...mkSeries(), inc: Float64Array.from([10, 500]) }
  const sum = mkChart([], tall)
  const apart = mkChart([], { ...tall, petApart: true })
  assert.equal(apart.yMax, sum.yMax)
  parsePts(apart.outLine).forEach((p, i) => {
    assert.ok(Math.abs(p.y - yAt(apart.yMax, APART[i])) <= 0.05, `bucket ${i} is you + group`)
  })
  assert.equal(apart.petLine, sum.petLine)
  assert.equal(apart.groupLine, sum.groupLine)
  assert.equal(apart.incLine, sum.incLine)
  assert.equal(apart.peakVis, Math.max(...APART), 'the peak is the gold line own peak')
  assert.equal(apart.t0, sum.t0)
  assert.equal(apart.t1, sum.t1)
  assert.equal(apart.i0, sum.i0)
  assert.equal(apart.count, sum.count)
})

test('a pet that out-damages you sets the scale when it is drawn apart', () => {
  const series: DpsSeries = {
    ...mkSeries(),
    you: Float64Array.from([100, 100]),
    pet: Float64Array.from([400, 300]),
    group: new Float64Array(2),
    hasGroup: false,
    petApart: true
  }
  const chart = mkChart([], series)
  assert.equal(chart.yMax, 400)
  const pet = parsePts(chart.petLine)
  const out = parsePts(chart.outLine)
  assert.ok(Math.abs(pet[0].y - PAD_T) < 1e-9, 'the pet line reaches the top of the plot')
  out.forEach((p, i) => assert.ok(p.y > pet[i].y, `the gold line sits below the pet at bucket ${i}`))
  assert.equal(mkChart(['pet'], series).yMax, 100, 'with the pet hidden the scale is your own peak')
})

test('the flag off or absent draws the same chart, and hiding the gold line still works apart', () => {
  const plain = mkChart()
  assert.deepEqual(mkChart([], { ...mkSeries(), petApart: false }), plain)
  parsePts(plain.outLine).forEach((p, i) => assert.ok(Math.abs(p.y - yAt(plain.yMax, OUT[i])) <= 0.05))
  const noOut = mkChart(['out'], { ...mkSeries(), petApart: true })
  assert.equal(noOut.outLine, null)
  assert.equal(noOut.outArea, null)
})

test('the gold line is named for exactly what it sums', () => {
  const solo: DpsSeries = { ...mkSeries(), hasGroup: false }
  assert.equal(outLabel(solo), 'you + pet')
  assert.equal(outLabel(mkSeries()), 'you + pet + group')
  assert.equal(outLabel({ ...solo, petApart: true }), 'you')
  assert.equal(outLabel({ ...mkSeries(), petApart: true }), 'you + group')
})

test('a band holding a stranger is called others, on the gold line and on its own row', () => {
  const series: DpsSeries = { ...mkSeries(), hasOther: true }
  assert.equal(bandLabel(mkSeries()), 'group')
  assert.equal(bandLabel(series), 'others')
  assert.equal(outLabel(series), 'you + pet + others')
  assert.equal(outLabel({ ...series, petApart: true }), 'you + others')
  assert.deepEqual(curveRows(series, 0, []).map((r) => r.label), ['you + pet + others', 'pet', 'others', 'incoming'])
})

test('the peak tooltip says when the peak leaves the pet out', () => {
  // The tooltip is the only place that says what the gold peak number measures.
  const plain = peakTitle(mkSeries())
  assert.equal(plain, 'Peak 5s rolling outgoing rate in the visible window.')
  assert.ok(!plain.includes('without your pet'))
  const apart = 'Peak 5s rolling rate without your pet, in the visible window.'
  assert.equal(peakTitle({ ...mkSeries(), petApart: true }), apart)
  assert.equal(peakTitle(withPetApart(mkSeries(), true)), apart, 'the path the card uses')
  assert.equal(peakTitle({ ...mkSeries(), petApart: false }), plain)
  // The window is the series own, rounded to whole seconds.
  assert.ok(peakTitle({ ...mkSeries(), smoothMs: 2600 }).startsWith('Peak 3s '))
  assert.ok(peakTitle({ ...mkSeries(), smoothMs: 2600, petApart: true }).startsWith('Peak 3s '))
})

// ── 8. the hover readout's rate rows ─────────────────────────────────────────────────────

test('the hover rows name the gold line for what it sums, and its number matches the name', () => {
  const grouped = mkSeries()
  const solo: DpsSeries = { ...mkSeries(), hasGroup: false, group: new Float64Array(2) }
  const labels = (s: DpsSeries): (string | undefined)[] => curveRows(s, 0, []).map((r) => r.label)
  assert.deepEqual(labels(solo), ['you + pet', 'pet', 'incoming'])
  assert.deepEqual(labels({ ...solo, petApart: true }), ['you', 'pet', 'incoming'])
  assert.deepEqual(labels(grouped), ['you + pet + group', 'pet', 'group', 'incoming'])
  assert.deepEqual(labels({ ...grouped, petApart: true }), ['you + group', 'pet', 'group', 'incoming'])
  assert.deepEqual(
    curveRows(grouped, 0, []).map((r) => r.key),
    ['out', 'pet', 'group', 'inc']
  )

  // Bucket 1 (t = 1000ms): the summed line carries the pet, the apart one does not.
  assert.equal(curveRows(grouped, 1000, [])[0].value, formatRate(OUT[1]))
  const apart = curveRows({ ...grouped, petApart: true }, 1000, [])
  assert.equal(apart[0].value, formatRate(APART[1]))
  assert.notEqual(apart[0].value, formatRate(OUT[1]))
  // The pet keeps its own row and its own number, so nothing is lost by drawing it apart.
  assert.equal(apart[1].value, formatRate(PET[1]))
  assert.equal(apart[2].value, formatRate(GROUP[1]))
  assert.equal(apart[3].value, formatRate(INC[1]))
})

test('a hidden line and a line the fight never had get no hover row', () => {
  const series = mkSeries()
  const keys = (s: DpsSeries, hidden: ChartLineKey[]): string[] => curveRows(s, 0, hidden).map((r) => r.key)
  assert.deepEqual(keys(series, ['out']), ['pet', 'group', 'inc'])
  assert.deepEqual(keys(series, ['pet']), ['out', 'group', 'inc'])
  assert.deepEqual(keys(series, ['group', 'inc']), ['out', 'pet'])
  assert.deepEqual(keys(series, ['out', 'pet', 'group', 'inc']), [])
  // A hidden marker kind is not a curve, so it takes no rate row with it.
  assert.deepEqual(keys(series, ['slow', 'coat']), ['out', 'pet', 'group', 'inc'])
  assert.deepEqual(keys({ ...series, hasPet: false }, []), ['out', 'group', 'inc'])
  assert.deepEqual(keys({ ...series, hasGroup: false }, []), ['out', 'pet', 'inc'])
  assert.deepEqual(keys({ ...series, hasInc: false }, []), ['out', 'pet', 'group'])
  // Hiding the gold line under Its own bar leaves the pet row standing.
  assert.deepEqual(keys({ ...series, petApart: true }, ['out']), ['pet', 'group', 'inc'])
})

test('an estimated series marks every hover rate with a tilde', () => {
  const exact = curveRows(mkSeries(), 0, [])
  const rough = curveRows({ ...mkSeries(), estimated: true }, 0, [])
  assert.equal(rough.length, exact.length)
  rough.forEach((r, i) => assert.equal(r.value, `~${exact[i].value}`))
  for (const r of exact) assert.ok(!r.value.startsWith('~'))
})

test('withPetApart hands back the same series unless the pet is apart, and never copies the bands', () => {
  const series = mkSeries()
  assert.equal(withPetApart(series, false), series)
  const apart = withPetApart(series, true)
  assert.notEqual(apart, series)
  assert.equal(apart.petApart, true)
  assert.equal(series.petApart, undefined, 'the kept series is never flagged in place')
  assert.equal(apart.you, series.you)
  assert.equal(apart.pet, series.pet)
  assert.equal(apart.group, series.group)
  assert.equal(apart.inc, series.inc)
})

test('the pet layout decides the gold line: only Its own bar leaves the pet out', () => {
  // The card's own path: layout -> petDrawnApart -> withPetApart -> the drawn chart and its name.
  const series = mkSeries()
  const plain = mkChart([], series)
  for (const layout of PET_LAYOUTS) {
    const drawn = withPetApart(series, petDrawnApart(layout))
    if (layout === 'separate') {
      assert.equal(drawn.petApart, true)
      assert.equal(outLabel(drawn), 'you + group')
      assert.equal(mkChart([], drawn).peakVis, Math.max(...APART))
    } else {
      assert.equal(drawn, series, `${layout} draws the kept series itself`)
      assert.equal(outLabel(drawn), 'you + pet + group')
      assert.deepEqual(mkChart([], drawn), plain, `${layout} draws what it drew before`)
    }
  }
})

test('every combat tooltip gets its rate rows from one builder: a row is named for what its number sums', () => {
  // Before 2026-11-19 the Timeline built its own rows: the first was always called "you + pet"
  // while its number was the gold line's, group included, and a group fight had no group row.
  const palette = { you: 'gold', pet: 'teal', member: 'blue', enemy: 'red' }
  const rows = rateRows(mkSeries(), 1000, [], palette)
  assert.deepEqual(rows, [
    { label: 'you + pet + group', value: formatRate(OUT[1]), color: 'gold' },
    { label: 'pet', value: formatRate(PET[1]), color: 'teal' },
    { label: 'group', value: formatRate(GROUP[1]), color: 'blue' },
    { label: 'incoming', value: formatRate(INC[1]), color: 'red' }
  ])
  const solo: DpsSeries = { ...mkSeries(), hasGroup: false, group: new Float64Array(2) }
  assert.deepEqual(rateRows(solo, 1000, [], palette).map((r) => r.label), ['you + pet', 'pet', 'incoming'])
  assert.deepEqual(rateRows(mkSeries(), 0, ['out', 'inc'], palette).map((r) => r.label), ['pet', 'group'])
  assert.deepEqual(Object.keys(ROW_KIND), ['out', 'pet', 'group', 'inc'])

  // Neither hover layer names a rate row itself any more.
  for (const file of ['TimelineHoverLayer.tsx', 'DpsCurveHoverLayer.tsx']) {
    const src = readFileSync(new URL(`../src/renderer/src/features/combat/${file}`, import.meta.url), 'utf8')
    assert.match(src, /return rateRows\(series, t, (\[\]|hidden), KIND_COLOR\)/, file)
    assert.doesNotMatch(src, /label: '(you|pet|group|incoming)/, file)
  }
})
