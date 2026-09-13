// spellUtilitySet.ts — THE TOP RUNG OF EVERY LINE THE OTHER THREE PANES DID NOT PLACE.
//
// ============================================================================
// THE OWNER'S REPORT, VERBATIM (kaltinril 2026-09-12)
// ============================================================================
// *"your combat set for the enchanter is also missing utility things: Tepid Deeds, Beguile (Crowd
// control), Strip Enchantment, Feckless Might, Tashani, Calm (Crowd control), sagar's animation
// (pet), Mezmerization (Crowd control). Buffs: Illusion Iksar, Intellectual Superiority. I'm really
// confused why you missed all this"*.
//
// He was right and the three panes could not have answered him. The buff set is a SCORING problem
// over stat grants, so a spell that grants no weighted stat (an illusion, a casting-level buff)
// scored zero and was dropped before either list. The combat and heal sets are RANKINGS over the
// Leveling tab's damage and healing tables, so a slow, a charm, a mez, a dispel, a debuff and a pet
// - none of which has a figure those tables rank on - were never in the running. Every spell he
// named is the best of its kind he can cast, and no engine on the tab asked that question.
//
// ============================================================================
// THE ANSWER IS ALREADY IN THE DATA: THE SHIPPED LADDERS
// ============================================================================
// `spellLines.json` places every one of those spells on a class's upgrade line - the Deeds slow
// line, the Charm line, the Cancel Magic line, the Tash line, the Lull line, the Animation line,
// the AE mez line, the Intellectual line, the racial illusion line - and `UnlockSpell.replaces`
// carries that ladder's answer per class onto every row. So "the best slow I can cast" needs no
// new ranking: it is the highest rung of the slow line at or under your level. That is exactly the
// list he wrote, at his enchanter's level, rung for rung.
//
// This engine is that rule and nothing more:
//
//   CASTABLE   - a class in the trio gains it at or under the level asked, and it is in era.
//   TOP RUNG   - no castable row of the same class replaces it. Judged PER CLASS, because the same
//                name sits at a different rung for different classes: a row hidden behind its
//                enchanter successor may still be a shaman's best.
//   NOT PLACED - the buff set (kept or left out), the combat set and the heal set already spoke
//                for it. A spell appears on ONE pane.
//   NOT RANKED - nukes, DoTs, heals and HoTs belong to the Leveling tab's tables and the cast
//                sets that spend gems on them; a rung of those the combat set did not pick was
//                outranked by a figure, which is a better reason than this file could give.
//
// It ranks nothing, weighs nothing and never says "best" about two lines against each other -
// there is no exchange rate between a mez and a slow, and it does not pretend to one. Grouped by
// the classifier's own category so the pane reads as jobs, with the line's own name on every row.
//
// Pure and node-tested (tests/spellUtilitySet.test.mts).

import type { ClassAbbr } from './classCombo'
import type { UnlockSpell } from './levelUnlocks'
import type { UpgradeCategory } from './spellUpgrade'

/** One top rung: the spell, the line it tops, and who in the trio casts it. */
export interface UtilityPick {
  name: string
  iconId?: number
  /** The shipped ladder's name for its line, when one places it - the row's own explanation. */
  line?: string
  category: UpgradeCategory
  /** The lowest level a class in the trio gains it at. */
  gainedAt: number
  /** The trio's classes for which it is the top castable rung. */
  classes: ClassAbbr[]
}

/** One job's worth of top rungs. */
export interface UtilityGroup {
  category: UpgradeCategory
  label: string
  picks: UtilityPick[]
}

export interface UtilitySet {
  groups: UtilityGroup[]
  /** Every pick across the groups - the tab's own count. */
  count: number
  /** How many of the trio's classes the picks come from - one, and a class chip on every row would
   *  say nothing (the owner's ENC / MNK / WAR: only the enchanter casts). */
  casters: number
}

/**
 * THE PANE'S HEADINGS, in draw order: the crowd you control, what you weaken, what fights for
 * you, the buffs the stat table could not score, and the rest.
 *
 * Not `UPGRADE_CATEGORY_LABEL`: those are the CLASSIFIER's words (`Uncategorized` is its honest
 * confession about Strip Enchantment), and a heading names the JOB a reader is scanning for.
 */
const HEADINGS: readonly { category: UpgradeCategory; label: string }[] = [
  { category: 'cc', label: 'Crowd control' },
  { category: 'debuff', label: 'Debuffs' },
  { category: 'pet', label: 'Pets' },
  { category: 'buff', label: 'Other buffs' },
  { category: 'other', label: 'Utility' }
]

/** The categories the Leveling tab's tables rank and the cast sets already spend on. */
const RANKED: ReadonlySet<UpgradeCategory> = new Set(['nuke', 'dot', 'heal', 'hot'])

