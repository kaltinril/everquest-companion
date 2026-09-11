// spellUpgrade.ts — WHAT A MOTE TIER ACTUALLY BUYS, per spell category
// (docs/plans/spell-upgrades-and-loadout.md §3.1).
//
// ============================================================================
// WHY THIS EXISTS BESIDE `spellScale.ts` RATHER THAN INSIDE IT
// ============================================================================
// `spellScale.ts` answers ONE question - what a damage or healing magnitude reads at a mote rank -
// and it answers it from a fit to the owner's own combat log. That is the right shape for the
// question it was asked (JOS-447, the best-spells rank slider) and the wrong shape for this one,
// because upgrading a spell moves SIX quantities and only two of them are magnitudes:
//
//     cast time  ·  mana  ·  duration  ·  recovery  ·  reuse  ·  resist modifier
//
// and the RATE of every one of them depends on what KIND of spell it is. A nuke's mana falls at
// 2% a tier; a buff's falls at 4%. So the unit this file works in is a CATEGORY, not a spell, and
// the thing it produces is a whole per-tier reading rather than one number.
//
// `spellScale.ts` keeps its two magnitude functions, its own header's evidence, and BOTH damage
// rates - the direct one and the per-tick one this ticket measured. This file READS them rather than
// restating them, so the rate table below cannot drift from the function the Leveling tab's rank
// slider already calls. It imports nothing else: no Electron, no catalog, no clock.
//
// ============================================================================
// WHERE THE NUMBERS COME FROM, AND WHICH OF THEM ARE OURS
// ============================================================================
// The upgrade system is SERVER-SIDE. None of it is in `spells_us.txt`, none of it is on the wiki,
// and the in-game tooltip prints only part of it. So there are exactly two sources and this file
// keeps them apart on every single rate:
//
//   'measured'  - this repo put it to the owner's own log and it survived. Three rates qualify.
//   'reported'  - the community model at <https://amerzel.github.io/eql-info/#/upgrades>, itself
//                 reverse-engineered from ~94 tooltip captures (their `spell-upgrades/STATUS.md`,
//                 2026-07-20). Credited in the app, per the standing rule that crediting a source
//                 is part of shipping a feature.
//   'inferred'  - the community model's OWN extrapolations, which it marks as such. We do not
//                 launder them into anything firmer by copying them.
//
// THE MEASUREMENTS (docs/plans/spell-upgrades-and-loadout.md §0.9, read on 2,007,769 lines of
// `eqlog_Drywrought_oggok.txt`, 2026-09-10). They are possible at all because the log states the
// rank on a DoT's own tick line - `<mob> has taken 468 damage from your Odium VII.` - where a nuke
// hit does not, so rank, level and damage arrive together and the worn-focus factor cancels in a
// same-level ratio:
//
//   DOT DAMAGE IS 3% A TIER AND NOT 6%. Odium's tick ceiling is 387 at base (n=239),
//   445 at V and 468 at VII. `floor(387 x 1.15) = 445` and `floor(387 x 1.21) = 468`, both EXACT.
//   Envenomed Bolt reads 422 -> 473 at IV (3.02% a tier) and Plague 180 -> 199 at IV (2.64%).
//   The 6% rate would have predicted 503, 549, 523 and 223 - wrong on all four by 10-15%, which is
//   far outside the noise on ceilings this tight. This is the one place this file CONTRADICTS a
//   number the app shipped, and it does so on evidence.
//
//   DOT DURATION IS 5% A TIER. A base application prints one initial hit plus its ticks (the SPA-79
//   hybrid). Odium: 6 lines at base, 8 at VII, and `round(5 x 1.35) + 1 = 8`. Plague: 14 at base,
//   17 at IV, and `round(13 x 1.20) + 1 = 17`. Envenomed Bolt's IV sample is 7 applications and
//   reads one short; it is recorded as a miss rather than explained away.
//
//   BUFF DURATION READS CONSISTENT WITH 10% A TIER, and is NOT recorded as measured. Spirit of the
//   Puma at level 38, three rungs in one window: 1.20 min at base (n=9), 1.58 at IV (n=11), 2.00 at
//   VI (n=48) - 7.9% and 11.1% a tier, bracketing the reported rate. It stays 'reported' because it
//   is ONE spell with single-digit samples on two of its three rungs, and because of the paragraph
//   below.
//
// ============================================================================
// WHY ONLY THE TWO DOT RATES ARE 'measured' (owner's caution, 2026-09-10)
// ============================================================================
// The owner's warning, verbatim: *"in practice many things can affect buff cast time and duration.
// Dying, cancel magic stuff, pillage spells, accidental clicking off, noticing a buff is getting low
// and manually recasting it. Different AA can affect cast time etc. Different stances or whatever
// they are called also. So the logs can't be 100% trusted."*
//
// Every one of those is real, and this log names three of them out loud:
//
//   1,928 STANCE CHANGES (`You assume an offensive stance.` x760, evasive x529, balanced x578,
//   channeler x30 and four more). The character is switching stance constantly, and a stance moves
//   cast time. Any cast-time reading off this log is measuring the stance as much as the tier.
//
//   TWO CAST-TIME AAs LAND INSIDE THE COMPARISON WINDOWS: `Spell Casting Deftness` on Sep 06 and
//   `Quick Damage` on Sep 09 - and Sep 09 is the very day of the Odium base-versus-V-versus-VII
//   comparison. Cast time was already off the list; it is now off it on evidence.
//
//   TWO DOT CRIT AAs (`Critical Affliction`, `Destructive Cascade`) were bought on Sep 08, between
//   the older base window and the ranked one.
//
// SO WHY DO THE TWO DOT RATES SURVIVE ALL OF THAT:
//
//   A TICK'S MAGNITUDE IS IMMUNE TO THE WHOLE LIST. Dying, a dispel, a cancel, an accidental click,
//   a manual recast and a stance change all decide WHETHER a tick happens; none of them changes the
//   NUMBER on one that does. The two inputs that do - caster level and worn focus - are controlled
//   by comparing inside one level and one day, which is the same discipline `spellScale.ts` used.
//   The crit AAs are the one live risk, and they are ruled out by shape rather than by argument: a
//   crit is a large multiplier, and the histograms carry no 2x values at all - Odium at VII reads
//   468 on four of its top four ticks, a ceiling that repeats rather than an outlier.
//
//   A TICK COUNT IS CENSORED DOWNWARD ONLY. Everything on the owner's list ENDS a DoT early; nothing
//   makes one run long. So the failure mode is under-reading the duration, and the estimator is the
//   MODE over many applications (n=180 for Odium at base) rather than the max, which is exactly the
//   rule AGENTS.md already records for durations - *"recency-weighted MAX (median biases low via
//   censored samples)"* - applied to a distribution dense enough to have a mode.
//
//   A BUFF'S landing-to-wears-off gap has NEITHER protection: a missed wears-off (a zone, a camp, a
//   log gap) reads LONG, which is the one direction that flatters a duration rate. Hence 'reported'.
//
// WHAT THE LOG COULD NOT SETTLE AT ALL, stated rather than fudged: cast time and reuse (the stances
// and the two AAs above, on top of 1-second timestamps and a tick-phase offset), mana (the log never
// prints a cost, and stances move it too), and the resist modifier. Those ship 'reported'. An
// in-game tooltip pair at two ranks settles any of them outright and settles them better than any
// amount of log arithmetic could.
//
// ============================================================================
// FORM OF THE BEAR: THE OWNER'S CLAIM STANDS, AND TWO OF ITS THREE LEGS ARE NOW MEASURED
// ============================================================================
// This block used to record an open disagreement and say a tooltip pair would settle it. Neither
// half of that survived 2026-09-10, so both are rewritten here rather than amended.
//
// WHAT IS MEASURED, from the owner's own character Stats window, buff OFF then Form of the Bear IV
// ON - one rank against no rank, which is the comparison the screenshots actually make:
//
//                        buff off      Bear IV
//     Combat HP Regen      93            94
//     Wisdom              163           168
//     Max mana           2208          2287     (the +5 WIS, downstream)
//
// So the spell's whole contribution is +1 regen and +5 WIS, and it is REAL - the old block's worry
// that the owner might be describing a buff that grants nothing is answered and was never the
// claim anyway.
//
// AND THE ARITHMETIC CLOSES IT WITHOUT A SECOND RANK, which the owner's own argument points
// straight at: *"at a +4 (IV) it should have done more than that if it was going to have any
// impact at all on stats."* The catalog's base figures for this spell are `Increase Hit points by
// 1 per tick` and `Increase Wisdom by 5`. Rank IV reads 1 and 5. So base and rank IV agree.
//
// A 1 CANNOT MOVE, AND THAT IS A FACT ABOUT THE NUMBER RATHER THAN ABOUT THE RATE. Every magnitude
// in this model is `floor(base * (1 + rate * tier))`, so the `hot` rate's own prediction for a base
// of 1 is `floor(1 * 1.12) = 1` at rank IV and `floor(1 * 1.30) = 1` at rank X, the top of the
// ladder. The measurement and the disputed rate agree for this spell at every rank there is. The
// owner's conclusion - upgrading Bear Form buys nothing but mana and duration - is therefore true
// under BOTH models, and no second Stats-window reading could separate them.
//
// THAT GENERALISES, and `magnitudeCanMove` below is the general form: a magnitude the top of the
// ladder leaves unchanged is not a payoff, whatever the category claims. It is arithmetic over the
// model's own rate rather than a taxonomy guess, which is what makes it admissible where a rule
// like "a regen under 2 a tick is a buff" is not.
//
// AND THE TOOLTIP IS NOT AN INSTRUMENT, which is the part that invalidates the obvious check the
// old block asked for. The owner: *"the tooltips in game never update for damage but the damage of
// spells like this one DOES go up."* His Odium VII tooltip prints `between 317 and 325 damage every
// six seconds` - base figures - while the mana, cast and re-use lines beside them show live green
// values. A tooltip pair therefore proves nothing about a magnitude in either direction. Read the
// Stats window, or a log line.
//
// WHY THIS IS AN EXCEPTION AND NOT A NEW RULE. The taxonomy argument is unchanged: Form of the Bear
// is `Increase Hit points by 1 per tick` on a spell with a duration, which is SPA 100, and nothing
// in the catalog distinguishes it from Regeneration. The available rules are still inventions ("a
// regen under 2 a tick is a buff") and would silently re-file spells nobody has checked - the
// taxonomy mistake `spellEffectClass.ts` warns about. So it is recorded on the ONE spell it was
// reported for (`MEASURED_STATIC_MAGNITUDE`), and the `hot` rate is left alone elsewhere.
//
// WHAT IS STILL OPEN: whether Chloroplast and Harnessing of Spirit - real HoTs, and the other rows
// the Upgrades tab ranks on the `hot` rate - behave like Form of the Bear or like the community
// table. If they match Bear, the rate is wrong for the category rather than for one spell.

