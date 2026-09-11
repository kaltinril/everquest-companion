// spellLoadout.ts — THE BEST SET OF BUFFS A CLASS TRIO CAN KEEP UP
// (docs/plans/spell-upgrades-and-loadout.md §3.5).
//
// ============================================================================
// THE FORK USER'S QUESTION 1, VERBATIM
// ============================================================================
// *"allow the person to know the best set of buff spells they can use given their combined classes
// to maximize stats/resists/hp/atk/etc"*.
//
// That is a MAXIMUM-WEIGHT SELECTION UNDER CONFLICTS: every buff is worth something, some pairs of
// them cannot both stand, and the answer is the best subset that can. Which is why the stacking
// engine had to be real before this file could exist - a guessed conflict here does not produce a
// slightly wrong recommendation, it produces one that tells a player to drop a buff the game was
// perfectly happy to let him keep.
//
// ============================================================================
// WHY THE SELECTION IS EXACT, AND WHERE IT ADMITS IT IS NOT
// ============================================================================
// Maximum-weight independent set is NP-hard in general. It is not hard HERE, and the reason is the
// shape of the conflict graph: buffs contest each other through SPA slots, so the graph decomposes
// into small components, and most components are CLIQUES - the haste family, the movement family,
// the STR family. In a clique the best subset is "the single best member", exact and linear.
//
// A component that is NOT a clique needs a search, and this file:
//
//   * searches it exhaustively while it is small (`EXHAUSTIVE_CAP` members), which is exact; and
//   * past that cap takes a GREEDY answer and SAYS SO (`provenOptimal: false`), rather than
//     printing a maybe-best set as a best set.
//
// `tests/spellStack.test.mts` pins both shapes of component; the cap is a stated number rather than
// a hope, and a set that hit it is labelled on the way out.
//
// ============================================================================
// WHAT A BUFF IS WORTH: SUPPLIED, NOT DECIDED HERE
// ============================================================================
// The scoring function is the CALLER'S, which is the same arrangement `nextTierReturn` uses and it
// is deliberate on this branch.
//
// The gear area is growing a two-layer weights table - what a stat is worth to somebody playing this
// way, gated by what a class can actually use - on the `gear-progression-plan` branch
// (`shared/planner/roleWeights.ts`). That table is the RIGHT source for this, and the plan doc says
// so: one opinion in this app about what a stat is worth, read by gear and spells alike. It is not
// on this branch yet. Inventing a second permanent weights vocabulary here would guarantee two
// tables that disagree the first time somebody tunes one, so this file takes a function instead and
// ships `DEFAULT_STAT_WEIGHTS` as an explicitly PROVISIONAL default. The day roleWeights merges, the
// Loadout tab passes it and nothing in the optimizer changes.

import type { UnlockSpell } from './levelUnlocks'
import type { ClassAbbr } from './classCombo'
import type { BestSpellTab } from './bestSpells'
import type { SpellMetrics } from './spellMetrics'
import { grantsShareASlot, type SpellStatGrant, type SpellStatKey } from './spellStats'
import {
  conflictComponents,
  spellsConflict,
  type StackLevels,
  type StackSpellView
} from './spellStack'

/** Past this many members in one non-clique component, the search stops being exhaustive. */
export const EXHAUSTIVE_CAP = 16

// =================================================================================================
// SCORING
// =================================================================================================

/** What one point of a stat is worth. A caller may pass any table; see the header. */
export type StatWeights = Partial<Record<SpellStatKey, number>>

/**
 * A PROVISIONAL default, and the word is load-bearing.
 *
 * These are round numbers chosen to be defensible rather than measured, and they exist so the tab
 * works before `shared/planner/roleWeights.ts` reaches this branch. They are deliberately COARSE -
 * no class gate, no role, no attempt at the two-layer model the gear area is building - because a
 * table that looked sophisticated would invite somebody to tune it here instead of there.
 *
 * A stat absent from this table scores ZERO, which is the honest reading of "nobody has said what
 * this is worth" for a scoring table, and is not the same as `spellStats.ts`'s absent-means-unknown
 * rule about MAGNITUDES.
 */
