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
// (FactionWorkPanel.tsx), with the turn-in items carrying "you have N" from the inventory dump.
//
// THE ROSTER INCLUDES FACTIONS THE CHARACTER HAS NEVER MET (the server's table, not a diary), so
// untouched 0-rows and capped rows hide behind toggles, both ON by default.
//
// THE LIST IS ITS OWN SCROLLER (AGENTS.md UI conventions): the view fills its height and the
// table scrolls in a bounded box rather than growing the page.

import { type JSX, useCallback, useMemo, useState } from 'react'
import {
  Box,
  Chip,
  Collapse,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material'
import HandshakeIcon from '@mui/icons-material/Handshake'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import type { HeldCounts } from '@shared/types'
import type { ZoneShort } from '@shared/maps'
import type { View } from '../../appViews'
import OutputKindLine from '../../components/OutputKindLine'
// The Maps tab's own pin is the zone deep link: write the selection it persists, then switch
// tabs — MapsView reads it on mount, exactly as if the zone had been picked in its selector.
import { onPick, saveZoneSelection } from '../maps/zoneFollow'
import FactionWorkPanel, { type WorkPanelLinks } from './FactionWorkPanel'
import RaceUnlocksPanel from './RaceUnlocksPanel'
import { useFactionData, type FactionRowVm } from './useFactionRows'

interface RowFilters {
  query: string
  /** hide the 0-rows the character has never touched */
  hideUntouched: boolean
  /** hide rows at their own cap (LIVE `toMax <= 0` — the dump's fact plus the log's): done is done */
  hideMaxed: boolean
}

function visibleRows(rows: readonly FactionRowVm[], f: RowFilters): FactionRowVm[] {
  const q = f.query.trim().toLowerCase()
  return rows
    .filter(
      (r) =>
        (q === '' || r.name.toLowerCase().includes(q)) &&
        !(f.hideUntouched && r.standing === 0) &&
        !(f.hideMaxed && r.toMax <= 0)
    )
    .sort((a, b) => b.standing - a.standing || a.name.localeCompare(b.name))
}

/** The work panel's link handlers plus the held counts its turn-in lists draw with. */
interface WorkLinks extends WorkPanelLinks {
  held: HeldCounts
}

/** The hover behind a drifted number: both halves of the correction, and how sure it is. */
function driftTitle(row: FactionRowVm): string {
  const base = `dump said ${String(row.dumpStanding)}; the log moved it ${row.drift > 0 ? '+' : ''}${String(row.drift)} since`
  return row.exact ? base : `${base} (log window did not reach the dump - at least this much)`
}

/**
 * One faction: the standing row, and — expanded — the work panel beneath it. EVERY row expands
 * (a faction with nothing on record answers with that fact rather than refusing the click); the
 * collapsed row's quest count is what says where the work is before anyone clicks.
 */
function FactionRow({
  row,
  expanded,
  onToggle,
  links
}: {
  row: FactionRowVm
  expanded: boolean
  onToggle: () => void
  links: WorkLinks
}): JSX.Element {
  return (
    <>
      <TableRow
        hover
        data-testid={`factions-row-${String(row.id)}`}
        onClick={onToggle}
        sx={{ cursor: 'pointer', '& > td': { borderBottom: expanded ? 'none' : undefined } }}
      >
        <TableCell sx={{ py: 0.5 }}>
          {expanded ? (
            <KeyboardArrowUpIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom', mr: 0.5 }} />
          ) : (
            <KeyboardArrowDownIcon
              sx={{ fontSize: 16, verticalAlign: 'text-bottom', mr: 0.5, opacity: 0.5 }}
            />
          )}
          {row.name}
          {row.raiseCount > 0 && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {row.raiseCount} quest{row.raiseCount === 1 ? '' : 's'}
            </Typography>
          )}
        </TableCell>
        <TableCell sx={{ py: 0.5, width: 130 }}>
          <Chip
            size="small"
            label={row.label}
            sx={{ height: 20, fontSize: 11, color: row.color, borderColor: row.color }}
            variant="outlined"
          />
        </TableCell>
        <TableCell align="right" sx={{ py: 0.5, width: 130, fontVariantNumeric: 'tabular-nums' }}>
          {/* The LIVE number; a row the log moved wears its drift, dump value on the hover. */}
          {row.drift !== 0 && (
            <Typography
              component="span"
              variant="caption"
              title={driftTitle(row)}
              data-testid="factions-drift"
              sx={{ color: row.drift > 0 ? 'success.main' : 'error.main', mr: 0.75 }}
            >
              {row.drift > 0 ? '+' : ''}
              {row.drift}
              {row.exact ? '' : '?'}
            </Typography>
          )}
          {row.standing}
        </TableCell>
        <TableCell sx={{ py: 0.5, width: 180 }}>
          <LinearProgress
            variant="determinate"
            value={row.pct}
            title={`${String(row.standing)} of ${String(row.cap)} (${String(row.toMax)} to max)`}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': { bgcolor: row.color }
            }}
          />
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={4} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ pl: 3 }}>
              <FactionWorkPanel work={row.work} held={links.held} links={links} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

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

