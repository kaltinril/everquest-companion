// HOW CLOSE IS THE DEFAULT BOARD TO TODAY'S BEST? (plans/2026-11-24-bis-sheet.md, "The default tier
// list is our formula"; owner, 2026-11-24: *"the default teir list will be what our formula
// shows"*). Over the committed corpus, per equip slot: the top 10 by the old BEST (`gearBisValue`,
// the balanced focus) against the top 10 by the default board's score, and Spearman's rank
// correlation over every row in the slot. Slot-free on both sides, as the Gear table scores.
//
// The numbers are printed for the plan and pinned as FLOORS a little under the measured day, never
// as equalities: a wiki delta moves them by a hair (tests/corpusFloor.mts's reasoning). The owner
// decides from them whether the BEST column switches to the board (plan question 8).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { GearRow } from '../src/shared/planner/gear'
import { gearBisValue } from '../src/shared/planner/gearScale'
import { defaultBoard, measureTierScale, tierScore } from '../src/shared/planner/tierWeights'
import { EQUIP_SLOTS } from '../src/shared/planner/types'

const rows = buildGearIndex(itemsJson as unknown as ItemDbFile).rows
const scale = measureTierScale(rows)

function usable(row: GearRow, classes: readonly ClassAbbr[]): boolean {
  return classes.length === 0 || row.classes.length === 0 || row.classes.some((c) => classes.includes(c))
}

/** Ranks with ties averaged, 1 = highest. */
function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0])
  const out = new Array<number>(values.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return out
}

function spearman(a: readonly number[], b: readonly number[]): number {
  const ra = ranks(a)
  const rb = ranks(b)
  const mean = (ra.length + 1) / 2
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - mean) * (rb[i] - mean)
    da += (ra[i] - mean) ** 2
    db += (rb[i] - mean) ** 2
  }
  return da === 0 || db === 0 ? 1 : num / Math.sqrt(da * db)
}

function top10(slotRows: readonly GearRow[], score: readonly number[]): Set<string> {
  const idx = slotRows.map((r, i) => i).sort((x, y) => score[y] - score[x] || slotRows[x].name.localeCompare(slotRows[y].name))
  return new Set(idx.slice(0, 10).map((i) => slotRows[i].key))
}

interface Calibration {
  meanOverlap: number
  minOverlap: number
  minOverlapSlot: string
  meanRho: number
  minRho: number
  minRhoSlot: string
}

function calibrate(classes: readonly ClassAbbr[]): Calibration {
  const board = defaultBoard(classes, scale)
  const overlaps: [string, number][] = []
  const rhos: [string, number][] = []
  for (const slot of EQUIP_SLOTS) {
    const slotRows = rows.filter((r) => r.slots.includes(slot) && usable(r, classes))
    if (slotRows.length < 10) continue
    const old = slotRows.map((r) => gearBisValue(r.stats, { classes }) ?? 0)
    const now = slotRows.map((r) => tierScore(r, board, { scale, classes }))
    const a = top10(slotRows, old)
    const b = top10(slotRows, now)
    overlaps.push([slot, [...a].filter((k) => b.has(k)).length])
    rhos.push([slot, spearman(old, now)])
  }
  const minOf = (xs: [string, number][]): [string, number] => xs.reduce((m, x) => (x[1] < m[1] ? x : m))
  const [minOverlapSlot, minOverlap] = minOf(overlaps)
  const [minRhoSlot, minRho] = minOf(rhos)
  return {
    meanOverlap: overlaps.reduce((s, [, v]) => s + v, 0) / overlaps.length,
    minOverlap,
    minOverlapSlot,
    meanRho: rhos.reduce((s, [, v]) => s + v, 0) / rhos.length,
    minRho,
    minRhoSlot
  }
}

function report(what: string, c: Calibration): void {
  console.log(
    `${what}: top-10 overlap mean ${c.meanOverlap.toFixed(1)}/10, min ${String(c.minOverlap)} (${c.minOverlapSlot}); ` +
      `Spearman mean ${c.meanRho.toFixed(3)}, min ${c.minRho.toFixed(3)} (${c.minRhoSlot})`
  )
}

test('calibration, no class picked: the default board ranks close to BEST', () => {
  const c = calibrate([])
  report('no classes', c)
  assertFloors(c)
})

test('calibration, the owner\'s trio WAR/MNK/SHM', () => {
  const c = calibrate(['WAR', 'MNK', 'SHM'])
  report('WAR/MNK/SHM', c)
  assertFloors(c)
})

/**
 * Measured 2026-11-24 (6,975 rows): no classes 8.7/10 mean overlap, min 6 (BACK), Spearman mean
 * 0.991, min 0.958 (WAIST); WAR/MNK/SHM 8.8/10, min 5 (BACK), 0.991, min 0.955 (WAIST).
 */
function assertFloors(c: Calibration): void {
  assert.ok(c.meanOverlap >= 8, `mean top-10 overlap ${c.meanOverlap.toFixed(1)} under 8`)
  assert.ok(c.minOverlap >= 4, `a slot's top-10 overlap ${String(c.minOverlap)} (${c.minOverlapSlot}) under 4`)
  assert.ok(c.meanRho >= 0.97, `mean Spearman ${c.meanRho.toFixed(3)} under 0.97`)
  assert.ok(c.minRho >= 0.9, `a slot's Spearman ${c.minRho.toFixed(3)} (${c.minRhoSlot}) under 0.9`)
}
