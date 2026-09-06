// factions/FactionsView.tsx — THE FACTION STANDINGS TAB (UNRELEASED; the third graduated
// `/outputfile` kind, 2026-09-05).
//
// WHAT THIS TAB IS. The `/outputfile faction` dump, drawn LIVE: one row per faction the server
// tracks, the dump's absolute number corrected by the log's own receipts since the file was
// written (`adjusted by N` sums on; a "could not possibly get any better/worse" line PINS the
// value at the cap whatever a stale file said — useFactionRows.ts / shared/factionLog.ts). A row
// that moved since the dump wears its drift beside the number, with the dump's own value one
// hover away.
//
// Race unlocks head the tab because the server defines them AS faction work ("Get maximum
// faction with …" — RaceUnlocksPanel.tsx); each faction row expands into the quests that move it
// (FactionWorkPanel.tsx), turn-in items carrying "you have N", gear rewards counted per row, and
// wishlist hits shouted (factionDerive.ts). The class and reward-slot filters narrow the WORK
// (factionFilters.ts); the search and hide-toggles narrow the ROWS.
//
// THE FILE IS A SHELL AT THE MEASURED CEILINGS: the row is FactionRow.tsx, the controls are
// FactionControls.tsx, the derivations are factionDerive.ts/factionFilters.ts — split, never
// ratcheted.
//
// THE LIST IS ITS OWN SCROLLER (AGENTS.md UI conventions): the view fills its height and the
// table scrolls in a bounded box rather than growing the page.

import { type JSX, useCallback, useMemo, useState } from 'react'
import { Box, Stack, Table, TableBody, Typography } from '@mui/material'
import HandshakeIcon from '@mui/icons-material/Handshake'
import type { ClassAbbr } from '@shared/classCombo'
import type { ZoneShort } from '@shared/maps'
import type { View } from '../../appViews'
import OutputKindLine from '../../components/OutputKindLine'
// The Maps tab's own pin is the zone deep link: write the selection it persists, then switch
// tabs — MapsView reads it on mount, exactly as if the zone had been picked in its selector.
import { onPick, saveZoneSelection } from '../maps/zoneFollow'
import { useGearIndex } from '../gear/gearData'
// THE LOUD WISHLIST JOIN: a faction whose quests reward something you have DECIDED you want is
// the most valuable row on the table, and it says so before anyone expands anything.
import { useWishlist } from '../wishlist/useWishlist'
import { FactionTableHead, FilterBar, WorkFilterControls } from './FactionControls'
import FactionRow, { type WorkLinks } from './FactionRow'
import RaceUnlocksPanel from './RaceUnlocksPanel'
import {
  DEFAULT_SORT,
  NO_DERIVED,
  deriveRows,
  gearMaps,
  visibleRows,
  type RowDerived,
  type RowFilters,
  type RowSort,
  type SortKey
} from './factionDerive'
import { filtersActive, type SlotFilter, type WorkFilters } from './factionFilters'
import { useFactionData } from './useFactionRows'

/** The never-run state. It names what the tab is FOR; the line above it names the command. */
function NoDump(): JSX.Element {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 6, color: 'text.secondary' }}>
      <HandshakeIcon sx={{ fontSize: 44, opacity: 0.6 }} />
      <Typography variant="body2" data-testid="factions-empty" sx={{ maxWidth: 460, textAlign: 'center' }}>
        Type <code>/outputfile faction</code> in game and this becomes your real standing with
        every faction the server tracks - the number the adjustment lines never total up. The app
        notices the file by itself; re-type the command any time to refresh.
      </Typography>
    </Stack>
  )
}

/** The row-filter STATE — the search, the three toggles, and the race-chip reveal — as one hook,
 *  split out of `FactionsView` at the 100-line function ceiling. */
