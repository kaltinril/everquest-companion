// Buff conflicts: your spells this session that did not take hold (and what blocked them) and your
// buffs on someone that were overwritten, as the log stated them. Absent when there are none.

import type { JSX } from 'react'
import { useState } from 'react'
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import type { BuffConflictRow, BuffConflictsSnap } from '@shared/buffConflicts'
import { conflictKey, conflictOutcome, conflictTarget } from '@shared/buffConflicts'
import { useModule } from '../../lib/useModule'
import { formatTime } from '../../lib/formatDate'

function ConflictRow({ row }: { row: BuffConflictRow }): JSX.Element {
  return (
    <TableRow hover data-testid="buff-conflict-row">
      <TableCell>{row.spell}</TableCell>
      <TableCell sx={{ color: row.kind === 'overwritten' ? 'text.secondary' : 'warning.main' }}>
        {conflictOutcome(row)}
      </TableCell>
      <TableCell>{conflictTarget(row)}</TableCell>
      <TableCell align="right">×{row.count}</TableCell>
      <TableCell align="right" sx={{ opacity: 0.7 }}>
        {formatTime(row.lastTs, { hour: '2-digit', minute: '2-digit' })}
      </TableCell>
    </TableRow>
  )
}

export function BuffConflicts(): JSX.Element | null {
  const rows = useModule<BuffConflictsSnap>('buffConflicts')?.rows ?? []
  const [open, setOpen] = useState(true)
  if (rows.length === 0) return null
  return (
    <Box data-testid="buff-conflicts">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">Buff conflicts</Typography>
        <Chip
          size="small"
          variant="outlined"
          label={`${String(rows.length)} this session`}
          sx={{ height: 18, fontSize: 11 }}
        />
        <IconButton
          size="small"
          aria-label={open ? 'Hide buff conflicts' : 'Show buff conflicts'}
          onClick={() => {
            setOpen((v) => !v)
          }}
        >
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Paper variant="outlined" sx={{ maxHeight: 260, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Your spell</TableCell>
                <TableCell>What happened</TableCell>
                <TableCell>On</TableCell>
                <TableCell align="right">Times</TableCell>
                <TableCell align="right">Last</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <ConflictRow key={conflictKey(r)} row={r} />
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Collapse>
    </Box>
  )
}
