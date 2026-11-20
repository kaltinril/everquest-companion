// planner/skillMod.ts - an item's SKILL MODS, read out of its stat block's flag phrases (owner,
// 2026-11-20: "things that improve fishing skill, baking skill, etc ... searchable on the gear tab").
//
// The wiki states a skill mod as prose, and the scrape leaves it among the flags. Every shape the
// committed corpus holds (2026-11-20, seven pages):
//   Skill Mod: Fishing 5%            Skill Mod: Fishing +2% (4 Max)     Skill Mod: Baking +5%
//   Skill Mod: Pick Lock +2% (8 Max) Skill Mod: Fishing +5% (10 Max)    Skill Mod: ?
// `Skill Mod: ?` names no skill and no number, so it reads as nothing (law 1: absent, never zero).
// PURE: the gear index calls it once per row at build, and the Gear tab reads the answer.

/** One skill mod as the item states it. */
export interface SkillMod {
  /** the skill as written ("Fishing", "Pick Lock") - any skill, not only tradeskills */
  skill: string
  /** the percent, signed ("+5%" and a bare "5%" are both 5) */
  percent: number
  /** the "(10 Max)" part; absent when the item states none */
  cap?: number
}

// A flag entry can hold several facts in one string, so the phrase is found wherever it sits. The
// skill name must hold a letter and may not cross a ':' - that is where the next fact's key ends.
const SKILL_MOD = /Skill\s*Mod\s*:\s*([^:%()]*?[A-Za-z][^:%()]*?)\s*([+-]?\d+(?:\.\d+)?)\s*%(?:\s*\(\s*(\d+)\s*Max\s*\))?/gi

/** Every skill mod the flags state, in source order. A mod with no readable percent is left out. */
export function parseSkillMods(flags: readonly string[]): SkillMod[] {
  const out: SkillMod[] = []
  for (const flag of flags) {
    for (const m of flag.matchAll(SKILL_MOD)) {
      const skill = m[1].trim().replace(/\s+/g, ' ')
      const cap = m[3] as string | undefined
      out.push({ skill, percent: Number(m[2]), ...(cap === undefined ? {} : { cap: Number(cap) }) })
    }
  }
  return out
}

/** `Fishing +5%` - the cell's words for one mod. */
export function skillModText(mod: SkillMod): string {
  return `${mod.skill} ${mod.percent < 0 ? '' : '+'}${String(mod.percent)}%`
}

/** The cell's words for a row: every mod, comma separated; `''` when the row states none. */
export function skillModsText(mods: readonly SkillMod[] | undefined): string {
  return (mods ?? []).map(skillModText).join(', ')
}

/** The hover's words: the same, with each cap as the wiki writes it (`Fishing +5% (10 Max)`). */
export function skillModsTitle(mods: readonly SkillMod[] | undefined): string {
  return (mods ?? []).map((m) => `${skillModText(m)}${m.cap === undefined ? '' : ` (${String(m.cap)} Max)`}`).join(', ')
}

/** The number a sort or a threshold reads: the largest percent, `undefined` when the row states none. */
export function skillModPercent(mods: readonly SkillMod[] | undefined): number | undefined {
  if (mods === undefined || mods.length === 0) return undefined
  return Math.max(...mods.map((m) => m.percent))
}

/** What a search reaches: `skill mod fishing`. The NAME only - a number is a threshold's question. */
export function skillModSearchText(mods: readonly SkillMod[] | undefined): string {
  return (mods ?? []).map((m) => `skill mod ${m.skill}`).join(' ').toLowerCase()
}