export const DEFAULT_STAT_WEIGHTS: StatWeights = {
  HP: 1,
  AC: 2,
  ATTACK: 1,
  STR: 1,
  STA: 1,
  AGI: 0.5,
  DEX: 0.5,
  WIS: 0.75,
  INT: 0.75,
  CHA: 0.25,
  MP: 0.75,
  SV_FIRE: 0.5,
  SV_COLD: 0.5,
  SV_MAGIC: 0.75,
  SV_POISON: 0.5,
  SV_DISEASE: 0.5,
  SV_ALL: 2,
  DAMAGE_SHIELD: 2,
  HP_ON_CAST: 0.25,
  // A POINT OF REGEN IS WORTH MANY POINTS OF HP, because it arrives every six seconds forever. 20
  // is the roundest number that puts a 5-a-tick regen buff (100) in the same league as a 238-point
  // HP buff without swamping it - a fight lasting a minute takes ten ticks, so 5 a tick is 50 HP
  // of healing in it and more in a long one. It is a weight, not a measurement, like every other
  // number in this table.
  HP_REGEN: 20,
  ABSORB_DAMAGE: 0.5,
  // The percent-valued stats. They are scored on their PERCENT, which is a different unit from a
  // point of STR - the weights below are what makes them comparable, and they are the roundest
  // numbers in a table that is already round.
  HASTE: 3,
  HASTE_V2: 3,
  MOVEMENT_SPEED: 0.5,
  SPELL_HASTE: 2
}

/**
 * What one spell's grants are worth under a weights table.
 *
 * A PERCENT AND A POINT ARE BOTH JUST NUMBERS HERE, and that is exactly why the weights for the
 * percent stats are separate entries: `spellStats.ts` refuses to add 47% to 20 STR, and this file
 * does not add them either - it multiplies each by its own weight and sums the products, which is a
 * different operation and a legitimate one.
 */
export function scoreGrants(grants: readonly SpellStatGrant[], weights: StatWeights): number {
  let total = 0
  for (const g of grants) total += (weights[g.key] ?? 0) * g.amount
  return total
}

// =================================================================================================
// THE CANDIDATES
// =================================================================================================

/** One buff the trio could keep up, and what it is worth. */
export interface LoadoutCandidate {
  name: string
  /** The client's gem icon, when this machine's install answered. See `UnlockSpell.iconId`. */
  iconId?: number
  /** The classes in the trio that can cast it, with the level each gets it. */
  at: readonly { cls: ClassAbbr; level: number }[]
  grants: readonly SpellStatGrant[]
  score: number
  /** The client's stacking view, when the player's own spell file could answer for it. */
  view?: StackSpellView
}

/** One buff that lost its slot, and what losing it costs beyond the obvious. */
export interface LoadoutRejection {
  name: string
  score: number
  /** The spell that beat it. */
  beatenBy: string
  /**
   * WHAT THE LOSER CARRIED THAT THE WINNER DOES NOT.
   *
   * The half of a conflict worth printing. The fork user's own example: Spirit of Bih`Li grants
   * movement speed AND `Increase Attack by 15`, so taking Spirit of Wolf over it silently costs the
   * ATK. A recommender that said only "these conflict" would have hidden the interesting part.
   */
  loses: readonly SpellStatGrant[]
  /**
   * How THIS pair's verdict was reached - `exact` when the client file answered for both spells,
   * `flagged` when it could not answer for one of them. Never `mixed`: a pair is two spells.
   */
  certainty: LoadoutCertainty
}

