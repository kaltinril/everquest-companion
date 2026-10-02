// shared/unlocks/unlocks.ts — THE THREE UNLOCK FAMILIES of the `/outputfile achievements` dump
// (`Untapped Potential: Races`, `: Classes`, `: Deity`), read as what each one still needs and
// how each open one was opened. Pure: no Node, no Electron, no React.
//
// WHAT AN UNLOCK ACHIEVEMENT'S LINES ARE, MEASURED on the committed fixture (2026-08-20) and the
// owner's dump of 2026-09-29, every line of the three groups accounted for:
//   - REQUIREMENTS, one shape per family:
//       race    `Get maximum faction with <Faction>.`             (40 lines), plus one task line
//       class   `Obtain <Item>.`                                    (95; a Sky quest reward each)
//       deity   `Complete the '<Task>' task for a mysterious Emissary.` (Agnostic alone), and
//               `Future Placeholder for <Deity> Requirements.`     (the other sixteen)
//   - THE TWO OTHER WAYS IN, printed as lines with a status of their own:
//       `This achievement will autocomplete if your character was created as <Race>.`
//       `This achievement will autocomplete if you chose to confirm your Primary Class as a <C>.`
//       `This achievement will autocomplete if you chose to confirm your Deity as <D>.`
//       `This achievement will autocomplete when you unlock Human or Wood Elf as a race.`
//       `This achievement can be bypassed using a <Kind> Unlock Token.`  (twice spelled `can by`)
//     A `C` on one of those says HOW the achievement completed, which is why they are folded
//     into `how` rather than listed as work (achievements.ts measured the class half of this:
//     the one class the owner confirmed is the one whose reward lines were all cascaded to `C`).
//
// WHAT A REQUIREMENT'S `C` MEANS: for a faction line, that the faction has been at maximum; for
// a reward line, that the server credits the item, which for a confirmed or tokened class is a
// cascade and not a quest (the class half is display-only here; the Sky tab keeps the ladder).

import {
  componentText,
  type AchievementBook,
  type BookAchievement,
  type BookComponent
} from '../outputs/achievementBook'
import {
  CLASS_UNLOCK_CATEGORY,
  CLASS_UNLOCK_PREFIX,
  RACE_UNLOCK_CATEGORY,
  RACE_UNLOCK_PREFIX
} from '../outputs/achievements'

/** The category holding the deity-unlock achievements, and what each one's name starts with.
 *  Spelled here because achievements.ts on this branch's base names the class and race blocks
 *  only; `exaltation-clarity` names these two the same way for its own read of the deity. */
const DEITY_UNLOCK_CATEGORY = 'Untapped Potential: Deity'
const DEITY_UNLOCK_PREFIX = 'Deity Unlock - '

export type UnlockKind = 'race' | 'class' | 'deity'

/** How an open unlock opened. `earned` is the requirements; the others are the file's own words. */
export type UnlockHow = 'earned' | 'created' | 'confirmed' | 'token' | 'other-unlock'

export type NeedKind = 'faction' | 'reward' | 'task' | 'placeholder' | 'other'

/** One requirement line, classified. */
export interface UnlockNeed {
  kind: NeedKind
  /** the faction, the item, or the task title; the whole line for `other` and `placeholder` */
  subject: string
  /** the line as shown */
  text: string
  done: boolean
}

export interface Unlock {
  kind: UnlockKind
  /** `Barbarian`, `Human (Freeport)`, `Shadowknight`, `Cazic Thule`: the game's spelling */
  name: string
  open: boolean
  /** null while closed */
  how: UnlockHow | null
  needs: UnlockNeed[]
  /** the requirement lines the server marks done, over all of them */
  done: number
  /** false when the dump said nothing about this unlock (the rulebook's row, status unclaimed) */
  known: boolean
  /** the rulebook's lines the dump did not print (the window's Show filters hide `C` rows) */
  unstated: number
}

export interface UnlockBook {
  races: Unlock[]
  classes: Unlock[]
  deities: Unlock[]
  /** the deity whose confirm line is `C`, the game's spelling, or null when none or several */
  deity: string | null
  /** the class whose confirm line is `C`, likewise */
  primaryClass: string | null
  /** the race whose created-as line is `C`, likewise */
  createdAs: string | null
}

