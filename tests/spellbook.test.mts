// THE SPELLBOOK'S ROWS (docs/plans/spell-upgrades-and-loadout.md §4.1) — the filters, the tier
// reading, the sort's null rule, and a run over the REAL committed corpus.
//
// Hand-authored rows for the rules, the real catalog for the shape. The split is the same one
// `spellStats.test.mts` makes and for the same reason: a scrape change must be able to break the
// corpus assertions without also breaking the grammar ones, or nobody can tell which moved.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { UnlockSpell } from '../src/shared/levelUnlocks'
import {
  PAYOFF_MARKS,
  magnitudeRatePercent,
  spellbookLadder,
  spellbookRow,
  spellbookRows
} from '../src/shared/spellbook'
import { SPELL_MAX_RANK } from '../src/shared/spellScale'
import { buildLevelUnlocks } from '../src/main/data/levelUnlocks'

/** A catalog row with only what a case is about. */
function spell(over: Partial<UnlockSpell> & { name: string }): UnlockSpell {
  return { at: [{ cls: 'ENC', level: 20 }], ...over } as UnlockSpell
}

// =================================================================================================
// THE TIER READING
// =================================================================================================

test('every figure on a row is read at the row`s own stated tier', () => {
  const nuke = spell({
    name: 'Test Nuke',
    upgradeCategory: 'nuke',
    mana: 200,
    castTimeMs: 3000,
    metrics: { damage: 333 } as UnlockSpell['metrics']
  })
  const base = spellbookRow(nuke, 0)
  assert.equal(base.tier, 0)
  assert.equal(base.mana, 200)
  assert.equal(base.damage, 333)
  const five = spellbookRow(nuke, 5)
  assert.equal(five.tier, 5)
  assert.equal(five.mana, 180) // 200 x (1 - 0.02 x 5)
  assert.equal(five.damage, 432) // 333 + floor(333 x 6 x 5 / 100)
  // The row states the tier it was read at, so no caller can hold a figure without its tier.
  assert.equal(spellbookRow(nuke, 99).tier, SPELL_MAX_RANK)
})

test('a DoT`s ticks scale at the measured three percent, not six', () => {
  const dot = spell({
    name: 'Test DoT',
    upgradeCategory: 'dot',
    metrics: { damage: 387 } as UnlockSpell['metrics']
  })
  // Odium's own ladder, through the browsing surface: the same numbers the log measured.
  assert.equal(spellbookRow(dot, 5).damage, 445)
  assert.equal(spellbookRow(dot, 7).damage, 468)
})

test('the Bear Form row says a buff`s numbers do not move', () => {
  const bear = spell({
    name: 'Form of the Bear',
    upgradeCategory: 'buff',
    mana: 100,
    castTimeMs: 4000,
    durationMs: 8640000
  })
  const row = spellbookRow(bear, 10)
  assert.equal(row.payoff.magnitude, false)
  assert.deepEqual([row.payoff.duration, row.payoff.mana, row.payoff.cast], [true, true, true])
  // …and the two figures it DOES buy really move.
  assert.equal(row.mana, 60)
  assert.equal(row.castSeconds, 2.4)
})

test('a spell stating no mana never grows one at any tier', () => {
  const song = spell({ name: 'Test Song', upgradeCategory: 'buff', durationMs: 60000 })
  for (const t of [0, 5, 10]) assert.equal(spellbookRow(song, t).mana, undefined)
})

// =================================================================================================
// THE FILTERS
// =================================================================================================

const CORPUS: UnlockSpell[] = [
  spell({ name: 'Alpha Nuke', upgradeCategory: 'nuke', at: [{ cls: 'WIZ', level: 10 }], mana: 50, metrics: { damage: 100 } as UnlockSpell['metrics'] }),
  spell({ name: 'Beta Buff', upgradeCategory: 'buff', at: [{ cls: 'CLR', level: 30 }], mana: 80, durationMs: 60000 }),
  spell({ name: 'Gamma Heal', upgradeCategory: 'heal', at: [{ cls: 'CLR', level: 20 }], mana: 120, metrics: { heal: 200 } as UnlockSpell['metrics'] }),
  spell({ name: 'Delta Debuff', upgradeCategory: 'debuff', at: [{ cls: 'ENC', level: 40 }], outOfEra: true })
]

