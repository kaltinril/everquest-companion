// The drop-database event builder (src/main/dropObs/events.ts): the player's own loot rows as schema 1
// `eozobservations` loot events (docs/community/requirements/drop-db-submit.md). Pure; nothing here
// reaches a network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { batchIdFor, itemTier, nextBatch, obsEvent, obsEvents, type LootRowIn } from '../src/main/dropObs/events'

const NOW = Date.parse('2026-11-23T12:00:00.000Z')
const TS = Date.parse('2026-11-20T03:04:05.000Z')
const ctx = { server: 'freeport', character: 'Primitive', players: new Set(['primitive', 'drywrought', 'bob']), now: NOW }
const row = (over: Partial<LootRowIn> = {}): LootRowIn => ({ ts: TS, item: 'Bone Chips', source: 'a rat', zone: 'Befallen', ...over })
const ID = /^[A-Za-z0-9_-]{8,120}$/

test('itemTier reads the +N suffix (0..10), with or without (Exaltation), and nothing else', () => {
  assert.equal(itemTier('Shin Greaves +2'), 2)
  assert.equal(itemTier('Shin Greaves +0'), 0)
  assert.equal(itemTier('Thick Banded Belt +10'), 10)
  assert.equal(itemTier('Thick Banded Belt +3 (Exaltation)'), 3)
  assert.equal(itemTier('Thick Banded Belt +11'), null)
  assert.equal(itemTier('Bone Chips'), null)
  assert.equal(itemTier('+2'), null)
})

test('A ROW BECOMES THIS EVENT: keys in order, ms-precision UTC, the item as the log spelled it, no tier when none', () => {
  const e = obsEvent(row(), ctx, 0)
  assert.ok(e !== null)
  assert.match(e.id, /^eqc-[0-9a-f]{40}$/)
  assert.deepEqual(Object.keys(e), ['id', 'kind', 'observedAt', 'server', 'zone', 'npc', 'item', 'quantity', 'instance', 'sourceKind'])
  assert.deepEqual({ ...e, id: 'x' }, {
    id: 'x',
    kind: 'loot',
    observedAt: '2026-11-20T03:04:05.000Z',
    server: 'freeport',
    zone: 'Befallen',
    npc: 'a rat',
    item: 'Bone Chips',
    quantity: 1,
    instance: 'unknown',
    sourceKind: 'explicit-corpse'
  })
  assert.ok(!JSON.stringify(e).includes('Primitive'), 'no character name, ever')
})

test('a tiered item carries its tier beside its own name; a stack carries its count', () => {
  const e = obsEvent(row({ item: 'Shin Greaves +2', count: 4, disposition: 'sold' }), ctx, 0)
  assert.equal(e?.item, 'Shin Greaves +2')
  assert.equal(e?.tier, 2)
  assert.equal(e?.quantity, 4)
  assert.deepEqual(Object.keys(e ?? {}).slice(7, 9), ['quantity', 'tier'])
})

test('NOT SENT: destroyed, Reward Chest, no source, a player corpse, no zone, a count out of range, a future stamp', () => {
  const none = (over: Partial<LootRowIn>): void => assert.equal(obsEvent(row(over), ctx, 0), null, JSON.stringify(over))
  none({ disposition: 'destroyed' })
  none({ source: 'Reward Chest' })
  none({ source: undefined, item: 'Ivory from Reward Chest' })
  none({ source: undefined })
  none({ source: '' })
  none({ source: 'Primitive' })
  none({ source: 'BOB' })
  none({ zone: undefined })
  none({ count: 0 })
  none({ count: 1001 })
  none({ ts: NOW + 10 * 60_000 })
  none({ item: 'x'.repeat(231) })
  assert.equal(obsEvent(row(), { ...ctx, server: '' }, 0), null, 'no server, no event')
  assert.notEqual(obsEvent(row({ disposition: 'currency' }), ctx, 0), null, 'other dispositions are still loot off a corpse')
})

test('IDS ARE DETERMINISTIC and two identical rows at one instant are two events', () => {
  const rows = [row(), row(), row({ item: 'Rat Whiskers' })]
  const a = obsEvents(rows, ctx)
  const b = obsEvents(rows, ctx)
  assert.equal(a.length, 3)
  assert.deepEqual(a, b, 'the same log gives the same IDs (a resend after a reinstall is a duplicate)')
  assert.equal(new Set(a.map((e) => e.id)).size, 3)
  for (const e of a) assert.match(e.id, ID)
  const other = obsEvents(rows, { ...ctx, character: 'Drywrought' })
  assert.notEqual(other[0].id, a[0].id, 'another character on the same server is another report')
})

test('events come newest first', () => {
  const rows = [row({ ts: TS }), row({ ts: TS + 2000 }), row({ ts: TS + 1000 })]
  assert.deepEqual(
    obsEvents(rows, ctx).map((e) => e.observedAt),
    ['2026-11-20T03:04:07.000Z', '2026-11-20T03:04:06.000Z', '2026-11-20T03:04:05.000Z']
  )
})

const LIM = { events: 100, bytes: 262_144, eventBytes: 4096 }

test('a batch holds at most 100 events and fits the byte limit; its ID is a hash of its content', () => {
  const rows = Array.from({ length: 250 }, (_, i) => row({ ts: TS + i * 1000 }))
  const events = obsEvents(rows, ctx)
  const b = nextBatch(events, 'everquest-companion/0.1.0', LIM)
  assert.ok(b !== null)
  assert.equal(b.events.length, 100)
  assert.equal(b.schemaVersion, 1)
  assert.match(b.batchId, ID)
  assert.deepEqual(b.events, events.slice(0, 100), 'newest first, in order')
  assert.equal(nextBatch(events, 'everquest-companion/0.1.0', LIM)?.batchId, b.batchId, 'the same content, the same ID')
  assert.notEqual(nextBatch(events, 'everquest-companion/0.2.0', LIM)?.batchId, b.batchId, 'another client version is another batch')
  assert.equal(b.batchId, batchIdFor(b.clientVersion, b.events))
  const small = nextBatch(events, 'v', { ...LIM, bytes: 2000 })
  assert.ok(small !== null && small.events.length > 0 && small.events.length < 100)
  assert.ok(Buffer.byteLength(JSON.stringify(small)) <= 2000)
  assert.equal(nextBatch(events, 'v', { ...LIM, events: 7 })?.events.length, 7, 'the status limit is honoured')
  assert.equal(nextBatch([], 'v', LIM), null)
})