// ============================================================================
// AND THE ONE CLAIM THE WHOLE FEATURE HANGS ON
// ============================================================================
// A BUFF'S MAGNITUDES DO NOT SCALE. Form of the Bear grants `Increase Hit points by 1 per tick` and
// `Increase Wisdom by 5`, and upgrading it to X leaves both of those exactly where they are - all
// you buy is duration, mana and cast time. That is the owner's own report (2026-09-10) and the
// community model states it independently; NEITHER is a measurement, because no log line anywhere
// prints a stat magnitude. `upgradePayoff` is the function that says it out loud, and it says it
// as a fact about the CATEGORY rather than about the spell, which is the only form of the claim the
// evidence supports.

import {
  SPELL_DAMAGE_RANK_PERCENT,
  SPELL_DOT_DAMAGE_RANK_PERCENT,
  SPELL_HEAL_RANK_PERCENT,
  SPELL_MAX_RANK,
  normalizeSpellRank
} from './spellScale'

/** The two damage rates and the healing rate, as fractions, read from the file that measured them. */
const DIRECT_DAMAGE = SPELL_DAMAGE_RANK_PERCENT / 100
const TICK_DAMAGE = SPELL_DOT_DAMAGE_RANK_PERCENT / 100
const HEAL = SPELL_HEAL_RANK_PERCENT / 100

