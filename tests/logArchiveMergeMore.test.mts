// ============================================================================
// logArchiveMergeMore.test.mts — the phase 4 merge rules and their split-log tests (log archive,
// steps 4.1 to 4.5).
// ============================================================================
//
// The split-log test of step 1.6 (logArchiveMerge.test.mts), for the modules phase 4 adds. Two
// fixture sets, each recorded once with the engine's own snapshot tool:
//
//   * `wl40-{a,b,whole}.json`: `tests/fixtures/wl40-farm-run.log` cut after line 470.
//   * `la2-{a,b,whole}.json`: `tests/fixtures/logArchive/la2-history-run.log` cut after line 12. A
//     small synthetic log, written for this test because no fixture log holds a class unlock and
//     none cons the same mob on both sides of a cut. Its B half opens with a line no module reads:
//     the engine does not ring a con on the very first line of a file, which is the engine's own
//     behaviour and not a merge matter, so the cut keeps it out of the way.
//
// To re-record: cut the log the same way into files named `eqlog_Primitive_freeport.<part>.txt`,
// run `engine/target/release/parity.exe <file> --snapshots --tz UTC` on each, and keep the modules
// each fixture holds from the `modules` array (each module's `snapshot.state`).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONSIDER_CAP, mergeConsider } from '../src/shared/logArchive/mergeConsider'
import { mergeItemTiers } from '../src/shared/logArchive/mergeItemTiers'
import { dropsFromLoot, mergeDropsSeen, withArchivedDrops } from '../src/shared/logArchive/mergeDropsSeen'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { MobLootIndex } from '../src/main/mobLookupParse'
import type { ConsiderRow, ConsiderSnap, ItemTierRow, ItemTiersSnap, LootSnap, MobSeenDrop } from '../src/shared/types'

interface Recorded {
  loot: LootSnap
  consider?: ConsiderSnap
  itemTiers: ItemTiersSnap
}

const fixture = (name: string): Recorded =>
  JSON.parse(readFileSync(new URL(`fixtures/logArchive/${name}.json`, import.meta.url), 'utf8')) as Recorded

const WL = { a: fixture('wl40-a'), b: fixture('wl40-b'), whole: fixture('wl40-whole') }
const LA = { a: fixture('la2-a'), b: fixture('la2-b'), whole: fixture('la2-whole') }

// ── 4.1 consider: the split-log test ────────────────────────────────────────────────────────────

/**
 * THE ONE FIELD ALLOWED TO DIFFER. B cons the large rat before B's first zone line. The fold labels
 * a row with the zone it is standing in, so the whole log labels it West Freeport (from A) and B
 * alone cannot label it at all. The merge keeps B's row, the newest con, as the fold does.
 */
function wholeConsiderAsSplitSeesThem(): ConsiderSnap {
  const ring = structuredClone(LA.whole.consider ?? [])
  const rat = ring.find((r) => r.id === 'a large rat')
  assert.ok(rat)
  delete rat.zone
  return ring
}

test('split log: consider of A merged with B equals the consider ring of the whole log', () => {
  assert.deepEqual(mergeModule('consider', [LA.a.consider], LA.b.consider).state, wholeConsiderAsSplitSeesThem())
})

test('split log: the consider fixture really is split', () => {
  const a = LA.a.consider ?? []
  const b = LA.b.consider ?? []
  assert.ok(a.some((r) => b.some((s) => s.id === r.id)), 'a mob is conned in both halves')
  assert.ok(a.some((r) => !b.some((s) => s.id === r.id)), 'a mob is conned in A only')
})

// ── 4.1 drops seen: the split-log test ──────────────────────────────────────────────────────────

/** The app's own index (its fold before the engine took it over), fed the whole log's loot. */
function wholeDropsSeen(loot: LootSnap, mob: string): MobSeenDrop[] {
  const index = new MobLootIndex()
  for (const r of loot) if (r.disposition !== 'destroyed') index.note(r.item, r.source, r.ts, r.count ?? 1)
  return sortedLikeEngine(index.drops(mob))
}

function sortedLikeEngine(rows: MobSeenDrop[]): MobSeenDrop[] {
  return [...rows].sort((a, b) => b.count - a.count || b.lastTs - a.lastTs || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0))
}

