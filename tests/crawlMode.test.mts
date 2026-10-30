// Crawl mode (competitor-quick-wins, 2026-10-29): the mobs killed on this visit to the zone, from
// the kills module's record and the progression module's zone intervals.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { killedSince, stayStart, type ZoneStays } from '../src/shared/crawlMode'
import { zoneShortName } from '../src/shared/zones'
import type { KillInfo, KillMap } from '../src/shared/kills'

const kill = (display: string, lastTs: number): KillInfo => ({ count: 1, bestTier: -1, firstTs: lastTs, lastTs, credited: 1, display, tiers: {} })
const kills: KillMap = {
  'a gnoll pup': kill('a gnoll pup', 5_000),
  'orc pawn': kill('Orc pawn', 9_000),
  'a bat': kill('a bat', 1_000)
}
const here = zoneShortName('Crushbone')
const killedThisStay = (k: KillMap, s: ZoneStays, zone: string | null): ReadonlySet<string> => killedSince(k, stayStart(s, zone))
const stays = { zoneStart: [0, 4_000], zoneName: ['Greater Faydark', 'Crushbone'] }

test('the zone names used here resolve, or the rest proves nothing', () => {
  assert.ok(here != null)
  assert.notEqual(zoneShortName('Greater Faydark'), here)
})

test('this visit starts at the latest zone line, and only while that zone is the one asked about', () => {
  assert.equal(stayStart(stays, here), 4_000)
  assert.equal(stayStart(stays, zoneShortName('Greater Faydark')), null, 'a zone you have left counts nothing')
  assert.equal(stayStart(stays, null), null)
  assert.equal(stayStart({ zoneStart: [], zoneName: [] }, here), null)
})

test('the kills since the visit began, keyed as the map rows key a mob', () => {
  const set = killedThisStay(kills, stays, here)
  assert.deepEqual([...set].sort(), ['a gnoll pup', 'orc pawn'])
  assert.ok(!set.has('a bat'), 'killed before you zoned in')
})

test('leaving the zone resets it: a new zone line, a new visit, nothing killed yet', () => {
  const moved = { zoneStart: [...stays.zoneStart, 10_000], zoneName: [...stays.zoneName, 'Greater Faydark'] }
  assert.equal(killedThisStay(kills, moved, zoneShortName('Greater Faydark')).size, 0)
  assert.equal(killedThisStay(kills, moved, here).size, 0, 'the zone you left dims nothing')
})

test('no visit to count from, nothing dimmed', () => {
  assert.equal(killedSince(kills, null).size, 0)
})
