// The one Mobs list (owner, 2026-11-10: "Merchants, factions, mobs, respawns are all basically the
// same page, just different REASONS the mob shows up"): each mob's needs, the Update row a known mob
// gets from its field rows, the fold of a no-page faction row into its mob's New page row, the Needs
// filter (any ticked need; counts are mobs) and the Seen as collapse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FOLDED_INTO, GAP_TABS, needCounts, needIndex, needLabel, needsCopyText, needsFilter, needsOf, needsPickOf, needsPickText, seenAs, withMobNeeds } from '../src/shared/gapNeeds'
import { gapDomainOf } from '../src/shared/gapsViewPrefs'
import { gapJob, jobCaption } from '../src/shared/gapJob'
import type { GapRow, GapsSnap } from '../src/shared/gaps'

const row = (domain: GapRow['domain'], name: string, extra: Partial<GapRow> = {}): GapRow =>
  ({ domain, name, kinds: ['killed'], count: 3, first: '2026-11-10 20:00:00', last: '2026-11-10 21:00:00', details: { samples: [] }, ...extra }) as GapRow

const field = (domain: GapRow['domain'], name: string, mob: string, extra: Partial<GapRow> = {}): GapRow =>
  row(domain, name, { page: `A ${mob.replace(/^a /, '')}`, details: { samples: [], sources: { entries: [{ name: mob, n: 3 }], distinct: 1 }, zones: { entries: [{ name: 'Befallen', n: 3 }], distinct: 1, all: ['Befallen'] } }, ...extra })

/** A known mob with every field row; an unknown mob with a kill row and a no-page faction row; a merchant. */
const SNAP: GapsSnap = {
  rows: [
    row('mob', 'a burnt zombie', { kinds: ['killed', 'dropped-by', 'considered', 'hailed'] }),
    field('faction', 'Befallen Inhabitants (a burnt zombie)', 'a burnt zombie', { page: undefined, noPage: true }),
    field('faction', 'Clerics of Underfoot (a festering hag)', 'a festering hag'),
    field('drop', 'Festering Cloak (a festering hag)', 'a festering hag'),
    field('drop', 'Scuffed Silver Key (a festering hag)', 'a festering hag'),
    row('image', 'a festering hag', { page: 'A festering hag', kinds: ['considered'], count: 9, details: { samples: [], zones: { entries: [{ name: 'Toxxulia Forest', n: 9 }], distinct: 1, all: ['Toxxulia Forest'] } } }),
    row('respawn', 'a festering hag', { page: 'A festering hag', count: 4, first: '', last: '' }),
    row('merchant', 'Scribe Noglleg', { kinds: ['quoted'] })
  ],
  totals: { mob: 1, faction: 2, drop: 2, image: 1, respawn: 1, merchant: 1 },
  seen: {}
} as unknown as GapsSnap

test('a known mob with field rows gets one Update row; a no-page faction folds into its mob\'s New page row', () => {
  const snap = withMobNeeds(SNAP)
  const hag = snap.rows.find((r) => r.domain === 'mob' && r.name === 'a festering hag')
  assert.ok(hag !== undefined, 'the hag is on the Mobs list')
  assert.equal(hag.page, 'A festering hag')
  assert.equal(gapJob(hag), 'update', 'its page exists')
  assert.deepEqual(hag.kinds, ['considered', 'killed'])
  assert.equal(hag.count, 9)
  assert.equal(hag.first, '2026-11-10 20:00:00')
  assert.equal(hag.details.zones?.entries[0]?.name, 'Toxxulia Forest')
  assert.ok(!snap.rows.some((r) => r.domain === 'faction' && r.noPage === true), 'the zombie\'s faction row is folded away')
  assert.ok(snap.rows.some((r) => r.domain === 'faction' && r.name.startsWith('Clerics')), 'the hag\'s faction row stays, as a field')
  assert.deepEqual(snap.totals, { mob: 2, faction: 1, drop: 2, image: 1, respawn: 1, merchant: 1 })
  assert.equal(withMobNeeds(snap), snap, 'once per snapshot object, and nothing left to join')
  assert.equal(jobCaption(snap, 'mob', { zone: null, hidden: () => false }), '1 missing · 1 to update')
})