/**
 * HOW SURE THE CONFLICT VERDICTS ARE (§3.3's three tiers).
 *
 *   `exact`   - the player's `spells_us.txt` answered, and the verdicts are the game's own rules.
 *   `mixed`   - it answered for most of them. See below: this tier exists because the old
 *               all-or-nothing reading threw away 75 good answers over 1 missing one.
 *   `flagged` - no client file, so two spells were called conflicting because they state the SAME
 *               STAT in the committed catalog. That is a true statement about the wiki's own words
 *               and it is NOT a stacking verdict: it cannot say which wins, cannot see a blocking
 *               directive, does not know a bard song stacks alongside a spell, and will flag pairs
 *               the game runs together happily. The copy that draws it must say so.
 *
 * ============================================================================
 * CERTAINTY IS A PROPERTY OF A PAIR, NOT OF THE WHOLE SET
 * ============================================================================
 * This was `candidates.every(c => c.view !== undefined)` - one unanswerable name and the entire
 * tab dropped to its weakest tier and SAID SO on every row. The owner's own trio hit it: 75 of his
 * 76 candidates resolved against his client file and the 76th, `Manicial Strength`, is a misspelling
 * in the scraped catalog that no client row can ever match. One typo, and every verdict on screen
 * was labelled a guess.
 *
 * `conflicts()` was already per-pair and always had been, so the labels were the only thing lying.
 * A REJECTION now carries the certainty of ITS OWN pair - both spells answered, or they did not -
 * and the set carries the tally, so the header can say "74 of 76 read from your spell file" rather
 * than picking one word for a mixed answer.
 */
export type LoadoutCertainty = 'exact' | 'mixed' | 'flagged'

/** The recommendation. */
export interface LoadoutSet {
  keep: LoadoutCandidate[]
  rejected: LoadoutRejection[]
  /** The sum of what `keep` is worth. */
  score: number
  certainty: LoadoutCertainty
  /** How many candidates the client file answered for, out of how many there were. */
  read: { exact: number; total: number }
  /**
   * FALSE when any component was too big to search exhaustively and took a greedy answer.
   *
   * Stated rather than hidden: a set that might not be the best set must not be presented as one.
   */
  provenOptimal: boolean
  /** How many gems the set wants. A player has eight, and this file never silently trims to fit. */
  gems: number
}

/**
 * Which of the corpus a trio can actually cast, scored.
 *
 * A BUFF, AND NOT MERELY A BENEFICIAL SPELL: it has to be something that STAYS on you, so the
 * category test is `buff` - a heal is beneficial and occupies no slot afterwards. `hot` is excluded
 * for the same reason a heal is: it is a healing tool rather than a standing buff, and a recommender
 * that put Regeneration in a stat set would be answering a question nobody asked.
 */
export interface CandidateQuery {
  /** The client's stacking rows, when the player's own spell file has answered. */
  views?: ReadonlyMap<string, StackSpellView>
  /**
   * THE CHARACTER'S LEVEL. A spell no class in the trio has reached is not a recommendation.
   *
   * Added 2026-09-10 after the owner read the tab and asked *"are you also sure the spells are
   * A) In our ERA B) available at my level?"*. They were not. At level 50 the set it handed him
   * was 8 spells he could not cast out of 17, headed by Focus of Spirit, which is SHM 60 - so the
   * single most prominent recommendation on the tab was unreachable, and every buff it beat had
   * been rejected in its favour.
   *
   * Absent means no level filter, which is the reading every other absent field here takes and the
   * right one for a caller that genuinely does not know the level yet.
   */
  level?: number
  /**
   * KEEP THE SPELLS THE ERA SIDECAR PLACES OUT OF ERA. Default false - they are dropped.
   *
   * Same report. 4 of those 17 were flagged out of era, which on this server means the spell is not
   * obtainable, and a "what should I keep up" list is exactly the surface where that matters. The
   * flag is `true` or ABSENT and never false (law 1), so silence is not a verdict and a spell the
   * sidecar never judged is kept.
   */
  includeOutOfEra?: boolean
  /**
   * THE SHORTEST DURATION THAT COUNTS AS A BUFF YOU KEEP UP. Default three minutes.
   *
   * The owner's report (2026-09-10): *"spirit of cheetah is a short duration spell/buff, it's not
   * worth making it a primary buff spell"*. He is right and the optimizer had no way to know: it
   * scored Spirit of Cheetah over Spirit of Bih`Li purely on 75% run speed against 55%, and never
   * looked at the fact that one lasts 48 SECONDS and the other 36 minutes. A gem spent on a sprint
   * is not a gem spent on a buff.
   *
   * ONLY A STATED DURATION IS JUDGED. A spell whose page states none (Rage is one) is kept: silence
   * is not a short duration (law 1), and dropping the rows nobody wrote a number for would quietly
   * delete good buffs.
   */
  minDurationMs?: number
}

