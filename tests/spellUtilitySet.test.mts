// THE UTILITY PANE (src/shared/spellUtilitySet.ts; owner report, kaltinril 2026-09-12: the
// enchanter's slow, charm, dispel, debuffs, lull, pet, mez, illusion and casting-level buff were
// on no pane at all).
//
// THE CLAIM UNDER TEST: the pane is the top castable rung of every line the trio has, judged per
// class off the shipped ladder's own `replaces`, minus what the other panes placed and minus the
// categories the Leveling tab already ranks. It ranks nothing itself.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { UnlockSpell } from '../src/shared/levelUnlocks'
import type { UpgradeCategory } from '../src/shared/spellUpgrade'
import { utilitySet } from '../src/shared/spellUtilitySet'

/** One row as the unlock dataset carries it: who gains it, what it is, what it replaces. */
function row(
  name: string,
  at: { cls: string; level: number }[],
  category: UpgradeCategory,
  extra: Partial<UnlockSpell> = {}
): UnlockSpell {
  return { name, at, upgradeCategory: category, ...extra } as UnlockSpell
}

/** The owner's enchanter ladders, the rungs around his level. */
const ENC = [
  row('Tashan', [{ cls: 'ENC', level: 4 }], 'debuff', { line: 'Tash line' }),
  row('Tashani', [{ cls: 'ENC', level: 18 }], 'debuff', { line: 'Tash line', replaces: [{ name: 'Tashan', cls: 'ENC' }] }),
  row('Tashania', [{ cls: 'ENC', level: 41 }], 'debuff', { line: 'Tash line', replaces: [{ name: 'Tashani', cls: 'ENC' }] }),
  row('Charm', [{ cls: 'ENC', level: 11 }], 'cc', { line: 'Charm line' }),
  row('Beguile', [{ cls: 'ENC', level: 23 }], 'cc', { line: 'Charm line', replaces: [{ name: 'Charm', cls: 'ENC' }] }),
  row('Strip Enchantment', [{ cls: 'ENC', level: 22 }], 'other', { line: 'Dispel line' }),
  row("Sagar's Animation", [{ cls: 'ENC', level: 22 }], 'pet', { line: 'Animation line' }),
  row('Intellectual Superiority', [{ cls: 'ENC', level: 17 }], 'buff', { line: 'Intellectual line' }),
  row('Illusion: Iksar', [{ cls: 'ENC', level: 20 }], 'buff', { line: 'Racial illusion line' }),
  row('Suffocate', [{ cls: 'ENC', level: 26 }], 'dot'),
  row('Choke', [{ cls: 'ENC', level: 11 }], 'dot'),
  row('Major Shielding', [{ cls: 'ENC', level: 23 }], 'buff')
]

test('the pane is the top castable rung of each line: a successor you cannot cast yet supersedes nothing', () => {
  const set = utilitySet(ENC, ['ENC'], 24)
  const names = set.groups.flatMap((g) => g.picks.map((p) => p.name))
  // Tashani tops the Tash line at 24 - Tashan is behind it, Tashania is seventeen levels away.
  assert.ok(names.includes('Tashani'))
  assert.ok(!names.includes('Tashan'))
  assert.ok(!names.includes('Tashania'))
  // Beguile over Charm, the same way.
  assert.ok(names.includes('Beguile') && !names.includes('Charm'))
  // At 41 the ladder moves up one rung.
  const later = utilitySet(ENC, ['ENC'], 41).groups.flatMap((g) => g.picks.map((p) => p.name))
  assert.ok(later.includes('Tashania') && !later.includes('Tashani'))
})

test('nukes, DoTs and heals are the cast sets` business, and a name another pane placed appears once', () => {
  const placed = new Set(['Major Shielding'])
  const set = utilitySet(ENC, ['ENC'], 24, { placed })
  const names = set.groups.flatMap((g) => g.picks.map((p) => p.name))
  assert.ok(!names.includes('Choke') && !names.includes('Suffocate'), 'the Leveling tab ranks these')
  assert.ok(!names.includes('Major Shielding'), 'the buff set spoke for it')
  // The owner's list, rung for rung, minus the two the other panes hold.
  assert.deepEqual(
    [...names].sort(),
    ['Beguile', 'Illusion: Iksar', 'Intellectual Superiority', "Sagar's Animation", 'Strip Enchantment', 'Tashani']
  )
  assert.equal(set.count, 6)
  assert.equal(set.casters, 1, 'only the enchanter casts, so no row needs a class chip')
})

