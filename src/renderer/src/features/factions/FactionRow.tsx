// factions/FactionRow.tsx — one faction on the table: the standing row (name + signals, rung
// chip, live number with drift, the bar) and — expanded — the work panel beneath it. Split out
// of FactionsView.tsx at the measured file ceiling (split, never ratchet).

import { type JSX } from 'react'
import { Box, Chip, Collapse, LinearProgress, TableCell, TableRow, Typography } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import type { HeldCounts } from '@shared/types'
import FactionWorkPanel, { type WorkPanelLinks } from './FactionWorkPanel'
import type { RowDerived } from './factionDerive'
import type { FactionRowVm } from './useFactionRows'

/** The work panel's link handlers plus the held counts its turn-in lists draw with. */
export interface WorkLinks extends WorkPanelLinks {
  held: HeldCounts
}

/** The hover behind a drifted number: both halves of the correction, and how sure it is. */
function driftTitle(row: FactionRowVm): string {
  const base = `dump said ${String(row.dumpStanding)}; the log moved it ${row.drift > 0 ? '+' : ''}${String(row.drift)} since`
  return row.exact ? base : `${base} (log window did not reach the dump - at least this much)`
}

/** The name cell's trailing signals: quest count, the gear-value count, the loud wishlist chip. */
function NameSignals({ derived }: { derived: RowDerived }): JSX.Element {
  const raiseCount = derived.work?.raise.length ?? 0
  return (
    <>
      {raiseCount > 0 && (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {raiseCount} quest{raiseCount === 1 ? '' : 's'}
        </Typography>
      )}
      {derived.gear.length > 0 && (
        <Typography
          component="span"
          variant="caption"
          title={derived.gear.join(', ')}
          data-testid="factions-gear-count"
          sx={{ ml: 1, color: 'primary.main' }}
        >
          · {derived.gear.length} gear reward{derived.gear.length === 1 ? '' : 's'}
        </Typography>
      )}
      {/* THE LOUD ONE: this faction's quests reward something on YOUR wishlist. */}
      {derived.wished.length > 0 && (
        <Chip
          size="small"
          color="warning"
          variant="outlined"
          label={`♥ ${derived.wished.join(', ')}`}
          title="on your wishlist"
          data-testid="factions-wishlist-hit"
          sx={{ ml: 1, height: 20, fontSize: 11, fontWeight: 600, maxWidth: 320 }}
        />
      )}
    </>
  )
}

/**
 * One faction: the standing row, and — expanded — the work panel beneath it. EVERY row expands
 * (a faction with nothing on record answers with that fact rather than refusing the click); the
 * collapsed row's signals say where the work and the value are before anyone clicks.
 */
export default function FactionRow({
  row,
  derived,
  expanded,
  onToggle,
  links
}: {
  row: FactionRowVm
  /** the filtered work plus everything the row states about it (factionDerive.ts) */
  derived: RowDerived
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
          <NameSignals derived={derived} />
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
              <FactionWorkPanel work={derived.work} held={links.held} links={links} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}