const CREATED_RE = /^This achievement will autocomplete if your character was created as (?:a |an )?(.+?)\.?$/
const CONFIRM_RE = /^This achievement will autocomplete if you chose to confirm your (?:Primary Class|Deity) as (?:a |an )?(.+?)\.?$/
const OTHER_UNLOCK = 'This achievement will autocomplete when you unlock '
const TOKEN_RE = /^This achievement can b[ey] bypassed using /
const FACTION_RE = /^Get maximum faction with (.+?)\.?$/
const OBTAIN_RE = /^Obtain (.+?)\.?$/
const TASK_RE = /^Complete the '(.+)' task/i
const PLACEHOLDER = 'Future Placeholder for '

/** The way in a pseudo-line states, or null for a requirement. */
function wayIn(text: string): Exclude<UnlockHow, 'earned'> | null {
  if (CREATED_RE.test(text)) return 'created'
  if (CONFIRM_RE.test(text)) return 'confirmed'
  if (text.startsWith(OTHER_UNLOCK)) return 'other-unlock'
  if (TOKEN_RE.test(text)) return 'token'
  return null
}

function need(c: BookComponent): UnlockNeed {
  const text = componentText(c)
  const faction = FACTION_RE.exec(text)?.[1]
  if (faction !== undefined) return { kind: 'faction', subject: faction, text, done: c.done }
  const item = OBTAIN_RE.exec(text)?.[1]
  if (item !== undefined) return { kind: 'reward', subject: item, text, done: c.done }
  const task = TASK_RE.exec(text)?.[1]
  if (task !== undefined) return { kind: 'task', subject: task, text, done: c.done }
  if (text.startsWith(PLACEHOLDER)) return { kind: 'placeholder', subject: text, text, done: c.done }
  return { kind: 'other', subject: text, text, done: c.done }
}

/** The name a created-as or confirm line states, when that line is `C`. */
function statedBy(c: BookComponent): string | null {
  if (!c.done) return null
  const text = componentText(c)
  return CREATED_RE.exec(text)?.[1] ?? CONFIRM_RE.exec(text)?.[1] ?? null
}

function unlockOf(kind: UnlockKind, name: string, a: BookAchievement): Unlock {
  const needs: UnlockNeed[] = []
  let how: UnlockHow | null = a.done ? 'earned' : null
  for (const c of a.components) {
    const way = wayIn(componentText(c))
    // A way in through another unlock is also the one thing the file says the closed one needs.
    if (way === null || way === 'other-unlock') needs.push(need(c))
    // A `C` on a way-in line names how the unlock opened; `earned` stands only when none says so.
    if (way !== null && c.done && a.done) how = way
  }
  return { kind, name, open: a.done, how, needs, done: needs.filter((n) => n.done).length, known: true, unstated: 0 }
}

/** The achievements of one family, by the name after the prefix. */
function familyRows(book: AchievementBook, category: string, prefix: string): [string, BookAchievement][] {
  const rows: [string, BookAchievement][] = []
  for (const group of book.groups) {
    if (group.category !== category) continue
    for (const a of group.achievements) {
      const name = a.name.startsWith(prefix) ? a.name.slice(prefix.length).trim() : ''
      if (name !== '') rows.push([name, a])
    }
  }
  return rows
}

function family(
  book: AchievementBook,
  kind: UnlockKind,
  category: string,
  prefix: string
): { unlocks: Unlock[]; stated: string | null } {
  const unlocks: Unlock[] = []
  const stated = new Set<string>()
  for (const [name, a] of familyRows(book, category, prefix)) {
    unlocks.push(unlockOf(kind, name, a))
    for (const c of a.components) {
      const by = statedBy(c)
      if (by !== null) stated.add(by)
    }
  }
  // Two would be a contradiction (achievements.ts `confirmedDeity`), and answers null.
  return { unlocks, stated: stated.size === 1 ? [...stated][0] : null }
}

export function unlockBook(book: AchievementBook): UnlockBook {
  const races = family(book, 'race', RACE_UNLOCK_CATEGORY, RACE_UNLOCK_PREFIX)
  const classes = family(book, 'class', CLASS_UNLOCK_CATEGORY, CLASS_UNLOCK_PREFIX)
  const deities = family(book, 'deity', DEITY_UNLOCK_CATEGORY, DEITY_UNLOCK_PREFIX)
  return {
    races: races.unlocks,
    classes: classes.unlocks,
    deities: deities.unlocks,
    deity: deities.stated,
    primaryClass: classes.stated,
    createdAs: races.stated
  }
}

/**
 * Whether an unlock is the one the file states as yours. The created-as line names the bare race
 * (`created as a Human`, on both Human rows of the fixture) where the unlocks carry a city
 * (`Human (Freeport)`, `Human (Qeynos)`), so the bare name marks each city's row of it.
 */
