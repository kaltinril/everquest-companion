// THE BUFF SET WITH THE GROUP IN IT (src/shared/spellParty.ts).
//
// THE CLAIM UNDER TEST: a group changes the pool and nothing else. What a group-mate adds is what
// they can put ON YOU, the selection over the wider pool is `buildLoadout`'s own, and with no group
// the answer is the solo one.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { UnlockSpell } from '../src/shared/levelUnlocks'
import { spellStatGrants } from '../src/shared/spellStats'
import { DEFAULT_STAT_WEIGHTS, buildLoadout, loadoutCandidates } from '../src/shared/spellLoadout'
import {
  MAX_PARTY_MEMBERS,
  PARTY_COLOR_COUNT,
  keepByCaster,
  landsOnOthers,
  normalizeParty,
  partyCandidates,
  partyColors,
  partySuggestions,
  readOwnClasses,
  readParty,
  readSelfColor,
  sameClassSet,
  withColor,
  withMember,
  withoutMember,
  type PartyMember
} from '../src/shared/spellParty'
import { PARTY_PAINT } from '../src/renderer/src/features/spells/partyPaint'

const L = { worn: 50, cast: 50 }
const SCORING = { weights: DEFAULT_STAT_WEIGHTS }

interface BuffSpec {
  effects: string[]
  classes: string[]
  targetType?: string
}

function buff(name: string, spec: BuffSpec): UnlockSpell {
  return {
    name,
    at: spec.classes.map((cls) => ({ cls, level: 20 })),
    upgradeCategory: 'buff',
    grants: spellStatGrants(spec.effects, 50),
    grantsLevel: 50,
    ...(spec.targetType === undefined ? {} : { targetType: spec.targetType })
  } as UnlockSpell
}

const GARRETT: PartyMember = { name: 'Garrett', classes: ['ENC'] }

// =================================================================================================
// THE POOL
// =================================================================================================

test('with no group the pool is the solo candidate list', () => {
  const corpus = [
    buff('Mine', { effects: ['Increase STR by 20'], classes: ['SHM'] }),
    buff('Theirs', { effects: ['Increase AC by 30'], classes: ['ENC'], targetType: 'Single' })
  ]
  const pool = partyCandidates(corpus, ['SHM'], [], SCORING)
  assert.deepEqual(pool.candidates, loadoutCandidates(corpus, ['SHM'], DEFAULT_STAT_WEIGHTS))
  assert.equal(pool.casters.size, 0)
})

test('a group-mate adds the buffs they can put on you, and the row says who casts it', () => {
  const corpus = [
    buff('Mine', { effects: ['Increase STR by 20'], classes: ['SHM'] }),
    buff('Theirs', { effects: ['Increase AC by 30'], classes: ['ENC'], targetType: 'Single' }),
    buff('Nobodys', { effects: ['Increase HP by 99'], classes: ['CLR'], targetType: 'Single' })
  ]
  const pool = partyCandidates(corpus, ['SHM'], [GARRETT], SCORING)
  assert.deepEqual(pool.candidates.map((c) => c.name), ['Theirs', 'Mine'])
  assert.deepEqual(pool.casters.get('Mine'), ['You'])
  assert.deepEqual(pool.casters.get('Theirs'), ['Garrett'])
})

test('a group-mate`s SELF buff is theirs, and your own self buff is still yours', () => {
  const corpus = [
    buff('MySelfBuff', { effects: ['Increase AC by 10'], classes: ['SHM'], targetType: 'Self' }),
    buff('TheirSelfBuff', { effects: ['Increase AC by 40'], classes: ['ENC'], targetType: 'Self' }),
    buff('TheirPetBuff', { effects: ['Increase STR by 40'], classes: ['ENC'], targetType: 'Pet' })
  ]
  const pool = partyCandidates(corpus, ['SHM'], [GARRETT], SCORING)
  assert.deepEqual(pool.candidates.map((c) => c.name), ['MySelfBuff'])
})

test('a spell two of you can cast is one candidate with both casters, you first', () => {
  const corpus = [buff('Shared', { effects: ['Increase STR by 20'], classes: ['SHM', 'ENC'], targetType: 'Single' })]
  const pool = partyCandidates(corpus, ['SHM'], [GARRETT, { name: 'Malkil', classes: ['ENC'] }], SCORING)
  assert.equal(pool.candidates.length, 1)
  assert.deepEqual(pool.casters.get('Shared'), ['You', 'Garrett', 'Malkil'])
})