test('groups read as jobs in a fixed order, newest rung first within one, and carry the line', () => {
  const set = utilitySet(ENC, ['ENC'], 24)
  assert.deepEqual(
    set.groups.map((g) => g.label),
    ['Crowd control', 'Debuffs', 'Pets', 'Other buffs', 'Utility']
  )
  const buffs = set.groups.find((g) => g.category === 'buff')
  // Major Shielding (23) before Illusion: Iksar (20) before Intellectual Superiority (17).
  assert.deepEqual(buffs?.picks.map((p) => p.name), ['Major Shielding', 'Illusion: Iksar', 'Intellectual Superiority'])
  assert.equal(buffs?.picks[1]?.line, 'Racial illusion line')
  assert.equal(buffs?.picks[1]?.gainedAt, 20)
})

test('superseded is judged PER CLASS: a rung an enchanter has outgrown can still be a shaman`s best', () => {
  const corpus = [
    row('Weaken', [{ cls: 'ENC', level: 1 }, { cls: 'SHM', level: 9 }], 'debuff'),
    row('Enfeeblement', [{ cls: 'ENC', level: 4 }], 'debuff', { replaces: [{ name: 'Weaken', cls: 'ENC' }] })
  ]
  const both = utilitySet(corpus, ['ENC', 'SHM'], 24)
  const weaken = both.groups[0]?.picks.find((p) => p.name === 'Weaken')
  assert.deepEqual(weaken?.classes, ['SHM'], 'top rung for the shaman only')
  assert.equal(both.casters, 2)
  assert.equal(weaken?.gainedAt, 9, 'the level is read off the classes it tops for')
  // Alone, the enchanter never sees Weaken.
  const enc = utilitySet(corpus, ['ENC'], 24)
  assert.deepEqual(enc.groups[0]?.picks.map((p) => p.name), ['Enfeeblement'])
})

test('a same-level pair that `replaces` cannot order is still outranked by a higher rung of its line', () => {
  // Enchant Clay and Enchant Silver both come at 7, so neither replaces the other and Electrum
  // replaces only one of them; without the line rule Enchant Clay drew beside Enchant Gold.
  const line = 'Enchant metal line'
  const corpus = [
    row('Enchant Clay', [{ cls: 'ENC', level: 7 }], 'other', { line }),
    row('Enchant Silver', [{ cls: 'ENC', level: 7 }], 'other', { line }),
    row('Enchant Electrum', [{ cls: 'ENC', level: 14 }], 'other', { line, replaces: [{ name: 'Enchant Silver', cls: 'ENC' }] }),
    row('Enchant Gold', [{ cls: 'ENC', level: 24 }], 'other', { line, replaces: [{ name: 'Enchant Electrum', cls: 'ENC' }] })
  ]
  assert.deepEqual(utilitySet(corpus, ['ENC'], 24).groups[0]?.picks.map((p) => p.name), ['Enchant Gold'])
  // Under the top rung, the two at 7 are still a pair: at level 10 both are the line's best.
  assert.deepEqual(
    utilitySet(corpus, ['ENC'], 10).groups[0]?.picks.map((p) => p.name),
    ['Enchant Clay', 'Enchant Silver']
  )
})

test('a level you have not reached is not castable, and out of era is dropped unless asked', () => {
  const corpus = [
    row('Beguile', [{ cls: 'ENC', level: 23 }], 'cc'),
    row('Dictate', [{ cls: 'ENC', level: 60 }], 'cc', { replaces: [{ name: 'Beguile', cls: 'ENC' }] }),
    row('Old Charm', [{ cls: 'ENC', level: 5 }], 'cc', { outOfEra: true })
  ]
  assert.deepEqual(utilitySet(corpus, ['ENC'], 24).groups[0]?.picks.map((p) => p.name), ['Beguile'])
  assert.deepEqual(
    utilitySet(corpus, ['ENC'], 24, { includeOutOfEra: true }).groups[0]?.picks.map((p) => p.name),
    ['Beguile', 'Old Charm']
  )
  // A trio with none of the casting classes has an empty pane, honestly.
  assert.equal(utilitySet(corpus, ['WAR'], 24).count, 0)
})
