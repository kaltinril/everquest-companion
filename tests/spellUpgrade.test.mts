// THE MOTE-TIER MODEL (docs/plans/spell-upgrades-and-loadout.md §3.1) — every rate, every rounding
// rule and the mote curve, plus the two measurements that made this file contradict a shipped number.
//
// The suite is deliberately in two halves.
//
//   THE FIXTURES are the owner's own log, kept here so the fit can be RE-ARGUED rather than trusted
//   — `spellScale.test.mts`'s own discipline, applied to the ticket that widened it. Every number in
//   `DOT_DAMAGE_LADDERS` and `DOT_DURATION_LADDERS` was read off
//   `eqlog_Drywrought_oggok.txt` (2,007,769 lines, 2026-09-10) by a throwaway miner, deleted with
//   the ticket per the diagnose-then-delete rule. The plan doc §0.9 carries the method; §0.9.1
//   carries the owner's caution about what a log can and cannot be trusted for, and the reason only
//   the two DoT rates survived it.
//
//   THE UNIT TESTS pin the arithmetic — the rounding rules in particular, because a display that
//   disagrees with the in-game tooltip by one is worse than no display at all.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONFIDENCE_LABEL,
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_LABEL,
  UPGRADE_RATES,
  UNIVERSAL_RATES,
  categoryIsOffensive,
  classifyUpgrade,
  motesSpentAt,
  motesToReach,
  nextTierReturn,
  spellTierLadder,
  upgradePayoff,
  upgradePayoffSentence,
  weakestConfidence,
  type SpellTierBase,
  type UpgradeCategory,
  type UpgradeFacts
} from '../src/shared/spellUpgrade'
import { SPELL_MAX_RANK } from '../src/shared/spellScale'

/** A fact set with everything off, so each case states only what it is about. */
function facts(over: Partial<UpgradeFacts>): UpgradeFacts {
  return {
    beneficial: false,
    hasDuration: false,
    permanent: false,
    damage: false,
    heal: false,
    charm: false,
    pet: false,
    ...over
  }
}

// =================================================================================================
// THE MEASUREMENTS — the two rates this repo can defend from its own evidence
// =================================================================================================

/**
 * DOT DAMAGE: the ceiling of one spell's own tick, at base and at a rank, read INSIDE one level and
 * one gear window so the worn-focus factor cancels.
 *
 * The measurement is possible only because the log states the rank on a DoT's own tick line —
 * `<mob> has taken 468 damage from your Odium VII.` — where a nuke hit does not.
 *
 * `n` is the sample behind each ceiling. Odium's base ceiling of 387 is the pooled L20-L29 reading
 * (n=239), which is the best-sampled base this log contains for it.
 */
const DOT_DAMAGE_LADDERS = [
  { spell: 'Odium', base: 387, baseN: 239, tier: 5, observed: 445 },
  { spell: 'Odium', base: 387, baseN: 239, tier: 7, observed: 468 },
  { spell: 'Envenomed Bolt', base: 422, baseN: 123, tier: 4, observed: 473 },
  { spell: 'Plague', base: 180, baseN: 80, tier: 4, observed: 199 }
] as const

test('DoT damage: the measured ladders read 3% a tier, and 6% is excluded', () => {
  for (const row of DOT_DAMAGE_LADDERS) {
    const perTier = (row.observed / row.base - 1) / row.tier
    // Every ladder lands between 2.5% and 3.5%. Plague is the low one at 2.64%.
    assert.ok(
      perTier > 0.025 && perTier < 0.035,
      `${row.spell} +${String(row.tier)}: measured ${(perTier * 100).toFixed(2)}% a tier, expected ~3%`
    )
    // …and the rate the app shipped before this ticket misses every one of them by a mile.
    const atSix = row.base + Math.floor((row.base * 6 * row.tier) / 100)
    assert.ok(
      atSix > row.observed * 1.06,
      `${row.spell} +${String(row.tier)}: the 6% rate predicts ${String(atSix)} against an observed ${String(row.observed)}`
    )
  }
})

