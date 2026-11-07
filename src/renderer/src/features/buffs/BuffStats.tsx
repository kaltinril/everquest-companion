// BuffStats — the per-class DURATIONS tables, their search box, and the allow-list box on every
// row. Split out of BuffsView.tsx when JOS-168 added the last two: that file is at the repo's
// 400-code-line factoring ceiling and the house answer is a split, never a widened threshold.
//
// Nothing about the tables themselves changed in the move — the estimate cell, its provenance chip
// and the "everything unstated renders as a dash" rule are the same code they were in BuffsView.
//
// WHAT IS NEW IS THE SEARCH, AND WHY IT IS HERE (owner ask 2026-08-16): these tables are every
// spell this character's log has ever mined, which makes them the only complete list of "spells I
// could tick". In opt-in mode a player needs to allow a buff that is not currently up — there is no
// card to press — so the search is how they find it and the row's own box is how they check it. It
// replaces the earlier search-to-ADD design entirely: no suggestion flow, no wiki source, no second
// namespace. A spell the log has never seen has no row, and the answer for it is to cast it once
// and check it on the card.
//
// PLAIN SUBSTRING, CASE-INSENSITIVE, ACROSS EVERY CLASS. Not `spellSearch`'s token machinery: this
// is a filter over ~200 names the reader is already looking at, and the ticket says so explicitly.
// The input echoes instantly and the FILTER rides `useDeferredValue` (AGENTS.md's search rule).
//
// WINDOWED, IN A FIXED-HEIGHT BOX PER CLASS (the 2026-11-06 renderer pass; whole-app review #5).
// Every spell the log ever mined is a row of seven cells, a chip, a button and (in opt-in mode) a
// checkbox, and all of them mounted at once — 300 to 1,200 MUI nodes per visit on the owner's log.
// Each class's table now scrolls inside its own box (AGENTS.md: a growing list lives in a
// fixed-height scroll box) and mounts only the rows under the viewport (useWindowedRows, the
// Loot ledger's pattern: fixed row height, spacer rows). The two per-row tooltips became native
// `title`s, the repo's rule for a dense table cell (JOS-143): a popper per cell was most of the
// cost and the cell is not a card.

import type { JSX } from 'react'
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import EditIcon from '@mui/icons-material/EditOutlined'
import type { BuffClass, BuffStat } from '@shared/types'
import type { BuffDurationOverride } from '@shared/buffTrust'
import { buffStatRows, type KeyedBuffStat } from '@shared/buffStatRows'
import { fmtDuration, classAccent, estimateChipLabel, estimatePrefix, estimatorSourceTitle } from './format'
import { BuffDurationDialog } from './BuffDurationDialog'
import { BuffAllowCheck } from './BuffAllowCheck'
import { useBuffAllow } from './useBuffAllow'
import { useWindowedRows, type WindowedRows } from '../../lib/useWindowedRows'
import { characterEpoch, heldNow, holdFor, type Held } from '../../lib/characterEpoch'

/** Every durations row is this tall (the windowing hook is fixed-height): the small edit button
 *  (18 px) is the tallest thing on it, with the cell's padding. */
const STAT_ROW_HEIGHT = 34
/** How tall one class's scroll box may grow before it scrolls: about fourteen rows. */
const SECTION_MAX_HEIGHT = 480

// Stats-table sections: buffs first, then debuffs (Task #35 — a spell property).
const CLASS_ORDER: BuffClass[] = ['buff', 'debuff']
const CLASS_LABEL: Record<BuffClass, string> = { buff: 'Buffs', debuff: 'Debuffs' }

/**
 * The estimate the app uses (JOS-117): max(DB floor, recent observed max). The source names which
 * WON — 'db' when the DB floor held, 'observed' when a logged cast beat it, since JOS-212
 * 'cluster' when three agreeing clean cycles overruled a floor that was too long, and since
 * JOS-379 'deathBound' when the only evidence is a mob that died still carrying the spell. Every
 * learned source shows a "log" chip (the DB is the baseline, the log is what makes it accurate)
 * and they are told apart by the tooltip; a bound also wears a `≥` on the figure, because it is a
 * floor under the duration rather than the duration. Falls back to median for older deltas without
 * the field.
 */
function rowEstimate(s: BuffStat): { ms?: number | null; src?: string } {
  const ms = s.estimateMs ?? s.dbDurationMs ?? s.medianMs
  const src =
    s.estimatorSource ?? (s.dbDurationMs != null ? 'db' : s.medianMs != null ? 'observed' : undefined)
  return { ms, src }
}

/** The estimate cell: the figure plus a chip naming where it came from. A native `title` (the
 *  dense-cell rule, file header) says which source won, exactly as the popper used to. */
