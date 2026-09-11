// spellScale.ts — what a spell's DAMAGE reads at a mote upgrade level (JOS-447).
//
// ============================================================================
// SOURCE: MEASURED, BECAUSE NOTHING PUBLISHES IT
// ============================================================================
// The gear engine could be ported (`itemUpgrade.ts` is the wiki's own ItemLevelSlider module, read
// line by line). No such source exists for spells: the wiki has no per-rank spell stats and no
// spell slider, and the client's `spells_us.txt` carries the CLASSIC rank lines (`Yaulp II`) rather
// than the Legends mote ranks, which are server side. So every number below was FITTED to the
// owner's own combat log (2.4M lines, eqlog_Primitive_freeport.txt), and the fit is recorded as
// fixtures in `tests/spellScale.test.mts` so it can be re-argued rather than trusted.
//
// ============================================================================
// THE MEASUREMENT, AND WHY IT IS DONE ON RATIOS
// ============================================================================
// The log states the rank a cast used (`You begin casting Garrison's Mighty Mana Shock VIII.`; an
// unsuffixed cast line is the BASE) and it names the spell on every hit (`You hit X for 600 points
// of magic damage by Garrison's Mighty Mana Shock.`), marking criticals. Maximum non-critical hit
// per (spell, rank, level) is therefore the unresisted damage, sampled.
//
// IT IS NOT THE SPELL'S BASE FIGURE, THOUGH, and that is the whole difficulty: the owner's worn
// gear multiplies it. Measured on BASE-RANK casts against the client's own magnitude formula, the
// factor is 1.0 in some windows and ~1.2216 in others (Shock of Lightning, Lightning Bolt, Spirit
// Tap and base-rank Garrison's all read 1.219..1.222 of their computed base in the August windows;
// Chaos Flux and Anarchy read 1.017 in July).
//
// MOST OF THAT FACTOR IS NOW EXPLAINED, AND IT IS A WORN FOCUS (JOS-452). The owner looted a
// Polished Mithril Mask - Improved Damage II, `Increase Spell Damage by 1% to 20%` - on Jul 31,
// between the July windows and the August ones, and the step is exactly it:
// `1.2216 = 1.20 x 1.017`. The 1.017 residual is present in the July windows where no damage focus
// was worn, so it is NOT focus and this app still models it nowhere. `shared/wornFocus.ts` carries
// the focus half and the histogram proving the bonus rolls per cast rather than applying flat; the
// numbers in THIS file are unchanged, because the fit is on ratios where the whole factor cancels.
//
// So the rank rule is read off RATIOS BETWEEN TWO RANKS OF ONE SPELL, where the worn factor
// cancels. The owner cast Garrison's at base on 2026-08-06 (levels 19..24) and at VIII on
// 2026-08-21 (the same levels, on a re-levelled loadout), with the same worn factor in both
// windows, which gives six independent same-level pairs:
//
//     level 19  337 -> 498      level 22  351 -> 519
//     level 20  342 -> 506      level 23  356 -> 526
//     level 21  346 -> 512      level 24  361 -> 534
//
// Every one of the six is `floor(base x 1.48)` EXACTLY, and none of them is the ceiling. 1.48 is
// `1 + 8 x 0.06`. A second spell agrees at a different rank: Discordant Mind reads 472 at base and
// 528 at II in windows whose worn factor is the same 1.2196, and 528/472 = 1.1186, which is
// `1 + 2 x 0.06` to within a point of rounding.
//
//     SIX PERCENT OF THE BASE AMOUNT PER RANK, AND THE SUM IS FLOORED.
//
// ============================================================================
// THIS IS NOT THE ITEM ENGINE'S DAMAGE RULE, AND THE DIFFERENCE IS MEASURED
// ============================================================================
// The ticket's hypothesis was that spells mirror `itemUpgrade.scaleDamage` — ten percent a rank,
// `base + floor(base * N / 10)` — which at rank VIII would make the owner's Garrison's 599 or 600
// against its base of 333. The log says otherwise, and says it twice:
//
//   * the six same-level pairs above put the rank-VIII multiplier at 1.4787 (interval
//     [1.47977, 1.48034) if the rounding is a floor), not 1.8. Ten percent a rank is outside that
//     interval by twenty standard widths.
//   * the 600 the owner reads in his log IS `floor(492 x 1.2216)` — the fitted 492 wearing the same
//     worn factor his base-rank casts wear. Take the factor out and the base figure is 492.
//
// A reader who compares this app's `dmg 492` against a 600 in his own log is seeing the caveat
// spellMetrics.ts has always stated, not a defect: these are the spell's own numbers with no gear
// in them. Ten percent would have printed 599 and agreed with the log by accident, on a spell whose
// worn factor happens to be 1.22.
//
// ============================================================================
// HEALING IS THREE PERCENT A RANK — HALF THE DAMAGE RATE, SAME METHOD
// ============================================================================
// The same ratio method over the owner's `You healed X for N hit points by <Spell>.` lines puts
// Slugs Healing at 204 / 222 / 228 / 235 / 241 for base / III / IV / V / VI and Superior Healing at
// 892 / 943 / 968 for II / IV / V — three percent of base per rank, floored, on every pair. It
// shipped one merge after the damage rule (owner ruling 2026-08-23: "we are fine with healing
// estimates for now"); the evidence fixtures are in tests/spellScale.test.mts beside the damage
// ones.
//
// ============================================================================
// WHAT IS NOT SCALED, AND THE DIRECTION OF THE ERROR
// ============================================================================
// MANA AND CAST TIME STAY AT BASE. The owner states that a levelled spell "casts faster, has
// better mana costs, and does more damage", but the log carries no mana or cast-time readings at
// all, so neither axis has evidence to fit (the spellbook readings remain the standing ask).
// Consequence, stated once so no surface has to caveat it: for a spell above base rank, sustained
// dps and hps UNDERSTATE slightly (the real cast is faster), and the per-mana ratios UNDERSTATE
// (the real mana is lower).