test('an empty filter list filters NOTHING - that is the show-all state', () => {
  assert.equal(spellbookRows(CORPUS, {}, 0).length, 4)
  assert.equal(spellbookRows(CORPUS, { classes: [], categories: [] }, 0).length, 4)
})

test('the filters are AND-ed, each on its own axis', () => {
  assert.deepEqual(spellbookRows(CORPUS, { classes: ['CLR'] }, 0).map((r) => r.name), [
    'Gamma Heal',
    'Beta Buff'
  ])
  assert.deepEqual(spellbookRows(CORPUS, { categories: ['nuke', 'heal'] }, 0).map((r) => r.name), [
    'Alpha Nuke',
    'Gamma Heal'
  ])
  assert.deepEqual(spellbookRows(CORPUS, { maxLevel: 20 }, 0).map((r) => r.name), [
    'Alpha Nuke',
    'Gamma Heal'
  ])
  assert.deepEqual(spellbookRows(CORPUS, { text: 'beta' }, 0).map((r) => r.name), ['Beta Buff'])
  // Two axes at once.
  assert.deepEqual(
    spellbookRows(CORPUS, { classes: ['CLR'], categories: ['heal'] }, 0).map((r) => r.name),
    ['Gamma Heal']
  )
})

test('silence is not an era verdict', () => {
  // `outOfEra` is `true` or ABSENT. The three rows that never got a verdict are shown plainly.
  assert.equal(spellbookRows(CORPUS, { inEraOnly: true }, 0).length, 3)
  assert.equal(spellbookRows(CORPUS, {}, 0).length, 4)
})

test('the payoff filter is the owner`s question 2, both ways round', () => {
  // What is worth motes: the numbers move.
  assert.deepEqual(
    spellbookRows(CORPUS, { payoffMagnitudeOnly: true }, 0).map((r) => r.name),
    ['Alpha Nuke', 'Gamma Heal']
  )
  // …and its complement is the dead-ends list.
  assert.deepEqual(
    spellbookRows(CORPUS, { payoffMagnitudeOnly: false }, 0).map((r) => r.name),
    ['Gamma Heal', 'Beta Buff', 'Delta Debuff'].filter((n) => n !== 'Gamma Heal')
  )
})

// =================================================================================================
// THE SORT
// =================================================================================================

test('an absent figure sorts LAST in BOTH directions, never as the worst answer', () => {
  const byHeal = spellbookRows(CORPUS, { sort: 'heal' }, 0)
  const descHeal = spellbookRows(CORPUS, { sort: 'heal', desc: true }, 0)
  // Only one row states a heal at all; the other three have none and must trail either way.
  assert.equal(byHeal[0].name, 'Gamma Heal')
  assert.equal(descHeal[0].name, 'Gamma Heal')
  for (const list of [byHeal, descHeal]) {
    assert.deepEqual(list.slice(1).map((r) => r.heal), [undefined, undefined, undefined])
  }
})

test('ties break on the name, so the order is stable rather than incidental', () => {
  const rows = spellbookRows(
    [spell({ name: 'Zeta', upgradeCategory: 'buff' }), spell({ name: 'Aleph', upgradeCategory: 'buff' })],
    { sort: 'level' },
    0
  )
  assert.deepEqual(rows.map((r) => r.name), ['Aleph', 'Zeta'])
})

test('name sorts case-insensitively and level ascends by default', () => {
  assert.deepEqual(spellbookRows(CORPUS, { sort: 'name' }, 0).map((r) => r.name), [
    'Alpha Nuke',
    'Beta Buff',
    'Delta Debuff',
    'Gamma Heal'
  ])
  assert.deepEqual(spellbookRows(CORPUS, { sort: 'level' }, 0).map((r) => r.level), [10, 20, 30, 40])
})

// =================================================================================================
// DISPLAY
// =================================================================================================

test('the payoff glyphs are five, distinct, and named in user-facing words', () => {
  assert.equal(PAYOFF_MARKS.length, 5)
  assert.equal(new Set(PAYOFF_MARKS.map((m) => m.glyph)).size, 5)
  for (const m of PAYOFF_MARKS) {
    // No em dashes (AGENTS.md, UI conventions).
    assert.ok(!/[–—]/.test(m.title), m.title)
  }
})