// =================================================================================================
// THE CATEGORIES
// =================================================================================================

/**
 * What KIND of spell this is, for the purpose of upgrading it. The community model's own partition,
 * kept verbatim because the rates are keyed by it and a category of our own invention would make
 * their table unreadable against ours.
 *
 * `other` is a real member and not a failure: a beneficial instant that heals nothing and lasts no
 * time (a cure, a summon, a gate) genuinely is none of the eight, and giving it the cautious buff
 * rates under an honest name beats filing it under one it is not.
 */
export type UpgradeCategory =
  | 'nuke'
  | 'dot'
  | 'heal'
  | 'hot'
  | 'debuff'
  | 'cc'
  | 'buff'
  | 'pet'
  | 'other'

/** Tab-order for any surface that lists the categories. Offence, then healing, then the rest. */
export const UPGRADE_CATEGORIES: readonly UpgradeCategory[] = [
  'nuke',
  'dot',
  'heal',
  'hot',
  'debuff',
  'cc',
  'buff',
  'pet',
  'other'
]

/** What a player calls it. One place, so the tab, the chip and the tooltip cannot drift. */
export const UPGRADE_CATEGORY_LABEL: Record<UpgradeCategory, string> = {
  nuke: 'Nuke / lifetap',
  dot: 'Damage over time',
  heal: 'Heal',
  hot: 'Heal over time',
  debuff: 'Debuff',
  cc: 'Charm / mez',
  buff: 'Buff',
  pet: 'Pet summon',
  other: 'Uncategorized'
}

/**
 * How well we know a number. Read by every surface that prints one, and the reason this file exists
 * as a table rather than as arithmetic scattered through a component.
 *
 * The ORDER is the confidence order, weakest first, so `WEAKEST_OF` can fold a reading's marks into
 * one verdict without a lookup table of its own.
 */
export type UpgradeConfidence = 'inferred' | 'reported' | 'measured'

const CONFIDENCE_RANK: Record<UpgradeConfidence, number> = { inferred: 0, reported: 1, measured: 2 }

/** The weakest mark in a set - what a whole reading is worth is what its softest claim is worth. */
export function weakestConfidence(
  marks: readonly UpgradeConfidence[]
): UpgradeConfidence | undefined {
  let worst: UpgradeConfidence | undefined
  for (const m of marks) {
    if (worst === undefined || CONFIDENCE_RANK[m] < CONFIDENCE_RANK[worst]) worst = m
  }
  return worst
}

/** One word a surface can print beside a figure. Deliberately short; the tooltip carries the why. */
export const CONFIDENCE_LABEL: Record<UpgradeConfidence, string> = {
  measured: 'measured',
  reported: 'reported',
  inferred: 'inferred'
}

