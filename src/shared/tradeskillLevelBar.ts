// shared/tradeskillLevelBar.ts — the level bar of a tradeskill (owner, 2026-11-20: "that bar you
// had showing the progress for each tradeskill, can we get that on the main tradeskill overview
// page?"): the level the log last stated against the top of the skill, and the wiki's rule on the
// 200 cap.
//
// What the scale rests on (measured, not a guide's word): the game's own achievements dump
// (`/outputfile achievements`; tests/fixtures/Primitive_freeport-Achievements.txt, the blocks
// `Tradeskill: <name>` and `Tradeskill: Special`) lists one milestone per 50 skill for each
// tradeskill. They run 50 to 300 for Alchemy, Baking, Blacksmithing (the dump writes "Smithing"),
// Brewing, Fletching, Jewelcrafting, Pottery and Tailoring, and 50 to 200 for Fishing. The dump
// lists none for Tinkering, Poison Making or Spell Research: nothing measured says where those
// top out, so they get the level's number and no scale.
//
// The 200 cap is the wiki's rule, not a measurement (its Tradeskills page: "Once you pass 200 in
// any one skill, all other tradeskills will cap out at 200 until you buy the Crafting Mastery
// Alternate Advancement"). The wiki's AA table names the tradeskills Crafting Mastery lifts from
// 200 to 300: Baking, Blacksmithing, Brewing, Fletching, Jewelcraft, Pottery, Tailoring. The note
// is drawn for those seven only, where both pages say the same thing. It is worded as the wiki's
// rule; the app does not know which tradeskills the player's Crafting Mastery ranks cover.

import type { SkillRow } from './skills'
import { tradeskillLevel } from './tradeskillBook'
import type { Tradeskill } from './tradeskills'

/** The top skill milestone the achievements dump lists, by tradeskill; absent where it lists none. */
const TOP_MILESTONE: Partial<Record<Tradeskill, number>> = {
  Alchemy: 300,
  Baking: 300,
  Blacksmithing: 300,
  Brewing: 300,
  Fishing: 200,
  Fletching: 300,
  Jewelcrafting: 300,
  Pottery: 300,
  Tailoring: 300
}

/** The top of a tradeskill's bar: its last achievement milestone, or null when the dump lists none. */
export function skillTop(tradeskill: Tradeskill): number | null {
  return TOP_MILESTONE[tradeskill] ?? null
}

/** Where the wiki says every other tradeskill stops once one is past it. */
export const SPECIALIZATION_CAP = 200

/** The tradeskills the wiki's Crafting Mastery row names: the ones the 200 rule is drawn for. */
const CAPPED: readonly Tradeskill[] = ['Baking', 'Blacksmithing', 'Brewing', 'Fletching', 'Jewelcrafting', 'Pottery', 'Tailoring']

export interface LevelBar {
  tradeskill: Tradeskill
  /** Null: the log has not shown this skill go up. */
  level: number | null
  /** The bar's full length in skill; null when nothing measured gives one. */
  top: number | null
  /** How much of the bar is filled, 0 to 1; 0 with no level or no top. */
  fill: number
  /** Where the 200 tick sits on the bar, 0 to 1; null when the cap note does not apply. */
  capTick: number | null
  /** The player's tradeskill that is past 200, which is why the cap note is drawn; null when it is not. */
  cappedBy: Tradeskill | null
}

/** The player's first tradeskill (of the seven the rule names) above 200, other than `tradeskill`; or null. */
function pastCap(rows: readonly SkillRow[], tradeskill: Tradeskill): Tradeskill | null {
  return CAPPED.find((other) => other !== tradeskill && (tradeskillLevel(rows, other) ?? 0) > SPECIALIZATION_CAP) ?? null
}

/**
 * One tradeskill's bar from the log's skill rows. The cap note applies to a tradeskill of the
 * seven whose level is known and at or under 200 while another of the seven is above 200. A
 * skill the log never showed has an empty bar and no note: its level is not known.
 */
export function levelBar(rows: readonly SkillRow[], tradeskill: Tradeskill): LevelBar {
  const level = tradeskillLevel(rows, tradeskill)
  const top = skillTop(tradeskill)
  const fill = level === null || top === null ? 0 : Math.min(1, Math.max(0, level / top))
  const capped = top !== null && level !== null && level <= SPECIALIZATION_CAP && CAPPED.includes(tradeskill)
  const cappedBy = capped ? pastCap(rows, tradeskill) : null
  return { tradeskill, level, top, fill, capTick: cappedBy === null || top === null ? null : SPECIALIZATION_CAP / top, cappedBy }
}

// ---- the words on screen ----------------------------------------------------------------------

/** Beside the level: "of 300"; '' with no level or no scale. */
export function barOfText(bar: LevelBar): string {
  return bar.level === null || bar.top === null ? '' : `of ${String(bar.top)}`
}

/** The bar for a screen reader: "Jewelcrafting 205 of 300". */
export function barLabel(bar: LevelBar): string {
  if (bar.level === null) return `${bar.tradeskill}: not in your log`
  const of = barOfText(bar)
  return `${bar.tradeskill} ${String(bar.level)}${of === '' ? '' : ` ${of}`}`
}

/** The bar's hover: what its length is, or why it has none. */
export function barTip(bar: LevelBar): string {
  if (bar.top === null) return "The game's achievements list no skill milestones for this tradeskill, so the bar has no scale."
  return `${String(bar.top)} is the last skill milestone the game's achievements list for ${bar.tradeskill}.`
}

/** The quiet note under a capped tradeskill's bar. */
export const CAP_NOTE = 'caps at 200 without Crafting Mastery'

/** The note's hover: the wiki's rule, and which of the player's tradeskills brought it on. */
export function capTip(over: Tradeskill): string {
  return `The wiki's Tradeskills page says: once one tradeskill passes 200, the others cap at 200 until you buy the Crafting Mastery AA. Your ${over} is past 200.`
}