/** The highest mote upgrade level a spell line is known to reach. Ten, like the item engine's tiers. */
export const SPELL_MAX_RANK = 10

/**
 * Percent of the base amount ONE rank adds to a DIRECT damage line. Measured, not ported — see the
 * header. It is a whole number so the arithmetic below stays in integers until one division.
 */
export const SPELL_DAMAGE_RANK_PERCENT = 6

/**
 * …and the rate for a PER-TICK damage line, which is HALF of it (2026-09-10).
 *
 * ── WHY THIS NUMBER IS NOT SIX ────────────────────────────────────────────────────────────────
 *
 * The fit above was made on NUKES — Garrison's Mighty Mana Shock and Discordant Mind — and no DoT
 * ladder was in its sample. So six percent for a DoT was never a measurement: it was the one rate
 * the fit had, applied everywhere, because nothing had asked the question.
 *
 * The spell-upgrade ticket asked it, and the owner's own log answers it. A DoT's tick line states
 * the rank ON ITSELF — `<mob> has taken 468 damage from your Odium VII.` — where a nuke hit does
 * not, so rank, level and damage arrive together and the worn factor cancels in a same-level ratio.
 * Three ladders, each read inside one level and one day (docs/plans/spell-upgrades-and-loadout.md
 * §0.9; `tests/spellUpgrade.test.mts` keeps the fixtures):
 *
 *     Odium           387 -> 445 at V     floor(387 x 1.15) = 445    EXACT
 *     Odium           387 -> 468 at VII   floor(387 x 1.21) = 468    EXACT
 *     Envenomed Bolt  422 -> 473 at IV    3.02% a rank
 *     Plague          180 -> 199 at IV    2.64% a rank
 *
 * At six percent those four would read 503, 549, 523 and 223 — wrong by 10-15% on every one, far
 * outside the noise on ceilings this tight (Odium at VII reads 468 on four of its top four ticks).
 *
 * THE CONFOUNDS WERE CHECKED AND NONE OF THEM REACHES THIS NUMBER (owner's caution, 2026-09-10).
 * Death, dispels, an accidental click-off and a manual recast all decide WHETHER a tick happens and
 * never what number is on one that does; the 1,928 stance changes and the two cast-time AAs in that
 * log move cast time, not tick magnitude; and the two DoT crit AAs bought mid-window are ruled out
 * by shape, since a crit is a large multiplier and the histograms carry no 2x values at all.
 */
