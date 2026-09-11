// spellbook.ts — THE CORPUS BROWSER'S ROWS (docs/plans/spell-upgrades-and-loadout.md §4.1).
//
// ============================================================================
// WHAT THIS ANSWERS THAT NOTHING ELSE DOES
// ============================================================================
// The owner's ask, verbatim (2026-09-10): *"allow spells to be looked at, because right now spells
// and exaltations don't really tell me WHAT it does, it just says the name of the spell which isn't
// helpful on how much stats or what it does."*
//
// Three surfaces already draw spells and none of them answers that:
//
//   THE BUFFS TAB draws what is on you right now, observed off the log. It knows a buff is up and
//   nothing whatever about what it grants.
//   THE LEVELING TAB'S BEST-SPELLS READOUT ranks what you OWN by efficiency at your level. It is
//   the right answer to "what should I cast" and it deliberately cannot browse: its corpus is your
//   loadout's slice, its figures are damage and healing, and its own header records that at the
//   app's 260px floor it has no room for a fifth column.
//   THE SPELL PAGE answers in full, for ONE spell you already knew to look up.
//
// This is the missing one: the whole catalog, filterable, with what a spell GRANTS and what a mote
// tier BUYS beside every row. It does not rank and it does not recommend - those are the Upgrades
// and Loadout tabs. It is a corpus, and its job is to make a spell findable and legible.
//
// ============================================================================
// WHY IT LIVES IN shared/ AND NOT IN THE VIEW
// ============================================================================
// Ruling 4 (eslint.domainMunging.mjs): the renderer never filters or sorts domain collections. The
// sanctioned shape is a PURE FOLD in `src/shared` that the view calls once - which is exactly what
// `bestSpellsSearch.ts` is and why this file is its neighbour rather than a hook. Nothing below
// touches React, and `tests/spellbook.test.mts` drives it over the committed corpus with no app.
//
// ============================================================================
// THE CORPUS IS THE UNLOCK FOLD'S, DELIBERATELY
// ============================================================================
// `LevelUnlockData.spells` is every spell the DB places for at least one class at a stated level -
// ~1,900 rows - already carrying the era verdict, the class levels, the metrics, and (since this
// ticket) the parsed grants and the upgrade category. Re-deriving any of that here would be a
// second opinion about a join main already made, and `bestSpells.ts` made the same choice for the
// same reason. The cost is stated rather than hidden: a spell NO class gains at a stated level is
// not in this corpus and cannot be browsed here. That is 430 rows of NPC-only and unlearnable
// spells (shared/spellLevels.ts measured them), and a browser for spells nobody can cast is not
// what was asked for.

import type { ClassAbbr } from './classCombo'
import type { UnlockSpell } from './levelUnlocks'
import { SPELL_MAX_RANK, normalizeSpellRank } from './spellScale'
import type { SpellStatGrant } from './spellStats'
import {
  UPGRADE_RATES,
  spellTierLadder,
  upgradePayoff,
  type SpellTierBase,
  type SpellTierReading,
  type UpgradeCategory,
  type UpgradePayoff
} from './spellUpgrade'

// =================================================================================================
// THE ROW
// =================================================================================================

/** One spell, as the Spellbook draws it. Every figure already read at the requested tier. */
export interface SpellbookRow {
  name: string
  /** Every class that gains it, with the level, in the order main sorted them. */
  at: readonly { cls: ClassAbbr; level: number }[]
  /** The lowest level any class gains it at - what the row sorts and filters by. */
  level: number
  category: UpgradeCategory
  /** The wiki's own `spell_type`, verbatim, for the reader who wants the page's own word. */
  spellType?: string
  /** What it grants, at the level main read it - see `UnlockSpell.grants`. */
  grants: readonly SpellStatGrant[]
  /** The level those grants were read at, when there are any. */
  grantsLevel?: number
  /** What a tier buys for THIS spell - the Bear Form verdict, per row. */
  payoff: UpgradePayoff
  /** Mana and cast AT THE REQUESTED TIER. Absent where the page states none. */
  mana?: number
  castSeconds?: number
  /** Damage and healing at the requested tier, from `metrics` where main computed one. */
  damage?: number
  heal?: number
  /** The wiki's era verdict, `true` or absent - never false (law 1, the sidecar's own rule). */
  outOfEra?: boolean
  /** The tier every figure above was read at, so a row can never be read at the wrong one. */
  tier: number
}

/** Which column the list is ordered by. */
export type SpellbookSort = 'name' | 'level' | 'mana' | 'damage' | 'heal'

