// THE RECOMMENDED BUFF SET (docs/plans/spell-upgrades-and-loadout.md §3.5) — the selection, the
// exactness argument, and the thing a recommender has to say out loud when it drops a buff.
//
// THE CLAIM UNDER TEST, stated so the cases read as one: the answer is the best subset of buffs that
// can all stand at once, it is EXACT while a conflict component is small, and where it is not exact
// it says so rather than presenting a maybe-best set as a best one.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { UnlockSpell } from '../src/shared/levelUnlocks'
import { spellStatGrants } from '../src/shared/spellStats'
import { stackView, type StackSpellView } from '../src/shared/spellStack'
import {
  DEFAULT_STAT_WEIGHTS,
  buildLoadout,
  loadoutCandidates,
  scoreGrants,
  type LoadoutCandidate
} from '../src/shared/spellLoadout'

const L = { worn: 50, cast: 50 }

/** A catalog buff with real, parsed grants - the same reader main uses. */
function buff(name: string, effects: string[], classes: string[] = ['SHM']): UnlockSpell {
  return {
    name,
    at: classes.map((cls) => ({ cls, level: 20 })),
    upgradeCategory: 'buff',
    grants: spellStatGrants(effects, 50),
    grantsLevel: 50
  } as UnlockSpell
}

/** A candidate built by hand, for the selection cases that do not need a corpus. */
function cand(name: string, score: number, effects: string[], view?: StackSpellView): LoadoutCandidate {
  const grants = spellStatGrants(effects, 50)
  return view === undefined ? { name, at: [], grants, score } : { name, at: [], grants, score, view }
}

// =================================================================================================
// THE CANDIDATES
// =================================================================================================

test('only BUFFS are candidates, and only ones the trio can cast', () => {
  const corpus = [
    buff('Mine', ['Increase STR by 20'], ['SHM']),
    buff('Theirs', ['Increase STR by 30'], ['ENC']),
    { ...buff('AHeal', ['Increase STR by 99']), upgradeCategory: 'heal' } as UnlockSpell
  ]
  const out = loadoutCandidates(corpus, ['SHM'], DEFAULT_STAT_WEIGHTS)
  // `Theirs` is a real spell and the Spellbook still lists it; it is not a buff THIS trio can keep
  // up. `AHeal` is beneficial and occupies no slot afterwards, so it is a healing tool rather than
  // a standing buff.
  assert.deepEqual(out.map((c) => c.name), ['Mine'])
})

test('a buff worth nothing under the weights in force is not a recommendation', () => {
  // Still a real spell, still in the Spellbook. This tab is about a SET worth keeping up.
  const corpus = [buff('Cosmetic', ['Increase Player Size by 20'])]
  assert.deepEqual(loadoutCandidates(corpus, ['SHM'], DEFAULT_STAT_WEIGHTS), [])
})

test('candidates arrive score-descending, which the greedy path relies on', () => {
  const corpus = [
    buff('Small', ['Increase STR by 5']),
    buff('Big', ['Increase STR by 50']),
    buff('Mid', ['Increase STR by 20'])
  ]
  const out = loadoutCandidates(corpus, ['SHM'], DEFAULT_STAT_WEIGHTS)
  assert.deepEqual(out.map((c) => c.name), ['Big', 'Mid', 'Small'])
})

test('scoring multiplies each grant by its own weight and sums the products', () => {
  // A percent and a point are never ADDED (spellStats refuses), but each may be weighted and the
  // products summed - a different operation and a legitimate one.
  const grants = spellStatGrants(['Increase STR by 10', 'Increase Attack Speed by 40%'], 50)
  assert.equal(scoreGrants(grants, { STR: 1, HASTE: 3 }), 10 * 1 + 40 * 3)
  // A stat nobody has weighted scores zero.
  assert.equal(scoreGrants(grants, { STR: 1 }), 10)
})

// =================================================================================================
// THE SELECTION
// =================================================================================================

test('buffs that share no stat all survive', () => {
  const set = buildLoadout(
    [
      cand('Str', 20, ['Increase STR by 20']),
      cand('Ac', 40, ['Increase AC by 20']),
      cand('Hp', 30, ['Increase HP by 30'])
    ],
    L
  )
  assert.equal(set.keep.length, 3)
  assert.equal(set.rejected.length, 0)
  assert.equal(set.gems, 3)
  assert.equal(set.score, 90)
  assert.equal(set.provenOptimal, true)
})

test('a family of conflicting buffs keeps exactly its best member', () => {
  const set = buildLoadout(
    [
      cand('Celerity', 141, ['Increase Attack Speed by 47%']),
      cand('Alacrity', 120, ['Increase Attack Speed by 40%']),
      cand('Quickness', 90, ['Increase Attack Speed by 30%'])
    ],
    L
  )
  assert.deepEqual(set.keep.map((c) => c.name), ['Celerity'])
  assert.deepEqual(set.rejected.map((r) => r.name), ['Alacrity', 'Quickness'])
  for (const r of set.rejected) assert.equal(r.beatenBy, 'Celerity')
})

