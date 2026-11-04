// respawnTiers: the Respawn overlay's view across a zone's places (owner, 2026-11-03: tracking is by
// mob, a clock is per open tier / private instance, and the overlay says where the mob is up).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RESPAWN_PREFS, RESPAWN_LINGER_MS, type RespawnRow } from '../src/shared/respawn.ts'
import {
  comparePlaces,
  respawnCellLabel,
  respawnPlaceOf,
  respawnTierEmptyText,
  respawnTierView,
  respawnWithinWindow
} from '../src/shared/respawnTiers.ts'
import { normalizeRespawnOverlayConfig } from '../src/shared/respawnOverlayConfig.ts'

const NOW = 10_000_000
const EST = 720_000

function row(zone: string, baseTs: number, over: Partial<RespawnRow> = {}): RespawnRow {
  const key = over.key ?? 'corrupted kedgespawn'
  return {
    id: `${zone.toLowerCase()}::${key}`,
    key,
    display: over.display ?? 'Corrupted Kedgespawn',
    zone,
    baseTs,
    basis: 'death',
    source: 'observed',
    samples: 1,
    kills: 1,
    estimateMs: EST,
    ...over
  }
}

const watch = (key: string, display: string): { key: string; display: string } => ({ key, display })

test('a zone line names its place: open or inst, with the difficulty; a crawl is its own kind', () => {
  assert.deepEqual(respawnPlaceOf('Lake Nerius'), { kind: 'open', tier: 0, tag: 'open +0' })
  assert.deepEqual(respawnPlaceOf('Lake Nerius 3 (Fused)'), { kind: 'open', tier: 3, tag: 'open +3' })
  assert.deepEqual(respawnPlaceOf('Lake Nerius 4 (Refined) [instance 17]'), { kind: 'inst', tier: 4, tag: 'inst +4' })
  assert.deepEqual(respawnPlaceOf("Nagafen's Lair - Group 4 (Refined)"), { kind: 'crawl', tier: 4, tag: 'crawl +4' })
  assert.deepEqual(respawnPlaceOf('The Plane of Sky (Awakened)'), { kind: 'open', tier: 1, tag: 'open +1' })
  assert.equal(respawnPlaceOf(''), null)
})

test('places order open before inst, each by difficulty', () => {
  const tags = ['inst +4', 'open +4', 'open +0', 'open +2']
    .map((t) => respawnPlaceOf(t === 'inst +4' ? 'X 4 (Refined) [instance 1]' : t === 'open +0' ? 'X' : `X ${t.slice(-1)} (Fused)`))
    .flatMap((p) => (p === null ? [] : [p]))
    .sort(comparePlaces)
    .map((p) => p.tag)
  assert.deepEqual(tags, ['open +0', 'open +2', 'open +4', 'inst +4'])
})

test('another place is shown within twice the respawn, or the linger window with no estimate', () => {
  assert.equal(respawnWithinWindow(row('X', NOW - 2 * EST), NOW), true)
  assert.equal(respawnWithinWindow(row('X', NOW - 2 * EST - 1), NOW), false)
  const none = row('X', NOW - RESPAWN_LINGER_MS, { estimateMs: undefined, source: 'none', samples: 0 })
  assert.equal(respawnWithinWindow(none, NOW), true)
  assert.equal(respawnWithinWindow({ ...none, baseTs: NOW - RESPAWN_LINGER_MS - 1 }, NOW), false)
})

const snapIn = (zone: string, rows: RespawnRow[], watches = [watch('corrupted kedgespawn', 'Corrupted Kedgespawn')]) => ({
  zone,
  rows,
  prefs: { ...DEFAULT_RESPAWN_PREFS, watches }
})

test('standing in the open +3: the +3 clock leads, the other places follow soonest first, old ones drop', () => {
  const rows = [
    row('Lake Nerius 3 (Fused)', NOW - 120_000),
    row('Lake Nerius 4 (Refined)', NOW - 600_000),
    row('Lake Nerius', NOW - EST - 60_000),
    row('Lake Nerius 2 (Adaptive)', NOW - 2 * EST - 1),
    row('Nektropos Castle 4 (Refined)', NOW - 60_000)
  ]
  const v = respawnTierView(snapIn('Lake Nerius 3 (Fused)', rows), NOW, 'here')
  assert.equal(v.here?.tag, 'open +3')
  assert.equal(v.groups.length, 1)
  const g = v.groups[0]
  assert.equal(g?.hereState, 'clock')
  assert.deepEqual(
    g?.entries.map((e) => [e.place.tag, e.here]),
    [
      ['open +0', false],
      ['open +4', false],
      ['open +3', true]
    ]
  )
  assert.deepEqual(
    v.places.map((p) => p.tag),
    ['open +0', 'open +3', 'open +4']
  )
  assert.equal(v.elsewhere, 1, 'the Nektropos clock is another zone')
})