function EstimateCell({ ms, src }: { ms?: number | null; src?: string }): JSX.Element {
  if (ms == null) return <>-</>
  return (
    <span title={estimatorSourceTitle(src)}>
      {/* A DEATH BOUND IS A FLOOR, AND THE CELL SAYS SO (JOS-379): `≥ 3m 08s`, never a bare
          figure that reads as a measurement. See format.ts `estimatePrefix`. */}
      {estimatePrefix(src)}
      {fmtDuration(ms)}
      {src ? (
        <Chip
          size="small"
          label={estimateChipLabel(src)}
          variant="outlined"
          sx={{ ml: 0.5, height: 15, fontSize: 9, '& .MuiChip-label': { px: 0.4 } }}
        />
      ) : null}
    </span>
  )
}

/** Opens the duration dialog for one line (fork issue #4). */
type OnEdit = (key: string) => void

/** The row's fixed geometry (file header): one line, no wrapping, the hook's row height. */
const ROW_SX = { height: STAT_ROW_HEIGHT, '& td': { py: 0, whiteSpace: 'nowrap' } } as const

/** One stats row. Everything not stated by a source renders as '—', never as a zero. Memoized on
 *  its stat object: the snapshot rebuilds only the rows that moved, and a search or a scroll
 *  must not redraw every row it keeps. */
const StatsRow = memo(function StatsRow({ k, s, withBoxes, onEdit }: { k: string; s: BuffStat; withBoxes: boolean; onEdit: OnEdit }): JSX.Element {
  const est = rowEstimate(s)
  return (
    <TableRow hover data-testid="buff-stats-row" data-spell={s.spell} sx={ROW_SX}>
      {/* THE SECOND PLACE TO CHECK A SPELL (JOS-168) — the same box the active card carries, on
          every mined line, which is what makes a buff that is not currently up reachable. The
          COLUMN exists only in opt-in mode (owner ruling 2026-08-17): off means no boxes anywhere,
          and an empty column would be a box-shaped hole. */}
      {withBoxes ? (
        <TableCell padding="checkbox">
          <BuffAllowCheck spell={s.spell} dense />
        </TableCell>
      ) : null}
      <TableCell>{s.spell}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <EstimateCell ms={est.ms} src={est.src} />
        <IconButton
          size="small"
          aria-label={`Change ${s.spell} duration`}
          data-testid="buff-duration-edit"
          onClick={() => {
            onEdit(k)
          }}
          sx={{ ml: 0.25, p: 0.25 }}
        >
          <EditIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </TableCell>
      <TableCell align="right">
        {s.n === 0 ? (
          <span style={{ opacity: 0.5 }} title="No cast→fade pair yet">
            0
          </span>
        ) : (
          s.n
        )}
      </TableCell>
      <TableCell align="right">{fmtDuration(s.medianMs)}</TableCell>
      <TableCell align="right" style={{ opacity: 0.8 }}>
        {s.p25 != null && s.p75 != null ? `${fmtDuration(s.p25)} - ${fmtDuration(s.p75)}` : '-'}
      </TableCell>
      <TableCell align="right" style={{ opacity: 0.65 }}>
        {s.minMs != null && s.maxMs != null ? `${fmtDuration(s.minMs)} - ${fmtDuration(s.maxMs)}` : '-'}
      </TableCell>
    </TableRow>
  )
})

/** The spacer rows that reserve the windowed rows' height (useWindowedRows; LootTables' PadRow). */
function PadRow({ height, colSpan }: { height: number; colSpan: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={colSpan} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

/** The dense per-spell stats table for ONE class, sorted by sample count; `win` is its slice. */
function StatsTable({ rows, withBoxes, onEdit, win }: { rows: KeyedBuffStat[]; withBoxes: boolean; onEdit: OnEdit; win: WindowedRows }): JSX.Element {
  const colSpan = withBoxes ? 7 : 6
  return (
    <Table size="small" stickyHeader sx={{ '& th': { py: 0.5 } }}>
      <TableHead>
        <TableRow>
          {withBoxes ? <TableCell padding="checkbox">on</TableCell> : null}
          <TableCell>Spell</TableCell>
          <TableCell align="right">estimate</TableCell>
          <TableCell align="right">n</TableCell>
          <TableCell align="right">median</TableCell>
          <TableCell align="right">IQR (p25-p75)</TableCell>
          <TableCell align="right">min-max</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <PadRow height={win.topPad} colSpan={colSpan} />
        {rows.slice(win.start, win.end).map(({ key, s }) => (
          <StatsRow key={key} k={key} s={s} withBoxes={withBoxes} onEdit={onEdit} />
        ))}
        <PadRow height={win.bottomPad} colSpan={colSpan} />
      </TableBody>
    </Table>
  )
}

/** One class's durations table, under its accent swatch, in its own scroll box (file header). The
 *  windowing hook lives beside the box it measures (LootView's JOS-260 shape). */
function StatsSection({
  cls,
  rows,
  withBoxes,
  onEdit
}: {
  cls: BuffClass
  rows: KeyedBuffStat[]
  withBoxes: boolean
  onEdit: OnEdit
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: rows.length, rowHeight: STAT_ROW_HEIGHT, scrollRef })
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: classAccent(cls) }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {CLASS_LABEL[cls]}
        </Typography>
      </Stack>
      <Paper
        ref={scrollRef}
        variant="outlined"
        data-testid="buff-stats-scroll"
        sx={{ maxHeight: SECTION_MAX_HEIGHT, overflow: 'auto', borderLeft: '3px solid', borderLeftColor: classAccent(cls) }}
      >
        <StatsTable rows={rows} withBoxes={withBoxes} onEdit={onEdit} win={win} />
      </Paper>
    </Box>
  )
}

