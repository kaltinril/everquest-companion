// The Reincarnations panel's derivation (docs/community/requirements/reincarnation-leveling.md):
// what counts as one reincarnation, where its climb ends, and when it refuses to state a time.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reincarnationClimbs } from '../src/shared/reincarnationClimbs'
import { rangeStats, wallMs } from '../src/shared/progressionStats'
import type { AASpendEvent, LevelEvent } from '../src/shared/types'
import type { ProgressionSnap } from '../src/shared/progressionTypes'

const MIN = 60_000
const HOUR = 60 * MIN
const T = Date.parse('2026-11-12T18:00:00')

function snapOf(over: Partial<ProgressionSnap> = {}): ProgressionSnap {
  return {
    expTs: [], expPct: [], expFlag: [],
    killTs: [], killZone: [], killCredit: [],
    witnessTs: [], lootTs: [],
    zoneStart: [], zoneEnd: [], zoneName: [],
    offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [],
    aaGainTs: [], aaGainAmount: [],
    recentKills: [], lastTs: 0, windowStart: 0, dropped: 0,
    ...over
  } as ProgressionSnap
}

/** The snapshot holding these dings, with a kill at each so the climb has play in it. */
function snapWith(dings: readonly LevelEvent[], over: Partial<ProgressionSnap> = {}): ProgressionSnap {
  const ts = dings.map((d) => d.ts)
  return snapOf({
    levelTs: ts,
    levelValue: dings.map((d) => d.level),
    killTs: ts,
    killZone: ts.map(() => -1),
    killCredit: ts.map(() => 0),
    lastTs: ts.length > 0 ? ts[ts.length - 1] : T,
    ...over
  })
}

const first = (ts: number, race = 'Iksar'): AASpendEvent[] => [
  { ts, ability: `Race Reincarnation: ${race}`, cost: 0 },
  { ts, ability: 'Class Reincarnation: Warrior', cost: 0 },
  { ts, ability: 'Class Reincarnation: Monk', cost: 0 },
  { ts, ability: 'Class Reincarnation: Shaman', cost: 0 }
]

const ranked = (ts: number, rank: number, race = 'Half Elf'): AASpendEvent[] => [
  { ts, ability: `Race Reincarnation: ${race}`, cost: 0 },
  { ts, ability: `Class Reincarnation: Warrior ${rank}`, cost: 0, rank },
  { ts, ability: `Class Reincarnation: Monk ${rank}`, cost: 0, rank },
  { ts, ability: `Class Reincarnation: Shaman ${rank}`, cost: 0, rank }
]

/** Dings 2..to, one every ten minutes from `from`. */
function climb(from: number, to = 50): LevelEvent[] {
  const out: LevelEvent[] = []
  for (let level = 2; level <= to; level++) out.push({ ts: from + (level - 1) * 10 * MIN, level })
  return out
}

test('no reincarnation line: no rows, whatever else was bought', () => {
  const spends: AASpendEvent[] = [{ ts: T, ability: 'Innate Regeneration 2', cost: 3, rank: 2 }]
  assert.deepEqual(reincarnationClimbs({ levels: climb(T), spends, snap: snapWith(climb(T)) }), [])
})

test('four lines in one second are one reincarnation, with its race and classes', () => {
  const levels = climb(T)
  const rows = reincarnationClimbs({ levels, spends: first(T), snap: snapWith(levels) })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].race, 'Iksar')
  assert.deepEqual(rows[0].classes, ['Warrior', 'Monk', 'Shaman'])
  assert.equal(rows[0].rank, null)
  assert.equal(rows[0].status, 'reached')
})

test('lines straddling a second boundary are still one event', () => {
  const spends = first(T).map((s, i) => ({ ...s, ts: T + (i > 1 ? 1000 : 0) }))
  const levels = climb(T)
  assert.equal(reincarnationClimbs({ levels, spends, snap: snapWith(levels) }).length, 1)
})

test('a second reincarnation states its rank; rows come newest first', () => {
  const second = T + 100 * HOUR
  const levels = [...climb(T), ...climb(second, 20)]
  const rows = reincarnationClimbs({ levels, spends: [...first(T), ...ranked(second, 2)], snap: snapWith(levels) })
  assert.deepEqual(rows.map((r) => r.ts), [second, T])
  assert.equal(rows[0].race, 'Half Elf')
  assert.equal(rows[0].rank, 2)
})

test('a climb ends at the FIRST level-50 ding, through a loadout wobble', () => {
  const wobble = [44, 42, 43, 45, 44, 45, 46, 47, 48, 49, 50, 50].map((level, i) => ({ ts: T + (i + 10) * HOUR, level }))
  const levels = [{ ts: T + HOUR, level: 2 }, ...wobble]
  const [row] = reincarnationClimbs({ levels, spends: first(T), snap: snapWith(levels) })
  assert.equal(row.status, 'reached')
  assert.equal(row.reachedTs, wobble[10].ts)
  assert.equal(row.level, 50)
})

