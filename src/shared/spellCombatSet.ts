// spellCombatSet.ts - THE COMBAT AND HEAL SETS: eight gems spent on the Leveling tab's ranking.
//
// Split out of `spellLoadout.ts` on 2026-11-15 at that file's line ceiling, along the seam its own
// header names: the buff set is a conflict problem, and this is a ranking spent on a budget.

import type { ClassAbbr } from './classCombo'
import type { BestSpellTab } from './bestSpells'
import type { SpellMetrics } from './spellMetrics'

// =================================================================================================
// THE COMBAT SET - the fork user's goal 5, which the buff half above never answered
// =================================================================================================
//
// The ask, verbatim: *"recommend a DMG/combat set"*, beside the buff set this file already built.
// The owner's report that it was missing is blunt (2026-09-10): *"loadout tab is ugly, and it's
// missing the damage set it only shows buff?"*
//
// ── IT IS A DIFFERENT QUESTION AND IT GETS A DIFFERENT ENGINE ─────────────────────────────────
//
// The buff set is a CONFLICT problem: buffs occupy slots on your character, they contest each
// other, and the interesting work is deciding which of two that cannot both stand is worth more.
// Damage spells contest nothing - you cast a nuke and it is gone - so none of the machinery above
// applies to them and forcing it to would be a lie dressed as rigour.
//
// What a damage set is instead is a RANKING problem, and this app already has the ranker: the
// Leveling tab's `bestSpellsAt`, which folds the same corpus into dd / dot / aoe tables ordered by
// the figure that matters for each. So this function does not rank anything. It takes that answer
// and spends eight gems on it, which is the only part `bestSpellsAt` cannot do, because gems are a
// budget and a ranking is not.
//
// ── WHY IT BUYS BREADTH BEFORE DEPTH, STATED SO IT CAN BE ARGUED WITH ─────────────────────────
//
// The third-best nuke is a worse answer than the best DoT, because the three tables solve different
// fights: a nuke is burst on a single target, a DoT is throughput on something that lives, and an
// AE is a pack. A set of eight nukes can only fight one of those. So the budget is spent in rounds
// - the best of each table, then the second of each, and so on - which fills the first three gems
// with one of each and only then doubles up.
//
// It is a POLICY and not a measurement, and the surface that draws it says so rather than
// presenting eight spells as a computed optimum.
//
// ── ONE GEM PER LINE (owner report, kaltinril 2026-09-12) ─────────────────────────────────────
//
// *"you also seem to be recommending multiple levels of spells in the same damage line for some
// reason"*. The reason was that a ranking by figure puts Chaos Flux first and the rung under it
// second, and eight gems spent down that ranking bought three rungs of one ladder. A ladder means
// the rung above supersedes the one below, so the lower rung is skipped whenever the table also
// shows the rung that replaces it for a class in the trio - the Spellbook's own "newest rank only"
// reading (`spellbook.supersededNames`), applied to what is spent rather than what is drawn. Only
// a row the table SHOWS may hide another: the tables are already at the level asked and in era,
// so a successor you cannot cast yet takes nothing from you.

/** One spell in the combat set, with the table it was the best of. */
export interface CombatPick {
  name: string
  /**
   * THE RANK THE FIGURES WERE READ AT - `max(observed, simulated)`, the same number the buff rows
   * wear (owner, 2026-09-10: *"you forgot to display the level on the other spell tabs"*). The
   * damage already moved with it; only the row was silent about why.
   */
  rank: number
  /** `dd`, `dot` or `aoe` - which question this spell is the answer to. */
  tab: BestSpellTab
  /** Where it placed in its own table. 1 is that table's best. */
  place: number
  /** The client's gem icon, when this machine's install answered. */
  iconId?: number
  /** The figure its own table ranks on, already worded by the caller's formatter. */
  metrics: SpellMetrics
  mana: number | null
  /** The lowest level a class in the trio gains it at. */
  gainedAt: number
  classes: readonly ClassAbbr[]
}

