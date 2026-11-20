// respawnJoinSharedName.test.mts — "Several mobs share this name" across the archive join (owner,
// 2026-11-09; bug hunt 2026-11-19). The live engine numbers a shared-name watch from its gaps of ten
// minutes or more. An archived row was numbered before the switch was set, or read with a bare watch
// (the history rows), so its bound is the short gap of two spawns mixed. The join must not let that
// bound number the clock again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { respawnSourceLabel, type RespawnRow, type RespawnSnap } from '../src/shared/respawn'
import { mergeRespawn, withHistoryRows } from '../src/shared/logArchive/mergeRespawn'
import { mergeModule } from '../src/shared/logArchive/mergeRules'

const FLOORED = 1_260_000

const row = (over: Partial<RespawnRow>): RespawnRow => ({
  id: 'guk::a gnoll',
  key: 'a gnoll',
  display: 'a gnoll',
  zone: 'Guk',
  baseTs: 100,
  basis: 'death',
  source: 'observed',
  samples: 2,
  kills: 3,
  observedMs: 90_000,
  estimateMs: 90_000,
  gapsMs: [90_000, 120_000],
  ...over
})

const watch = (over: { sharedName?: true; customSec?: number } = {}): RespawnSnap['prefs'] => ({ watches: [{ key: 'a gnoll', display: 'a gnoll', ...over }] })

const snap = (rows: RespawnRow[], prefs: RespawnSnap['prefs'], over: Partial<RespawnSnap> = {}): RespawnSnap => ({ v: 4, zone: 'Guk', rows, recent: [], prefs, ...over })

const learned = (gapsMs: number[], zone = 'Guk'): NonNullable<RespawnSnap['learned']> => [
  { id: `${zone.toLowerCase()}::a gnoll`, key: 'a gnoll', display: 'a gnoll', zone, gapsMs }
]

/** The live engine's row for a shared-name watch: one gap of 21 minutes, the short ones left out. */
const live = (over: Partial<RespawnRow> = {}): RespawnRow =>
  row({ observedMs: FLOORED, estimateMs: FLOORED, samples: 1, sharedName: true, gapsMs: [FLOORED, 95_000], baseTs: 900, ...over })

test('an archived short gap does not lower a shared-name clock', () => {
  const joined = mergeRespawn(snap([row({})], watch()), snap([live()], watch({ sharedName: true })))?.rows[0]
  assert.ok(joined)
  assert.equal(joined.observedMs, FLOORED)
  assert.equal(joined.estimateMs, FLOORED)
  assert.equal(joined.samples, 1, 'only the gap over ten minutes is counted')
  assert.equal(joined.sharedName, true)
  assert.equal(respawnSourceLabel(joined), 'your kills (1 gap over 10 min)')
  assert.equal(joined.kills, 6, 'kills still add')
})

test('an archived gap of ten minutes or more still counts for a shared name', () => {
  const older = row({ observedMs: 90_000, gapsMs: [90_000, 900_000] })
  const joined = mergeRespawn(snap([older], watch()), snap([live()], watch({ sharedName: true })))?.rows[0]
  assert.equal(joined?.observedMs, 900_000)
  assert.equal(joined?.estimateMs, 900_000)
  assert.equal(joined?.samples, 2)
  // Ten minutes exactly is over the floor, one second under is not.
  const edge = mergeRespawn(snap([row({ gapsMs: [599_000, 600_000] })], watch()), snap([live()], watch({ sharedName: true })))?.rows[0]
  assert.equal(edge?.observedMs, 600_000)
  assert.equal(edge?.samples, 2)
})

test("the archive's whole learned list is read, not only the row's six newest gaps", () => {
  const older = snap([row({ samples: 9 })], watch(), { learned: learned([90_000, 120_000, 95_000, 660_000, 100_000, 110_000, 105_000, 700_000, 115_000]) })
  const joined = mergeRespawn(older, snap([live()], watch({ sharedName: true })))?.rows[0]
  assert.equal(joined?.observedMs, 660_000)
  assert.equal(joined?.samples, 3, 'two archived gaps over the floor and the live one')
})

test('the archived gaps pool across the places of the zone, as the engine pools them', () => {
  const MM = 'The Castle of Mistmoore'
  const here = row({ id: 'the castle of mistmoore 4 (refined)::a gnoll', zone: `${MM} 4 (Refined)` })
  const older = snap([here], watch(), { zone: here.zone, learned: [...learned([720_000], `${MM} 3 (Fused)`), ...learned([650_000], 'Najena')] })
  const joined = mergeRespawn(older, snap([], watch({ sharedName: true }), { zone: here.zone }))?.rows[0]
  assert.equal(joined?.observedMs, 720_000, "another tier's gap counts, another zone's does not")
  assert.equal(joined?.samples, 1)
})