test('your level is the group`s: a spell a group-mate has not reached is not offered', () => {
  const corpus = [buff('Theirs', { effects: ['Increase AC by 30'], classes: ['ENC'], targetType: 'Single' })]
  const at = (level: number): string[] =>
    partyCandidates(corpus, ['SHM'], [GARRETT], { ...SCORING, query: { level } }).candidates.map((c) => c.name)
  assert.deepEqual(at(19), [])
  assert.deepEqual(at(20), ['Theirs'])
})

test('THE POINT OF IT: a group-mate`s better buff takes the slot from yours', () => {
  const corpus = [
    buff('My Haste', { effects: ['Increase Attack Speed by 30%'], classes: ['SHM'], targetType: 'Single' }),
    buff('Their Haste', { effects: ['Increase Attack Speed by 47%'], classes: ['ENC'], targetType: 'Single' }),
    buff('My Strength', { effects: ['Increase STR by 20'], classes: ['SHM'], targetType: 'Single' })
  ]
  const solo = buildLoadout(partyCandidates(corpus, ['SHM'], [], SCORING).candidates, L)
  assert.deepEqual(solo.keep.map((c) => c.name), ['My Haste', 'My Strength'])

  const grouped = buildLoadout(partyCandidates(corpus, ['SHM'], [GARRETT], SCORING).candidates, L)
  assert.deepEqual(grouped.keep.map((c) => c.name), ['Their Haste', 'My Strength'])
  assert.deepEqual(grouped.rejected.map((r) => [r.name, r.beatenBy]), [['My Haste', 'Their Haste']])
})

test('the target types that reach another player', () => {
  for (const t of ['Single', 'Single Friendly (or Self)', 'Group v1', 'Group v2', 'Group', 'Party', 'Target Group Member or Self']) {
    assert.equal(landsOnOthers({ targetType: t }), true, t)
  }
  for (const t of ['Self', 'Pet', 'Corpse', 'Undead', 'Targeted AE']) {
    assert.equal(landsOnOthers({ targetType: t }), false, t)
  }
  // Silence is not a verdict.
  assert.equal(landsOnOthers({}), true)
})

// =================================================================================================
// THE STORED LIST
// =================================================================================================

test('a stored group is validated, not trusted', () => {
  const stored = [
    { name: '  Garrett ', classes: ['ENC', 'ENC', 'SHM', 'DRU', 'WAR'] },
    { name: 'NoClasses', classes: [] },
    { name: 'BadClass', classes: ['XYZ'] },
    { classes: ['CLR', 'PAL'] },
    'not a member',
    null
  ]
  assert.deepEqual(normalizeParty(stored), [
    { name: 'Garrett', classes: ['ENC', 'SHM', 'DRU'] },
    { name: 'CLR/PAL', classes: ['CLR', 'PAL'] }
  ])
  assert.deepEqual(normalizeParty('nope'), [])
})

test('unreadable stored text is an empty group', () => {
  assert.deepEqual(readParty(null), [])
  assert.deepEqual(readParty('{not json'), [])
  assert.deepEqual(readParty(JSON.stringify([GARRETT])), [GARRETT])
})

test('adding a name that is already there replaces it, and a full group takes nobody new', () => {
  const swapped = withMember([GARRETT], { name: 'garrett', classes: ['CLR'] })
  assert.deepEqual(swapped, [{ name: 'garrett', classes: ['CLR'] }])

  let full: PartyMember[] = []
  for (let i = 0; i < MAX_PARTY_MEMBERS + 2; i++) full = withMember(full, { name: `M${String(i)}`, classes: ['WAR'] })
  assert.equal(full.length, MAX_PARTY_MEMBERS)
  assert.deepEqual(withoutMember(full, 'm0').map((m) => m.name), ['M1', 'M2', 'M3', 'M4'])
})


// =================================================================================================
// BY CASTER, IN COLOUR
// =================================================================================================

test('the kept set groups by caster, you first, and a shared spell is listed under you', () => {
  const corpus = [
    buff('Mine', { effects: ['Increase STR by 20'], classes: ['SHM'] }),
    buff('Shared', { effects: ['Increase AC by 30'], classes: ['SHM', 'ENC'], targetType: 'Single' }),
    buff('Theirs', { effects: ['Increase HP by 50'], classes: ['ENC'], targetType: 'Single' })
  ]
  const party = [GARRETT, { name: 'Idle', classes: ['WAR' as const] }]
  const pool = partyCandidates(corpus, ['SHM'], party, SCORING)
  const set = buildLoadout(pool.candidates, L)
  const groups = keepByCaster(set.keep, pool.casters, party)
  assert.deepEqual(
    groups.map((g) => [g.caster, g.rows.map((r) => r.name)]),
    [
      ['You', ['Shared', 'Mine']],
      ['Garrett', ['Theirs']]
    ]
  )
})