// =================================================================================================
// THE RATE TABLE
// =================================================================================================

/**
 * The per-tier rates for one category. Every field is a FRACTION OF BASE PER TIER, applied
 * linearly - `base x (1 - rate x tier)` for a cost, `base x (1 + rate x tier)` for a benefit.
 *
 * `duration: null` means the category has no duration to extend (an instant), which is NOT the same
 * claim as `duration: 0` (a duration that exists and does not move). Nothing in the shipped table
 * states the second, and the distinction is kept because a future measurement might.
 */
export interface UpgradeRates {
  /** Cast time falls by this fraction of base per tier. */
  cast: number
  /** Mana cost falls by this fraction of base per tier. Zero-mana spells have nothing to reduce. */
  mana: number
  /** Buff/DoT duration RISES by this fraction per tier; null where the category has no duration. */
  duration: number | null
  /**
   * The damage magnitude rate, or null where the category's magnitudes DO NOT SCALE AT ALL.
   *
   * Null is the load-bearing value in this whole file: it is what makes `upgradePayoff` able to say
   * "upgrading this buys you no bigger numbers" without any surface having to know why.
   */
  damage: number | null
  /** The healing magnitude rate, same null rule. */
  heal: number | null
  /** How well each of the four above is known. */
  confidence: {
    cast: UpgradeConfidence
    mana: UpgradeConfidence
    duration: UpgradeConfidence
    magnitude: UpgradeConfidence
  }
}

/**
 * THE TABLE. Read the file header before changing a number in it: every one of them is either a
 * measurement with a stated method or a community claim with a stated provenance, and a rate edited
 * without moving its confidence mark is a lie the UI will faithfully print.
 */
export const UPGRADE_RATES: Record<UpgradeCategory, UpgradeRates> = {
  nuke: {
    cast: 0.02,
    mana: 0.02,
    duration: null,
    damage: DIRECT_DAMAGE,
    heal: null,
    confidence: { cast: 'reported', mana: 'reported', duration: 'reported', magnitude: 'measured' }
  },
  dot: {
    cast: 0.04,
    mana: 0.02,
    duration: 0.05,
    // 3% and not 6%: measured on three DoT ladders in the owner's own log. `spellScale.ts` holds the
    // number and the evidence, and `scaleSpellDamage(_, _, perTick)` applies the same one, so the
    // Spells area and the Leveling tab's rank slider cannot print different figures for one spell.
    damage: TICK_DAMAGE,
    heal: null,
    confidence: { cast: 'reported', mana: 'reported', duration: 'measured', magnitude: 'measured' }
  },
  heal: {
    cast: 0.04,
    mana: 0.02,
    duration: null,
    damage: null,
    heal: HEAL,
    confidence: { cast: 'reported', mana: 'reported', duration: 'reported', magnitude: 'reported' }
  },
  hot: {
    cast: 0.04,
    mana: 0.02,
    duration: 0.05,
    damage: null,
    heal: HEAL,
    confidence: { cast: 'reported', mana: 'reported', duration: 'inferred', magnitude: 'reported' }
  },
  debuff: {
    cast: 0.04,
    mana: 0.04,
    duration: 0.1,
    // A slow does not slow harder when upgraded; a Tash does not tash deeper. Only the clock moves.
    damage: null,
    heal: null,
    confidence: { cast: 'reported', mana: 'reported', duration: 'inferred', magnitude: 'reported' }
  },
  cc: {
    cast: 0.04,
    mana: 0.04,
    duration: 0.1,
    damage: null,
    heal: null,
    confidence: { cast: 'reported', mana: 'reported', duration: 'reported', magnitude: 'reported' }
  },
  buff: {
    cast: 0.04,
    mana: 0.04,
    // Spirit of the Puma's three rungs at one level read 7.9% and 11.1% a tier, which BRACKETS this
    // number without pinning it. It stays 'reported': one spell, single-digit samples, and a
    // landing-to-wears-off gap is the one measurement here that a missed line inflates rather than
    // truncates. See the header's third section.
    duration: 0.1,
    damage: null,
    heal: null,
    confidence: { cast: 'reported', mana: 'reported', duration: 'reported', magnitude: 'reported' }
  },
  pet: {
    cast: 0.04,
    mana: 0.04,
    duration: null,
    damage: null,
    heal: null,
    confidence: { cast: 'inferred', mana: 'inferred', duration: 'inferred', magnitude: 'inferred' }
  },
  other: {
    cast: 0.04,
    mana: 0.04,
    duration: 0.1,
    damage: null,
    heal: null,
    confidence: { cast: 'inferred', mana: 'inferred', duration: 'inferred', magnitude: 'inferred' }
  }
}

/**
 * Rates that apply to EVERY category. They are not in the table above because putting nine copies
 * of one number in a table invites nine of them to drift.
 */