export function isYours(name: string, stated: string | null): boolean {
  if (stated === null) return false
  return name === stated || name.startsWith(`${stated} (`)
}

/** The ones still closed. */
export function closedOf(unlocks: readonly Unlock[]): Unlock[] {
  return unlocks.filter((u) => !u.open)
}

/** How many of an unlock's lines are work: a placeholder line is the game saying there is none. */
export function countedNeeds(unlock: Unlock): number {
  return unlock.needs.filter((n) => n.kind !== 'placeholder').length
}

/** `6 of 16 open`, for a heading, saying how many the dump left out rather than counting them shut. */
export function openText(unlocks: readonly Unlock[]): string {
  const open = unlocks.filter((u) => u.open).length
  const unknown = unlocks.filter((u) => !u.known).length
  const tail = unknown === 0 ? '' : `, ${String(unknown)} not in the dump`
  return `${String(open)} of ${String(unlocks.length)} open${tail}`
}

/** The word the tab uses for how an unlock opened. */
export function howText(how: UnlockHow | null): string {
  switch (how) {
    case 'earned':
      return 'earned'
    case 'created':
      return 'created as'
    case 'confirmed':
      return 'confirmed'
    case 'token':
      return 'unlock token'
    case 'other-unlock':
      return 'with another race'
    case null:
      return ''
  }
}

/**
 * The rulebook as a book with nothing known: every unlock closed, no line done, no way in named.
 * What the tab draws for a character who has never exported achievements, so the requirements
 * are on screen before the status is.
 */
export function unlocksFromRules(rules: readonly UnlockRuleLike[]): UnlockBook {
  const of = (kind: UnlockKind): Unlock[] =>
    rules
      .filter((r) => r.kind === kind)
      .map((r) => ({
        kind,
        name: r.name,
        open: false,
        how: null,
        needs: r.needs.map((n) => ({ kind: n.kind, subject: n.subject, text: n.text, done: false })),
        done: 0,
        known: false,
        unstated: 0
      }))
  return {
    races: of('race'),
    classes: of('class'),
    deities: of('deity'),
    deity: null,
    primaryClass: null,
    createdAs: null
  }
}

const fold = (raw: string): string => raw.toLowerCase().replace(/\s+/g, ' ').trim()

/** A dumped unlock over its rule: the dump's lines where it printed them, the rule's where not. */
function overlayUnlock(rule: Unlock, dumped: Unlock): Unlock {
  const lines = new Map(dumped.needs.map((n) => [fold(n.text), n]))
  const needs = rule.needs.map((n) => lines.get(fold(n.text)) ?? n)
  const ruled = new Set(rule.needs.map((n) => fold(n.text)))
  needs.push(...dumped.needs.filter((n) => !ruled.has(fold(n.text))))
  const unstated = rule.needs.filter((n) => n.kind !== 'placeholder' && !lines.has(fold(n.text))).length
  return { ...dumped, needs, unstated }
}

/** One family: every rule, overlaid by the dump's row of that name; a row the rules lack, after. */
function overlayFamily(rules: readonly Unlock[], dumped: readonly Unlock[]): Unlock[] {
  const byName = new Map(dumped.map((u) => [fold(u.name), u]))
  const out = rules.map((r) => {
    const d = byName.get(fold(r.name))
    byName.delete(fold(r.name))
    return d === undefined ? r : overlayUnlock(r, d)
  })
  return [...out, ...byName.values()]
}

/**
 * THE DUMP OVER THE RULEBOOK, never instead of it. The game's achievements window has Show
 * checkboxes and `/outputfile achievements` writes what the window shows: a real dump arrived with
 * no `C` row at all, so every open unlock was simply absent from it. Reading such a file as the
 * whole book lost those unlocks ("0 of 14"); overlaid, a rule the dump omits stays on screen as
 * the rulebook's row with its status unclaimed (`known` false), and a line it omits stays too.
 */
export function overlayUnlockBook(rules: UnlockBook, dump: UnlockBook): UnlockBook {
  return {
    ...dump,
    races: overlayFamily(rules.races, dump.races),
    classes: overlayFamily(rules.classes, dump.classes),
    deities: overlayFamily(rules.deities, dump.deities)
  }
}

/** The shape of a rulebook row this file needs, so it does not import the generated file. */
export interface UnlockRuleLike {
  kind: UnlockKind
  name: string
  needs: readonly { kind: NeedKind; subject: string; text: string }[]
}
