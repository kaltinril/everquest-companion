// shared/outputs/slayer.ts — THE SLAYER HALF of the `/outputfile achievements` dump.
//
// A file of its own rather than a section of achievements.ts, which carries the measured format
// and the parse: this module reads rows that parser produced and knows nothing about tabs.
//
// WHAT THE DUMP SAYS ABOUT SLAYER, MEASURED on two dumps (the committed fixture, 2026-08-20, and
// the owner's of 2026-09-28):
//
//   Slayer: General      four achievements whose components are other achievements, by name:
//                          I<TAB><TAB>Complete the achievement "Bat Country!"
//                          I<TAB><TAB>(Optional) Complete the achievement "Bunnyslayer"
//   Slayer: Conquest     one component each, a list of kinds and a counter to 5,000 or 10,000
//   Slayer: Special      the same to 250, 500 or 1,000; `I'm a People Person!` alone has one
//                        component per playable race, each with a counter to 10
//   Slayer: Skill        the same to 5, 10, 25, 50 or 100
//
// The counter is the 4-field row's last field, `<n>/<m>`, and only an INCOMPLETE row has one: a
// completed component prints no number (fixture), and the newer dump prints no completed rows at
// all (zero `C` rows in 1,165). So the open counters are the whole of what is left to do, which
// is the question this projection exists to answer.
//
// THE GENERAL ROWS SPELL THEIR TARGETS LOOSELY. `Complete the achievement "We are the dead!"`
// names `We Are the Dead!`; `"Catnipped in the bud."` names `Catnipped In the Bud`. Case and a
// closing period are folded at the join (`achievementKey`), never rewritten in the record.

import type { AchievementsDump } from './achievements'

/** What every Slayer category's header starts with; the rest is the group. */
export const SLAYER_PREFIX = 'Slayer: '

/** The group whose components are other achievements rather than kills. */
export const SLAYER_GENERAL = 'General'

/** One open kill counter, as the dump states it. */
export interface SlayerCounter {
  /** `Conquest`, `Special` or `Skill`: the category header after `Slayer: ` */
  group: string
  /** the achievement's name, verbatim */
  achievement: string
  /** the requirement line, verbatim: the kinds of creature that count */
  label: string
  have: number
  need: number
}

/** One achievement a General achievement still asks for. */
export interface SlayerNeed {
  /** the name as the General row quotes it, verbatim */
  name: string
  optional: boolean
}

/** One of the four General achievements and what it is still waiting on. */
export interface SlayerGoal {
  achievement: string
  needs: SlayerNeed[]
}

/** The flat artifact main persists: `ProgressState.slayer`. */
export interface SlayerRecord {
  counters: SlayerCounter[]
  goals: SlayerGoal[]
}

/** An achievement's name as the General rows and the achievement rows can both be compared. */
export function achievementKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.\s]+$/, '')
    .trim()
}

/**
 * Whether each achievement the General rows name is still REQUIRED by one of them, by
 * `achievementKey`. An achievement only ever quoted as `(Optional)` maps to false; one no General
 * row names is absent, and a reader treats absent as required (it is on the list for a reason).
 */
export function requiredByGoal(goals: readonly SlayerGoal[]): Map<string, boolean> {
  const required = new Map<string, boolean>()
  for (const need of goals.flatMap((g) => g.needs)) {
    const key = achievementKey(need.name)
    required.set(key, required.get(key) === true || !need.optional)
  }
  return required
}

/** How many achievements a General achievement still requires, the optional ones left out. */
export function requiredLeft(goal: SlayerGoal): number {
  return goal.needs.filter((n) => !n.optional).length
}

/**
 * Whether the dump printed any open row at all. A dump written with the window's `Show Open`
 * unticked has none, and its empty record would say nothing is left: such a dump is no witness
 * about Slayer, and the record it would make is not stored over the last good one.
 */
export function showsOpenRows(dump: AchievementsDump): boolean {
  return dump.rows.some((row) => row.status === 'incomplete')
}

const COUNTER_RE = /^(\d+)\/(\d+)$/
const NEED_RE = /^(\(Optional\) )?Complete the achievement "(.+)"$/

/** The open counters and the General achievements' open requirements. Completed rows of either
 *  kind are left out: a record of what is left cannot be misread as a record of what was done. */
export function slayerRecord(dump: AchievementsDump): SlayerRecord {
  const counters: SlayerCounter[] = []
  const goals = new Map<string, SlayerGoal>()
  for (const row of dump.rows) {
    if (!row.category.startsWith(SLAYER_PREFIX)) continue
    if (row.component === undefined || row.status !== 'incomplete') continue
    const group = row.category.slice(SLAYER_PREFIX.length).trim()
    if (group === SLAYER_GENERAL) {
      const need = NEED_RE.exec(row.component)
      if (need === null) continue
      const goal = goals.get(row.achievement) ?? { achievement: row.achievement, needs: [] }
      goal.needs.push({ name: need[2], optional: need[1] !== undefined })
      goals.set(row.achievement, goal)
      continue
    }
    const counter = COUNTER_RE.exec(row.progress ?? '')
    if (counter === null) continue
    counters.push({
      group,
      achievement: row.achievement,
      label: row.component,
      have: Number(counter[1]),
      need: Number(counter[2])
    })
  }
  return { counters, goals: [...goals.values()] }
}