export const UNIVERSAL_RATES = {
  /** Recovery time falls 2% a tier, displayed to the nearest 0.1s with exact halves rounding DOWN. */
  recovery: 0.02,
  /** Re-use timer falls 2% a tier, displayed floor-truncated, with a hard floor of one second. */
  reuse: 0.02,
  /** The resist modifier is a FLAT -15 a tier, not a percentage. Offensive resistable spells only. */
  resistPerTier: 15,
  confidence: { recovery: 'reported', reuse: 'reported', resist: 'reported' } as const
}

/** The floor the game puts under a re-use timer, in seconds. A tier can never take you below it. */
export const MIN_REUSE_SECONDS = 1

// =================================================================================================
// MOTES
// =================================================================================================

/**
 * Motes to advance FROM tier `t - 1` TO tier `t`: `2^(t-1)`.
 *
 * The doubling is the whole reason this feature is worth building. Tier 1 costs one mote and tier 10
 * costs 512, so the last rung of a ladder costs more than the first nine put together - which makes
 * "which spell should these motes go into" a real question with a wrong answer, rather than a
 * matter of taste.
 *
 * Zero for a tier at or below 0 and for anything past the cap: there is no such rung to buy.
 */
export function motesToReach(tier: number): number {
  const t = Math.trunc(tier)
  if (t <= 0 || t > SPELL_MAX_RANK) return 0
  return 2 ** (t - 1)
}

/** Motes spent in total to STAND at tier `t`: `2^t - 1`, the sum of every rung below it. */
export function motesSpentAt(tier: number): number {
  const t = Math.trunc(tier)
  if (t <= 0) return 0
  return 2 ** Math.min(t, SPELL_MAX_RANK) - 1
}

// =================================================================================================
// CLASSIFICATION
// =================================================================================================

/**
 * What a caller must know about a spell to file it. Deliberately the SMALLEST set that decides the
 * category, and every field of it is something the app already holds:
 *
 *   `beneficial`  - `spellDb.ts spellNature`, or the client row's `good_effect`.
 *   `hasDuration` - a duration the spell states, from either source.
 *   `permanent`   - the client's duration formula 50, or the wiki's `Permanent`.
 *   `damage`/`heal`/`charm`/`pet` - one boolean each, from whichever source the caller has.
 *
 * Taking booleans rather than a spell record is what keeps this file pure and testable: the wiki
 * catalog and the client table describe a spell in two different vocabularies, and BOTH of them can
 * answer these six questions. Neither of them is imported here.
 */
export interface UpgradeFacts {
  /** True for a buff/heal, false for a nuke/debuff. The `good_effect` bit, by any spelling. */
  beneficial: boolean
  /** The spell states a duration greater than zero. */
  hasDuration: boolean
  /** The duration is Permanent - it counts as "has a duration" but never scales. */
  permanent: boolean
  /** Some effect of it reduces hitpoints. */
  damage: boolean
  /** Some effect of it restores hitpoints, over time or at once. */
  heal: boolean
  /** Some effect of it charms or mesmerizes. */
  charm: boolean
  /** It summons a pet or a warder. */
  pet: boolean
}

/**
 * File a spell. The community model's own decision tree, in the same order, because the order IS
 * the rule - a damaging spell with a duration is a DoT and not a nuke, and a beneficial spell that
 * heals over time is a HoT and not a buff, and reordering the tests would silently re-file
 * hundreds of spells.
 */
export function classifyUpgrade(facts: UpgradeFacts): UpgradeCategory {
  const lasting = facts.hasDuration || facts.permanent
  if (!facts.beneficial) {
    if (facts.charm) return 'cc'
    if (facts.damage) return lasting ? 'dot' : 'nuke'
    return 'debuff'
  }
  if (facts.pet) return 'pet'
  if (facts.heal) return lasting ? 'hot' : 'heal'
  if (lasting) return 'buff'
  return 'other'
}

// =================================================================================================
// THE PER-TIER READING
// =================================================================================================

/**
 * A spell's BASE figures - what it reads at tier 0. Every field optional, and ABSENT MEANS THE
 * SOURCE STATED NOTHING, never zero (`bestSpells.ts`'s law, and the reason a bard song with no mana
 * does not read as a free nuke).
 */
export interface SpellTierBase {
  category: UpgradeCategory
  /**
   * The spell's name, when the caller has it.
   *
   * Read ONLY by `MEASURED_STATIC_MAGNITUDE`, which is the one place this file is allowed to know
   * about a particular spell rather than about a category. Absent is a supported state and means
   * "no exception can apply", which is the category's own answer.
   */
  name?: string
  /** Mana cost. Absent, or zero for a spell that genuinely costs none - both mean "no mana row". */
  mana?: number
  /** Cast time in SECONDS. */
  castSeconds?: number
  /** Recovery time in seconds - the cooldown the game charges for any cast. */
  recoverySeconds?: number
  /** The re-use timer in seconds. */
  reuseSeconds?: number
  /** Duration in TICKS (six seconds each), which is the unit the game keeps it in. */
  durationTicks?: number
  /** The spell's own resist modifier. Offensive resistable spells only. */
  resistAdjust?: number
  /** The damage magnitude at the level being read, already level-scaled by the caller. */
  damage?: number
  /** The healing magnitude at the level being read, already level-scaled by the caller. */
  heal?: number
}