test('DoT damage: Odium is EXACT at two separate ranks under the shipped rule', () => {
  // `floor(387 x 1.15) = 445` and `floor(387 x 1.21) = 468`. Two independent rungs of one ladder,
  // both to the unit — which is why this rate is marked 'measured' and not 'reported'.
  const ladder = spellTierLadder({ category: 'dot', damage: 387 })
  assert.equal(ladder[5].damage, 445)
  assert.equal(ladder[7].damage, 468)
})

/**
 * DOT DURATION: damage LINES per application — one initial hit (the SPA-79 hybrid) plus the DoT's
 * own ticks. Runs split on a gap over 12s; the estimator is the MODE over many applications, not the
 * max, because every way an application can end early censors downward only (plan doc §0.9.1).
 */
const DOT_DURATION_LADDERS = [
  { spell: 'Odium', baseTicks: 5, baseLines: 6, baseN: 180, tier: 7, observedLines: 8 },
  { spell: 'Plague', baseTicks: 13, baseLines: 14, baseN: 36, tier: 4, observedLines: 17 }
] as const

test('DoT duration: the +5% a tier rule reproduces both well-sampled ladders exactly', () => {
  for (const row of DOT_DURATION_LADDERS) {
    const ladder = spellTierLadder({ category: 'dot', durationTicks: row.baseTicks })
    const predicted = (ladder[row.tier].durationTicks ?? 0) + 1 // + the initial hit
    assert.equal(
      predicted,
      row.observedLines,
      `${row.spell} +${String(row.tier)}: predicted ${String(predicted)} lines, observed ${String(row.observedLines)}`
    )
  }
})

test('DoT duration: the Envenomed Bolt miss is recorded rather than explained away', () => {
  // Base 6 ticks + 1 initial = 7 lines; the +5% rule predicts 8 at rank IV and the log read 7 — off
  // this suite's ladders because its rank-IV sample is SEVEN applications. Pinned so that if a later
  // reading resolves it, somebody has to come here and say which way it went.
  const ladder = spellTierLadder({ category: 'dot', durationTicks: 6 })
  assert.equal((ladder[4].durationTicks ?? 0) + 1, 8)
})

test('the two DoT rates are the only ones marked measured', () => {
  const measured: string[] = []
  for (const c of UPGRADE_CATEGORIES) {
    for (const [what, mark] of Object.entries(UPGRADE_RATES[c].confidence)) {
      if (mark === 'measured') measured.push(`${c}.${what}`)
    }
  }
  // Nuke damage is `spellScale.ts`'s own fit (JOS-447), which this ticket did not disturb.
  assert.deepEqual(measured.sort(), ['dot.duration', 'dot.magnitude', 'nuke.magnitude'])
})

// =================================================================================================
// CLASSIFICATION
// =================================================================================================

test('classify: the ORDER of the tests is the rule', () => {
  const cases: [Partial<UpgradeFacts>, UpgradeCategory][] = [
    // A damaging detrimental WITH a duration is a DoT and not a nuke - reordering these two tests
    // would silently re-file every DoT in the game.
    [{ damage: true }, 'nuke'],
    [{ damage: true, hasDuration: true }, 'dot'],
    [{ damage: true, permanent: true }, 'dot'],
    // Charm beats damage: a charm that also nukes is still crowd control.
    [{ damage: true, charm: true, hasDuration: true }, 'cc'],
    [{ charm: true }, 'cc'],
    // A detrimental that does not damage is a debuff whether or not it lasts.
    [{}, 'debuff'],
    [{ hasDuration: true }, 'debuff'],
    // Beneficial: pet first, then healing, then duration.
    [{ beneficial: true, pet: true, heal: true, hasDuration: true }, 'pet'],
    [{ beneficial: true, heal: true }, 'heal'],
    [{ beneficial: true, heal: true, hasDuration: true }, 'hot'],
    [{ beneficial: true, hasDuration: true }, 'buff'],
    [{ beneficial: true, permanent: true }, 'buff'],
    // A beneficial instant that neither heals nor lasts is genuinely none of them.
    [{ beneficial: true }, 'other']
  ]
  for (const [over, expected] of cases) {
    assert.equal(classifyUpgrade(facts(over)), expected, JSON.stringify(over))
  }
})