/** What the view asks for. Every field is AND-ed; an absent one filters nothing. */
export interface SpellbookQuery {
  /** Free text over the name. Folded and trimmed by the caller's own search vocabulary. */
  text?: string
  /** Only spells at least one of these classes gains. Empty means every class. */
  classes?: readonly ClassAbbr[]
  /** Only these categories. Empty means every category. */
  categories?: readonly UpgradeCategory[]
  /** Only spells gained at or below this level. */
  maxLevel?: number
  /** Drop the rows the era sidecar placed out of era. */
  inEraOnly?: boolean
  /**
   * ONLY SPELLS A TIER ACTUALLY IMPROVES THE NUMBERS OF.
   *
   * The owner's question 2, as a filter: hide everything whose magnitudes do not move, so what is
   * left is the list worth spending motes on. Its complement (`payoffMagnitudeOnly: false`) is the
   * Upgrades tab's "dead ends" panel, which is the same question asked the other way round.
   */
  payoffMagnitudeOnly?: boolean
  sort?: SpellbookSort
  /** Descending, when the column reads better that way. Name always reads ascending. */
  desc?: boolean
}

// =================================================================================================
// THE FOLD
// =================================================================================================

/**
 * `{ key: value }` when the value is a stated positive, `{}` otherwise.
 *
 * ABSENT-MEANS-NOTHING, spelled once. Every field of a `SpellTierBase` obeys it - a zero mana and an
 * omitted mana are both "there is no mana row here" - and eight hand-written `!== undefined && > 0`
 * guards is eight chances to write one of them as `>=`. Spread rather than assigned so the base
 * stays one expression, which is what keeps this under the tree's complexity ceiling.
 */
function positive<K extends string>(key: K, value: number | undefined): Partial<Record<K, number>> {
  return value !== undefined && value > 0 ? ({ [key]: value } as Record<K, number>) : {}
}

/**
 * The tier base for one catalog row.
 *
 * `recoverySeconds` and `reuseSeconds` are DELIBERATELY ABSENT even though `UnlockSpell` carries a
 * `recastMs`: the Spellbook draws neither column, and a `SpellTierBase` that stated them would make
 * `upgradePayoff` report "harder to resist"-shaped gains this surface never shows. The spell PAGE
 * builds a fuller base for its own table (wave 3), which is the right place for the full ladder.
 */
function tierBase(s: UnlockSpell): SpellTierBase {
  return {
    category: s.upgradeCategory ?? 'other',
    ...positive('mana', s.mana),
    ...positive('castSeconds', s.castTimeMs === undefined ? undefined : s.castTimeMs / 1000),
    // The metrics snapshot is main's, taken at the row's own gain level. Reading it rather than
    // re-deriving keeps this surface agreeing with the Leveling tab about the same spell.
    ...positive('damage', s.metrics?.damage),
    ...positive('heal', s.metrics?.heal),
    // Ticks, not ms: `spellTierLadder` works in the unit the game keeps a duration in.
    ...positive('durationTicks', s.durationMs === undefined ? undefined : Math.round(s.durationMs / 6000))
  }
}

/** The lowest level any class gains this spell at - the row's own level. */
function gainLevel(s: UnlockSpell): number {
  return s.at.length === 0 ? 0 : Math.min(...s.at.map((p) => p.level))
}

/**
 * ONE ROW, at a tier.
 *
 * Exported because the spell page and the Upgrades tab both want a single row without running the
 * whole corpus through a query, and a second copy of this mapping is how two surfaces come to state
 * different mana for one spell.
 */
export function spellbookRow(s: UnlockSpell, tier: number): SpellbookRow {
  const t = normalizeSpellRank(tier)
  const base = tierBase(s)
  const reading = spellTierLadder(base)[t]
  const row: SpellbookRow = {
    name: s.name,
    at: s.at,
    level: gainLevel(s),
    category: base.category,
    grants: s.grants ?? [],
    payoff: upgradePayoff(base),
    tier: t
  }
  if (s.spellType !== undefined) row.spellType = s.spellType
  if (s.grantsLevel !== undefined) row.grantsLevel = s.grantsLevel
  if (reading.mana !== undefined) row.mana = reading.mana
  if (reading.castSeconds !== undefined) row.castSeconds = reading.castSeconds
  if (reading.damage !== undefined) row.damage = reading.damage
  if (reading.heal !== undefined) row.heal = reading.heal
  // `true` or absent, never false - the era sidecar's own shape (law 1).
  if (s.outOfEra === true) row.outOfEra = true
  return row
}