test('everyone wears a colour of their own until the user says otherwise', () => {
  const party: PartyMember[] = [
    { name: 'A', classes: ['ENC'] },
    { name: 'B', classes: ['CLR'], color: 1 },
    { name: 'C', classes: ['DRU'] }
  ]
  // You wear slot 0 and B picked 1, so A and C take the first two slots nobody is wearing.
  assert.deepEqual([...partyColors(party, 0)], [['You', 0], ['A', 2], ['B', 1], ['C', 3]])
  // A picked colour is kept even when it matches somebody else's: that is the user's call.
  assert.equal(partyColors(withColor(party, 'c', 1), 0).get('C'), 1)
  // Your own colour moves too, and the unpicked members move out of its way.
  assert.deepEqual([...partyColors(party, 2)], [['You', 2], ['A', 0], ['B', 1], ['C', 3]])
})

test('a colour is a slot the palette has, stored or not at all', () => {
  assert.equal(PARTY_PAINT.length, PARTY_COLOR_COUNT)
  assert.deepEqual(normalizeParty([{ name: 'A', classes: ['ENC'], color: 3 }]), [
    { name: 'A', classes: ['ENC'], color: 3 }
  ])
  for (const bad of [-1, 1.5, PARTY_COLOR_COUNT, '2', null]) {
    assert.deepEqual(normalizeParty([{ name: 'A', classes: ['ENC'], color: bad }]), [{ name: 'A', classes: ['ENC'] }])
  }
  assert.deepEqual(withColor([GARRETT], 'Garrett', 99), [GARRETT])
  assert.equal(readSelfColor(null), 0)
  assert.equal(readSelfColor('5'), 5)
  assert.equal(readSelfColor('nope'), 0)
  assert.equal(readSelfColor('42'), 0)
})

test('your own pinned classes are a loadout or nothing', () => {
  assert.deepEqual(readOwnClasses('["MNK","WAR","SHM"]'), ['MNK', 'WAR', 'SHM'])
  // At most a loadout's three, each once, and only real classes.
  assert.deepEqual(readOwnClasses('["MNK","MNK","XYZ","WAR","SHM","ENC"]'), ['MNK', 'WAR', 'SHM'])
  // Absent, unreadable and empty all hand the tab back to detection.
  for (const text of [null, '', '[]', '{nope', '"MNK"']) assert.equal(readOwnClasses(text), null)
  assert.equal(sameClassSet(['MNK', 'WAR'], ['WAR', 'MNK']), true)
  assert.equal(sameClassSet(['MNK', 'WAR'], ['MNK', 'ENC']), false)
  assert.equal(sameClassSet(['MNK'], ['MNK', 'WAR']), false)
})

// =================================================================================================
// THE OFFERS
// =================================================================================================

test('a roster member is offered only when a /who row stated their classes', () => {
  const roster = [
    { name: 'Malkil', classes: ['DRU', 'RNG', 'MAG'] },
    { name: 'Quiet' },
    { name: 'Odd', classes: ['XYZ'] }
  ]
  assert.deepEqual(partySuggestions(roster, []), [{ name: 'Malkil', classes: ['DRU', 'RNG', 'MAG'] }])
  // …and an offer says how old its evidence is, when the roster says.
  assert.deepEqual(partySuggestions([{ ...roster[0], classesTs: 1234 }], []), [
    { name: 'Malkil', classes: ['DRU', 'RNG', 'MAG'], statedTs: 1234 }
  ])
  // Adding an offer stores a member, not the offer: the instant is evidence, not a preference.
  assert.deepEqual(withMember([], { name: 'Malkil', classes: ['DRU'], statedTs: 1234 } as PartyMember), [
    { name: 'Malkil', classes: ['DRU'] }
  ])
})

test('somebody already in the group is offered again only when their classes changed', () => {
  const roster = [{ name: 'Malkil', classes: ['DRU', 'RNG', 'MAG'] }]
  assert.deepEqual(partySuggestions(roster, [{ name: 'malkil', classes: ['DRU', 'RNG', 'MAG'] }]), [])
  // The same classes in another order are the same member: a /who row prints them its own way.
  assert.deepEqual(partySuggestions(roster, [{ name: 'Malkil', classes: ['MAG', 'DRU', 'RNG'] }]), [])
  assert.deepEqual(partySuggestions(roster, [{ name: 'Malkil', classes: ['DRU', 'RNG', 'ENC'] }]), [
    { name: 'Malkil', classes: ['DRU', 'RNG', 'MAG'] }
  ])
})