test('an archived-only row of a shared name shows no short clock', () => {
  const elsewhere = row({ id: 'najena::a gnoll', zone: 'Najena' })
  const alone = mergeRespawn(snap([elsewhere], watch()), snap([live()], watch({ sharedName: true })))?.rows.find((r) => r.zone === 'Najena')
  assert.ok(alone)
  assert.equal(alone.estimateMs, undefined)
  assert.equal(alone.observedMs, undefined)
  assert.equal(alone.source, 'none')
  assert.equal(alone.samples, 0)
  assert.equal(alone.sharedName, true)
  // With a wiki time the ladder falls to it, as the engine's does.
  const wiki = mergeRespawn(snap([row({ ...elsewhere, wikiMs: 1_320_000, wikiText: '22 minutes' })], watch()), snap([], watch({ sharedName: true })))?.rows[0]
  assert.equal(wiki?.estimateMs, 1_320_000)
  assert.equal(wiki?.source, 'wiki')
})

test('an agreed gap under ten minutes does not lower the wiki floor of a shared name', () => {
  const older = row({ observedMs: 150_000, agreedMs: 150_000, samples: 3, gapsMs: [150_000, 152_000, 155_000], wikiMs: 1_320_000, wikiText: '22 minutes', estimateMs: 150_000 })
  const newer = live({ wikiMs: 1_320_000, wikiText: '22 minutes', estimateMs: 1_320_000 })
  const joined = mergeRespawn(snap([older], watch()), snap([newer], watch({ sharedName: true })))?.rows[0]
  assert.equal(joined?.agreedMs, undefined)
  assert.equal(joined?.estimateMs, 1_320_000)
  // An agreed gap over the floor is the same gap with the short ones out: it is kept.
  const long = row({ observedMs: 90_000, agreedMs: 720_000, samples: 4, gapsMs: [90_000, 720_000, 725_000, 730_000], wikiMs: 1_320_000, wikiText: '22 minutes' })
  const kept = mergeRespawn(snap([long], watch()), snap([newer], watch({ sharedName: true })))?.rows[0]
  assert.equal(kept?.agreedMs, 720_000)
  assert.equal(kept?.estimateMs, 720_000)
})

test('a row the engine already floored is joined as it is', () => {
  const older = row({ observedMs: 840_000, estimateMs: 840_000, samples: 5, sharedName: true, gapsMs: [70_000, 80_000] })
  const joined = mergeRespawn(snap([older], watch({ sharedName: true })), snap([live()], watch({ sharedName: true })))?.rows[0]
  assert.equal(joined?.observedMs, 840_000)
  assert.equal(joined?.samples, 6)
})

test('a typed number still wins over a shared name across the join', () => {
  const typed = live({ customMs: 300_000, source: 'custom', estimateMs: 300_000 })
  const joined = mergeRespawn(snap([row({})], watch()), snap([typed], watch({ sharedName: true, customSec: 300 })))?.rows[0]
  assert.equal(joined?.estimateMs, 300_000)
  assert.equal(joined?.source, 'custom')
  assert.equal(joined?.observedMs, FLOORED)
})

test('without the switch the rows join as they always did', () => {
  const plain = row({ observedMs: FLOORED, estimateMs: FLOORED, samples: 1, gapsMs: [FLOORED], baseTs: 900 })
  const joined = mergeRespawn(snap([row({})], watch()), snap([plain], watch()))?.rows[0]
  assert.equal(joined?.observedMs, 90_000)
  assert.equal(joined?.estimateMs, 90_000)
  assert.equal(joined?.samples, 3)
  assert.equal(joined?.sharedName, undefined)
})

test('a history row read with a bare watch is floored by the live list, across several archives', () => {
  const liveSnap = snap([live()], watch({ sharedName: true }))
  const first = withHistoryRows(snap([], { watches: [] }), [row({})], liveSnap)
  const second = withHistoryRows(snap([], { watches: [] }), [row({ gapsMs: [100_000, 780_000] })], liveSnap)
  const merged = mergeModule('respawn', [first, second], liveSnap).state as RespawnSnap
  assert.equal(merged.rows.length, 1)
  assert.equal(merged.rows[0]?.observedMs, 780_000)
  assert.equal(merged.rows[0]?.estimateMs, 780_000)
  assert.equal(merged.rows[0]?.samples, 2)
  // The archives alone, no live row: still no short clock.
  const none = mergeModule('respawn', [first], snap([], watch({ sharedName: true }))).state as RespawnSnap
  assert.equal(none.rows[0]?.estimateMs, undefined)
  assert.equal(none.rows[0]?.source, 'none')
})