export interface UtilityQuery {
  /** Names the other panes already placed - kept or left-out buffs, combat picks, heal picks. */
  placed?: ReadonlySet<string>
  /** Keep rows the era sidecar places out of era. Default false, the buff set's own reading. */
  includeOutOfEra?: boolean
}

function castableVia(s: UnlockSpell, cls: ClassAbbr, level: number): boolean {
  return s.at.some((p) => p.cls === cls && p.level <= level)
}

/**
 * `name|cls` for every row a CASTABLE row of that class replaces. A successor you cannot cast yet
 * supersedes nothing: Tashania at 41 leaves Tashani the top rung of a level-24 enchanter.
 *
 * AND A HIGHER CASTABLE RUNG OF THE SAME LINE SUPERSEDES TOO. `replaces` walks to the nearest
 * STRICTLY lower member (`spellLineLookup.ts` says why: Heroism and Heroic Bond at 52 do not replace
 * each other), so a same-level pair leaves one of the two replaced by nobody - Enchant Clay and
 * Enchant Silver both at 7, Illusion: Erudite and Halfling both at 12 - and the probe drew Enchant
 * Clay beside Enchant Gold. The line's own name settles it: a row is not its line's top rung while
 * the same class casts a higher rung of that line.
 */
function supersededKeys(
  spells: readonly UnlockSpell[],
  classes: readonly ClassAbbr[],
  level: number
): Set<string> {
  const out = new Set<string>()
  for (const s of spells) {
    for (const r of s.replaces ?? []) {
      if (classes.includes(r.cls) && castableVia(s, r.cls, level)) out.add(`${r.name}|${r.cls}`)
    }
  }
  const top = topRungOfLine(spells, classes, level)
  for (const s of spells) {
    if (s.line === undefined) continue
    for (const p of s.at) {
      if (p.level < (top.get(`${s.line}|${p.cls}`) ?? 0)) out.add(`${s.name}|${p.cls}`)
    }
  }
  return out
}

/** `line|cls` -> the highest level at which that class casts a rung of that line, at this level. */
function topRungOfLine(
  spells: readonly UnlockSpell[],
  classes: readonly ClassAbbr[],
  level: number
): Map<string, number> {
  const top = new Map<string, number>()
  for (const s of spells) {
    if (s.line === undefined) continue
    for (const p of s.at) {
      if (!classes.includes(p.cls) || p.level > level) continue
      const key = `${s.line}|${p.cls}`
      top.set(key, Math.max(top.get(key) ?? 0, p.level))
    }
  }
  return top
}

function admits(s: UnlockSpell, query: UtilityQuery): boolean {
  if (RANKED.has(s.upgradeCategory ?? 'other')) return false
  if (query.placed?.has(s.name) === true) return false
  return !(s.outOfEra === true && query.includeOutOfEra !== true)
}

/** The trio's classes for which this row is a castable top rung, in the trio's order. */
function topFor(
  s: UnlockSpell,
  classes: readonly ClassAbbr[],
  level: number,
  superseded: ReadonlySet<string>
): ClassAbbr[] {
  return classes.filter((cls) => castableVia(s, cls, level) && !superseded.has(`${s.name}|${cls}`))
}

function pickOf(s: UnlockSpell, classes: ClassAbbr[]): UtilityPick {
  const levels = s.at.filter((p) => classes.includes(p.cls)).map((p) => p.level)
  return {
    name: s.name,
    ...(s.iconId === undefined ? {} : { iconId: s.iconId }),
    ...(s.line === undefined ? {} : { line: s.line }),
    category: s.upgradeCategory ?? 'other',
    gainedAt: Math.min(...levels),
    classes
  }
}

/**
 * The top castable rung of every line the trio has, minus what the other panes placed, grouped by
 * job. Rows within a group arrive newest rung first, then by name, so the same corpus always
 * draws the same pane.
 */
export function utilitySet(
  spells: readonly UnlockSpell[],
  classes: readonly ClassAbbr[],
  level: number,
  query: UtilityQuery = {}
): UtilitySet {
  const superseded = supersededKeys(spells, classes, level)
  const picks: UtilityPick[] = []
  for (const s of spells) {
    if (!admits(s, query)) continue
    const top = topFor(s, classes, level, superseded)
    if (top.length > 0) picks.push(pickOf(s, top))
  }
  picks.sort((a, b) => b.gainedAt - a.gainedAt || a.name.localeCompare(b.name))
  const groups: UtilityGroup[] = []
  for (const h of HEADINGS) {
    const mine = picks.filter((p) => p.category === h.category)
    if (mine.length > 0) groups.push({ ...h, picks: mine })
  }
  return { groups, count: picks.length, casters: new Set(picks.flatMap((p) => p.classes)).size }
}
