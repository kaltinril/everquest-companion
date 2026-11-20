// shared/tradeskillGear.ts — the Tradeskills workbench's "Gear that raises this skill" list (owner,
// 2026-11-20: "recommended to the person if they are on tradeskills looking at fishing 'hey go get
// the angler hat or the fishing rod etc'").
//
// The Gear index already states each item's skill mods (`GearRow.skillMods`, planner/skillMod.ts).
// This folds them to one tradeskill: which rows name it, in what order, and the words on screen.
// Here, not in the renderer: a filter and a sort over Gear rows are domain logic
// (eqc/no-domain-munging), and tests/tradeskillGear.test.mts runs them on the committed data.

import type { GearRow } from './planner/gear'
import { skillModsTitle, type SkillMod } from './planner/skillMod'
import { tradeskillOf, type Tradeskill } from './tradeskills'

/** What the list reads off a Gear row. */
export type SkillGearRow = Pick<GearRow, 'key' | 'name' | 'slots' | 'skillMods'>

/** One item that raises the tradeskill, with the mod that says so. */
export interface SkillGearLine<R extends SkillGearRow = SkillGearRow> {
  row: R
  /** The item's mod for this tradeskill; its largest when it states more than one. */
  mod: SkillMod
}

export interface SkillGear<R extends SkillGearRow = SkillGearRow> {
  /** Largest percent first, then the higher cap, then by name. */
  lines: SkillGearLine<R>[]
  /** Items the era setting left out. */
  eraHidden: number
  /** What the Gear tab's search box takes to list the same items; '' when there are none. */
  search: string
}

/** The row's mod for a tradeskill, any spelling of it folded (`tradeskillOf`); the largest percent wins. */
function modFor(row: SkillGearRow, tradeskill: Tradeskill): SkillMod | null {
  let best: SkillMod | null = null
  for (const mod of row.skillMods ?? []) {
    if (tradeskillOf(mod.skill) !== tradeskill) continue
    if (best === null || mod.percent > best.percent) best = mod
  }
  return best
}

function lineOrder(a: SkillGearLine, b: SkillGearLine): number {
  return b.mod.percent - a.mod.percent || (b.mod.cap ?? -1) - (a.mod.cap ?? -1) || a.row.name.localeCompare(b.row.name)
}

/**
 * The Gear search words that reach one skill's mods: `skill mod fishing`, the text the Gear
 * tab's haystack holds for such a row (`skillModSearchText`).
 */
export function skillGearSearch(skill: string): string {
  return `skill mod ${skill}`.toLowerCase()
}

/**
 * The Gear rows whose skill mod names the tradeskill. `hidden` is the era verdict, injected the
 * way `indexBook` and the Gear filter take it; absent, nothing is hidden. A mod that lowers the
 * skill is not a recommendation and is left out.
 */
export function skillGear<R extends SkillGearRow>(
  rows: readonly R[],
  tradeskill: Tradeskill,
  hidden?: (row: R) => boolean
): SkillGear<R> {
  const lines: SkillGearLine<R>[] = []
  let eraHidden = 0
  for (const row of rows) {
    if (row.skillMods === undefined) continue
    const mod = modFor(row, tradeskill)
    if (mod === null || mod.percent <= 0) continue
    if (hidden?.(row) === true) eraHidden++
    else lines.push({ row, mod })
  }
  lines.sort(lineOrder)
  // The items' own spelling of the skill: the Gear haystack holds what the item wrote.
  const first = lines[0]
  return { lines, eraHidden, search: first === undefined ? '' : skillGearSearch(first.mod.skill) }
}

/** `+5% (10 Max)`: the mod without the skill's name, which the panel's heading already says. */
export function skillGearModText(mod: SkillMod): string {
  return skillModsTitle([mod]).slice(mod.skill.length).trim()
}

/** The slots as the Gear table prints them; '' when the item states none. */
export function skillGearSlots(row: SkillGearRow): string {
  return row.slots.join(' ')
}

/** The Have cell's words: how many the inventory dump lists. */
export function skillGearHeldText(held: number): string {
  return held > 0 ? `you have ${String(held)}` : 'not held'
}

export const SKILL_GEAR_HEADING = 'Gear that raises this skill'

/** The line under the list when the era setting left items out, or null. */
export function skillGearHiddenText(eraHidden: number): string | null {
  return eraHidden > 0 ? `${String(eraHidden)} out of era, hidden` : null
}
