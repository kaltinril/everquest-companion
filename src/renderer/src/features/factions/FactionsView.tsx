// factions/FactionsView.tsx — THE FACTION STANDINGS TAB (UNRELEASED; the third graduated
// `/outputfile` kind, 2026-09-05).
//
// WHAT THIS TAB IS. The `/outputfile faction` dump, drawn: one row per faction the server tracks,
// each carrying the ABSOLUTE standing the game will state nowhere else — the log's faction lines
// say only better/worse, and `/con` samples one mob at one instant. Main loads the dump at
// session start and follows it for rewrites (session.ts, the inventory/achievements twins), so
// typing the command in game fills this tab with no click anywhere; the store write lands on
// `ProgressState.factionStandings` and `onProgress` is the whole delivery.
//
// TWO READINGS PER ROW, deliberately: the NUMBER (precision — "1815, 185 short of the cap") and
// the /con RUNG (meaning — "kindly"). The rung chip wears the app's one con ladder and palette
// (shared/considerFaction.ts), and the floors it is derived from are ASSUMED community values —
// factionTiers.ts's header carries exactly what is unmeasured and what would settle it.
//
// PROJECT FIRST, ARRANGE SECOND (owner ruling 4). The dump rows are domain data, and the ruling's
// boundary is that a renderer never filters/sorts a domain collection — so the ONE thing done to
// `FactionStanding[]` here is a `.map` into this file's own row model (a projection is what a
// renderer is for; the rule's header says so in those words), and the search box, the untouched
// toggle and the ordering all operate on that view model. No exemption needed, none taken.
//
// THE ROSTER INCLUDES FACTIONS THE CHARACTER HAS NEVER MET (a measured fact of the dump — the
// server's table, not a diary), so the default view hides the untouched 0-rows behind a toggle:
// 185 rows where ~50 have ever moved is a table whose signal is drowned by its own long tail.
// A 0 can also be a real return to neutral; the toggle is a filter, never a claim.
//
// THE LIST IS ITS OWN SCROLLER (AGENTS.md UI conventions): the view fills its height and the
// table scrolls in a bounded box rather than growing the page.