test('TRAP: a re-logged line of a rank already held is not a new reincarnation', () => {
  const relog = T + 200 * HOUR
  const levels = climb(T)
  const rows = reincarnationClimbs({ levels, spends: [...first(T), ...first(relog)], snap: snapWith(levels, { lastTs: relog + HOUR }) })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ts, T)
  assert.equal(rows[0].status, 'reached')
})

test('TRAP: a re-log whose earlier line is gone is refused by the dings: no reset, no row', () => {
  // Rank 2 with no rank 1 on record looks new. The next dings are a high loadout, not a reset.
  const relog = T + HOUR
  const levels = [{ ts: relog + HOUR, level: 31 }, { ts: relog + 2 * HOUR, level: 32 }]
  assert.deepEqual(reincarnationClimbs({ levels, spends: ranked(relog, 2), snap: snapWith(levels) }), [])
})

test('a refused re-log does not cut the climb it fell inside', () => {
  const relog = T + 3 * HOUR
  const levels = climb(T)
  const spends = [...first(T), ...ranked(relog, 2)]
  // Rank 2 is new to the record, and the dings after it (20 and up) prove no reset.
  const rows = reincarnationClimbs({ levels, spends, snap: snapWith(levels) })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].ts, T)
  assert.equal(rows[0].status, 'reached')
  assert.equal(rows[0].reachedTs, levels[levels.length - 1].ts)
})

test('a climb under way is in progress at its last ding, timed to the log clock', () => {
  const levels = climb(T, 12)
  const lastTs = T + 5 * HOUR
  const [row] = reincarnationClimbs({ levels, spends: first(T), snap: snapWith(levels, { lastTs }) })
  assert.equal(row.status, 'climbing')
  assert.equal(row.reachedTs, null)
  assert.equal(row.level, 12)
  assert.ok(row.play)
  assert.equal(row.play.kills, levels.length)
})

test('a reincarnation with no ding yet shows at level 1', () => {
  const snap = snapOf({ lastTs: T + MIN })
  const [row] = reincarnationClimbs({ levels: [], spends: first(T), snap })
  assert.equal(row.status, 'climbing')
  assert.equal(row.level, 1)
})

test('the numbers are rangeStats over the climb, so active means what the tab means', () => {
  const levels = climb(T, 10)
  const off = { offlineStart: [T + 30 * MIN], offlineEnd: [T + 35 * MIN], offlineCamped: [1] }
  const snap = snapWith(levels, off as Partial<ProgressionSnap>)
  const [row] = reincarnationClimbs({ levels, spends: first(T), snap })
  const end = levels[levels.length - 1].ts
  const want = rangeStats({ snap, range: { t0: T, t1: end + 1 } })
  assert.deepEqual(row.play, { activeMs: want.activeMs, elapsedMs: wallMs(want), kills: want.kills })
  assert.equal(row.play?.kills, levels.length, 'the kill on the ding second is inside the climb')
})

test('history trimmed past the start: partial, and no number is claimed', () => {
  const levels = climb(T)
  const [row] = reincarnationClimbs({ levels, spends: first(T), snap: snapWith(levels, { windowStart: T + HOUR }) })
  assert.equal(row.partial, true)
  assert.equal(row.play, null)
  assert.equal(row.status, 'reached', 'the dates are uncapped and still stand')
})

test('a progression snapshot missing the climb is partial, not a row of zeros', () => {
  const levels = climb(T)
  const held = snapWith(levels.slice(0, 5), { lastTs: levels[levels.length - 1].ts })
  assert.equal(reincarnationClimbs({ levels, spends: first(T), snap: held })[0].partial, true)
  const empty = reincarnationClimbs({ levels, spends: first(T), snap: snapOf() })
  assert.equal(empty[0].partial, true)
  assert.equal(empty[0].play, null)
})

test('a ding the leveling module heard first is lag, not missing history', () => {
  const levels = climb(T, 12)
  const behind = levels.slice(0, -1)
  const snap = snapWith(behind, { lastTs: behind[behind.length - 1].ts })
  const [row] = reincarnationClimbs({ levels, spends: first(T), snap })
  assert.equal(row.partial, false)
  assert.equal(row.level, 12)
  assert.equal(row.play?.kills, behind.length)
})

test('a climb the next reincarnation overtook with no 50 on record is unfinished', () => {
  const second = T + 100 * HOUR
  const levels = [...climb(T, 30), ...climb(second, 8)]
  const rows = reincarnationClimbs({ levels, spends: [...first(T), ...ranked(second, 2)], snap: snapWith(levels) })
  assert.equal(rows[1].status, 'unfinished')
  assert.equal(rows[1].play, null)
  assert.equal(rows[1].partial, false)
  assert.equal(rows[0].status, 'climbing')
})