/** Three minutes - long enough to outlive a fight, short enough to keep every real buff. */
export const DEFAULT_MIN_BUFF_MS = 180_000

/**
 * IS THIS A BUFF YOU KEEP UP?
 *
 * `buff` always, and `hot` WHEN IT LASTS - which is the second half of the same 2026-09-10 report,
 * from the other direction: *"you're also missing HP Regen in the stats"*. Regeneration, Chloroplast
 * and Regrowth are filed `hot` and were excluded outright, on the reasoning that a recommender
 * putting Regeneration in a stat set would be answering a question nobody asked. Over a 16-minute
 * buff that reasoning is simply wrong - it is exactly the question, and the owner keeps those up.
 *
 * The duration is what separates them from the heals: Superior Healing is `hot` too and lasts
 * moments, so the same floor that drops Spirit of Cheetah drops it, and Form of the Bear (144
 * minutes) comes in where it belongs.
 */
function isKeepUp(s: UnlockSpell, minMs: number): boolean {
  if (s.upgradeCategory === 'buff') return true
  if (s.upgradeCategory !== 'hot') return false
  return s.durationMs !== undefined && s.durationMs >= minMs
}

/**
 * THE REGEN A HEAL-OVER-TIME BUFF GRANTS, per tick, as a stat.
 *
 * `spellStats.parseStatLine` REFUSES `... per tick` lines on purpose - `spellMetrics.ts` owns regen
 * and states it in its own units, and reading it in both places would double-count. So this reads
 * the metrics rather than the words: the total healing over the duration, divided by the ticks it
 * runs over, which is the number the character sheet's `Combat HP Regen` row moves by.
 *
 * Absent unless the metrics state BOTH halves, because a per-tick figure derived from a total with
 * no duration would be arithmetic on an assumption.
 */
function regenGrant(s: UnlockSpell): SpellStatGrant | null {
  const m = s.metrics
  if (m?.hot !== true || m.heal === undefined || m.overSec === undefined || m.overSec <= 0) return null
  const ticks = Math.round(m.overSec / 6)
  if (ticks <= 0) return null
  const perTick = Math.round(m.heal / ticks)
  if (perTick <= 0) return null
  return {
    key: 'HP_REGEN',
    amount: perTick,
    percent: false,
    line: `Increase Hit points by ${String(perTick)} per tick`
  }
}

/**
 * Is this spell one the trio can actually keep up - category, era, duration and level?
 *
 * Its own function because `loadoutCandidates` sits at this tree's complexity ceiling and every
 * question it asks costs a branch. This is the whole of "may it be considered"; the caller is left
 * with "what is it worth".
 */
function admitsBuff(s: UnlockSpell, query: CandidateQuery, minMs: number): boolean {
  if (!isKeepUp(s, minMs)) return false
  // A STATED duration below the floor is a sprint, not a buff - see `minDurationMs`.
  if (s.durationMs !== undefined && s.durationMs < minMs) return false
  return !(s.outOfEra === true && query.includeOutOfEra !== true)
}

/** What one candidate row is built from, beyond the spell itself. */
interface CandidateParts {
  at: LoadoutCandidate['at']
  grants: readonly SpellStatGrant[]
  score: number
  view: StackSpellView | undefined
}

/** One candidate row, with the two optional fields spread rather than branched. */
function candidate(s: UnlockSpell, parts: CandidateParts): LoadoutCandidate {
  const { at, grants, score, view } = parts
  return {
    name: s.name,
    ...(s.iconId === undefined ? {} : { iconId: s.iconId }),
    at,
    grants,
    score,
    ...(view === undefined ? {} : { view })
  }
}