for (const [name, set] of [['wl40', WL], ['la2', LA]] as const) {
  test(`split log (${name}): every mob's drops seen, archive A joined to B, equal the whole log's`, () => {
    const mobs = new Set(set.whole.loot.flatMap((r) => (r.source === undefined ? [] : [r.source])))
    assert.ok(mobs.size > 0)
    for (const mob of mobs) {
      const live = dropsFromLoot(set.b.loot, [mob])
      const box = withArchivedDrops(live.length > 0 ? { seen: live } : {}, [set.a.loot], [mob])
      assert.deepEqual(box.seen ?? [], wholeDropsSeen(set.whole.loot, mob), mob)
    }
  })
}

test('split log: some mob drops in both halves of la2, so counts really add', () => {
  const a = dropsFromLoot(LA.a.loot, ['a large rat']).map((d) => d.item)
  const b = dropsFromLoot(LA.b.loot, ['a large rat']).map((d) => d.item)
  assert.ok(a.some((item) => b.includes(item)))
})

// ── 4.1 consider: the rule ──────────────────────────────────────────────────────────────────────

const con = (id: string, mob: string, ts: number, extra: Partial<ConsiderRow> = {}): ConsiderRow => ({
  id,
  mob,
  ts,
  rare: false,
  faction: 'indifferent',
  difficulty: 'x',
  cons: 1,
  ...extra
})

test('consider: a mob on both sides takes the newer con, with the cons added and the fold\'s display', () => {
  const m = mergeConsider([con('a rat', 'a rat', 1, { cons: 2 }), con('b', 'B', 2)], [con('a rat', 'A rat', 9, { cons: 3, level: 4 })])
  assert.ok(m)
  assert.deepEqual(m.map((r) => r.id), ['b', 'a rat'])
  assert.deepEqual(m[1], con('a rat', 'a rat', 9, { cons: 5, level: 4 }))
})

test('consider: learned knowledge is kept across the join, and the ring keeps its cap', () => {
  const knowledge = { name: 'x' } as unknown as ConsiderRow['knowledge']
  const m = mergeConsider([con('k', 'k', 1, { knowledge })], [con('k', 'k', 2)])
  assert.equal(m?.[0].knowledge, knowledge)
  const older = Array.from({ length: CONSIDER_CAP }, (_, i) => con(`o${i}`, `o${i}`, i))
  const capped = mergeConsider(older, [con('n', 'n', 999)])
  assert.equal(capped?.length, CONSIDER_CAP)
  assert.equal(capped?.[0].id, 'o1', 'the oldest falls off the front')
  assert.equal(capped?.[CONSIDER_CAP - 1].id, 'n')
})

test('consider: inputs are not changed, and a bad shape is not merged', () => {
  const older = [con('a', 'a', 1)]
  const newer = [con('a', 'a', 2)]
  const before = JSON.stringify([older, newer])
  mergeConsider(older, newer)
  assert.equal(JSON.stringify([older, newer]), before)
  assert.equal(mergeConsider({}, []), null)
  assert.equal(mergeConsider([{ id: 'a' }], []), null)
})

// ── 4.1 drops seen: the rule ────────────────────────────────────────────────────────────────────

test('drops seen: a destroy, a row with no source and an empty item are not drops; a stack adds its count', () => {
  const rows = [
    { ts: 1, item: 'Bone Chips', source: 'a rat', count: 2 },
    { ts: 2, item: 'bone chips', source: 'A rat' },
    { ts: 3, item: 'Bone Chips', source: 'a rat', disposition: 'destroyed', count: 5 },
    { ts: 4, item: 'Rat Ear' },
    { ts: 5, item: ' ', source: 'a rat' },
    'not a row'
  ]
  assert.deepEqual(dropsFromLoot(rows, ['a rat']), [{ item: 'Bone Chips', count: 3, lastTs: 2 }])
})

test('drops seen: every spelling of one mob counts, and the order is the engine\'s', () => {
  const rows = [
    { ts: 1, item: 'B', source: 'Cazic-Thule' },
    { ts: 2, item: 'A', source: 'Cazic Thule' },
    { ts: 3, item: 'C', source: 'Cazic Thule' },
    { ts: 3, item: 'C', source: 'Cazic Thule' }
  ]
  assert.deepEqual(dropsFromLoot(rows, ['cazic thule', 'cazic-thule']).map((d) => d.item), ['C', 'A', 'B'])
})

