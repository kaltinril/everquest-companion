// factions/useFactionsController.ts — ALL of the Factions tab's state and derivation, as one
// hook: the row filters and their reveal, the work filters, the sort, the multi-expand set, the
// zone deep link, and every join (gear worthiness, wishlist keys, per-row derived work). Split
// out of FactionsView.tsx at the measured ceilings (the view is a render shell now) — and split
// as a CONTROLLER rather than five hooks because these pieces move together: a filter change
// re-derives the rows, a derive feeds the counts, the counts feed the bar.

import { useCallback, useMemo, useState } from 'react'
import type { ClassAbbr } from '@shared/classCombo'
import type { ZoneShort } from '@shared/maps'
import type { View } from '../../appViews'
// The Maps tab's own pin is the zone deep link: write the selection it persists, then switch
// tabs — MapsView reads it on mount, exactly as if the zone had been picked in its selector.
import { onPick, saveZoneSelection } from '../maps/zoneFollow'
import { useGearIndex } from '../gear/gearData'
// THE LOUD WISHLIST JOIN: a faction whose quests reward something you have DECIDED you want is
// the most valuable row on the table, and it says so before anyone expands anything.
import { useWishlist } from '../wishlist/useWishlist'
// Value imports used only under `typeof` — the controller returns exactly the prop bundles these
// components take, so their signatures are the one source of the shapes.
import { FilterBar, WorkFilterControls } from './FactionControls'
import type { WorkLinks } from './FactionRow'
import {
  DEFAULT_SORT,
  deriveRows,
  gearMaps,
  visibleRows,
  type RowDerived,
  type RowFilters,
  type RowSort,
  type SortKey
} from './factionDerive'
import { filtersActive, type SlotFilter, type WorkFilters } from './factionFilters'
import { useFactionData, type FactionRowVm } from './useFactionRows'

/** The set with one member toggled — a fresh Set, because React compares by identity. */
function toggledSet(s: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(s)
  if (!next.delete(id)) next.add(id)
  return next
}

/** A repeat click flips the direction; a new column starts at its natural reading — names
 *  ascending, everything numeric biggest-first. */
function nextSort(s: RowSort, key: SortKey): RowSort {
  if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'name' ? 'asc' : 'desc' }
}

/** The row-filter STATE — the search, the toggles, and the race-chip reveal. */
function useRowFilterState(): {
  rowFilters: RowFilters
  onQuery: (q: string) => void
  toggles: Parameters<typeof FilterBar>[0]['toggles']
  reveal: (name: string) => void
} {
  const [query, setQuery] = useState('')
  const [hideUntouched, setHideUntouched] = useState(true)
  const [hideMaxed, setHideMaxed] = useState(true)
  const [unlocksOnly, setUnlocksOnly] = useState(false)
  const [unlocksPending, setUnlocksPending] = useState(false)
  const [races, setRaces] = useState<string[]>([])
  const [rewardsOnly, setRewardsOnly] = useState(false)
  // A race chip's click REVEALS its faction row: the search finds it, and both hide-toggles come
  // off — a race's missing faction is usually untouched, which is exactly what the default view
  // hides, and a reveal that landed on an empty table would read as a broken link.
  const reveal = useCallback((name: string) => {
    setQuery(name)
    setHideUntouched(false)
    setHideMaxed(false)
  }, [])
  return {
    rowFilters: { query, hideUntouched, hideMaxed, unlocksOnly, unlocksPending, races, rewardsOnly },
    onQuery: setQuery,
    toggles: {
      hideUntouched,
      onHideUntouched: setHideUntouched,
      hideMaxed,
      onHideMaxed: setHideMaxed,
      unlocksOnly,
      onUnlocksOnly: setUnlocksOnly,
      unlocksPending,
      onUnlocksPending: setUnlocksPending,
      races,
      onRaces: setRaces,
      rewardsOnly,
      onRewardsOnly: setRewardsOnly
    },
    reveal
  }
}

/** What the app hands the tab: the three drill-down openers the links reach. */
export interface FactionsViewProps {
  onOpenLoot?: (item?: string) => void
  onOpenMob?: (t: { mob: string }) => void
  /** the app's MANUAL navigator — how a zone link becomes the Maps tab */
  onSelectView?: (v: View) => void
}

