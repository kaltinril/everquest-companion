// THE EXALTATION CLEANUP ADVISOR (src/renderer/src/features/character/exaltationAudit.ts; fork
// ask, kaltinril 2026-09-09). What is pinned, because each is a decision:
//
//   DUPLICATES are counted, never commanded — the row states copies / socketed / loose, and a
//   single copy is never a finding.
//
//   SUPERSEDED runs through the CLASS GATE on the BETTER copy: a higher tier of the same effect
//   family flags the lower one only when some class of the character's loadout can use the
//   better donor. An unusable higher tier supersedes nothing ("the items are class-specific").
//
//   RANK comes from the corpus's focus parse where it ran (`family`/`familyTier`) and from the
//   trailing roman numeral where it did not — and an unranked effect belongs to no family, so a
//   family of one flags nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import type { OwnedExaltation } from '../src/shared/characterSheet'
import {
  auditExaltations,
  rankedEffects,
  recommendSockets,
  type SocketHostCell
} from '../src/renderer/src/features/character/exaltationAudit'

function row(key: string, name: string, effects: GearRow['effects'], classes: GearRow['classes'] = []): GearRow {
  return {
    key,
    name,
    searchKey: name.toLowerCase(),
    slots: ['WAIST'],
    classes,
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: {},
    effects
  }
}

function owned(name: string, where: string, socketed = false): OwnedExaltation {
  return { name, key: name.toLowerCase(), where, socketed }
}

test('rankedEffects prefers the corpus focus parse and falls back to the trailing roman numeral', () => {
  const parsed = row('a', 'A', [
    { name: 'Improved Damage II', kind: 'focus', family: 'Improved Damage', familyTier: 2 }
  ])
  assert.deepEqual(rankedEffects(parsed), [
    { family: 'improved damage', tier: 2, effect: 'Improved Damage II' }
  ])
  const fallback = row('b', 'B', [{ name: 'Burning Affliction III', kind: 'worn' }])
  assert.deepEqual(rankedEffects(fallback), [
    { family: 'burning affliction', tier: 3, effect: 'Burning Affliction III' }
  ])
  // Unranked effects belong to no family.
  assert.deepEqual(rankedEffects(row('c', 'C', [{ name: 'See Invisible', kind: 'worn' }])), [])
})

test('a lower owned tier is flagged when a higher owned tier is usable by the loadout', () => {
  const rows = [
    row('weak belt', 'Weak Belt', [{ name: 'Burning Affliction I', kind: 'worn' }]),
    row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }], ['WAR'])
  ]
  const audit = auditExaltations(
    [owned('Weak Belt', 'General 1'), owned('Strong Belt', 'Bank 2')],
    rows,
    ['WAR', 'MNK', 'SHM']
  )
  assert.equal(audit.superseded.length, 1)
  const f = audit.superseded[0]
  assert.equal(f.name, 'Weak Belt')
  assert.equal(f.betterName, 'Strong Belt')
  assert.equal(f.betterTier, 3)
  assert.deepEqual(f.wheres, ['General 1'])
  // …and the same pair through a loadout the better donor CANNOT serve flags nothing.
  const gated = auditExaltations(
    [owned('Weak Belt', 'General 1'), owned('Strong Belt', 'Bank 2')],
    [rows[0], row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }], ['NEC'])],
    ['WAR', 'MNK', 'SHM']
  )
  assert.equal(gated.superseded.length, 0, 'an unusable higher tier supersedes nothing')
})

test('duplicates are counted with their places, and a worn copy is called socketed', () => {
  const audit = auditExaltations(
    [
      owned('Blood Fire', 'socketed in Primary', true),
      owned('Blood Fire', 'Augmentation'),
      owned('Lone Gem', 'General 3')
    ],
    [],
    []
  )
  assert.equal(audit.duplicates.length, 1)
  assert.deepEqual(audit.duplicates[0], {
    name: 'Blood Fire',
    copies: 2,
    socketed: 1,
    wheres: ['socketed in Primary', 'Augmentation']
  })
  // No corpus at all: the tier half stays silent rather than guessing.
  assert.equal(audit.superseded.length, 0)
})

function host(cellId: string, type: string, currentName: string | null, item = 'Host Item'): SocketHostCell {
  return {
    cellId,
    cellLabel: cellId,
    item,
    type,
    currentKey: currentName === null ? null : currentName.toLowerCase(),
    currentName
  }
}

test('the recommender swaps a socketed gem only for a strictly better LOOSE copy of the same family', () => {
  const rows = [
    row('weak belt', 'Weak Belt', [{ name: 'Burning Affliction I', kind: 'worn' }]),
    row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }]),
    // A higher tier of a DIFFERENT family must never be offered as a swap: no exchange rate.
    row('other gem', 'Other Gem', [{ name: 'Enhancement Haste V', kind: 'worn' }])
  ]
  const recs = recommendSockets(
    [
      { name: 'Weak Belt', key: 'weak belt', where: 'socketed in Waist', socketed: true },
      { name: 'Strong Belt', key: 'strong belt', where: 'Bank 2', socketed: false },
      { name: 'Other Gem', key: 'other gem', where: 'Bank 2', socketed: false }
    ],
    rows,
    [],
    [host('waist', 'Worn', 'Weak Belt')]
  )
  assert.equal(recs.swaps.length, 1)
  assert.equal(recs.swaps[0].toName, 'Strong Belt')
  assert.equal(recs.swaps[0].toWhere, 'Bank 2')
  // …and the cell is flagged for the grid to paint red.
  assert.deepEqual([...(recs.flaggedByCell.get('waist') ?? [])], ['weak belt'])
})

test('an empty socket takes the best remaining loose gem, and one physical copy is never spent twice', () => {
  const rows = [
    row('gem a', 'Gem A', [{ name: 'Improved Damage II', kind: 'worn' }]),
    row('gem b', 'Gem B', [{ name: 'See Invisible', kind: 'worn' }])
  ]
  const recs = recommendSockets(
    [{ name: 'Gem A', key: 'gem a', where: 'General 1', socketed: false },
     { name: 'Gem B', key: 'gem b', where: 'General 2', socketed: false }],
    rows,
    [],
    [host('ear1', 'Worn', null), host('ear2', 'Worn', null), host('neck', 'Worn', null)]
  )
  // Two gems, three empty sockets: the ranked one first, the unranked one second, nothing third.
  assert.equal(recs.fills.length, 2)
  assert.equal(recs.fills[0].gemName, 'Gem A')
  assert.equal(recs.fills[1].gemName, 'Gem B')
})

test('a socketed gem the corpus cannot rank is left alone - "better" would be a guess', () => {
  const recs = recommendSockets(
    [
      { name: 'Mystery Gem', key: 'mystery gem', where: 'socketed in Head', socketed: true },
      { name: 'Strong Belt', key: 'strong belt', where: 'Bank 2', socketed: false }
    ],
    [row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }])],
    [],
    [host('head', 'Worn', 'Mystery Gem')]
  )
  assert.equal(recs.swaps.length, 0)
  assert.equal(recs.flaggedByCell.size, 0)
})