import { type JSX, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Chip,
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
import type { FactionStanding } from '@shared/outputs/factions'
import type { ProgressState } from '@shared/types'
import { CONSIDER_FACTION_COLOR, CONSIDER_FACTION_LABEL } from '@shared/considerFaction'
import OutputKindLine from '../../components/OutputKindLine'
import { factionTier } from './factionTiers'

/** The dump's floor — the far end every bar is measured from (measured cap ±2000, factions.ts). */
const SCALE_FLOOR = -2000

/**
 * ONE ROW AS THIS TAB DRAWS IT — the projection of a `FactionStanding` plus everything the render
 * derives from it once (the rung, its colour, the bar geometry), declared HERE because it is this
 * view's own shape, not the dump's.
 */
interface FactionRowVm {
  id: number
  name: string
  standing: number
  /** `standing + toMax` — the file's own ceiling for THIS faction (today always 2000), so the bar
   *  still tells the truth the day a faction caps elsewhere. */
  cap: number
  toMax: number
  label: string
  color: string
  /** the bar, 0–100 from the scale floor to this faction's cap */
  pct: number
}

function toRowVm(r: FactionStanding): FactionRowVm {
  const tier = factionTier(r.standing)
  const cap = r.standing + r.toMax
  return {
    id: r.id,
    name: r.name,
    standing: r.standing,
    cap,
    toMax: r.toMax,
    label: CONSIDER_FACTION_LABEL[tier],
    color: CONSIDER_FACTION_COLOR[tier],
    pct: Math.max(0, Math.min(100, ((r.standing - SCALE_FLOOR) / (cap - SCALE_FLOOR)) * 100))
  }
}

interface FactionsProgress {
  /** null until the first read lands AND while no dump has ever been loaded for this character */
  rows: FactionRowVm[] | null
  /** when this app last read the dump — `OutputKindLine`'s second slot */
  readAt: number | null
}

/** The standings as persisted, live on the same push every progress consumer rides. */
function useFactionRows(): FactionsProgress {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  useEffect(() => {
    let alive = true
    void window.eq.getProgress().then((p) => {
      if (alive) setProgress(p)
    })
    const off = window.eq.onProgress((p) => {
      setProgress(p)
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  const standings = progress?.factionStandings
  const rows = useMemo(() => (standings === undefined ? null : standings.map(toRowVm)), [standings])
  return { rows, readAt: progress?.factionsSource?.readAt ?? null }
}

/**
 * The rows worth drawing, decided per read: filter first, then sort by standing descending with
 * the name as the tiebreak — the factions you have actually worked are the top of the table, the
 * ones working against you the bottom, and the alphabetical middle stays stable between renders.
 */
function visibleRows(rows: readonly FactionRowVm[], query: string, hideUntouched: boolean): FactionRowVm[] {
  const q = query.trim().toLowerCase()
  return rows
    .filter((r) => (q === '' || r.name.toLowerCase().includes(q)) && !(hideUntouched && r.standing === 0))
    .sort((a, b) => b.standing - a.standing || a.name.localeCompare(b.name))
}

/** One faction's row: name, the rung chip, the number, and the bar from floor to this cap. */
function FactionRow({ row }: { row: FactionRowVm }): JSX.Element {
  return (
    <TableRow hover data-testid={`factions-row-${String(row.id)}`}>
      <TableCell sx={{ py: 0.5 }}>{row.name}</TableCell>
      <TableCell sx={{ py: 0.5, width: 130 }}>
        <Chip
          size="small"
          label={row.label}
          sx={{ height: 20, fontSize: 11, color: row.color, borderColor: row.color }}
          variant="outlined"
        />
      </TableCell>
      <TableCell align="right" sx={{ py: 0.5, width: 90, fontVariantNumeric: 'tabular-nums' }}>
        {row.standing}
      </TableCell>
      <TableCell sx={{ py: 0.5, width: 180 }}>
        {/* The exact arithmetic on hover, the Stamp idiom: coarse on the row, precise one hover away. */}
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
  )
}

/** The never-run state. It names what the tab is FOR; the line above it names the command. */
function NoDump(): JSX.Element {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 6, color: 'text.secondary' }}>
      <HandshakeIcon sx={{ fontSize: 44, opacity: 0.6 }} />
      <Typography variant="body2" data-testid="factions-empty" sx={{ maxWidth: 460, textAlign: 'center' }}>
        Type <code>/outputfile faction</code> in game and this becomes your real standing with
        every faction the server tracks - the number the better/worse lines never say. The app
        notices the file by itself; re-type the command any time to refresh.
      </Typography>
    </Stack>
  )
}

export default function FactionsView(): JSX.Element {
  const { rows: all, readAt } = useFactionRows()
  const [query, setQuery] = useState('')
  const [hideUntouched, setHideUntouched] = useState(true)
  const rows = useMemo(
    () => (all === null ? [] : visibleRows(all, query, hideUntouched)),
    [all, query, hideUntouched]
  )
  const untouched = useMemo(() => (all ?? []).filter((r) => r.standing === 0).length, [all])
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
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
            <TextField
              size="small"
              placeholder="Filter factions…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
              slotProps={{ htmlInput: { 'data-testid': 'factions-search' } }}
              sx={{ width: 260 }}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={hideUntouched}
                  onChange={(e) => {
                    setHideUntouched(e.target.checked)
                  }}
                  data-testid="factions-hide-untouched"
                />
              }
              label={`Hide untouched (${String(untouched)})`}
              slotProps={{ typography: { variant: 'caption', color: 'text.secondary' } }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" color="text.secondary" data-testid="factions-count">
              {rows.length} of {all.length}
            </Typography>
          </Stack>
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
                  <FactionRow key={row.id} row={row} />
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