/** Does this spell survive the query's filters? Split out to keep the fold under the ceiling. */
function admits(s: UnlockSpell, q: SpellbookQuery, text: string): boolean {
  // AN EMPTY LIST FILTERS NOTHING, which is the show-all state and not a filter that excludes
  // everything. Both pickers are multi-selects that start empty, so this reading is what makes an
  // untouched toolbar show the whole corpus.
  const anyOf = <T,>(picked: readonly T[] | undefined, has: (v: T) => boolean): boolean =>
    picked === undefined || picked.length === 0 || picked.some(has)
  if (text.length > 0 && !s.name.toLowerCase().includes(text)) return false
  if (!anyOf(q.classes, (c) => s.at.some((p) => p.cls === c))) return false
  if (!anyOf(q.categories, (c) => (s.upgradeCategory ?? 'other') === c)) return false
  if (q.maxLevel !== undefined && gainLevel(s) > q.maxLevel) return false
  // `outOfEra` is `true` or absent. Silence is NOT a verdict (law 1): a spell the sidecar never
  // answered for is shown plainly, exactly as the unlock list does.
  return !(q.inEraOnly === true && s.outOfEra === true)
}

/** The value a sort reads, or null - and a null always sorts LAST, in both directions. */
function sortValue(row: SpellbookRow, by: SpellbookSort): number | string | null {
  if (by === 'name') return row.name.toLowerCase()
  if (by === 'level') return row.level
  if (by === 'mana') return row.mana ?? null
  if (by === 'damage') return row.damage ?? null
  return row.heal ?? null
}

/**
 * THE WHOLE LIST, filtered, read at a tier, and ordered.
 *
 * ONE PASS OVER ~1,900 ROWS. The gear tab measured its own 6,766-row scale at ~18 ms, which is what
 * let it ship a LIVE slider; this corpus is a third of that and does strictly less per row, so the
 * same affordance is affordable here. The view still reads the tier through `useDeferredValue`, so
 * the slider thumb never waits on the list - the standing law for every control in this app that
 * moves a whole table.
 *
 * AN ABSENT FIGURE IS NEVER A ZERO (`bestSpells.ts`'s law). A spell with no healing line has no
 * `heal`, which is not the claim `heal: 0`; it sorts LAST on that column in both directions rather
 * than being read as the worst answer.
 */
export function spellbookRows(
  spells: readonly UnlockSpell[],
  q: SpellbookQuery,
  tier: number
): SpellbookRow[] {
  const text = (q.text ?? '').trim().toLowerCase()
  const out: SpellbookRow[] = []
  for (const s of spells) {
    if (!admits(s, q, text)) continue
    const row = spellbookRow(s, tier)
    if (q.payoffMagnitudeOnly !== undefined && row.payoff.magnitude !== q.payoffMagnitudeOnly) {
      continue
    }
    out.push(row)
  }
  const by = q.sort ?? 'level'
  const dir = q.desc === true ? -1 : 1
  out.sort((a, b) => {
    const av = sortValue(a, by)
    const bv = sortValue(b, by)
    if (av === null && bv === null) return a.name.localeCompare(b.name)
    if (av === null) return 1
    if (bv === null) return -1
    if (av === bv) return a.name.localeCompare(b.name)
    return (av < bv ? -1 : 1) * dir
  })
  return out
}

// =================================================================================================
// DISPLAY HELPERS - one place, so the table and the page cannot word a verdict differently
// =================================================================================================

/**
 * The compact payoff glyphs: which of the five things a tier moves for this spell.
 *
 * The owner's question 2 answered ACROSS A WHOLE LIST rather than one spell at a time, which is the
 * thing a page cannot do. Order is fixed so a column of them reads down.
 */
export const PAYOFF_MARKS: readonly { key: keyof UpgradePayoff; glyph: string; title: string }[] = [
  { key: 'magnitude', glyph: 'N', title: 'the numbers get bigger' },
  { key: 'duration', glyph: 'T', title: 'it lasts longer' },
  { key: 'mana', glyph: 'M', title: 'it costs less mana' },
  { key: 'cast', glyph: 'C', title: 'it casts faster' },
  { key: 'resist', glyph: 'R', title: 'it is harder to resist' }
]

/** Is there anything at all worth saying about upgrading this row? */
export function anyPayoff(p: UpgradePayoff): boolean {
  return !p.nothing
}

/**
 * The rate this category's magnitudes move at, as a whole percent, or null where they do not move.
 *
 * Read by the tier slider's caption so it can say what the reader is looking at rather than making
 * them remember which categories scale.
 */
export function magnitudeRatePercent(c: UpgradeCategory): number | null {
  const r = UPGRADE_RATES[c]
  const rate = r.damage ?? r.heal
  return rate === null || rate === undefined ? null : Math.round(rate * 100)
}

/** The ladder for one row, for the surfaces that draw a whole table rather than one tier. */
export function spellbookLadder(s: UnlockSpell): SpellTierReading[] {
  return spellTierLadder(tierBase(s))
}

export { SPELL_MAX_RANK }