export function loadoutCandidates(
  spells: readonly UnlockSpell[],
  classes: readonly ClassAbbr[],
  weights: StatWeights,
  query: CandidateQuery = {}
): LoadoutCandidate[] {
  const { views, level } = query
  const minMs = query.minDurationMs ?? DEFAULT_MIN_BUFF_MS
  const out: LoadoutCandidate[] = []
  for (const s of spells) {
    if (!admitsBuff(s, query, minMs)) continue
    // THE LEVEL IS PART OF "CAN I CAST IT", and it is applied to the (class, level) pairs rather
    // than to the row: a spell a Shaman gets at 60 and a Warrior at 45 is castable by a level-50
    // trio through the Warrior alone, and the surviving pairs are what the row then reports.
    const at = s.at.filter((p) => classes.includes(p.cls) && (level === undefined || p.level <= level))
    if (at.length === 0) continue
    // The catalog's own grants, plus the per-tick regen it states in another vocabulary.
    const regen = regenGrant(s)
    const grants = regen === null ? (s.grants ?? []) : [...(s.grants ?? []), regen]
    const score = scoreGrants(grants, weights)
    // A buff worth nothing under the weights in force is not a recommendation. It is still a real
    // spell and the Spellbook still lists it; this tab is about a SET worth keeping up.
    if (score <= 0) continue
    out.push(candidate(s, { at, grants, score, view: views?.get(s.name) }))
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return out
}

// =================================================================================================
// THE SELECTION
// =================================================================================================

/** Do these two candidates conflict? Exact through the engine, flagged through shared stats. */
function conflicts(a: LoadoutCandidate, b: LoadoutCandidate, levels: StackLevels): boolean {
  if (a.view !== undefined && b.view !== undefined) return spellsConflict(a.view, b.view, levels)
  return grantsShareASlot(a.grants, b.grants).length > 0
}

/** The best subset of one component, by exhaustive search. Exact, and only for a small one. */
function bestSubset(
  members: readonly LoadoutCandidate[],
  levels: StackLevels
): LoadoutCandidate[] {
  const n = members.length
  let best: LoadoutCandidate[] = []
  let bestScore = -1
  for (let mask = 0; mask < 1 << n; mask++) {
    const pick = pickForMask(members, mask, levels)
    if (pick === null) continue
    const score = pick.reduce((sum, c) => sum + c.score, 0)
    if (score > bestScore) {
      bestScore = score
      best = pick
    }
  }
  return best
}

/**
 * The candidates a bitmask selects, or null when they cannot all stand together.
 *
 * Its own function because the scan nested four blocks deep inside the mask loop and this tree caps
 * nesting at three - the ceiling working as designed: the inner block wanted a name, and the name is
 * "is this particular subset legal".
 */
function pickForMask(
  members: readonly LoadoutCandidate[],
  mask: number,
  levels: StackLevels
): LoadoutCandidate[] | null {
  const pick: LoadoutCandidate[] = []
  for (let i = 0; i < members.length; i++) {
    if ((mask & (1 << i)) === 0) continue
    if (pick.some((already) => conflicts(already, members[i], levels))) return null
    pick.push(members[i])
  }
  return pick
}

/** The best subset by greedy descent - the answer for a component too big to search. */
function greedySubset(
  members: readonly LoadoutCandidate[],
  levels: StackLevels
): LoadoutCandidate[] {
  const pick: LoadoutCandidate[] = []
  // `members` arrives score-descending from `loadoutCandidates`, so taking the first that fits is
  // the ordinary greedy rule.
  for (const m of members) {
    if (!pick.some((p) => conflicts(p, m, levels))) pick.push(m)
  }
  return pick
}

/**
 * THE RECOMMENDATION.
 *
 * The corpus is partitioned into components of the conflict graph, each solved on its own, and the
 * results concatenated - which is valid precisely because components share no edges.
 */
export function buildLoadout(
  candidates: readonly LoadoutCandidate[],
  levels: StackLevels
): LoadoutSet {
  const withView = candidates.filter((c) => c.view !== undefined).length
  const read = { exact: withView, total: candidates.length }
  const certainty: LoadoutCertainty =
    candidates.length > 0 && withView === candidates.length
      ? 'exact'
      : withView === 0
        ? 'flagged'
        : 'mixed'
  const keep: LoadoutCandidate[] = []
  let provenOptimal = true

  for (const component of componentsOf(candidates, levels)) {
    const members = component.map((i) => candidates[i])
    if (members.length === 1) {
      keep.push(members[0])
      continue
    }
    if (members.length <= EXHAUSTIVE_CAP) keep.push(...bestSubset(members, levels))
    else {
      provenOptimal = false
      keep.push(...greedySubset(members, levels))
    }
  }

  keep.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const kept = new Set(keep.map((c) => c.name))
  const rejected: LoadoutRejection[] = []
  for (const c of candidates) {
    if (kept.has(c.name)) continue
    const winner = keep.find((k) => conflicts(k, c, levels))
    if (winner === undefined) continue
    rejected.push({
      name: c.name,
      score: c.score,
      beatenBy: winner.name,
      loses: c.grants.filter((g) => !winner.grants.some((w) => w.key === g.key)),
      // THIS pair's tier, not the set's: `conflicts()` used the engine here exactly when both of
      // these two carried a client view, so that is what the row is entitled to claim.
      certainty: winner.view !== undefined && c.view !== undefined ? 'exact' : 'flagged'
    })
  }
  rejected.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return {
    keep,
    rejected,
    score: keep.reduce((sum, c) => sum + c.score, 0),
    certainty,
    read,
    provenOptimal,
    gems: keep.length
  }
}

/**
 * Component indices over the candidate list.
 *
 * Uses the stacking engine's own partition when every candidate has a client view, and falls back
 * to the shared-stat flag otherwise. The fallback is a genuinely different question and the answer
 * says which one it answered (`LoadoutSet.certainty`).
 */
function componentsOf(candidates: readonly LoadoutCandidate[], levels: StackLevels): number[][] {
  if (candidates.length > 0 && candidates.every((c) => c.view !== undefined)) {
    // Every candidate was just proven to carry a view by the guard on the line above, so the
    // non-null assertion is a statement about that guard rather than a hope.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded one line up
    const views = candidates.map((c) => c.view!)
    return conflictComponents(views, levels).map((comp) => comp.members)
  }
  // The flagged path: the same connected-components walk over the cheap conflict test.
  const n = candidates.length
  const seen = new Array<boolean>(n).fill(false)
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue
    const members: number[] = []
    const stack = [i]
    seen[i] = true
    while (stack.length > 0) {
      const cur = stack.pop()
      if (cur === undefined) break
      members.push(cur)
      pushNeighbours(candidates, cur, levels, { seen, stack })
    }
    out.push(members.sort((a, b) => a - b))
  }
  return out
}