test('the magnitude rate says which categories scale and which do not', () => {
  assert.equal(magnitudeRatePercent('nuke'), 6)
  assert.equal(magnitudeRatePercent('dot'), 3)
  assert.equal(magnitudeRatePercent('heal'), 3)
  // The categories whose numbers never move answer null, not zero.
  assert.equal(magnitudeRatePercent('buff'), null)
  assert.equal(magnitudeRatePercent('debuff'), null)
  assert.equal(magnitudeRatePercent('cc'), null)
})

test('the ladder is the full eleven rungs and its base is the row', () => {
  const ladder = spellbookLadder(spell({ name: 'X', upgradeCategory: 'nuke', mana: 100 }))
  assert.equal(ladder.length, SPELL_MAX_RANK + 1)
  assert.equal(ladder[0].mana, 100)
})

// =================================================================================================
// THE REAL CORPUS
// =================================================================================================

const REAL = buildLevelUnlocks(null).spells

test('the real catalog folds into rows, and every row is filed in a category', () => {
  assert.ok(REAL.length > 1400, `unlock corpus is ${String(REAL.length)} rows`)
  for (const s of REAL) {
    assert.ok(s.upgradeCategory !== undefined, `${s.name} has no upgrade category`)
  }
})

test('Form of the Bear: the WIS grant does not move, which is the half nothing disputes', () => {
  const bear = REAL.find((s) => s.name === 'Form of the Bear')
  assert.ok(bear !== undefined, 'Form of the Bear is in the unlock corpus')
  const row = spellbookRow(bear, 8)
  // The grant is READ AND STATED, which is the owner's "it just says the name" complaint answered…
  assert.deepEqual(row.grants.map((g) => `${g.key} ${String(g.amount)}`), ['WIS 5'])
  // …and it is the SAME 5 at tier 8 as at base. No category scales a stat grant, so this holds for
  // every buff in the game regardless of how the category question below is settled.
  assert.deepEqual(spellbookRow(bear, 0).grants, row.grants)
})

test('Form of the Bear is filed `hot`, and that CONTRADICTS the owner - recorded, not papered over', () => {
  // The owner (2026-09-10): Bear Form's regen does not scale. The catalog states its regen as
  // `Increase Hit points by 1 per tick` on a duration spell, which is SPA 100, which is what both
  // the community model and `classifyUpgrade` call a HoT - and the `hot` rates claim +3% a tier.
  //
  // It is structurally indistinguishable from Regeneration (`Increase Hitpoints by 5 per tick`), so
  // no classifier can separate "a form buff that regens" from "a regen spell" without a rule nobody
  // has measured. `spellUpgrade.ts` carries the full disagreement and the screenshot that settles
  // it; this test PINS THE CONFLICT so that resolving it has to come through here.
  const bear = REAL.find((s) => s.name === 'Form of the Bear')
  assert.ok(bear !== undefined)
  assert.equal(spellbookRow(bear, 8).category, 'hot')
  const regen = REAL.find((s) => s.name === 'Regeneration')
  assert.ok(regen !== undefined)
  assert.equal(spellbookRow(regen, 8).category, 'hot', 'the two are filed identically, as they must be')
})

test('the whole corpus reads at tier 10 without producing a NaN', () => {
  for (const s of REAL) {
    const row = spellbookRow(s, SPELL_MAX_RANK)
    for (const v of [row.mana, row.castSeconds, row.damage, row.heal]) {
      assert.ok(v === undefined || Number.isFinite(v), `${s.name}: ${String(v)}`)
    }
  }
})

test('a real query narrows the real corpus', () => {
  const hastes = spellbookRows(REAL, { text: 'celerity' }, 0)
  assert.ok(hastes.length >= 1, 'Celerity is findable by name')
  const clr = spellbookRows(REAL, { classes: ['CLR'] }, 0)
  assert.ok(clr.length > 50 && clr.length < REAL.length, `CLR: ${String(clr.length)} rows`)
  for (const r of clr) assert.ok(r.at.some((p) => p.cls === 'CLR'), r.name)
})