test('a fresh private instance: no kill there yet reads UP, and its column is there', () => {
  const rows = [row('Lake Nerius 4 (Refined)', NOW - 60_000)]
  const v = respawnTierView(snapIn('Lake Nerius 4 (Refined) [instance 19]', rows), NOW, 'here')
  assert.equal(v.here?.tag, 'inst +4')
  assert.equal(v.groups[0]?.hereState, 'up')
  assert.deepEqual(v.groups[0]?.entries.map((e) => e.place.tag), ['open +4'])
  assert.deepEqual(
    v.places.map((p) => p.tag),
    ['open +4', 'inst +4']
  )
})

test('a dungeon crawl shows no clock of its own, and its kills never appear elsewhere', () => {
  const rows = [row("Nagafen's Lair - Group 4 (Refined)", NOW - 60_000), row("Nagafen's Lair", NOW - 60_000)]
  const inCrawl = respawnTierView(snapIn("Nagafen's Lair - Group 4 (Refined)", rows), NOW, 'here')
  assert.equal(inCrawl.groups[0]?.hereState, 'noRespawn')
  assert.deepEqual(inCrawl.groups[0]?.entries.map((e) => e.place.tag), ['open +0'])
  const outside = respawnTierView(snapIn("Nagafen's Lair", rows), NOW, 'here')
  assert.deepEqual(outside.groups[0]?.entries.map((e) => e.place.tag), ['open +0'])
})

test('sort: here puts the clocks where you stand first; soon puts the soonest place first', () => {
  const kedge = [row('Lake Nerius 3 (Fused)', NOW - 60_000), row('Lake Nerius 4 (Refined)', NOW - EST + 30_000)]
  const bear = [row('Lake Nerius 4 (Refined)', NOW - EST, { key: 'direbear', display: 'Direbear' })]
  const watches = [watch('corrupted kedgespawn', 'Corrupted Kedgespawn'), watch('direbear', 'Direbear')]
  const here = respawnTierView(snapIn('Lake Nerius 3 (Fused)', [...kedge, ...bear], watches), NOW, 'here')
  assert.deepEqual(
    here.groups.map((g) => [g.key, g.hereState]),
    [
      ['corrupted kedgespawn', 'clock'],
      ['direbear', 'none']
    ]
  )
  const soon = respawnTierView(snapIn('Lake Nerius 3 (Fused)', [...kedge, ...bear], watches), NOW, 'soon')
  assert.deepEqual(
    soon.groups.map((g) => [g.key, g.entries[0]?.place.tag]),
    [
      ['direbear', 'open +4'],
      ['corrupted kedgespawn', 'open +4']
    ]
  )
})

test('the empty state names the tracking, never "nothing running" while something is watched', () => {
  const none = respawnTierView(snapIn('Befallen', [], []), NOW, 'here')
  assert.equal(respawnTierEmptyText(none, 'Befallen'), 'No clocks running - watch a mob on the Timers tab.')
  const away = respawnTierView(snapIn('Befallen', [row('Lake Nerius', NOW - 60_000)]), NOW, 'here')
  assert.equal(away.groups.length, 0)
  assert.equal(respawnTierEmptyText(away, 'Befallen'), 'Tracking 1 mob, none killed in Befallen yet - 1 running elsewhere.')
  const fresh = respawnTierView(snapIn('Befallen 4 (Refined) [instance 3]', []), NOW, 'here')
  assert.equal(respawnTierEmptyText(fresh, 'Befallen 4 (Refined) [instance 3]'), 'Tracking 1 mob, none killed in Befallen 4 (Refined) yet.')
})

test('the grid cell: m:ss running, up Nm elapsed, UP seen, await with no estimate, long due stale', () => {
  assert.equal(respawnCellLabel(row('X', NOW - 60_000), NOW), '11:00')
  assert.equal(respawnCellLabel(row('X', NOW - EST - 180_000), NOW), 'up 3m')
  assert.equal(respawnCellLabel(row('X', NOW - 60_000, { seenTs: NOW - 10_000, seenVia: 'hits' }), NOW), 'UP')
  assert.equal(respawnCellLabel(row('X', NOW - 60_000, { estimateMs: undefined, source: 'none', samples: 0 }), NOW), 'await')
  assert.equal(respawnCellLabel(row('X', NOW - EST - RESPAWN_LINGER_MS - 1), NOW), 'long due')
})

test('the stored blob reads back with defaults for anything unknown', () => {
  assert.deepEqual(normalizeRespawnOverlayConfig(undefined), { layout: 'rows', sort: 'here', collapsed: false })
  assert.deepEqual(normalizeRespawnOverlayConfig({ layout: 'grid', sort: 'soon', collapsed: true }), {
    layout: 'grid',
    sort: 'soon',
    collapsed: true
  })
  assert.deepEqual(normalizeRespawnOverlayConfig({ layout: 'table', sort: 1, collapsed: 'yes' }), {
    layout: 'rows',
    sort: 'here',
    collapsed: false
  })
})