test('every category is labelled and ordered exactly once', () => {
  assert.equal(UPGRADE_CATEGORIES.length, new Set(UPGRADE_CATEGORIES).size)
  for (const c of UPGRADE_CATEGORIES) {
    assert.ok(UPGRADE_CATEGORY_LABEL[c].length > 0)
    assert.ok(UPGRADE_RATES[c] !== undefined)
    // No em dashes in user-facing copy (AGENTS.md, UI conventions).
    assert.ok(!/[–—]/.test(UPGRADE_CATEGORY_LABEL[c]), c)
  }
  assert.equal(Object.keys(UPGRADE_RATES).length, UPGRADE_CATEGORIES.length)
})

test('only the offensive categories carry a resist row', () => {
  assert.deepEqual(UPGRADE_CATEGORIES.filter(categoryIsOffensive), ['nuke', 'dot', 'debuff', 'cc'])
  // A buff with a resist number in the client column still gets no row: nothing resists a buff.
  const ladder = spellTierLadder({ category: 'buff', resistAdjust: -20, durationTicks: 10 })
  assert.equal(ladder[5].resistAdjust, undefined)
  // …and a debuff does.
  assert.equal(spellTierLadder({ category: 'debuff', resistAdjust: -20 })[5].resistAdjust, -95)
})

// =================================================================================================
// MOTES
// =================================================================================================

test('motes double per tier and the total is one less than the next rung', () => {
  const perTier = Array.from({ length: SPELL_MAX_RANK }, (_, i) => motesToReach(i + 1))
  assert.deepEqual(perTier, [1, 2, 4, 8, 16, 32, 64, 128, 256, 512])
  assert.deepEqual(
    Array.from({ length: SPELL_MAX_RANK + 1 }, (_, i) => motesSpentAt(i)),
    [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023]
  )
  // The fact that makes the Upgrades tab worth building: the last rung costs more than the first
  // nine put together.
  assert.ok(motesToReach(10) > motesSpentAt(9))
})

test('there is no rung below 0 or above the cap to buy', () => {
  assert.equal(motesToReach(0), 0)
  assert.equal(motesToReach(-3), 0)
  assert.equal(motesToReach(SPELL_MAX_RANK + 1), 0)
  assert.equal(motesSpentAt(-1), 0)
  assert.equal(motesSpentAt(99), motesSpentAt(SPELL_MAX_RANK))
})

// =================================================================================================
// THE LADDER'S ARITHMETIC
// =================================================================================================

const NUKE: SpellTierBase = {
  category: 'nuke',
  mana: 200,
  castSeconds: 3,
  recoverySeconds: 1.5,
  reuseSeconds: 12,
  resistAdjust: 0,
  damage: 333
}

test('tier 0 is byte-identical to the base it was handed', () => {
  const [base] = spellTierLadder(NUKE)
  assert.equal(base.tier, 0)
  assert.equal(base.mana, NUKE.mana)
  assert.equal(base.castSeconds, NUKE.castSeconds)
  assert.equal(base.recoverySeconds, NUKE.recoverySeconds)
  assert.equal(base.reuseSeconds, NUKE.reuseSeconds)
  assert.equal(base.damage, NUKE.damage)
  assert.equal(base.resistAdjust, 0)
  assert.equal(base.motesTotal, 0)
})