/** One rung of the ladder: what every figure reads at that tier, plus what it cost to stand there. */
export interface SpellTierReading {
  tier: number
  /** Motes to advance from the rung below onto this one. Zero at tier 0. */
  motesForTier: number
  /** Motes spent in total to stand here. */
  motesTotal: number
  mana?: number
  castSeconds?: number
  recoverySeconds?: number
  reuseSeconds?: number
  durationTicks?: number
  resistAdjust?: number
  damage?: number
  heal?: number
}

/**
 * Is this a category the game rolls a resist against?
 *
 * The three detrimental members plus `dot`. A buff is never resisted, so the -15 a tier never
 * applies to one however the client's own column reads - and `other` is deliberately OUT, because
 * it is the bucket for things we could not file and inventing a resist row for one would be a claim
 * about a spell we already admitted we cannot classify.
 */
export function categoryIsOffensive(c: UpgradeCategory): boolean {
  return c === 'nuke' || c === 'dot' || c === 'debuff' || c === 'cc'
}

/** Round to the nearest 0.1 with an exact half going DOWN - the recovery row's observed display. */
function tenthsHalfDown(seconds: number): number {
  return Math.ceil(seconds * 10 - 0.5) / 10
}

/**
 * Apply a per-tier fraction to a base, in the direction the sign says.
 *
 * Multiplied before divided, `spellScale.ts`'s rule: the rates are hundredths and a repeating binary
 * fraction in the middle of a `floor` is how a display comes to disagree with the game by one.
 */
function scaled(base: number, ratePercent: number, tier: number, up: boolean): number {
  const delta = (base * ratePercent * tier) / 100
  return up ? base + delta : base - delta
}

/**
 * EVERY RUNG OF ONE SPELL'S LADDER, tier 0 through 10.
 *
 * Tier 0 is BYTE-IDENTICAL to the base it was handed - every rate multiplies by zero - which is the
 * property that lets a surface draw this table unconditionally and let the reader see for himself
 * that the base column is his spell.
 *
 * An absent base field stays absent at every tier. There is no rung at which a spell that stated no
 * mana acquires one.
 */
/**
 * A stated, positive figure, or undefined.
 *
 * ONE PLACE FOR THE ABSENT-MEANS-NOTHING RULE, because every field on this row obeys it and eight
 * copies of `x !== undefined && x > 0` is eight chances to write one of them as `>=`. Zero and
 * absent collapse to the same answer deliberately: a bard song's zero mana and a spell page that
 * omitted the field are both "there is no mana row here to reduce".
 */
function stated(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined
}

/**
 * The three COST rows - mana, cast, recovery, reuse - at one tier.
 *
 * Split out of `spellTierLadder` at this tree's measured complexity ceiling of 12 (eslint.config.mjs).
 * The seam is not arbitrary: these four are the rows whose rate is a REDUCTION and whose display
 * rounding is the fiddly part, and they are the ones a reader checks against the in-game tooltip.
 */
function costRowsAt(base: SpellTierBase, rates: UpgradeRates, tier: number): Partial<SpellTierReading> {
  const row: Partial<SpellTierReading> = {}
  const mana = stated(base.mana)
  if (mana !== undefined) row.mana = Math.round(scaled(mana, rates.mana * 100, tier, false))
  if (base.castSeconds !== undefined) {
    // Two decimals is the DISPLAY; the value stays a number and the surface formats it. Rounded to
    // hundredths here so no caller can print 2.1599999999.
    row.castSeconds = Math.round(scaled(base.castSeconds, rates.cast * 100, tier, false) * 100) / 100
  }
  if (base.recoverySeconds !== undefined) {
    row.recoverySeconds = tenthsHalfDown(
      scaled(base.recoverySeconds, UNIVERSAL_RATES.recovery * 100, tier, false)
    )
  }
  if (base.reuseSeconds !== undefined) {
    row.reuseSeconds = Math.max(
      MIN_REUSE_SECONDS,
      Math.floor(scaled(base.reuseSeconds, UNIVERSAL_RATES.reuse * 100, tier, false))
    )
  }
  return row
}

/**
 * The BENEFIT rows - duration, resist, damage, heal - at one tier.
 *
 * Every one of them can decline to move, and the declining is the interesting part: a `null` rate is
 * the Bear Form answer (the category's magnitudes do not scale), and a beneficial category has no
 * resist row at all however the client's own column reads.
 */
