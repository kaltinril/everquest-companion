// WHERE TO LEVEL AND WHERE TO FARM MOTES (owner ask, kaltinril 2026-09-11: "somewhere it shows
// recommendation for where to level, where to get motes (should be equal or higher level but not
// crazy higher)").
//
// The design claim under test is that those are ONE question, and it rests on this project's own
// measurement rather than on intuition: white/yellow/red cons drop 7-10 motes per 100 kills
// against 4.2 blue and 3.1 green. `shared/zoneAdvice.ts` carries the figures and their provenance.

import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTES_PER_100, moteGradeCap, rankZones } from '../src/shared/zoneAdvice'
import { zoneLevelBand, type ZoneLevelBand } from '../src/shared/zoneLevels'
import mobsJson from '../src/renderer/src/data/eqlegends/mobs.json'

function band(low: number, high: number): ZoneLevelBand {
  const levels: number[] = []
  for (let l = low; l <= high; l++) for (let i = 0; i < 10; i++) levels.push(l)
  const made = zoneLevelBand(levels)
  assert.ok(made)
  return made
}

test('a zone you cannot survive is not advice, however good its motes would be', () => {
  const bands = new Map([['Plane of Fear', band(48, 58)], ['Befallen', band(6, 26)]])
  const ranked = rankZones(bands, 20)
  assert.deepEqual(ranked.map((r) => r.zone), ['Befallen'], '"not crazy higher" is a bound, not a preference')
})

test('even and slightly-above lead, and green is last rather than absent', () => {
  const bands = new Map([
    ['easy', band(5, 10)],
    ['even', band(18, 24)],
    ['reach', band(23, 28)]
  ])
  const ranked = rankZones(bands, 22)
  assert.deepEqual(ranked.map((r) => r.zone), ['reach', 'even', 'easy'])
  // The harder of two equally-fitting bands leads: the measured GRADE floor rises with difficulty
  // even where the per-kill rate does not separate them.
  assert.equal(ranked[0].fit, 'even')
  assert.ok(ranked[0].band.typical[0] > ranked[1].band.typical[0])
  // A green zone is still listed - it is slower, not useless.
  assert.equal(ranked[2].fit, 'green')
  assert.equal(ranked[2].motesPer100, MOTES_PER_100.green)
  assert.ok(MOTES_PER_100.even > MOTES_PER_100.green * 2, 'the measured rate roughly doubles')
})

test('a thinly documented zone can be held back, and every row says how thin it is', () => {
  const bands = new Map([['thin', zoneLevelBand([20, 21])!], ['thick', band(19, 23)]])
  assert.deepEqual(rankZones(bands, 20).map((r) => r.zone).sort(), ['thick', 'thin'])
  assert.deepEqual(rankZones(bands, 20, 10).map((r) => r.zone), ['thick'], 'min n drops the thin one')
  for (const row of rankZones(bands, 20)) assert.equal(row.n, row.band.n, 'the weight rides on the row')
})

test('your own level caps the grade you can bank', () => {
  // ~1 tier per 5 levels, 50 reaching 10 (measured).
  assert.equal(moteGradeCap(50), 10)
  assert.equal(moteGradeCap(25), 5)
  assert.equal(moteGradeCap(1), 1, 'never zero - a level 1 banks SOMETHING')
  assert.equal(moteGradeCap(60), 10, 'and never past the ceiling')
})

test('the committed bestiary yields real advice for a real level', () => {
  const levels = new Map<string, number[]>()
  for (const mob of mobsJson.mobs) {
    const level = Number.parseInt(String(mob.level), 10)
    if (!Number.isFinite(level)) continue
    for (const zone of mob.zones ?? []) {
      const held = levels.get(zone) ?? []
      held.push(level)
      levels.set(zone, held)
    }
  }
  const bands = new Map<string, ZoneLevelBand>()
  for (const [zone, ls] of levels) {
    const made = zoneLevelBand(ls)
    if (made !== null) bands.set(zone, made)
  }
  const ranked = rankZones(bands, 20, 8)
  assert.ok(ranked.length >= 5, `expected real advice, got ${String(ranked.length)} zones`)
  // Nothing deadly survives the cut, at any level the catalog covers.
  for (const row of ranked) assert.notEqual(row.fit, 'deadly')
  // A level 20's best zones are not level 50 zones.
  assert.ok(ranked[0].band.typical[0] <= 24, `led with ${ranked[0].zone} ${String(ranked[0].band.typical)}`)
})