test('the ladder is the full 0..10 and its mote columns agree with the curve', () => {
  const ladder = spellTierLadder(NUKE)
  assert.equal(ladder.length, SPELL_MAX_RANK + 1)
  for (const [i, row] of ladder.entries()) {
    assert.equal(row.tier, i)
    assert.equal(row.motesForTier, motesToReach(i))
    assert.equal(row.motesTotal, motesSpentAt(i))
  }
})

test('recovery rounds to the nearest 0.1 with an exact half going DOWN', () => {
  // The community model's own observed display rule: 1.35 shows as 1.3, not 1.4. It is the one
  // rounding in this file that a naive `toFixed(1)` gets wrong, so it is pinned on the exact half.
  const ladder = spellTierLadder({ category: 'nuke', recoverySeconds: 2.5 })
  // tier 5: 2.5 x 0.90 = 2.25 exactly -> 2.2, not 2.3.
  assert.equal(ladder[5].recoverySeconds, 2.2)
  // tier 10: 2.5 x 0.80 = 2.0.
  assert.equal(ladder[10].recoverySeconds, 2)
})

test('reuse truncates fractions and never falls below one second', () => {
  const ladder = spellTierLadder({ category: 'nuke', reuseSeconds: 12 })
  // 12 x 0.98 = 11.76 -> the display drops the fraction.
  assert.equal(ladder[1].reuseSeconds, 11)
  assert.equal(ladder[10].reuseSeconds, Math.floor(12 * 0.8))
  // A one-second re-use timer cannot be improved away.
  const short = spellTierLadder({ category: 'nuke', reuseSeconds: 1 })
  assert.equal(short[10].reuseSeconds, 1)
})

test('a spell that states no mana never acquires one, and a zero is not a cost', () => {
  const bardSong = spellTierLadder({ category: 'buff', durationTicks: 10 })
  assert.equal(bardSong[7].mana, undefined)
  const free = spellTierLadder({ category: 'buff', mana: 0, durationTicks: 10 })
  assert.equal(free[7].mana, undefined)
})

test('an instant and a permanent duration never scale', () => {
  // No ticks stated at all -> no duration row at any tier.
  assert.equal(spellTierLadder({ category: 'heal', mana: 100 })[9].durationTicks, undefined)
  // A category with no duration RATE keeps its ticks exactly (`nuke`, `heal`, `pet`).
  assert.equal(spellTierLadder({ category: 'heal', durationTicks: 12 })[9].durationTicks, 12)
})

test('a magnitude only moves where the category says it does', () => {
  // The Bear Form rule, as arithmetic: a buff's numbers are the same at every rung.
  const bear = spellTierLadder({ category: 'buff', mana: 100, castSeconds: 4, durationTicks: 1440 })
  assert.equal(bear[0].mana, 100)
  assert.equal(bear[10].mana, 60) // 100 x (1 - 0.04 x 10)
  assert.equal(bear[10].castSeconds, 2.4)
  assert.equal(bear[10].durationTicks, 2880) // 1440 x 2.0
  // A debuff's slow does not slow harder.
  const tash = spellTierLadder({ category: 'debuff', damage: 0, resistAdjust: -60 })
  assert.equal(tash[10].damage, undefined)
})

// =================================================================================================
// THE PAYOFF — the owner's question 2
// =================================================================================================

test('Form of the Bear: the payoff names what upgrading does NOT buy', () => {
  // `Increase Hit points by 1 per tick` + `Increase Wisdom by 5`, 100 mana, 4.0s cast, 2h24m.
  // Neither number moves at any tier; all you buy is the clock and the cost.
  const p = upgradePayoff({
    category: 'buff',
    mana: 100,
    castSeconds: 4,
    durationTicks: 1440
  })
  assert.equal(p.magnitude, false)
  assert.deepEqual([p.duration, p.mana, p.cast], [true, true, true])
  assert.equal(p.resist, false)
  assert.equal(p.nothing, false)
  assert.equal(
    upgradePayoffSentence(p),
    'upgrading buys longer duration, less mana and faster casting - the numbers it grants do not change'
  )
})