/** Everything the render shell draws, in the shapes its children take. */
export interface FactionsController {
  all: FactionRowVm[] | null
  readAt: number | null
  raceUnlocks: ReturnType<typeof useFactionData>['raceUnlocks']
  reveal: (name: string) => void
  work: Parameters<typeof WorkFilterControls>[0]
  bar: Parameters<typeof FilterBar>[0]
  head: { sort: RowSort; onSort: (key: SortKey) => void }
  rows: FactionRowVm[]
  derivedById: ReadonlyMap<number, RowDerived>
  links: WorkLinks
  expanded: ReadonlySet<number>
  toggleRow: (id: number) => void
}

export function useFactionsController(props: FactionsViewProps): FactionsController {
  const { onOpenLoot, onOpenMob, onSelectView } = props
  const { rows: all, readAt, held, raceUnlocks } = useFactionData()
  const { rowFilters, onQuery, toggles, reveal } = useRowFilterState()
  const [classSel, setClassSel] = useState<ClassAbbr[]>([])
  const [slot, setSlot] = useState<SlotFilter>('ANY')
  const [coinOnly, setCoinOnly] = useState(false)
  const [sort, setSort] = useState<RowSort>(DEFAULT_SORT)
  // A SET, not a single id: comparing two factions' work side by side is the ordinary reading
  // posture, and an accordion that closes one panel to open another forbids it.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const toggleRow = useCallback((id: number) => {
    setExpanded((cur) => toggledSet(cur, id))
  }, [])
  const onCollapseAll = useCallback(() => {
    setExpanded(new Set())
  }, [])
  const onSort = useCallback((key: SortKey) => {
    setSort((s) => nextSort(s, key))
  }, [])
  const onOpenZone = useCallback(
    (stem: ZoneShort) => {
      saveZoneSelection(onPick(stem))
      onSelectView?.('maps')
    },
    [onSelectView]
  )
  const gearIndex = useGearIndex()
  const wishlist = useWishlist()
  const wishKeys = useMemo(
    () => new Set(wishlist.list.entries.map((e) => e.itemKey)),
    [wishlist.list.entries]
  )
  const links: WorkLinks = useMemo(
    () => ({ onOpenLoot, onOpenMob, onOpenZone, held, wished: wishKeys }),
    [onOpenLoot, onOpenMob, onOpenZone, held, wishKeys]
  )
  const maps = useMemo(() => gearMaps(gearIndex.rows), [gearIndex.rows])
  const workFilters = useMemo<WorkFilters>(
    () => ({ classes: classSel, slot, coinOnly, query: rowFilters.query, rewardsOnly: rowFilters.rewardsOnly }),
    [classSel, slot, coinOnly, rowFilters.query, rowFilters.rewardsOnly]
  )
  const derivedById = useMemo(
    () => deriveRows(all, workFilters, maps, wishKeys),
    [all, workFilters, maps, wishKeys]
  )
  const rows = useMemo(() => {
    if (all === null) return []
    const base = visibleRows(all, rowFilters, sort)
    // A narrowing filter is a reward hunt: a faction with no matching quest — attributed OR
    // home-zone — is not an answer to it, however interesting its standing is.
    if (!filtersActive(workFilters)) return base
    return base.filter((r) => {
      const w = derivedById.get(r.id)?.work
      return (w?.raise.length ?? 0) > 0 || (w?.nearby.length ?? 0) > 0
    })
  }, [all, rowFilters, sort, workFilters, derivedById])
  // The race picker's closed list IS the dump's race list, in the dump's own order — the same
  // names the row chips wear, so a pick and a chip agree by plain equality.
  const raceOptions = useMemo(() => (raceUnlocks ?? []).map((c) => c.race), [raceUnlocks])
  const counts = useMemo(
    () => ({
      untouched: (all ?? []).filter((r) => r.standing === 0).length,
      maxed: (all ?? []).filter((r) => r.toMax <= 0).length,
      unlockers: (all ?? []).filter((r) => r.unlocks.length > 0).length,
      shown: rows.length,
      total: all?.length ?? 0
    }),
    [all, rows]
  )
  return {
    all,
    readAt,
    raceUnlocks,
    reveal,
    work: { classes: classSel, onClasses: setClassSel, slot, onSlot: setSlot, coinOnly, onCoinOnly: setCoinOnly },
    bar: {
      query: rowFilters.query,
      onQuery,
      toggles,
      counts,
      unlocksKnown: raceUnlocks !== undefined,
      raceOptions,
      expandedCount: expanded.size,
      onCollapseAll
    },
    head: { sort, onSort },
    rows,
    derivedById,
    links,
    expanded,
    toggleRow
  }
}