test('THE FORK USER`S CASE: a rejection names what the loser carried and the winner does not', () => {
  // Spirit of Bih`Li grants movement AND ATK; Spirit of Wolf grants movement only. If SoW wins the
  // slot, taking it silently costs the ATK - and saying that is the whole point of the panel.
  const bihli = cand('Spirit of Bih`Li', 40, ['Increase Movement Speed by 55%', 'Increase Attack by 15'])
  const sow = cand('Spirit of Wolf', 50, ['Increase Movement Speed by 55%'])
  const set = buildLoadout([sow, bihli], L)
  assert.deepEqual(set.keep.map((c) => c.name), ['Spirit of Wolf'])
  const loss = set.rejected[0]
  assert.equal(loss.name, 'Spirit of Bih`Li')
  assert.equal(loss.beatenBy, 'Spirit of Wolf')
  assert.deepEqual(loss.loses.map((g) => g.key), ['ATTACK'])
})

test('a CHAIN is solved exactly, and greedy would have got it wrong', () => {
  // A(STR) conflicts with B(STR+AC); B conflicts with C(AC); A and C never meet. Greedy takes B
  // first because it scores highest and ends with 30. The exact answer takes A and C, for 40.
  const a = cand('A', 20, ['Increase STR by 20'])
  const b = cand('B', 30, ['Increase STR by 25', 'Increase AC by 25'])
  const c = cand('C', 20, ['Increase AC by 20'])
  const set = buildLoadout([b, a, c], L)
  assert.deepEqual(set.keep.map((x) => x.name).sort(), ['A', 'C'])
  assert.equal(set.score, 40)
  assert.equal(set.provenOptimal, true)
})

test('the set never silently trims to eight gems - it reports what it wants', () => {
  // A player has eight. Dropping a good buff to fit would be the recommender deciding something
  // nobody asked it to decide, so it states the count and lets him choose.
  const many = Array.from({ length: 11 }, (_, i) => cand(`S${String(i)}`, 10, [`Increase STR by ${String(i + 1)}`]))
  // Each states STR, so they all conflict under the flagged test - one survives.
  const set = buildLoadout(many, L)
  assert.equal(set.gems, set.keep.length)
  assert.equal(set.keep.length, 1)
})

// =================================================================================================
// CERTAINTY - THE THREE TIERS
// =================================================================================================

test('with no client views the verdicts are FLAGGED, never presented as exact', () => {
  const set = buildLoadout([cand('A', 10, ['Increase STR by 10']), cand('B', 20, ['Increase STR by 20'])], L)
  assert.equal(set.certainty, 'flagged')
  for (const r of set.rejected) assert.equal(r.certainty, 'flagged')
})

test('with client views on every candidate the verdicts are EXACT', () => {
  const HASTE = 11
  const view = (base: number): StackSpellView =>
    stackView({
      id: base,
      // Slot 1, not 0: the file numbers its slots from one and `stackView` reads them that
      // way (measured 2026-09-10). A 0 here is out of range and silently carries no effect.
      slots: [{ slot: 1, effect: HASTE, base, limit: 0, calc: 100, max: 0 }],
      durationFormula: 3,
      goodEffect: true,
      targetType: 5
    })
  const set = buildLoadout(
    [cand('Fast', 47, ['Increase Attack Speed by 47%'], view(147)),
     cand('Slow', 30, ['Increase Attack Speed by 30%'], view(130))],
    L
  )
  assert.equal(set.certainty, 'exact')
  assert.deepEqual(set.keep.map((c) => c.name), ['Fast'])
})

test('OVERHASTE survives beside haste under the exact engine - the flagged tier cannot know that', () => {
  const HASTE = 11
  const OVERHASTE = 98
  const mk = (id: number, effect: number, base: number): StackSpellView =>
    stackView({
      id,
      slots: [{ slot: 1, effect, base, limit: 0, calc: 100, max: 0 }],
      durationFormula: 3,
      goodEffect: true,
      targetType: 5
    })
  const set = buildLoadout(
    [cand('Haste', 47, ['Increase Attack Speed by 47%'], mk(1, HASTE, 147)),
     cand('Over', 20, ['Increase Haste v2 by 20%'], mk(2, OVERHASTE, 120))],
    L
  )
  // SPA 98 and SPA 11 are different slots and both stand. `spellStats.ts` keeps them as different
  // keys precisely so the FLAGGED tier does not wrongly report a conflict here either.
  assert.equal(set.keep.length, 2)
  assert.equal(set.rejected.length, 0)
})

// =================================================================================================
// EDGES
// =================================================================================================

test('an empty candidate list is an empty set, not a crash', () => {
  const set = buildLoadout([], L)
  assert.deepEqual(set.keep, [])
  assert.deepEqual(set.rejected, [])
  assert.equal(set.score, 0)
  assert.equal(set.gems, 0)
  assert.equal(set.provenOptimal, true)
})

test('the default weights are provisional but complete enough to rank a real buff', () => {
  // A tripwire on the table rather than an endorsement of its numbers: every stat it names must be
  // a real `SpellStatKey`, and a buff granting AC must outrank one granting the same points of CHA.
  const ac = scoreGrants(spellStatGrants(['Increase AC by 20'], 50), DEFAULT_STAT_WEIGHTS)
  const cha = scoreGrants(spellStatGrants(['Increase CHA by 20'], 50), DEFAULT_STAT_WEIGHTS)
  assert.ok(ac > cha)
})
