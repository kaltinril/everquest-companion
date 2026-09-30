// unlocks/useUnlocksController.ts — all of the Unlocks tab's state and derivation, as one hook.
//
// FOUR SOURCES, ONE ROW EACH:
//   - the rulebook (shared/unlocks/unlockRules.generated.ts): every race, class and deity unlock
//     and its requirement lines, on screen before any dump exists;
//   - the achievements dump, as the unlock model (shared/unlocks/unlocks.ts), which REPLACES the
//     rulebook's rows once there is one: which are open, how each opened, which lines are done;
//   - the factions dump with the log's receipts folded in (features/factions/useFactionRows.ts),
//     so a `Get maximum faction with X` line carries X's LIVE standing over its cap and the
//     quests on record that raise it;
//   - the Plane of Sky quest set, so an `Obtain <Item>` line opens the quest that hands the item
//     out (the join the Sky tab's inference makes: by class and item, spellings folded, the one
//     alias table applied), and the quest catalog, so a task made of quests names them.
//
// A CHIP ELSEWHERE CAN OPEN THE TAB ON ONE UNLOCK (lib/unlockLink.tsx): the parked ref is taken
// once when the tab mounts and the row it names is scrolled to and marked.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { QuestData } from '@shared/types'
import type { UnlockRef } from '@shared/unlocks/unlockGraph'
import { TASK_PARTS, nameKey } from '@shared/unlocks/unlockGraph'
import { UNLOCK_RULES } from '@shared/unlocks/unlockRules.generated'
import type { UnlockBook } from '@shared/unlocks/unlocks'
import { unlockBook, unlocksFromRules } from '@shared/unlocks/unlocks'
import type { View } from '../../appViews'
import { getPoskyData } from '../../data'
import questsJson from '../../data/eqlegends/quests.json'
import { takeUnlockFocus } from '../../lib/unlockLink'
import { useAchievementBook } from '../achievements/useAchievementBook'
import { useFactionData, type FactionRowVm } from '../factions/useFactionRows'
import type { MobTarget } from '../mobs/mobTarget'
import { achievementItemsFor } from '../posky/achievementInference'
import { questKey } from '../posky/keys'
import { loadFlag, savePref } from '../slayer/slayerRows'

export interface UnlocksViewProps {
  /** the Sky tab's deep link: the quest a reward line names */
  onOpenQuest?: (key: string) => void
  /** the mob page: a task's quest opens on its giver */
  onOpenMob?: (t: MobTarget) => void
  /** the app's MANUAL navigator, which is how a faction chip becomes the Factions tab */
  onSelectView?: (v: View) => void
}

/** What a faction line is drawn with: the row the Factions tab draws, less what it does not need. */
export interface FactionFact {
  standing: number
  cap: number
  label: string
  color: string
  /** the quests on record that raise it, by name */
  raises: string[]
}

/** The Sky quest a reward line opens. */
export interface RewardFact {
  key: string
  questName: string
  giver?: string
}

/** One quest a task is made of, as the catalog knows it. */
export interface TaskPart {
  name: string
  giver?: string
}

export interface UnlocksController {
  ready: boolean
  /** the rows carry the character's status; false while they are the rulebook alone */
  hasDump: boolean
  readAt: number | null
  book: UnlockBook
  /** by the faction's name, lowercased; empty without a factions dump */
  factions: ReadonlyMap<string, FactionFact>
  /** by `rewardKey(className, item)` */
  rewards: ReadonlyMap<string, RewardFact>
  /** by the task's title, folded */
  taskParts: ReadonlyMap<string, TaskPart[]>
  /** the unlock a chip elsewhere asked for, marked on its row */
  focus: UnlockRef | null
  hideOpen: boolean
  onHideOpen: (on: boolean) => void
  onOpenQuest?: (key: string) => void
  onOpenMob?: (t: MobTarget) => void
  onOpenFactions?: () => void
}

export const HIDE_OPEN_KEY = 'eq.unlocks.hideOpen'

// The Sky inference's own folds (achievementInference.ts, not exported): the file says
// `Shadowknight` where the scrape says `Shadow Knight`, and item spacing is nobody's promise.
const classFold = (name: string): string => name.toLowerCase().replace(/\s+/g, '')
const itemFold = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim()

export function rewardKey(className: string, item: string): string {
  return `${classFold(className)}\u0000${itemFold(item)}`
}

let REWARDS: Map<string, RewardFact> | null = null

/** Built on first use from committed bytes: every Sky reward, by the class and the item's spellings. */
function rewardIndex(): Map<string, RewardFact> {
  if (REWARDS !== null) return REWARDS
  REWARDS = new Map()
  for (const q of getPoskyData().quests) {
    if (q.reward === undefined || q.reward === '') continue
    const fact: RewardFact = {
      key: questKey(q),
      questName: q.name,
      ...(q.giver === undefined ? {} : { giver: q.giver })
    }
    for (const item of achievementItemsFor(q.className, q.reward)) {
      REWARDS.set(rewardKey(q.className, item), fact)
    }
  }
  return REWARDS
}

let TASKS: Map<string, TaskPart[]> | null = null

/** Built on first use: each task's quests, with the giver the catalog states for each. */
function taskIndex(): Map<string, TaskPart[]> {
  if (TASKS !== null) return TASKS
  const givers = new Map<string, string | undefined>()
  for (const q of (questsJson as QuestData).quests) givers.set(nameKey(q.name), q.giver)
  TASKS = new Map()
  for (const [task, parts] of Object.entries(TASK_PARTS)) {
    TASKS.set(
      nameKey(task),
      parts.map((name) => {
        const giver = givers.get(nameKey(name))
        return giver === undefined ? { name } : { name, giver }
      })
    )
  }
  return TASKS
}

function factionFacts(rows: readonly FactionRowVm[] | null): Map<string, FactionFact> {
  const facts = new Map<string, FactionFact>()
  for (const r of rows ?? []) {
    facts.set(r.name.toLowerCase(), {
      standing: r.standing,
      cap: r.cap,
      label: r.label,
      color: r.color,
      raises: (r.work?.raise ?? []).map((q) => q.name)
    })
  }
  return facts
}

const RULES_BOOK = unlocksFromRules(UNLOCK_RULES)

export function useUnlocksController(props: UnlocksViewProps): UnlocksController {
  const { onOpenQuest, onOpenMob, onSelectView } = props
  const { book: achievements, readAt, ready } = useAchievementBook()
  const { rows } = useFactionData()
  const [hideOpen, setHideOpen] = useState(() => loadFlag(HIDE_OPEN_KEY))
  const [focus, setFocus] = useState<UnlockRef | null>(null)
  useEffect(() => {
    setFocus(takeUnlockFocus())
  }, [])

  const book = useMemo(
    () => (achievements === null ? RULES_BOOK : unlockBook(achievements)),
    [achievements]
  )
  const factions = useMemo(() => factionFacts(rows), [rows])
  const onHideOpen = useCallback((on: boolean) => {
    setHideOpen(on)
    savePref(HIDE_OPEN_KEY, on ? '1' : '0')
  }, [])
  const onOpenFactions = useCallback(() => onSelectView?.('factions'), [onSelectView])

  return {
    ready,
    hasDump: achievements !== null,
    readAt,
    book,
    factions,
    rewards: rewardIndex(),
    taskParts: taskIndex(),
    focus,
    hideOpen,
    onHideOpen,
    ...(onOpenQuest === undefined ? {} : { onOpenQuest }),
    ...(onOpenMob === undefined ? {} : { onOpenMob }),
    ...(onSelectView === undefined ? {} : { onOpenFactions })
  }
}