/** The duration choices this window read for its character (lib/characterEpoch.ts), so a
 *  revisit paints with them instead of asking main again and rendering twice. */
let heldDurations: Held<Record<string, BuffDurationOverride>> | null = null

/**
 * The player's per-spell duration choices (fork issue #4): read once per character, and replaced
 * by what main stored after every save. Saves go through `setBuffDuration`, which merges on main.
 */
function useBuffDurations(): {
  durations: Record<string, BuffDurationOverride>
  setDuration: (key: string, choice: BuffDurationOverride | undefined) => void
} {
  const [durations, setDurations] = useState<Record<string, BuffDurationOverride>>(
    () => heldNow(heldDurations) ?? {}
  )
  useEffect(() => {
    if (heldNow(heldDurations) !== undefined) return
    const asked = characterEpoch()
    void window.eq.getBuffTrust().then((p) => {
      heldDurations = holdFor(asked, p.durations)
      setDurations(p.durations)
    })
  }, [])
  const setDuration = useCallback((key: string, choice: BuffDurationOverride | undefined) => {
    void window.eq.setBuffDuration(key, choice).then((p) => {
      heldDurations = holdFor(characterEpoch(), p.durations)
      setDurations(p.durations)
    })
  }, [])
  return { durations, setDuration }
}

/**
 * The whole Durations block: the search field, then one table per class that still has a row.
 *
 * A class with no MATCH disappears rather than printing its own empty state, so a search reads as
 * one list narrowing rather than as two tables arguing about it; the one empty state below says
 * which of the two situations you are in — nothing mined yet, or nothing matching.
 *
 * MEMOIZED (perf audit, 2026-10-20). BuffsView ticks a clock every second for the active cards'
 * countdowns, and every tick used to re-render this block too: a table row, an estimate tooltip
 * and a chip for every spell the log has ever mined (~120 rows, ~1,600 elements on the owner's
 * log), every second the tab is open, for a `stats` that had not changed. Its one prop is the
 * buffs snapshot's own `stats` object, so it re-renders when the snapshot does and not on a tick;
 * the search box and the allow-mode subscription are its own state and update it as before.
 */
export const BuffStats = memo(function BuffStats({ stats }: { stats: Record<string, BuffStat> }): JSX.Element {
  const [query, setQuery] = useState('')
  // The input echoes instantly; the FILTER is deferred (AGENTS.md's search rule).
  const needle = useDeferredValue(query).trim().toLowerCase()
  const sections = useMemo(
    () => CLASS_ORDER.map((cls) => ({ cls, rows: buffStatRows(stats, cls, needle) })).filter((s) => s.rows.length > 0),
    [stats, needle]
  )
  const mined = useMemo(() => Object.keys(stats).length > 0, [stats])
  // The boxes and their column exist only in opt-in mode; the search stays in both, because the
  // tables are worth searching whether or not you are ticking them.
  const withBoxes = useBuffAllow(window.eq).prefs.optIn
  const { durations, setDuration } = useBuffDurations()
  const [editing, setEditing] = useState<string | null>(null)
  const editStat = editing === null ? undefined : stats[editing]

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Durations</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <TextField
          size="small"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          placeholder="Search spells"
          data-testid="buff-stats-search"
          // NO TOOLTIP ON AN INPUT THE USER TYPES INTO (AGENTS.md's tooltip diet) — the
          // placeholder is the label and the magnifier is the affordance.
          slotProps={{
            htmlInput: { 'aria-label': 'Search spells' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }
          }}
          sx={{ width: 240 }}
        />
      </Stack>
      {sections.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {mined && needle !== '' ? `No spells match "${query.trim()}".` : 'No buff durations yet.'}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {sections.map((s) => (
            <StatsSection key={s.cls} cls={s.cls} rows={s.rows} withBoxes={withBoxes} onEdit={setEditing} />
          ))}
        </Stack>
      )}
      {editing !== null && editStat !== undefined && (
        <BuffDurationDialog
          stat={editStat}
          choice={durations[editing]}
          open
          onClose={() => {
            setEditing(null)
          }}
          onSave={(choice) => {
            setDuration(editing, choice)
          }}
        />
      )}
    </Box>
  )
})