/** The combat half of a loadout: what to keep memmed, and what it could not fit. */
export interface CombatSet {
  picks: CombatPick[]
  /** Which tables had anything at all. An empty one is an honest answer about a class trio. */
  tabsUsed: BestSpellTab[]
  /** How many gems the set was given to spend. */
  gems: number
}

/**
 * THE TABLES EACH SET SPENDS ITS GEMS ON, in the order a round visits them.
 *
 * Two sets, because they are two jobs and a player carries gems for both (owner, 2026-09-10: *"the
 * loadout tab should have tabs for buff combat heals"*). The breadth-before-depth argument above is
 * per set: the best nuke, DoT and AE before any second damage pick, and the best direct heal before
 * a second heal-over-time.
 */
export const COMBAT_TABLES: Readonly<Record<'combat' | 'heals', readonly BestSpellTab[]>> = {
  combat: ['dd', 'dot', 'aoe'],
  heals: ['heal', 'hot']
}

/**
 * SPEND `gems` ON THE DAMAGE TABLES, breadth first. See the block above for the policy.
 *
 * Takes the already-ranked tables rather than the corpus, so this file never re-ranks a spell the
 * Leveling tab has already ordered - two surfaces disagreeing about which nuke is better is exactly
 * the failure `spellbookRow`'s header warns about.
 *
 * A SPELL APPEARS ONCE. A spell that is in two tables (a rain is a DD and an AOE) is taken for the
 * first one that reaches it and skipped by the other, so eight gems buy eight spells.
 */
export function combatSet(
  tables: Readonly<Record<BestSpellTab, { shown: readonly CombatSource[] }>>,
  gems: number,
  which: readonly BestSpellTab[] = COMBAT_TABLES.combat
): CombatSet {
  const picks: CombatPick[] = []
  const taken = new Set<string>()
  const tabsUsed = which.filter((t) => tables[t].shown.length > 0)
  const superseded = supersededByShown(tabsUsed.flatMap((t) => tables[t].shown))
  const deepest = Math.max(0, ...tabsUsed.map((t) => tables[t].shown.length))
  for (let place = 0; place < deepest && picks.length < gems; place++) {
    for (const tab of tabsUsed) {
      if (picks.length >= gems) break
      const row = tables[tab].shown[place]
      if (row === undefined || taken.has(row.name) || outgrown(row, superseded)) continue
      taken.add(row.name)
      picks.push({
        name: row.name,
        tab,
        rank: row.rank,
        place: place + 1,
        ...(row.iconId === undefined ? {} : { iconId: row.iconId }),
        metrics: row.metrics,
        mana: row.mana,
        gainedAt: row.gainedAt,
        classes: row.classes
      })
    }
  }
  return { picks, tabsUsed, gems }
}

/**
 * `name|cls` for every rung a SHOWN row replaces, for a class that owns that row. See ONE GEM PER
 * LINE above. A row's `classes` are the trio's classes that gain it at the level asked, so the
 * class test is the same one the Spellbook's chip applies - and it is kept PER CLASS, because a
 * shaman's ladder replacing a name says nothing about the enchanter's rung of that name.
 */
function supersededByShown(shown: readonly CombatSource[]): Set<string> {
  const out = new Set<string>()
  for (const row of shown) {
    for (const r of row.replaces ?? []) if (row.classes.includes(r.cls)) out.add(`${r.name}|${r.cls}`)
  }
  return out
}

/** Outgrown for EVERY class that owns the row: no class in the trio still has it as a top rung. */
function outgrown(row: CombatSource, superseded: ReadonlySet<string>): boolean {
  return row.classes.every((cls) => superseded.has(`${row.name}|${cls}`))
}

/** The fields `combatSet` reads off a ranked row. Structural, so `bestSpells.ts` need not be imported. */
export interface CombatSource {
  name: string
  /** `BestSpellRow.rank` - what `bestSpellsAt` evaluated the metrics at. */
  rank: number
  metrics: SpellMetrics
  mana: number | null
  gainedAt: number
  classes: ClassAbbr[]
  iconId?: number
  /** `BestSpellRow.replaces` - the ladder's answer, for the one-gem-per-line rule. */
  replaces?: { name: string; cls: ClassAbbr }[]
}
