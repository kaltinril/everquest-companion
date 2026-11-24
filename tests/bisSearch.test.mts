// The Best in slot sheet's exact choice (src/shared/planner/bisSearch.ts): the assignment plus the
// two-hander and haste enumeration must equal brute force on every small case, lore, copies,
// penalties and all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignMinCost, searchLoadout, type HasteRate, type SearchCandidate, type SearchCell } from '../src/shared/planner/bisSearch'

/** A small seeded generator, so a failure names a reproducible case. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function randomCells(next: () => number): SearchCell[] {
  const keys = ['a', 'b', 'c', 'd', 'e']
  const copies = new Map(keys.map((k) => [k, next() < 0.5 ? 1 : next() < 0.5 ? 2 : Number.POSITIVE_INFINITY]))
  const twoHand = new Map(keys.map((k) => [k, next() < 0.3]))
  const haste = new Map(keys.map((k) => [k, next() < 0.4 ? Math.round(next() * 40) - 5 : 0]))
  const n = 2 + Math.floor(next() * 4)
  return Array.from({ length: n }, (_, i) => {
    const pool = keys.filter(() => next() < 0.6)
    const candidates: SearchCandidate[] = pool
      .map((key) => ({
        key,
        base: Math.round(next() * 40 - 8),
        haste: haste.get(key) ?? 0,
        copies: copies.get(key) ?? 1,
        twoHand: i === 0 && (twoHand.get(key) ?? false)
      }))
      .sort((x, y) => y.base - x.base)
    return { candidates, isPrimary: i === 0, isSecondary: i === 1 }
  })
}

/** Every choice per cell, checked and scored the slow way. */
function bruteForce(cells: readonly SearchCell[], rate: HasteRate): number {
  let best = 0
  const choice = cells.map(() => -1)
  const visit = (i: number): void => {
    if (i === cells.length) {
      best = Math.max(best, value(cells, choice, rate))
      return
    }
    for (let k = -1; k < cells[i].candidates.length; k++) {
      choice[i] = k
      visit(i + 1)
    }
  }
  visit(0)
  return best
}

function value(cells: readonly SearchCell[], choice: readonly number[], rate: HasteRate): number {
  const used = new Map<string, number>()
  let total = 0
  let hasteBest = 0
  let closed = false
  for (let i = 0; i < cells.length; i++) {
    if (choice[i] < 0) continue
    const c = cells[i].candidates[choice[i]]
    if (cells[i].isSecondary && closed) return Number.NEGATIVE_INFINITY
    if (cells[i].isPrimary && c.twoHand) closed = true
    used.set(c.key, (used.get(c.key) ?? 0) + 1)
    if ((used.get(c.key) ?? 0) > c.copies) return Number.NEGATIVE_INFINITY
    total += c.base + (c.haste < 0 ? c.haste * rate.perPercent : 0)
    hasteBest = Math.max(hasteBest, c.haste)
  }
  return total + hasteBest * rate.perPercent
}

test('the Hungarian method finds the cheapest assignment', () => {
  assert.deepEqual(assignMinCost([[4, 1, 3], [2, 0, 5], [3, 2, 2]]), [1, 0, 2])
  assert.deepEqual(assignMinCost([]), [])
})

test('the exact choice equals brute force on 400 random small sheets', () => {
  const next = rng(20261124)
  for (let n = 0; n < 400; n++) {
    const cells = randomCells(next)
    const rate: HasteRate = { perPercent: n % 3 === 0 ? 0 : next() * 2 }
    const got = searchLoadout(cells, rate)
    const want = bruteForce(cells, rate)
    assert.ok(Math.abs(got.total - want) < 1e-6, `case ${String(n)}: got ${String(got.total)}, brute force ${String(want)}`)
    assert.ok(Math.abs(value(cells, got.choice, rate) - got.total) < 1e-6, `case ${String(n)}: the choice is worth what it says`)
  }
})
