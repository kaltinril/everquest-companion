// factions/factionDerive.ts — everything the table derives per faction once the filters have
// spoken, plus the row-level visibility rules. PURE (no React), node-testable; split out of
// FactionsView.tsx at the measured 400-code-line file ceiling (split, never ratchet).

import type { GearRow } from '@shared/planner/gear'
import type { EquipSlot } from '@shared/planner/types'
import type { FactionWork } from './factionQuests'
import type { FactionRowVm } from './useFactionRows'
import { filterWork, rewardKey, wishedRewards, type WorkFilters } from './factionFilters'

/**
 * What the gear index says about the corpus, folded once per fetch: which keys are GEAR at all
 * (any stat or effect — the value signal's judge), and every key's slots (the slot filter's).
 */
export interface GearMaps {
  worthy: ReadonlySet<string>
  slots: ReadonlyMap<string, readonly EquipSlot[]>
}

/**
 * The stat keys that describe an item's PHYSICS rather than its virtue: every rusty weapon has a
 * damage and a delay, and everything on Norrath weighs something. Counting them made a 21-piece
 * newbie junk pile read as "21 gear rewards" (the Emerald Warriors' Items report); an item is
 * GEAR here only for what it adds — a stat, an AC, a save, an effect.
 */
const PHYSICAL_KEYS: ReadonlySet<string> = new Set(['DMG', 'DELAY', 'RANGE', 'WEIGHT'])

export function gearMaps(rows: readonly GearRow[]): GearMaps {
  const worthy = new Set<string>()
  const slots = new Map<string, readonly EquipSlot[]>()
  for (const r of rows) {
    slots.set(r.key, r.slots)
    const statful = Object.entries(r.stats).some(([k, v]) => (v ?? 0) !== 0 && !PHYSICAL_KEYS.has(k))
    if (statful || r.effects.length > 0) worthy.add(r.key)
  }
  return { worthy, slots }
}

/** Keep `n` when the corpus calls it gear and it has not been kept yet. Split from the loops
 *  below at the measured max-depth ceiling; `rewardKey` folds a name the way the index keys. */
function addGearReward(n: string, worthy: ReadonlySet<string>, seen: Set<string>, names: string[]): void {
  const key = rewardKey(n)
  if (seen.has(key) || !worthy.has(key)) return
  seen.add(key)
  names.push(n.replace(/\*+$/, '').trim())
}

/** The distinct gear items one faction's raising AND home-zone quests reward — the value
 *  question is "is working this faction's area worth it", and a Kerra Island page that forgot
 *  to quote its receipt still pays out on Kerra Island. */
function factionGearRewards(work: FactionWork, worthy: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const q of [...work.raise, ...work.nearby]) {
    for (const n of q.rewards) addGearReward(n, worthy, seen, names)
  }
  return names
}

/** Everything the table states per faction once the filters have spoken. */
export interface RowDerived {
  /** the work, narrowed by the class/slot filters — what the counts and the panel draw */
  work: FactionWork | null
  /** the distinct gear items the narrowed raising quests reward */
  gear: string[]
  /** the narrowed rewards that are ON THE WISHLIST — the loud chip */
  wished: string[]
}

export const NO_DERIVED: RowDerived = { work: null, gear: [], wished: [] }

/** Per faction id → its filtered work, gear rewards and wishlist hits, in one walk. */
export function deriveRows(
  all: readonly FactionRowVm[] | null,
  f: WorkFilters,
  maps: GearMaps,
  wishKeys: ReadonlySet<string>
): Map<number, RowDerived> {
  const m = new Map<number, RowDerived>()
  const q = f.query.trim().toLowerCase()
  for (const row of all ?? []) {
    if (row.work === null) {
      m.set(row.id, NO_DERIVED)
      continue
    }
    // THE USER'S OWN RULE: a search that matched the FACTION NAME shows the whole faction; any
    // other match narrows the panel to the quests that carried it (turn-in, reward, quest name,
    // giver, zone) — so "Pestilence Scythe" expands to exactly the scythe's quest.
    const effective = q !== '' && row.name.toLowerCase().includes(q) ? '' : q
    const work = filterWork(row.work, { ...f, query: effective }, maps.slots)
    m.set(row.id, {
      work,
      gear: factionGearRewards(work, maps.worthy),
      wished: wishedRewards(work, wishKeys)
    })
  }
  return m
}

export interface RowFilters {
  query: string
  /** hide the 0-rows the character has never touched */
  hideUntouched: boolean
  /** hide rows at their own cap (LIVE `toMax <= 0` — the dump's fact plus the log's): done is done */
  hideMaxed: boolean
  /** only factions that GATE a race unlock (`FactionRowVm.unlocks`, the achievements dump) —
   *  settled gates included, because a friend's unlock runs through the same factions */
  unlocksOnly: boolean
  /** …narrowed to gates THIS character has not settled yet (only read while `unlocksOnly`) */
  unlocksPending: boolean
  /** the search reads REWARDS only — the find-the-chain's-final-quest scope */
  rewardsOnly: boolean
}

/** The three sortable columns. Regard sorts the ladder's RANKS, so ties inside one rung stay
 *  grouped and fall back to the name; Standing sorts the live number. */
export type SortKey = 'name' | 'regard' | 'standing'

export interface RowSort {
  key: SortKey
  dir: 'asc' | 'desc'
}

export const DEFAULT_SORT: RowSort = { key: 'standing', dir: 'desc' }

/** One column's natural (ascending) comparison; `visibleRows` applies the direction. */
function compareBy(a: FactionRowVm, b: FactionRowVm, key: SortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name)
  if (key === 'regard') return a.tierRank - b.tierRank || b.standing - a.standing || a.name.localeCompare(b.name)
  return a.standing - b.standing || a.name.localeCompare(b.name)
}

export function visibleRows(rows: readonly FactionRowVm[], f: RowFilters, sort: RowSort): FactionRowVm[] {
  const q = f.query.trim().toLowerCase()
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .filter((r) => {
      // The query searches EVERYTHING the row's work would draw — faction, quest names, givers,
      // zones, turn-in items, rewards (`FactionRowVm.searchText`) — so "Talisman of Kejaar"
      // finds Kerra Isle without anyone knowing which faction owns the quest. A live search also
      // OVERRIDES the hide-toggles: the one faction holding the match may be untouched or maxed,
      // and a search whose only answer is hidden reads as no answer at all.
      const gates = f.unlocksPending ? r.unlocks.filter((u) => !u.done) : r.unlocks
      if (q !== '') {
        const hay = f.rewardsOnly ? r.rewardText : r.searchText
        return hay.includes(q) && !(f.unlocksOnly && gates.length === 0)
      }
      // The unlocks hunt OVERRIDES the hide-toggles too: a race-gating faction is usually
      // untouched, which is exactly what the default view hides — the race-chip reveal's trap.
      if (f.unlocksOnly) return gates.length > 0
      return !(f.hideUntouched && r.standing === 0) && !(f.hideMaxed && r.toMax <= 0)
    })
    .sort((a, b) => sign * compareBy(a, b, sort.key))
}