/** The mutable state of one graph walk, as one value - `seen` and `stack` never travel apart. */
interface WalkState {
  seen: boolean[]
  stack: number[]
}

/** Mark and queue everything `cur` conflicts with. Its own function to stay inside max-depth 3. */
function pushNeighbours(
  candidates: readonly LoadoutCandidate[],
  cur: number,
  levels: StackLevels,
  walk: WalkState
): void {
  for (let j = 0; j < candidates.length; j++) {
    if (walk.seen[j] || !conflicts(candidates[cur], candidates[j], levels)) continue
    walk.seen[j] = true
    walk.stack.push(j)
  }
}

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

/** One spell in the combat set, with the table it was the best of. */
export interface CombatPick {
  name: string
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
  const deepest = Math.max(0, ...tabsUsed.map((t) => tables[t].shown.length))
  for (let place = 0; place < deepest && picks.length < gems; place++) {
    for (const tab of tabsUsed) {
      if (picks.length >= gems) break
      const row = tables[tab].shown[place]
      if (row === undefined || taken.has(row.name)) continue
      taken.add(row.name)
      picks.push({
        name: row.name,
        tab,
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

/** The fields `combatSet` reads off a ranked row. Structural, so `bestSpells.ts` need not be imported. */
export interface CombatSource {
  name: string
  metrics: SpellMetrics
  mana: number | null
  gainedAt: number
  classes: ClassAbbr[]
  iconId?: number
}

// =================================================================================================
// WHAT THE SET ADDS UP TO - the owner's ask, 2026-09-10
// =================================================================================================
//
// *"do a summary for the stats on the right side panel, showing all the stats total combined next
// to the character, sort of like the gear tab has that stats for gear, but this will be stats from
// buffs and lets me imagine what it would look like for each individual spell updated"*.
//
// `character/GearStats.tsx` is the counterpart and its header is worth reading first: it sums what
// your ITEMS say and states in three words that that is all it knows, with no lecture about buffs.
// This is the other half of the sentence it refused to write, and it obeys the same two laws.
//
// ── A PERCENT AND A POINT ARE NEVER SUMMED (GearStats' law 6) ─────────────────────────────────
//
// `SpellStatGrant.percent` is a field, so the two never meet by accident: `Haste +34%` and
// `STR +51` are different kinds of number and a total that mixed them would be arithmetic nobody
// asked for. They are separated here rather than in the view, so every surface that draws these
// totals separates them the same way.
//
// ── AND THE TOTALS DO NOT MOVE WITH THE UPGRADE SLIDER, WHICH IS THE ANSWER RATHER THAN A GAP ──
//
// The reason to build this panel beside a 0-to-10 slider is to see what upgrading buys. For a BUFF
// SET the answer is nothing: no category scales a stat grant (`spellUpgrade.ts` states that claim
// and what it rests on), so every number below reads the same at rank 0 and at rank X. That is the
// owner's question 2 - *"which spells are important to upgrade"* - answered for a whole set at
// once, and a panel that sat still while the slider moved WITHOUT saying so would read as broken.
// The surface drawing it has to say it out loud; `buffTotals` just makes the stillness true.

/** One line of the summary. */
export interface BuffStatTotal {
  key: SpellStatKey
  /** The sum across the kept set, sign included. */
  amount: number
  /** True where every contributing grant was a percent - see the header, they never mix. */
  percent: boolean
  /** Which buffs contributed, in set order, so a row can say where it came from. */
  from: string[]
}

/** The whole summary, split the way the two kinds of number have to be drawn. */
export interface BuffTotals {
  /** Point stats - HP, AC, STR, resists. Summed. */
  points: BuffStatTotal[]
  /** Percent stats - haste, run speed. Summed only within their own key, never across kinds. */
  percents: BuffStatTotal[]
}

/**
 * WHAT A KEPT SET GRANTS, ALL TOGETHER.
 *
 * Ordered by magnitude within each half so the biggest contributions read first, with the key as
 * the tiebreak so the order is stable while the slider moves and rows never jump about.
 *
 * A KEY APPEARS AT MOST ONCE PER HALF and that is a property of the input rather than of this
 * function: `buildLoadout` only keeps buffs that do not contest each other, and two buffs granting
 * the same stat DO contest under `contestPass`. The sum is written as a sum anyway, because relying
 * on that here would couple this fold to the optimizer's internals for no gain.
 */
function addGrant(into: Map<string, BuffStatTotal>, g: SpellStatGrant, from: string): void {
  // THE PERCENT FLAG IS PART OF THE IDENTITY: a stat stated both ways is two rows, which is the
  // honest answer rather than a merge of two kinds of number (see the header).
  const id = `${g.key}|${g.percent ? '%' : 'n'}`
  const row = into.get(id)
  if (row === undefined) {
    into.set(id, { key: g.key, amount: g.amount, percent: g.percent, from: [from] })
    return
  }
  row.amount += g.amount
  if (!row.from.includes(from)) row.from.push(from)
}

export function buffTotals(keep: readonly LoadoutCandidate[]): BuffTotals {
  const byKey = new Map<string, BuffStatTotal>()
  for (const c of keep) {
    for (const g of c.grants) addGrant(byKey, g, c.name)
  }
  const order = (a: BuffStatTotal, b: BuffStatTotal): number =>
    Math.abs(b.amount) - Math.abs(a.amount) || a.key.localeCompare(b.key)
  const all = [...byKey.values()]
  return {
    points: all.filter((r) => !r.percent).sort(order),
    percents: all.filter((r) => r.percent).sort(order)
  }
}