/** One filter switch: a small labelled toggle with its own count. */
function FilterSwitch({
  label,
  checked,
  onChange,
  testId
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  testId: string
}): JSX.Element {
  return (
    <FormControlLabel
      control={
        <Switch
          size="small"
          checked={checked}
          onChange={(e) => {
            onChange(e.target.checked)
          }}
          data-testid={testId}
        />
      }
      label={label}
      slotProps={{ typography: { variant: 'caption', color: 'text.secondary' } }}
    />
  )
}

/** The controls row: search, the two hide-toggles, and the shown-of-total count on the far end.
 *  Split out of `FactionsView` at the measured 100-line function ceiling (split, never ratchet). */
function FilterBar({
  query,
  onQuery,
  toggles,
  counts
}: {
  query: string
  onQuery: (q: string) => void
  toggles: {
    hideUntouched: boolean
    onHideUntouched: (on: boolean) => void
    hideMaxed: boolean
    onHideMaxed: (on: boolean) => void
  }
  counts: { untouched: number; maxed: number; shown: number; total: number }
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
      <TextField
        size="small"
        placeholder="Filter factions…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value)
        }}
        slotProps={{ htmlInput: { 'data-testid': 'factions-search' } }}
        sx={{ width: 260 }}
      />
      <FilterSwitch
        label={`Hide untouched (${String(counts.untouched)})`}
        checked={toggles.hideUntouched}
        onChange={toggles.onHideUntouched}
        testId="factions-hide-untouched"
      />
      <FilterSwitch
        label={`Hide maxed (${String(counts.maxed)})`}
        checked={toggles.hideMaxed}
        onChange={toggles.onHideMaxed}
        testId="factions-hide-maxed"
      />
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" color="text.secondary" data-testid="factions-count">
        {counts.shown} of {counts.total}
      </Typography>
    </Stack>
  )
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
  const [expandedId, setExpandedId] = useState<number | null>(null)
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
  const onFind = useCallback((name: string) => {
    setQuery(name)
    setHideUntouched(false)
    setHideMaxed(false)
  }, [])
  const links = useMemo(
    () => ({ onOpenLoot, onOpenMob, onOpenZone, held }),
    [onOpenLoot, onOpenMob, onOpenZone, held]
  )
  const rows = useMemo(
    () => (all === null ? [] : visibleRows(all, { query, hideUntouched, hideMaxed })),
    [all, query, hideUntouched, hideMaxed]
  )
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
          <FilterBar
            query={query}
            onQuery={setQuery}
            toggles={{
              hideUntouched,
              onHideUntouched: setHideUntouched,
              hideMaxed,
              onHideMaxed: setHideMaxed
            }}
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