function benefitRowsAt(
  base: SpellTierBase,
  rates: UpgradeRates,
  tier: number
): Partial<SpellTierReading> {
  const row: Partial<SpellTierReading> = {}
  // Instant and Permanent never scale, which is why the caller states TICKS rather than a flag: a
  // spell with no finite duration has no ticks to state.
  const ticks = stated(base.durationTicks)
  if (ticks !== undefined) {
    row.durationTicks =
      rates.duration === null ? ticks : Math.round(scaled(ticks, rates.duration * 100, tier, true))
  }
  // The one FLAT rate: -15 a tier, added to the spell's own, and only where something rolls a resist.
  if (base.resistAdjust !== undefined && categoryIsOffensive(base.category)) {
    row.resistAdjust = base.resistAdjust - UNIVERSAL_RATES.resistPerTier * tier
  }
  // A MEASURED EXCEPTION READS AS NO RATE AT ALL, so the ladder prints the base figure at every
  // rung rather than a climb the game was measured not to give.
  const rate = magnitudeIsMeasuredStatic(base) ? { damage: null, heal: null } : rates
  const damage = stated(base.damage)
  if (damage !== undefined) row.damage = magnitudeAt(damage, rate.damage, tier)
  const heal = stated(base.heal)
  if (heal !== undefined) row.heal = magnitudeAt(heal, rate.heal, tier)
  return row
}

/**
 * One magnitude at a tier, or the base back untouched where the category states no rate.
 *
 * `amount + floor(amount * pct * tier / 100)` mirrors `spellScale.scaleSpellDamage` to the character,
 * which is what keeps the Spells area and the Leveling tab's rank slider printing the same number
 * for the same spell.
 */
function magnitudeAt(amount: number, rate: number | null, tier: number): number {
  if (rate === null) return amount
  return amount + Math.floor((amount * rate * 100 * tier) / 100)
}

export function spellTierLadder(base: SpellTierBase): SpellTierReading[] {
  const rates = UPGRADE_RATES[base.category]
  const out: SpellTierReading[] = []
  for (let tier = 0; tier <= SPELL_MAX_RANK; tier++) {
    out.push({
      tier,
      motesForTier: motesToReach(tier),
      motesTotal: motesSpentAt(tier),
      ...costRowsAt(base, rates, tier),
      ...benefitRowsAt(base, rates, tier)
    })
  }
  return out
}

// =================================================================================================
// THE PAYOFF - the owner's question 2, answered as a property of the category
// =================================================================================================

/**
 * SPELLS MEASURED TO GAIN NO MAGNITUDE FROM A TIER, whatever their category's rate claims.
 *
 * An EXCEPTION LIST rather than a rule, and it is deliberately hard to add to: an entry needs a
 * reading of the APPLIED stat - the Stats window, or a log line - and never a tooltip, which prints
 * base figures at every rank (see the Form of the Bear block above for the measurement that shows
 * it). An entry whose two-rank half rests on the owner's report rather than on a second reading
 * says so at the entry, as the one below does.
 *
 * Keyed by the name as the catalog spells it, folded the way every other spell join in this app
 * folds one, so a rank suffix and a stray case never miss.
 */
const MEASURED_STATIC_MAGNITUDE: ReadonlySet<string> = new Set([
  // Owner-reported at two ranks, and measured at one: Stats window reads 94 regen / 168 WIS with
  // Bear IV up against 93 / 163 with it down, and he reports the same pair at rank V. See above.
  'form of the bear'
])

/** Has this spell been MEASURED not to gain magnitude, overriding its category's rate? */
function magnitudeIsMeasuredStatic(base: SpellTierBase): boolean {
  const name = base.name
  return name !== undefined && MEASURED_STATIC_MAGNITUDE.has(name.trim().toLowerCase())
}

/**
 * COULD THE TOP OF THE LADDER MOVE THIS NUMBER AT ALL?
 *
 * Every magnitude here is `floor(base * (1 + rate * tier))`, so a small enough base is unmovable:
 * a 1 stays a 1 at rank X under the `hot` rate, and so does a 2 (`floor(2.6)`). Answering "the
 * numbers get bigger" for those is a promise the model's own arithmetic does not keep, and the
 * Upgrades tab would rank a spell for motes that buy nothing.
 *
 * Asked at `SPELL_MAX_RANK` rather than at the next rung on purpose: the question a payoff mark
 * answers is "is this worth upgrading AT ALL", and a base that moves only at rank VII is still a
 * spell whose numbers get bigger. See the Form of the Bear block above for the case that named it.
 */
function magnitudeCanMove(value: number | undefined, rate: number | null): boolean {
  if (rate === null || value === undefined || value <= 0) return false
  return magnitudeAt(value, rate, SPELL_MAX_RANK) > value
}

/** `magnitudeCanMove` for a DURATION, asked through the rounding the tick ladder actually uses. */
function durationCanMove(ticks: number | undefined, rate: number | null): boolean {
  if (rate === null || ticks === undefined || ticks <= 0) return false
  return Math.round(scaled(ticks, rate * 100, SPELL_MAX_RANK, true)) > ticks
}

/**
 * WHAT UPGRADING THIS SPELL ACTUALLY MOVES.
 *
 * The owner's ask, verbatim: *"some spells upgraded don't give a benefit beyond reduced mana cost
 * and cast time like Bear Form. It doesn't increase the regen rate or amount, nor does it increase
 * the amount of wisdom when upgraded."*
 *
 * Every flag below is a claim about the CATEGORY, joined against what this particular spell states.
 * A spell that costs no mana gains nothing from the mana rate however good that rate is, so `mana`
 * is false for it - the payoff is what YOU would get, not what the table offers in the abstract.
 */