export const SPELL_DOT_DAMAGE_RANK_PERCENT = 3

/** Percent ONE rank adds to a healing line: half the direct-damage rate, measured the same way. */
export const SPELL_HEAL_RANK_PERCENT = 3

/**
 * A rank as this file will read it: an integer 0..10, where 0 is "no upgrade".
 *
 * ONE AND ZERO ARE THE SAME ANSWER HERE, and that is a limitation of the evidence rather than a
 * choice. The observed-rank fold (`shared/spellRanks.ts`) records rank 1 both for a name the log
 * spelled with a trailing `I` and for one it spelled with no numeral at all, because
 * `parseSpellRank` cannot tell them apart; the display rule already refuses to draw a chip at rank
 * 1 for the same reason. Reading 1 as "no upgrade" therefore matches what the surfaces say, and it
 * errs downward — a genuinely `+1` spell reads six percent low rather than a base spell reading six
 * percent high, which is the safe direction for a buying decision.
 */
export function normalizeSpellRank(rank: number | null | undefined): number {
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return 0
  const n = Math.trunc(rank)
  if (n <= 1) return 0
  return Math.min(SPELL_MAX_RANK, n)
}

/**
 * ONE DAMAGE MAGNITUDE AT A RANK: `amount + floor(amount * pct * N / 100)`.
 *
 * Spelled as `amount + floor(...)` rather than `floor(amount * (1 + 0.06N))` to mirror
 * `itemUpgrade.scaleDamage`, and multiplied before it is divided so the percentage never becomes a
 * repeating binary fraction (`333 * 6 * 8 / 100` is exact where `333 * 0.48` is not).
 *
 * A non-positive amount is returned untouched: the wiki's ramps can read zero at a level below a
 * spell's band, and an upgrade does not turn nothing into something.
 *
 * `perTick` PICKS THE RATE, and it is the honest discriminator rather than a convenient one: a
 * per-tick damage line IS a damage-over-time tick, and a line that is not per-tick is a direct hit —
 * including the direct hit of a DD+DoT hybrid, which the community model likewise puts at the full
 * six percent while its ticks scale at three. `HpLine.perTick` is already on every line both the
 * wiki path and the client path fold through (`spellMetrics.ts foldLine`), so no caller has to
 * classify anything to get this right.
 *
 * DEFAULTS TO THE DIRECT RATE, so a caller that states nothing gets byte-for-byte what this function
 * returned before 2026-09-10.
 */
export function scaleSpellDamage(
  amount: number,
  rank: number | null | undefined,
  perTick = false
): number {
  const n = normalizeSpellRank(rank)
  if (n === 0 || amount <= 0) return amount
  const pct = perTick ? SPELL_DOT_DAMAGE_RANK_PERCENT : SPELL_DAMAGE_RANK_PERCENT
  return amount + Math.floor((amount * pct * n) / 100)
}

/** ONE HEALING MAGNITUDE AT A RANK: the damage rule at half the rate (see the header's evidence). */
export function scaleSpellHeal(amount: number, rank: number | null | undefined): number {
  const n = normalizeSpellRank(rank)
  if (n === 0 || amount <= 0) return amount
  return amount + Math.floor((amount * SPELL_HEAL_RANK_PERCENT * n) / 100)
}

/**
 * The rank a row is EVALUATED at: the higher of what has been observed and what is being simulated.
 *
 * The panel's slider lifts every row to a rank, but a row already ABOVE it must not be pulled down —
 * the owner's ask was to read his real Garrison's VIII against every other spell as if levelled, not
 * to hide the rank he actually owns. `Math.max` over two normalized ranks is that rule, and it lives
 * here rather than in the panel so the model and the card cannot disagree about it.
 */
export function effectiveSpellRank(
  observed: number | null | undefined,
  simulated: number | null | undefined
): number {
  return Math.max(normalizeSpellRank(observed), normalizeSpellRank(simulated))
}
