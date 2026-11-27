// REINCARNATIONS — how long each re-level back to 50 took in actual play (owner, 2026-11-22;
// docs/community/requirements/reincarnation-leveling.md). The whole derivation is
// `shared/reincarnationClimbs.ts`; this file only words its rows.
//
// It reads no scope: a climb is a fixed stretch of the character's history, so the tab's timeslice
// and a chart drag leave it alone. A character with no reincarnation gets no panel at all.

import { type JSX, memo, useMemo } from 'react'
import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { AASpendEvent, LevelEvent, ProgressionSnap } from '@shared/types'
import { fmtDuration } from '@shared/durationText'
import { reincarnationClimbs, type ReincarnationClimb } from '@shared/reincarnationClimbs'
import { Tooltip } from '../../lib/Tooltip'
import { formatDate } from '../../lib/formatDate'
import { ACTIVE_TIME_TITLE, ELAPSED_TIME_TITLE, NONE } from './rangeStatsRows'

const CELL_SX = { py: 0.5, px: 1, fontSize: 12, borderColor: 'divider' } as const
const HEAD_SX = { ...CELL_SX, fontWeight: 700, whiteSpace: 'nowrap', color: 'text.secondary' } as const
const NUM_SX = { ...CELL_SX, whiteSpace: 'nowrap' } as const

const CLIMBING_TITLE = "Still climbing, so time and kills run to the log's latest line."
const UNFINISHED_TITLE = 'The log shows no level-50 ding before the next reincarnation.'
const PARTIAL_TITLE = "Older history was trimmed, so this climb's play time cannot be stated."

/** The Reached 50 cell: a date, or what stands in for one. */
function ReachedCell({ row }: { row: ReincarnationClimb }): JSX.Element {
  if (row.reachedTs !== null) return <>{formatDate(row.reachedTs)}</>
  const climbing = row.status === 'climbing'
  return (
    <Tooltip title={climbing ? CLIMBING_TITLE : UNFINISHED_TITLE}>
      <Box component="span" sx={{ color: climbing ? 'primary.main' : 'text.secondary' }}>
        {climbing ? `in progress · level ${String(row.level)}` : 'no level 50'}
      </Box>
    </Tooltip>
  )
}

/** The headline. A climb the record cannot fully answer says so instead of printing a number. */
function ActiveCell({ row }: { row: ReincarnationClimb }): JSX.Element {
  if (row.partial) {
    return (
      <Tooltip title={PARTIAL_TITLE}>
        <Box component="span" sx={{ color: 'warning.main' }} data-testid="reincarnation-partial">
          partial
        </Box>
      </Tooltip>
    )
  }
  return (
    <Box component="span" sx={{ fontWeight: 700, fontSize: 13 }}>
      {row.play ? fmtDuration(row.play.activeMs) : NONE}
    </Box>
  )
}

function ClimbRow({ row }: { row: ReincarnationClimb }): JSX.Element {
  return (
    <TableRow data-testid="reincarnation-row">
      <TableCell sx={CELL_SX}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
          {row.race ?? 'Reincarnation'}
          {row.rank !== null && (
            <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>
              {` rank ${String(row.rank)}`}
            </Typography>
          )}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {row.classes.join(' / ')}
        </Typography>
      </TableCell>
      <TableCell sx={NUM_SX}>{formatDate(row.ts)}</TableCell>
      <TableCell sx={NUM_SX}>
        <ReachedCell row={row} />
      </TableCell>
      <TableCell align="right" sx={NUM_SX}>
        <ActiveCell row={row} />
      </TableCell>
      <TableCell align="right" sx={NUM_SX}>
        {row.play ? fmtDuration(row.play.elapsedMs) : NONE}
      </TableCell>
      <TableCell align="right" sx={NUM_SX}>
        {row.play ? row.play.kills.toLocaleString() : NONE}
      </TableCell>
    </TableRow>
  )
}

export const ReincarnationPanel = memo(function ReincarnationPanel({
  levels,
  spends,
  snap
}: {
  levels: readonly LevelEvent[]
  spends: readonly AASpendEvent[]
  snap: ProgressionSnap
}): JSX.Element | null {
  const rows = useMemo(() => reincarnationClimbs({ levels, spends, snap }), [levels, spends, snap])
  if (rows.length === 0) return null
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="reincarnation-panel">
      <Typography variant="subtitle2">Reincarnations</Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} gutterBottom>
        each climb back to 50, from the reincarnation to the first level-50 ding
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={HEAD_SX}>Reincarnation</TableCell>
              <TableCell sx={HEAD_SX}>Started</TableCell>
              <TableCell sx={HEAD_SX}>Reached 50</TableCell>
              <TableCell align="right" sx={HEAD_SX} title={ACTIVE_TIME_TITLE}>
                Active
              </TableCell>
              <TableCell align="right" sx={HEAD_SX} title={ELAPSED_TIME_TITLE}>
                Elapsed
              </TableCell>
              <TableCell align="right" sx={HEAD_SX}>
                Kills
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <ClimbRow key={row.ts} row={row} />
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  )
})