export interface UpgradePayoff {
  category: UpgradeCategory
  /** The damage or healing numbers get bigger. */
  magnitude: boolean
  /** The spell lasts longer. */
  duration: boolean
  /** It costs less mana. */
  mana: boolean
  /** It casts faster. */
  cast: boolean
  /** It is harder to resist. */
  resist: boolean
  /** Nothing above is true - upgrading this spell buys you nothing you can point at. */
  nothing: boolean
  /** The weakest confidence behind the flags that ARE true. Undefined when nothing is. */
  confidence?: UpgradeConfidence
}

/**
 * Read the payoff off a base. Pure over `SpellTierBase`, so a caller that can describe a spell to
 * `spellTierLadder` can describe it to this without a second join.
 */
export function upgradePayoff(base: SpellTierBase): UpgradePayoff {
  const rates = UPGRADE_RATES[base.category]
  // BOTH HALVES MATTER, and this is the whole subtlety of the function: a category with a mana rate
  // buys nothing for a spell that costs no mana, and a spell stating 300 damage gains nothing if its
  // category's magnitudes do not scale. The payoff is what YOU get, not what the table offers.
  const staticMagnitude = magnitudeIsMeasuredStatic(base)
  const flags = {
    magnitude:
      !staticMagnitude &&
      (magnitudeCanMove(stated(base.damage), rates.damage) ||
        magnitudeCanMove(stated(base.heal), rates.heal)),
    // DURATION IS ASKED THROUGH ITS OWN SCALER, not the magnitude one: the ladder ROUNDS ticks and
    // FLOORS magnitudes, and a flag computed with the wrong one of those would tell a reader his
    // duration moves on a spell whose printed tick count never changes.
    duration: durationCanMove(stated(base.durationTicks), rates.duration),
    mana: stated(base.mana) !== undefined,
    cast: stated(base.castSeconds) !== undefined,
    resist: base.resistAdjust !== undefined && categoryIsOffensive(base.category)
  }
  // One mark per LIVE flag. `nothing` then falls out of the count rather than being restated as a
  // five-way conjunction that has to be kept in step with the flags above.
  const marks: UpgradeConfidence[] = []
  if (flags.magnitude) marks.push(rates.confidence.magnitude)
  if (flags.duration) marks.push(rates.confidence.duration)
  if (flags.mana) marks.push(rates.confidence.mana)
  if (flags.cast) marks.push(rates.confidence.cast)
  if (flags.resist) marks.push(UNIVERSAL_RATES.confidence.resist)
  return {
    category: base.category,
    ...flags,
    nothing: marks.length === 0,
    confidence: weakestConfidence(marks)
  }
}

/**
 * THE ONE SENTENCE A CARD PRINTS. Built from the flags, in a fixed order, so two surfaces asking
 * the same spell can never phrase it differently.
 *
 * NO EM DASHES (AGENTS.md, UI conventions): this string is user-facing copy.
 */
export function upgradePayoffSentence(p: UpgradePayoff): string {
  if (p.nothing) return 'upgrading this buys nothing this app can measure'
  const gains: string[] = []
  if (p.magnitude) gains.push('bigger numbers')
  if (p.duration) gains.push('longer duration')
  if (p.mana) gains.push('less mana')
  if (p.cast) gains.push('faster casting')
  if (p.resist) gains.push('harder to resist')
  const list =
    gains.length === 1
      ? gains[0]
      : `${gains.slice(0, -1).join(', ')} and ${gains[gains.length - 1]}`
  // The part the owner actually asked for: say what it does NOT buy, where that is the surprise.
  if (!p.magnitude) return `upgrading buys ${list} - the numbers it grants do not change`
  return `upgrading buys ${list}`
}

/**
 * WHAT THE NEXT TIER IS WORTH PER MOTE - the ranking behind "spend your next motes here".
 *
 * `valueAt` is supplied by the caller because what a tier is WORTH is a question this file has no
 * business answering: the Loadout tab scores a buff through `planner/roleWeights.ts` and the
 * Upgrades tab scores a nuke on sustained dps, and neither opinion belongs in the rate table.
 *
 * Returns null at the cap and wherever the next tier changes nothing the caller can value - a
 * division that would read as an infinite return on 512 motes.
 */
export function nextTierReturn(
  ladder: readonly SpellTierReading[],
  from: number,
  valueAt: (reading: SpellTierReading) => number
): { tier: number; motes: number; gain: number; perMote: number } | null {
  const here = normalizeSpellRank(from)
  const next = here + 1
  if (next > SPELL_MAX_RANK) return null
  const a = ladder[here]
  const b = ladder[next]
  if (a === undefined || b === undefined) return null
  const gain = valueAt(b) - valueAt(a)
  const motes = motesToReach(next)
  if (!(gain > 0) || motes <= 0) return null
  return { tier: next, motes, gain, perMote: gain / motes }
}

export { SPELL_MAX_RANK, normalizeSpellRank }