test('needs: the page for an unknown mob; each lacking field for a known one, in the column\'s order, with counts', () => {
  const snap = withMobNeeds(SNAP)
  const index = needIndex(snap.rows)
  const needs = (name: string) => needsOf(snap.rows.find((r) => r.name === name && (r.domain === 'mob' || r.domain === 'merchant'))!, index, { isMob: (n) => n === 'Scribe Noglleg' })
  assert.deepEqual(needs('a burnt zombie').map(needLabel), ['NPC page'])
  assert.deepEqual(needs('a festering hag').map(needLabel), ['factions', 'drops 2', 'picture', 'respawn'])
  assert.deepEqual(needs('Scribe Noglleg').map(needLabel), ['merchant'], 'a known NPC the wiki lists without a merchant page')
  assert.deepEqual(needsOf(field('drop', 'x (y)', 'y'), index), [], 'a field row has no needs of its own')
})

test('the Needs filter keeps rows with ANY ticked need, none ticked keeps all; counts are mobs, not needs', () => {
  const snap = withMobNeeds(SNAP)
  const index = needIndex(snap.rows)
  const mobs = snap.rows.filter((r) => r.domain === 'mob' || r.domain === 'merchant')
  const needs = (r: GapRow) => needsOf(r, index, { isMob: (n) => n === 'Scribe Noglleg' })
  assert.equal(needsFilter(mobs, new Set(), needs).length, 3)
  assert.deepEqual(needsFilter(mobs, new Set(['drops']), needs).map((r) => r.name), ['a festering hag'])
  assert.deepEqual(needsFilter(mobs, new Set(['page', 'merchant']), needs).map((r) => r.name), ['a burnt zombie', 'Scribe Noglleg'])
  const counts = needCounts(mobs, needs)
  assert.equal(counts.get('drops'), 1, 'two drop rows, one mob')
  assert.equal(counts.get('page'), 1)
  assert.equal(counts.get('respawn'), 1)
  assert.equal(needsPickText(needsPickOf('drops,bogus,page')), 'page,drops')
  assert.equal(needsPickOf(null).size, 0)
})

test('an Update row\'s Copy is its field rows\' texts, one after another; a New page row keeps its own', () => {
  const snap = withMobNeeds(SNAP)
  const index = needIndex(snap.rows)
  const hag = snap.rows.find((r) => r.domain === 'mob' && r.name === 'a festering hag')!
  const text = needsCopyText(hag, index, (r) => `[${r.domain}: ${r.name}]`)
  assert.equal(text, '[faction: Clerics of Underfoot (a festering hag)]\n\n[drop: Festering Cloak (a festering hag)]\n\n[drop: Scuffed Silver Key (a festering hag)]\n\n[image: a festering hag]\n\n[respawn: a festering hag]')
  assert.equal(needsCopyText(snap.rows.find((r) => r.name === 'a burnt zombie')!, index, () => 'page'), undefined)
})

test('the tabs: the field domains fold into Mobs, a stored one reads as Mobs; Seen as shows two kinds and a count', () => {
  assert.deepEqual(GAP_TABS, ['item', 'mob', 'spell', 'drop', 'notice', 'quest', 'zone'])
  assert.deepEqual(FOLDED_INTO, { merchant: 'mob', faction: 'mob', image: 'mob', respawn: 'mob' })
  assert.equal(gapDomainOf('faction'), 'mob')
  assert.equal(gapDomainOf('respawn'), 'mob')
  assert.equal(gapDomainOf('drop'), 'drop')
  assert.equal(gapDomainOf('nothing'), 'item')
  assert.deepEqual(seenAs(['killed', 'dropped-by', 'considered', 'hailed']), { shown: ['killed', 'dropped-by'], more: 2 })
  assert.deepEqual(seenAs(['spoke']), { shown: ['spoke'], more: 0 })
})
