// respawnJoinRowCap.test.mts — the row cap across the archive join (bug hunt 2026-11-19). The cap
// is for the other zones: every clock of the zone the player stands in is kept, each tier and
// instance of it, as the engine keeps them (`respawn.rs collect`). A flat cut of 60 dropped the
// oldest rows, and the Respawn overlay then said "none killed here yet" of a mob killed there.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESPAWN_MAX_ROWS, cappedRowCount, type RespawnRow, type RespawnSnap } from '../src/shared/respawn'
import { mergeRespawn, withHistoryRows } from '../src/shared/logArchive/mergeRespawn'
import { mergeModule } from '../src/shared/logArchive/mergeRules'
import { respawnTierEmptyText, respawnTierView } from '../src/shared/respawnTiers'

const LAKE = 'Lake Nerius'
const TIERS = [LAKE, `${LAKE} 1 (Awakened)`, `${LAKE} 2 (Adaptive)`, `${LAKE} 3 (Fused)`, `${LAKE} 4 (Refined) [instance 17]`]

const row = (key: string, zone: string, baseTs: number): RespawnRow => ({
  id: `${zone.toLowerCase()}::${key}`,
  key,
  display: key,
  zone,
  baseTs,
  basis: 'death',
  source: 'none',
  samples: 0,
  kills: 1
})

const snap = (zone: string, rows: RespawnRow[], keys: string[]): RespawnSnap => ({
  v: 4,
  zone,
  rows,
  recent: [],
  prefs: { watches: keys.map((key) => ({ key, display: key })) }
})

/** `n` clocks in other zones, one mob each, killed after everything in the lake. */
const elsewhere = (n: number): RespawnRow[] => Array.from({ length: n }, (_, i) => row(`mob ${String(i)}`, `Zone ${String(i % 7)}`, 10_000 + i))
const mobKeys = (n: number): string[] => Array.from({ length: n }, (_, i) => `mob ${String(i)}`)

/** The named's archived clocks in every tier of the lake, the oldest rows of the archive. */
const lakeRows = (): RespawnRow[] => TIERS.map((zone, i) => row('the named', zone, 100 + i))

const inLake = (rows: readonly RespawnRow[]): RespawnRow[] => rows.filter((r) => r.zone.startsWith(LAKE))

test('the join keeps every clock of the zone you stand in, and caps the other zones', () => {
  const keys = ['the named', ...mobKeys(70)]
  const older = snap('Zone 0', [...elsewhere(70), ...lakeRows()], keys)
  const live = snap(TIERS[1], [row('the named', TIERS[1], 50_000)], keys)
  const merged = mergeRespawn(older, live)
  assert.ok(merged)
  assert.deepEqual(inLake(merged.rows).map((r) => r.zone).sort(), [...TIERS].sort(), 'a clock in every place of the lake')
  assert.equal(merged.rows.length - inLake(merged.rows).length, RESPAWN_MAX_ROWS, 'the other zones hold the cap')
  assert.equal(merged.rows[0]?.baseTs, 50_000, 'the live clock first, and it is the live one')
  // The 60 kept are the newest killed, as before.
  assert.ok(merged.rows.some((r) => r.key === 'mob 69') && !merged.rows.some((r) => r.key === 'mob 0'))
})

test('standing in another zone, the lake is one of the other zones and the cap cuts its oldest', () => {
  const keys = ['the named', ...mobKeys(70)]
  const merged = mergeRespawn(snap('Zone 0', [...elsewhere(70), ...lakeRows()], keys), snap('Najena', [], keys))
  assert.equal(merged?.rows.length, RESPAWN_MAX_ROWS)
  assert.equal(inLake(merged?.rows ?? []).length, 0)
})

test('a blank live zone stands where the archive ended', () => {
  const keys = ['the named', ...mobKeys(70)]
  const older = snap(TIERS[2], [...elsewhere(70), ...lakeRows()], keys)
  const merged = mergeRespawn(older, snap('', [], keys))
  assert.equal(merged?.zone, TIERS[2])
  assert.equal(inLake(merged?.rows ?? []).length, TIERS.length)
})

test("across several archives the zone kept whole is today's, not the zone an archive ended in", () => {
  const keys = ['the named', ...mobKeys(70)]
  const live = snap(LAKE, [], keys)
  // The older archive holds the lake's clocks; the newer one ends elsewhere with a full page.
  const first = withHistoryRows(snap('Zone 1', [], []), lakeRows(), live)
  const second = withHistoryRows(snap('Zone 0', [], []), elsewhere(70), live)
  const merged = mergeModule('respawn', [first, second], live).state as RespawnSnap
  assert.equal(inLake(merged.rows).length, TIERS.length)
  assert.equal(merged.rows.length, TIERS.length + RESPAWN_MAX_ROWS)
  assert.deepEqual(Object.keys(merged).sort(), Object.keys(live).sort(), 'the served state has the live shape')
})

test('the overlay then shows the clock where you stand, never "none killed here yet"', () => {
  const keys = ['the named', ...mobKeys(70)]
  const live = snap(LAKE, [], keys)
  const merged = mergeRespawn(snap('Zone 0', [...elsewhere(70), ...lakeRows()], keys), live)
  assert.ok(merged)
  const view = respawnTierView(merged, 200_000, 'here')
  assert.equal(view.groups.length, 1)
  assert.equal(view.groups[0]?.hereState, 'clock')
  assert.equal(view.elsewhere, RESPAWN_MAX_ROWS)
  // The sentence the cut rows used to produce, for the record of what was wrong.
  const cut = respawnTierView({ ...merged, rows: merged.rows.filter((r) => !r.zone.startsWith(LAKE)) }, 200_000, 'here')
  assert.ok(respawnTierEmptyText(cut, LAKE).includes('none killed in Lake Nerius yet'))
})

test('a count that holds the other zones never states the cap as the whole number', () => {
  assert.equal(cappedRowCount(0, 0), '0')
  assert.equal(cappedRowCount(RESPAWN_MAX_ROWS - 1, RESPAWN_MAX_ROWS - 1), '59')
  assert.equal(cappedRowCount(RESPAWN_MAX_ROWS, RESPAWN_MAX_ROWS), '60+', 'at the cap more may be running')
  assert.equal(cappedRowCount(RESPAWN_MAX_ROWS + 4, RESPAWN_MAX_ROWS), '64+', 'the zone you stand in adds to it')
  assert.equal(cappedRowCount(64, 10), '64', 'under the cap every row was published')
})
