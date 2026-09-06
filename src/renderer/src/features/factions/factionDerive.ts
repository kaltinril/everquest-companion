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

export function gearMaps(rows: readonly GearRow[]): GearMaps {
  const worthy = new Set<string>()
  const slots = new Map<string, readonly EquipSlot[]>()
  for (const r of rows) {
    slots.set(r.key, r.slots)
    const statful = Object.values(r.stats).some((v) => (v ?? 0) !== 0)
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
  for (const row of all ?? []) {
    if (row.work === null) {
      m.set(row.id, NO_DERIVED)
      continue
    }
    const work = filterWork(row.work, f, maps.slots)
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
  /** only factions that still GATE a race unlock (`FactionRowVm.unlocks`, the achievements dump) */
  unlocksOnly: boolean
}

export function visibleRows(rows: readonly FactionRowVm[], f: RowFilters): FactionRowVm[] {
  const q = f.query.trim().toLowerCase()
  return rows
    .filter((r) => {
      if (q !== '' && !r.name.toLowerCase().includes(q)) return false
      // The unlocks hunt OVERRIDES the hide-toggles: a race-gating faction is usually untouched,
      // which is exactly what the default view hides — the same trap the race-chip reveal clears.
      if (f.unlocksOnly) return r.unlocks.length > 0
      return !(f.hideUntouched && r.standing === 0) && !(f.hideMaxed && r.toMax <= 0)
    })
    .sort((a, b) => b.standing - a.standing || a.name.localeCompare(b.name))
}