function useRowFilterState(): {
  rowFilters: RowFilters
  onQuery: (q: string) => void
  toggles: Parameters<typeof FilterBar>[0]['toggles']
  /** the race-chip reveal: search for the faction and clear the hide-toggles that would bury it */
  reveal: (name: string) => void
} {
  const [query, setQuery] = useState('')
  const [hideUntouched, setHideUntouched] = useState(true)
  const [hideMaxed, setHideMaxed] = useState(true)
  const [unlocksOnly, setUnlocksOnly] = useState(false)
  // A race chip's click REVEALS its faction row: the search finds it, and both hide-toggles come
  // off — a race's missing faction is usually untouched, which is exactly what the default view
  // hides, and a reveal that landed on an empty table would read as a broken link.
  const reveal = useCallback((name: string) => {
    setQuery(name)
    setHideUntouched(false)
    setHideMaxed(false)
  }, [])
  return {
    rowFilters: { query, hideUntouched, hideMaxed, unlocksOnly },
    onQuery: setQuery,
    toggles: {
      hideUntouched,
      onHideUntouched: setHideUntouched,
      hideMaxed,
      onHideMaxed: setHideMaxed,
      unlocksOnly,
      onUnlocksOnly: setUnlocksOnly
    },
    reveal
  }
}

/** The table's rows once every filter has spoken — split out at the 100-line function ceiling. */
function useTableRows(
  all: ReturnType<typeof useFactionData>['rows'],
  filters: { rows: RowFilters; sort: RowSort; work: WorkFilters },
  derivedById: ReadonlyMap<number, RowDerived>
): ReturnType<typeof visibleRows> {
  const { rows: rowFilters, sort, work: workFilters } = filters
  return useMemo(() => {
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
}

/** A repeat click flips the direction; a new column starts at its natural reading — names
 *  ascending, everything numeric biggest-first. */
function nextSort(s: RowSort, key: SortKey): RowSort {
  if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'name' ? 'asc' : 'desc' }
}

export default function FactionsView({
  onOpenLoot,
  onOpenMob,
  onSelectView
}: {
  onOpenLoot?: (item?: string) => void
  onOpenMob?: (t: { mob: string }) => void
  /** the app's MANUAL navigator — how a zone link becomes the Maps tab */
  onSelectView?: (v: View) => void
}): JSX.Element {
  const { rows: all, readAt, held, raceUnlocks } = useFactionData()
  const { rowFilters, onQuery, toggles, reveal } = useRowFilterState()
  const [classSel, setClassSel] = useState<ClassAbbr[]>([])
  const [slot, setSlot] = useState<SlotFilter>('ANY')
  const [sort, setSort] = useState<RowSort>(DEFAULT_SORT)
  const [expandedId, setExpandedId] = useState<number | null>(null)
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
    () => ({ classes: classSel, slot, query: rowFilters.query }),
    [classSel, slot, rowFilters.query]
  )
  const derivedById = useMemo(
    () => deriveRows(all, workFilters, maps, wishKeys),
    [all, workFilters, maps, wishKeys]
  )
  const rows = useTableRows(all, { rows: rowFilters, sort, work: workFilters }, derivedById)
  const untouched = useMemo(() => (all ?? []).filter((r) => r.standing === 0).length, [all])
  const maxed = useMemo(() => (all ?? []).filter((r) => r.toMax <= 0).length, [all])
  const unlockers = useMemo(() => (all ?? []).filter((r) => r.unlocks.length > 0).length, [all])
  return (
    <Box
      data-testid="factions-view"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}
    >
      <OutputKindLine kind="faction" loadedAt={readAt} testId="factions-freshness" />
      {all === null ? (
        <NoDump />
      ) : (
        <>
          <RaceUnlocksPanel races={raceUnlocks} rows={all} onFind={reveal} />
          <WorkFilterControls classes={classSel} onClasses={setClassSel} slot={slot} onSlot={setSlot} />
          <FilterBar
            query={rowFilters.query}
            onQuery={onQuery}
            toggles={toggles}
            counts={{ untouched, maxed, unlockers, shown: rows.length, total: all.length }}
          />
          <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
            <Table size="small" stickyHeader data-testid="factions-table">
              <FactionTableHead sort={sort} onSort={onSort} />
              <TableBody>
                {rows.map((row) => (
                  <FactionRow
                    key={row.id}
                    row={row}
                    derived={derivedById.get(row.id) ?? NO_DERIVED}
                    expanded={expandedId === row.id}
                    onToggle={() => {
                      setExpandedId((cur) => (cur === row.id ? null : row.id))
                    }}
                    links={links}
                  />
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 && (
              <Typography
                variant="body2"
                color="text.secondary"
                data-testid="factions-no-match"
                sx={{ py: 4, textAlign: 'center' }}
              >
                No faction matches that.
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
