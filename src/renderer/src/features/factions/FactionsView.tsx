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
import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
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
import { FilterBar, WorkFilterControls } from './FactionControls'
import FactionRow, { type WorkLinks } from './FactionRow'
import RaceUnlocksPanel from './RaceUnlocksPanel'
import { NO_DERIVED, deriveRows, gearMaps, visibleRows, type RowDerived, type RowFilters } from './factionDerive'
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

/** The two row-level actions, split out of `FactionsView` at the 100-line function ceiling. */
function useRowActions(deps: {
  onSelectView?: (v: View) => void
  setQuery: (q: string) => void
  setHideUntouched: (on: boolean) => void
  setHideMaxed: (on: boolean) => void
}): { onOpenZone: (stem: ZoneShort) => void; onFind: (name: string) => void } {
  const { onSelectView, setQuery, setHideUntouched, setHideMaxed } = deps
  const onOpenZone = useCallback(
    (stem: ZoneShort) => {
      saveZoneSelection(onPick(stem))
      onSelectView?.('maps')
    },
    [onSelectView]
  )
  // A race chip's click REVEALS its faction row: the search finds it, and both hide-toggles come
  // off — a race's missing faction is usually untouched, which is exactly what the default view
  // hides, and a reveal that landed on an empty table would read as a broken link.
  const onFind = useCallback(
    (name: string) => {
      setQuery(name)
      setHideUntouched(false)
      setHideMaxed(false)
    },
    [setQuery, setHideUntouched, setHideMaxed]
  )
  return { onOpenZone, onFind }
}

/** The table's rows once every filter has spoken — split out at the 100-line function ceiling. */
function useTableRows(
  all: ReturnType<typeof useFactionData>['rows'],
  rowFilters: RowFilters,
  workFilters: WorkFilters,
  derivedById: ReadonlyMap<number, RowDerived>
): ReturnType<typeof visibleRows> {
  return useMemo(() => {
    if (all === null) return []
    const base = visibleRows(all, rowFilters)
    // A narrowing filter is a reward hunt: a faction with no matching quest — attributed OR
    // home-zone — is not an answer to it, however interesting its standing is.
    if (!filtersActive(workFilters)) return base
    return base.filter((r) => {
      const w = derivedById.get(r.id)?.work
      return (w?.raise.length ?? 0) > 0 || (w?.nearby.length ?? 0) > 0
    })
  }, [all, rowFilters, workFilters, derivedById])
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
  const [query, setQuery] = useState('')
  const [hideUntouched, setHideUntouched] = useState(true)
  const [hideMaxed, setHideMaxed] = useState(true)
  const [classSel, setClassSel] = useState<ClassAbbr[]>([])
  const [slot, setSlot] = useState<SlotFilter>('ANY')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const { onOpenZone, onFind } = useRowActions({ onSelectView, setQuery, setHideUntouched, setHideMaxed })
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
  const workFilters = useMemo<WorkFilters>(() => ({ classes: classSel, slot }), [classSel, slot])
  const derivedById = useMemo(
    () => deriveRows(all, workFilters, maps, wishKeys),
    [all, workFilters, maps, wishKeys]
  )
  const rows = useTableRows(all, { query, hideUntouched, hideMaxed }, workFilters, derivedById)
  const untouched = useMemo(() => (all ?? []).filter((r) => r.standing === 0).length, [all])
  const maxed = useMemo(() => (all ?? []).filter((r) => r.toMax <= 0).length, [all])
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
          <RaceUnlocksPanel races={raceUnlocks} rows={all} onFind={onFind} />
          <WorkFilterControls classes={classSel} onClasses={setClassSel} slot={slot} onSlot={setSlot} />
          <FilterBar
            query={query}
            onQuery={setQuery}
            toggles={{ hideUntouched, onHideUntouched: setHideUntouched, hideMaxed, onHideMaxed: setHideMaxed }}
            counts={{ untouched, maxed, shown: rows.length, total: all.length }}
          />
          <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
            <Table size="small" stickyHeader data-testid="factions-table">
              <TableHead>
                <TableRow>
                  <TableCell>Faction</TableCell>
                  <TableCell>Regard</TableCell>
                  <TableCell align="right">Standing</TableCell>
                  <TableCell>Toward max</TableCell>
                </TableRow>
              </TableHead>
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
