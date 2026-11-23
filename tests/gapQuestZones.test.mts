// A quest line is not offered for an NPC page that does not stand where the quest starts (owner,
// 2026-11-21). Small fixtures with the wiki's own shapes, so a data refresh cannot turn these red.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GapRow, GapsSnap } from '../src/shared/gaps'
import { questZoneCheck, startsElsewhere, withoutForeignQuests } from '../src/shared/gapQuestZones'

const MOBS = [
  { page: 'Lenka Stoutheart', zones: ['East Freeport'] },
  { page: 'Lenka Stoutheart (Firiona Vie)', zones: ['Firiona Vie'] },
  { page: 'Lord Ollix Everling', zones: ['Nektropos Castle'] },
  { page: 'Nikko Canti', zones: ['Lake Nerius'] },
  { page: 'No Zones' },
  { page: 'Vague', zones: ['Freeport'] }
]
const QUESTS = [
  { page: 'Cabilis Pale Ale (Firiona Vie)', giver: 'Lenka Stoutheart', startZone: 'Firiona Vie' },
  { page: 'The Painting', giver: 'Lenka Stoutheart', startZone: 'East Freeport' },
  { page: 'The Tragic Tale of House Everling', giver: 'Lord Ollix Everling', startZone: 'Nektropos Castle' },
  { page: 'Call for Aid', giver: 'Nikko Canti', startZone: 'Lake Nerius' },
  { page: 'No Start' },
  { page: 'Vague Start', startZone: 'Various' },
  { page: 'Twice', startZone: 'Firiona Vie' },
  { page: 'twice', startZone: 'East Freeport' }
]
const check = questZoneCheck(MOBS, QUESTS)

const rowOf = (page: string, quests: string[], extra: Partial<GapRow> = {}): GapRow =>
  ({ domain: 'mob', name: page, kinds: ['hail'], count: 1, first: '', last: '', details: {}, questGaps: { page, quests }, ...extra }) as unknown as GapRow
const snapOf = (rows: GapRow[]): GapsSnap => ({ rows, totals: { mob: rows.length }, seen: {} }) as unknown as GapsSnap

test('THE CABILIS PALE ALE LINE IS GONE from Lenka Stoutheart in East Freeport, and the row and total with it', () => {
  const out = withoutForeignQuests(snapOf([rowOf('Lenka Stoutheart', ['Cabilis Pale Ale (Firiona Vie)'])]), check)
  assert.deepEqual(out.rows, [])
  assert.equal(out.totals.mob, 0)
})

test('the page in the start zone answers for itself: its twin there does not save the East Freeport line', () => {
  assert.equal(check('Lenka Stoutheart', 'Cabilis Pale Ale (Firiona Vie)'), true)
  assert.equal(check('Lenka Stoutheart (Firiona Vie)', 'Cabilis Pale Ale (Firiona Vie)'), false)
})

test('a row keeps the quests that start where the NPC stands', () => {
  const out = withoutForeignQuests(snapOf([rowOf('Lenka Stoutheart', ['Cabilis Pale Ale (Firiona Vie)', 'The Painting'])]), check)
  assert.deepEqual(out.rows[0]?.questGaps, { page: 'Lenka Stoutheart', quests: ['The Painting'] })
  assert.equal(out.totals.mob, 1)
})

test("LORD OLLIX'S LINE STAYS, and NIKKO'S CALL FOR AID IS NOT CLEARED: both start in the NPC's zone", () => {
  const snap = snapOf([rowOf('Lord Ollix Everling', ['The Tragic Tale of House Everling']), rowOf('Nikko Canti', ['Call for Aid'])])
  assert.equal(withoutForeignQuests(snap, check), snap, 'nothing removed: the same snapshot object')
})

test('AN UNKNOWN ZONE REMOVES NOTHING: no start, no NPC zones, a spelling the table refuses, an unlisted page or quest', () => {
  assert.equal(check('Lenka Stoutheart', 'No Start'), false)
  assert.equal(check('No Zones', 'Cabilis Pale Ale (Firiona Vie)'), false)
  assert.equal(check('Vague', 'Cabilis Pale Ale (Firiona Vie)'), false, 'Freeport is three zones')
  assert.equal(check('Lenka Stoutheart', 'Vague Start'), false)
  assert.equal(check('Not In The Catalog', 'Cabilis Pale Ale (Firiona Vie)'), false)
  assert.equal(check('Lenka Stoutheart', 'Not In The Catalog'), false)
  assert.equal(check('Lenka Stoutheart', 'Twice'), false, 'two pages, one title, two start zones')
  assert.equal(startsElsewhere('Firiona Vie', []), false)
  assert.equal(startsElsewhere('Firiona Vie', ['East Freeport', 'Various']), false, 'one unknown place could be the start')
})

test('zones compare through the zone table: spellings of one place, and an NPC in several zones', () => {
  assert.equal(startsElsewhere('East Freeport', ['EFP']), false)
  assert.equal(startsElsewhere('The Eastern Plains of Karana', ['Eastern Karana']), false)
  assert.equal(startsElsewhere('Permafrost Keep', ['Permafrost']), false)
  assert.equal(startsElsewhere('Lake Nerius', ['East Freeport', 'Lake Nerius']), false)
  assert.equal(startsElsewhere('Firiona Vie', ['East Freeport', 'West Freeport']), true)
})

test('a row that is also a redirect stays for the redirect, without the quest line', () => {
  const out = withoutForeignQuests(snapOf([rowOf('Lenka Stoutheart', ['Cabilis Pale Ale (Firiona Vie)'], { viaRedirect: 'Elsewhere' })]), check)
  assert.equal(out.rows.length, 1)
  assert.equal(out.rows[0]?.questGaps, undefined)
  assert.equal(out.rows[0]?.viaRedirect, 'Elsewhere')
})
