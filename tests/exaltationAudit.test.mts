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
  rankedEffects
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
