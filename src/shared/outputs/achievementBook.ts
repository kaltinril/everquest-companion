// shared/outputs/achievementBook.ts — THE WHOLE `/outputfile achievements` DUMP, as the tree the
// game's own Achievements window draws: family, group, achievement, requirement.
//
// A file of its own for slayer.ts's reason: achievements.ts carries the measured format and the
// parse, and this module reads rows that parser produced. It projects nothing away. Every other
// reader of the dump takes the rows one question needs (the class unlocks, the race unlocks, the
// deity, the Slayer counters); this one is for the tab that answers "what is there to do".
//
// WHAT IS MEASURED, on three dumps (the committed fixture of 2026-08-20, and the owner's of
// 2026-09-28 and 2026-09-29, the last two from one character 21 hours apart):
//
//   - A CATEGORY HEADER IS `Family: Group`, every one of them, and the families are the five the
//     window lists: Untapped Potential, General, Tradeskill, Slayer, EverQuest. The groups under
//     a family are printed together and in the window's order.
//   - THE FILE HOLDS WHAT THE WINDOW WAS SHOWING. The 2026-09-28 dump has 341 achievements and
//     not one `C` row; the 2026-09-29 dump has 486, of which 145 are `C`. `General: Level`, ten
//     achievements all complete, is a category of the second and absent from the first. So a
//     group that is missing is a group with nothing to show, and a file with no `C` row cannot
//     say how much has been done.
//   - `General: Keys` AND `EverQuest: Keys` ARE THE SAME FOUR ACHIEVEMENTS, printed twice. The
//     window's total (143 of 483 on 2026-09-29) counts them once: the file's 145 complete less
//     the two complete keys printed twice is 143.
//   - A REQUIREMENT CAN BE ANOTHER ACHIEVEMENT, named three ways: quoted (`Complete the
//     achievement "Bat Country!"`), bare (`Hunter of Crushbone` under `Hunter of Faydwer`), or
//     either of those after `(Optional) `. It can also be the achievement's own name
//     (`Arcane Scientists` under `Arcane Scientists`), which names nothing further.
//
// WHAT IS ASSUMED: that the Show checkboxes of the window (Open, Complete, Locked) are what
// decided the difference between the two owner dumps. Nothing in the file states it.

import type { AchievementsDump } from './achievements'
import { outputFileNames, outputKind } from './kinds'

/** One requirement line of an achievement. */
export interface BookComponent {
  /** the line as the file printed it, `(Optional) ` included */
  line: string
  done: boolean
  /** the counter, on the lines that print one; a completed line prints none */
  have?: number
  need?: number
}

export interface BookAchievement {
  /** the achievement's name, verbatim */
  name: string
  /** the achievement row's OWN status, which is not always its requirements' (achievements.ts) */
  done: boolean
  components: BookComponent[]
}

export interface BookGroup {
  /** the category header, verbatim: `Slayer: Conquest` */
  category: string
  /** the header up to its colon: `Slayer` */
  family: string
  /** the rest of it: `Conquest`. Empty for a header with no colon, which no dump has printed */
  name: string
  achievements: BookAchievement[]
}

/** The dump as a tree, groups in file order. */
export interface AchievementBook {
  groups: BookGroup[]
}

const FAMILY_SEPARATOR = ': '

export function splitCategory(category: string): { family: string; name: string } {
  const at = category.indexOf(FAMILY_SEPARATOR)
  if (at < 0) return { family: category.trim(), name: '' }
  return {
    family: category.slice(0, at).trim(),
    name: category.slice(at + FAMILY_SEPARATOR.length).trim()
  }
}

const OPTIONAL_PREFIX = '(Optional) '
const QUOTED_RE = /^Complete the achievement "(.+)"$/
const COUNTER_RE = /^(\d+)\/(\d+)$/

export function isOptional(component: BookComponent): boolean {
  return component.line.startsWith(OPTIONAL_PREFIX)
}

/** The line without the `(Optional) ` some open with. What a reader is shown. */
export function componentText(component: BookComponent): string {
  return isOptional(component) ? component.line.slice(OPTIONAL_PREFIX.length) : component.line
}

/**
 * What the line would be called if it named an achievement: the quoted name, or the whole text.
 * Whether an achievement of that name exists is the caller's join.
 */
export function componentSubject(component: BookComponent): string {
  const text = componentText(component)
  return QUOTED_RE.exec(text)?.[1] ?? text
}

function counterOf(progress: string | undefined): { have?: number; need?: number } {
  const found = COUNTER_RE.exec(progress ?? '')
  return found === null ? {} : { have: Number(found[1]), need: Number(found[2]) }
}

/** The group a category's rows belong to, made on first sight. A repeated header is one group. */
function groupFor(groups: Map<string, BookGroup>, category: string): BookGroup {
  let group = groups.get(category)
  if (group === undefined) {
    group = { category, ...splitCategory(category), achievements: [] }
    groups.set(category, group)
  }
  return group
}

/**
 * Whether the dump found is the named character's own file. `preferredOutputFile` (kinds.ts)
 * falls back to ANYBODY's newest dump, the right answer for its own readers; but this dump is
 * stated per character, and another's would be drawn and stored as this one's. A character
 * whose name is not known owns whatever was found, which is the one-character machine.
 */
export function isOwnAchievementsDump(
  path: string,
  characterName?: string,
  server?: string
): boolean {
  if (!characterName) return true
  const file = (path.split(/[\\/]/).pop() ?? '').toLowerCase()
  return outputFileNames(outputKind('achievements'), characterName, server).some(
    (name) => name.toLowerCase() === file
  )
}

export function achievementBook(dump: AchievementsDump): AchievementBook {
  const groups = new Map<string, BookGroup>()
  let current: BookAchievement | null = null
  for (const row of dump.rows) {
    const group = groupFor(groups, row.category)
    if (row.component === undefined) {
      current = { name: row.achievement, done: row.status === 'complete', components: [] }
      group.achievements.push(current)
      continue
    }
    // The parser never yields a requirement ahead of its achievement; a caller's own rows might.
    if (current?.name !== row.achievement) continue
    current.components.push({
      line: row.component,
      done: row.status === 'complete',
      ...counterOf(row.progress)
    })
  }
  return { groups: [...groups.values()] }
}
