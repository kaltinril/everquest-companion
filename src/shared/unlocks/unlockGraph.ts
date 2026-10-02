// shared/unlocks/unlockGraph.ts — THE UNLOCK GRAPH, read from the committed rulebook: what a
// faction, an item, a task or a quest is on the way to. Pure: no Node, no Electron, no React.
//
// The rulebook (unlockRules.generated.ts) is the game's own requirement lines for every race,
// class and deity unlock, so a surface can answer "what does this unlock" for a player who has
// never exported an achievements dump. What the dump adds is the character's own status, and
// that is unlocks.ts's job; this file never looks at one.
//
// THE ONE HAND-AUTHORED JOIN. A task is not a quest: `Aid the Kerrans of Kerra Isle` (the
// Kerran unlock's task) is a wiki page of its own that names seven quests as its parts, and the
// quest catalog holds the seven and not the page. MEASURED 2026-09-30 on the cached pages of the
// five Kerra Isle NPCs that give them, each of which reads `<quest> (part of Aid the Kerrans of
// Kerra Isle)`. `Renouncing Your Faith` (the Agnostic deity's task) IS in the catalog under its
// own name and needs no row.
//
// THE TOKENS are the marketplace's way in, one per family; the log prints their delivery
// (`Race Unlock Token has been placed in your inventory!`, acquireEvents.ts) and the dump prints
// the line they satisfy, and that is the whole of what the app knows about them: no page, no
// price.

import { factionNameKey } from '../outputs/factions'
import type { UnlockKind } from './unlocks'
import { UNLOCK_RULES, type RuleNeed, type UnlockRule } from './unlockRules.generated'

export interface UnlockRef {
  kind: UnlockKind
  name: string
}

/** One thing on the way to one unlock: the unlock, and the line of it the thing satisfies. */
export interface UnlockPath {
  unlock: UnlockRef
  need: RuleNeed
}

/** The marketplace token that bypasses each family, as the dump names it. */
export const UNLOCK_TOKENS: Readonly<Record<UnlockKind, string>> = {
  race: 'Race Unlock Token',
  class: 'Primary Class Unlock Token',
  deity: 'Deity Unlock Token'
}

/** The quests a task is made of, by the task's title. See the header. */
export const TASK_PARTS: Readonly<Record<string, readonly string[]>> = {
  'Aid the Kerrans of Kerra Isle': [
    'First Test of Kejaar',
    'Second Test of Kejaar',
    'Fish Dinner',
    'Rat Teeth',
    'Skunk Scent Gland (quest)',
    'Something is Wrrrong',
    'This Means Warrr'
  ]
}

/** Names compared with case and runs of space folded, which is as loose as the joins here go. */
export function nameKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim()
}

let BY_SUBJECT: Map<string, UnlockPath[]> | null = null

// A faction subject keys through factionNameKey, so the factions dump's spelling of a faction
// finds the rule the achievements dump spells differently (`DaBashers`, `Da Bashers`).
function subjectKey(kind: RuleNeed['kind'], subject: string): string {
  return `${kind}\u0000${kind === 'faction' ? factionNameKey(subject) : nameKey(subject)}`
}

function index(): Map<string, UnlockPath[]> {
  if (BY_SUBJECT !== null) return BY_SUBJECT
  BY_SUBJECT = new Map()
  for (const rule of UNLOCK_RULES) {
    for (const need of rule.needs) {
      const key = subjectKey(need.kind, need.subject)
      const paths = BY_SUBJECT.get(key) ?? []
      paths.push({ unlock: { kind: rule.kind, name: rule.name }, need })
      BY_SUBJECT.set(key, paths)
    }
  }
  return BY_SUBJECT
}

function paths(kind: RuleNeed['kind'], subject: string): UnlockPath[] {
  return index().get(subjectKey(kind, subject)) ?? []
}

/** The unlocks that want this faction at maximum. */
export function unlocksNeedingFaction(faction: string): UnlockPath[] {
  return paths('faction', faction)
}

/** The unlocks that want this item obtained (the Sky rewards, by the dump's spelling). */
export function unlocksNeedingItem(item: string): UnlockPath[] {
  return paths('reward', item)
}

/** The unlocks that want this task completed, by the task's title. */
export function unlocksNeedingTask(task: string): UnlockPath[] {
  return paths('task', task)
}

/** The unlocks a quest is on the way to: the task it is, or the task it is a part of. */
export function unlocksNeedingQuest(quest: string): UnlockPath[] {
  const own = unlocksNeedingTask(quest)
  if (own.length > 0) return own
  const key = nameKey(quest)
  for (const [task, parts] of Object.entries(TASK_PARTS)) {
    if (parts.some((p) => nameKey(p) === key)) return unlocksNeedingTask(task)
  }
  return []
}

/** Paths with the same unlock and the same line, once. */
export function distinctPaths(paths: readonly UnlockPath[]): UnlockPath[] {
  const seen = new Set<string>()
  return paths.filter((p) => {
    const key = `${p.unlock.kind}:${p.unlock.name}:${p.need.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The rule for one unlock, or undefined when the rulebook has none of that name. */
export function unlockRule(kind: UnlockKind, name: string): UnlockRule | undefined {
  const key = nameKey(name)
  return UNLOCK_RULES.find((r) => r.kind === kind && nameKey(r.name) === key)
}

/** The rules of one family, in the rulebook's (the game's) order. */
export function rulesOf(kind: UnlockKind): UnlockRule[] {
  return UNLOCK_RULES.filter((r) => r.kind === kind)
}

/** `Race Unlock - Kerran`, the achievement's name as the dump and the log print it. */
export function unlockAchievementName(ref: UnlockRef): string {
  switch (ref.kind) {
    case 'race':
      return `Race Unlock - ${ref.name}`
    case 'class':
      return `Primary Class Unlock - ${ref.name}`
    case 'deity':
      return `Deity Unlock - ${ref.name}`
  }
}