test('a nuke says the opposite, and says it without the caveat clause', () => {
  const p = upgradePayoff(NUKE)
  assert.equal(p.magnitude, true)
  assert.ok(!upgradePayoffSentence(p).includes('do not change'))
})

test('the payoff is what YOU get, not what the table offers', () => {
  // A category with a mana rate buys nothing for a spell that costs no mana.
  const song = upgradePayoff({ category: 'buff', durationTicks: 60, castSeconds: 3 })
  assert.equal(song.mana, false)
  // …and a spell that states nothing at all gets the honest answer rather than an optimistic one.
  const empty = upgradePayoff({ category: 'other' })
  assert.equal(empty.nothing, true)
  assert.equal(empty.confidence, undefined)
  assert.equal(upgradePayoffSentence(empty), 'upgrading this buys nothing this app can measure')
})

test('a payoff is only as good as its weakest live claim', () => {
  // A DoT's magnitude is measured and its cast rate is reported: the reading is reported.
  const dot = upgradePayoff({ category: 'dot', damage: 300, durationTicks: 5, castSeconds: 3 })
  assert.equal(dot.confidence, 'reported')
  // Strip the reported halves and the measured one stands alone.
  const magnitudeOnly = upgradePayoff({ category: 'dot', damage: 300 })
  assert.equal(magnitudeOnly.confidence, 'measured')
  assert.equal(weakestConfidence([]), undefined)
  assert.equal(weakestConfidence(['measured', 'inferred', 'reported']), 'inferred')
})

test('no user-facing string in this module carries an em dash', () => {
  const strings = [
    ...Object.values(UPGRADE_CATEGORY_LABEL),
    ...Object.values(CONFIDENCE_LABEL),
    upgradePayoffSentence(upgradePayoff(NUKE)),
    upgradePayoffSentence(upgradePayoff({ category: 'buff', mana: 10, durationTicks: 10 })),
    upgradePayoffSentence(upgradePayoff({ category: 'other' }))
  ]
  for (const s of strings) assert.ok(!/[–—]/.test(s), s)
})

// =================================================================================================
// RETURN PER MOTE — the ranking behind "spend your next motes here"
// =================================================================================================

test('return per mote falls off a cliff as the cost doubles', () => {
  const ladder = spellTierLadder({ category: 'nuke', damage: 1000 })
  const value = (r: { damage?: number }): number => r.damage ?? 0
  const first = nextTierReturn(ladder, 0, value)
  const last = nextTierReturn(ladder, 9, value)
  assert.ok(first !== null && last !== null)
  assert.equal(first.motes, 1)
  assert.equal(last.motes, 512)
  // Each rung adds the same 60 damage; the 10th costs 512 times what the 1st did.
  assert.ok(first.perMote > last.perMote * 100)
})

test('there is no return past the cap, and none where nothing moves', () => {
  const ladder = spellTierLadder({ category: 'buff', durationTicks: 100, mana: 50 })
  assert.equal(nextTierReturn(ladder, SPELL_MAX_RANK, (r) => r.durationTicks ?? 0), null)
  // A buff valued on its MAGNITUDE returns nothing at any rung - which is the whole point.
  assert.equal(nextTierReturn(ladder, 3, (r) => r.damage ?? 0), null)
  // …but valued on its duration it returns plenty.
  assert.ok(nextTierReturn(ladder, 3, (r) => r.durationTicks ?? 0) !== null)
})

test('the universal rates are the community model, unchanged', () => {
  assert.equal(UNIVERSAL_RATES.recovery, 0.02)
  assert.equal(UNIVERSAL_RATES.reuse, 0.02)
  assert.equal(UNIVERSAL_RATES.resistPerTier, 15)
})
