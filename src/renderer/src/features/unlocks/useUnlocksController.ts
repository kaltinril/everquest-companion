// unlocks/useUnlocksController.ts — all of the Unlocks tab's state and derivation, as one hook.
//
// THREE SOURCES, ONE ROW EACH:
//   - the achievements dump, as the unlock model (shared/unlocks/unlocks.ts): which races, classes
//     and deities are open, how each opened, and what each closed one still needs;
//   - the factions dump with the log's receipts folded in (features/factions/useFactionRows.ts),
//     so a `Get maximum faction with X` line carries X's LIVE standing over its cap and the
//     quests on record that raise it;
//   - the Plane of Sky quest set, so an `Obtain <Item>` line opens the quest that hands the item
//     out. The join is the one the Sky tab's inference makes (achievementInference.ts): by class
//     and item, spellings folded, the one alias table applied.

import { useCallback, useMemo, useState } from 'react'
import type { UnlockBook } from '@shared/unlocks/unlocks'
import { unlockBook } from '@shared/unlocks/unlocks'
import type { View } from '../../appViews'
import { getPoskyData } from '../../data'
import { useAchievementBook } from '../achievements/useAchievementBook'
import { useFactionData, type FactionRowVm } from '../factions/useFactionRows'
import { achievementItemsFor } from '../posky/achievementInference'
import { questKey } from '../posky/keys'
import { loadFlag, savePref } from '../slayer/slayerRows'

export interface UnlocksViewProps {
  /** the Sky tab's deep link: the quest a reward line names */
  onOpenQuest?: (key: string) => void
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

export interface UnlocksController {
  ready: boolean
  hasDump: boolean
  readAt: number | null
  book: UnlockBook | null
  /** by the faction's name, lowercased; empty without a factions dump */
  factions: ReadonlyMap<string, FactionFact>
  /** by `rewardKey(className, item)` */
  rewards: ReadonlyMap<string, RewardFact>
  hideOpen: boolean
  onHideOpen: (on: boolean) => void
  onOpenQuest?: (key: string) => void
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

export function useUnlocksController(props: UnlocksViewProps): UnlocksController {
  const { onOpenQuest, onSelectView } = props
  const { book: achievements, readAt, ready } = useAchievementBook()
  const { rows } = useFactionData()
  const [hideOpen, setHideOpen] = useState(() => loadFlag(HIDE_OPEN_KEY))

  const book = useMemo(() => (achievements === null ? null : unlockBook(achievements)), [achievements])
  const factions = useMemo(() => factionFacts(rows), [rows])
  const onHideOpen = useCallback((on: boolean) => {
    setHideOpen(on)
    savePref(HIDE_OPEN_KEY, on ? '1' : '0')
  }, [])
  const onOpenFactions = useCallback(() => onSelectView?.('factions'), [onSelectView])

  return {
    ready,
    hasDump: book !== null,
    readAt,
    book,
    factions,
    rewards: rewardIndex(),
    hideOpen,
    onHideOpen,
    ...(onOpenQuest === undefined ? {} : { onOpenQuest }),
    ...(onSelectView === undefined ? {} : { onOpenFactions })
  }
}