// =================================================================================================
// NEWEST RANK ONLY (owner ask 2026-09-10)
// =================================================================================================
//
// *"can we get a 'latest level' or 'highest version' toggle chip on the spellbook tab also? I don't
// need to see 5 different versions of regeneration or poison resist etc"*.

test('the chip hides lower rungs and keeps the top of each line', () => {
  const trio: ClassAbbr[] = ['MNK', 'SHM', 'WAR']
  const all = spellbookRows(REAL, { classes: trio }, 0)
  const top = spellbookRows(REAL, { classes: trio, newestOnly: true }, 0)
  assert.ok(top.length < all.length, 'it has to actually hide something')
  const kept = new Set(top.map((r) => r.name))
  // The regen ladder for this trio is Regeneration -> Chloroplast -> Regrowth, and REGROWTH IS OUT
  // OF ERA - so the top OBTAINABLE rung is Chloroplast, and that is the one that stands.
  //
  // This test asserted the opposite until 2026-09-10, when Malkil read the chip and said so:
  // *"The spells not available yet is definitely messing with Newest Version."* He was right. The
  // fold hid a rung whenever a later one existed, without asking whether the later one is in the
  // game - so a shaman lost the regen he can cast in favour of one that does not exist yet, which
  // is the worst possible answer for a chip whose promise is "show me the one to use".
  assert.ok(kept.has('Chloroplast'), 'the top OBTAINABLE rung stays')
  assert.ok(!kept.has('Regeneration'), 'the rung below it still goes')
  assert.ok(kept.has('Regrowth'), 'and the out-of-era rung is still DRAWN - it just hides nothing')
  // …and it is the SHIPPED ladder doing it, not a name match: none of those three share a word.
})

test('NO SPELL LINE DISAPPEARS - the invariant that makes the chip honest', () => {
  // THE FIRST CUT OF THIS FAILED HERE, and it is the failure worth a test rather than a comment: it
  // hid anything the corpus said was superseded by anything at all, including by rungs this trio
  // cannot cast. Whole ladders vanished - a reader asking for "the newest Regeneration" was shown
  // no Regeneration at all, which is worse than the five rows he was complaining about.
  const trio: ClassAbbr[] = ['MNK', 'SHM', 'WAR']
  const visible = new Set(spellbookRows(REAL, { classes: trio }, 0).map((r) => r.name))
  const kept = new Set(spellbookRows(REAL, { classes: trio, newestOnly: true }, 0).map((r) => r.name))

  // Union-find over `replaces`, restricted to what this trio can see - one component per line.
  const parent = new Map<string, string>()
  for (const n of visible) parent.set(n, n)
  const find = (x: string): string => {
    let r = x
    for (;;) {
      const up = parent.get(r)
      if (up === undefined || up === r) return r
      r = up
    }
  }
  for (const s of REAL) {
    if (!visible.has(s.name)) continue
    for (const r of s.replaces ?? []) {
      if (!visible.has(r.name)) continue
      const a = find(s.name)
      const b = find(r.name)
      if (a !== b) parent.set(a, b)
    }
  }
  const lines = new Map<string, string[]>()
  for (const n of visible) {
    const root = find(n)
    const members = lines.get(root)
    if (members) members.push(n)
    else lines.set(root, [n])
  }
  const dead = [...lines.values()].filter((members) => !members.some((m) => kept.has(m)))
  assert.deepEqual(dead, [], 'every line must still show at least its highest visible rung')
})

test('an empty class filter still folds the ladders, and a narrow one folds only its own', () => {
  // The scoping rule: a rung is hidden only when its replacement belongs to a class ON SCREEN.
  // Filtered to WIZ, a Shaman's ladders are none of this filter's business.
  const wiz = spellbookRows(REAL, { classes: ['WIZ'], newestOnly: true }, 0)
  assert.ok(wiz.every((r) => r.at.some((p) => p.cls === 'WIZ')), 'the class filter still holds')
  const everyone = spellbookRows(REAL, { newestOnly: true }, 0)
  assert.ok(everyone.length < REAL.length, 'an empty filter shows every class, so every rung counts')
})