test('drops seen: the join adds counts, keeps the later time and the archive\'s spelling', () => {
  const merged = mergeDropsSeen([{ item: 'Rat Ear', count: 2, lastTs: 5 }], [{ item: 'rat ear', count: 1, lastTs: 9 }])
  assert.deepEqual(merged, [{ item: 'Rat Ear', count: 3, lastTs: 9 }])
})

test('drops seen: nothing archived for the mob returns the served box as the same object', () => {
  const box = { seen: [{ item: 'x', count: 1, lastTs: 1 }] }
  assert.equal(withArchivedDrops(box, [[{ ts: 1, item: 'y', source: 'someone else' }]], ['a rat']), box)
  assert.equal(withArchivedDrops(box, [], ['a rat']), box)
  const empty = {}
  assert.deepEqual(withArchivedDrops(empty, [[{ ts: 1, item: 'y', source: 'a rat' }]], ['a rat']), {
    seen: [{ item: 'y', count: 1, lastTs: 1 }]
  })
})

// ── 4.2 item tiers ──────────────────────────────────────────────────────────────────────────────

for (const [name, set] of [['wl40', WL], ['la2', LA]] as const) {
  test(`split log (${name}): item tiers of A merged with B equal the item tiers of the whole log`, () => {
    assert.deepEqual(mergeModule('itemTiers', [set.a.itemTiers], set.b.itemTiers).state, set.whole.itemTiers)
  })
}

test('split log: an item is upgraded in both halves of both fixtures, and la2 names a lower tier last', () => {
  for (const set of [WL, LA]) {
    assert.ok(Object.keys(set.a.itemTiers).some((k) => Object.prototype.hasOwnProperty.call(set.b.itemTiers, k)))
  }
  const fists = LA.whole.itemTiers['whitened treant fists']
  assert.ok(fists.tier !== undefined && fists.lastTier !== undefined && fists.lastTier < fists.tier)
})

const tierRow = (over: Partial<ItemTierRow>): ItemTierRow => ({ key: 'k', name: 'K', merges: 1, firstAt: 1, lastAt: 1, ...over })

test('item tiers: the higher tier wins, the newer last tier stands, merges add, first and last instants span both', () => {
  const m = mergeItemTiers({ k: tierRow({ tier: 4, lastTier: 4, merges: 3, firstAt: 1, lastAt: 5 }) }, { k: tierRow({ name: 'k', tier: 2, lastTier: 2, firstAt: 9, lastAt: 12 }) })
  assert.deepEqual(m, { k: { key: 'k', name: 'k', tier: 4, lastTier: 2, merges: 4, firstAt: 1, lastAt: 12 } })
})

test("item tiers: a side that named no tier keeps the other side's, and absent stays absent", () => {
  const m = mergeItemTiers({ k: tierRow({ tier: 3, lastTier: 3 }) }, { k: tierRow({ firstAt: 7, lastAt: 7 }) })
  assert.equal(m?.k.tier, 3)
  assert.equal(m?.k.lastTier, 3)
  const none = mergeItemTiers({ k: tierRow({}) }, { k: tierRow({ lastAt: 4 }) })
  assert.ok(none && !('tier' in none.k) && !('lastTier' in none.k))
})

test('item tiers: inputs are not changed, and a bad shape is not merged', () => {
  const older = { k: tierRow({ tier: 1 }) }
  const newer = { k: tierRow({ tier: 2 }) }
  const before = JSON.stringify([older, newer])
  mergeItemTiers(older, newer)
  assert.equal(JSON.stringify([older, newer]), before)
  assert.equal(mergeItemTiers([], {}), null)
  assert.equal(mergeItemTiers({ k: { key: 'k' } }, {}), null)
})

// ── the lookup ──────────────────────────────────────────────────────────────────────────────────

test('lookup: the phase 4 modules have rules', () => {
  assert.ok(hasMergeRule('consider') && hasMergeRule('itemTiers'))
})
