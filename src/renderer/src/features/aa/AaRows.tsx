// aa/AaRows.tsx — one AA table of the Alt. Advancement tab: a row per AA with its rank control.

import { type JSX, Fragment } from 'react'
import {
  Box,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import UndoIcon from '@mui/icons-material/Undo'
import type { AaClassGroup, AaRanked } from '@shared/aaRanks'
import { Tooltip } from '../../lib/Tooltip'

const CELL_SX = { py: 0.5, px: 1, fontSize: 12, verticalAlign: 'top' } as const
const TEXT_SX = {
  ...CELL_SX,
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden'
} as const

const FROM_LOG_TIP = 'Your log shows this rank bought; pick another to set it yourself.'
const CLEAR_TIP = 'Forget your pick and use the rank your log shows instead.'
const COST_TIP = 'Points each rank costs, as the wiki lists them.'
const VALUES_TIP = 'What each rank gives, as the wiki lists it.'

export type SetPick = (key: string, rank: number | null) => void

/** The rank picker, the "from log" mark, and the way back to the log's rank. */
function RankControl({ r, setPick }: { r: AaRanked; setPick: SetPick }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Select
        size="small"
        value={r.rank}
        onChange={(e) => {
          setPick(r.key, e.target.value)
        }}
        sx={{ fontSize: 12, minWidth: 56, '& .MuiSelect-select': { py: 0.25 } }}
        inputProps={{ 'aria-label': `${r.key} rank` }}
        data-testid="aa-rank"
      >
        {Array.from({ length: r.row.ranks + 1 }, (_, n) => (
          <MenuItem key={n} value={n} sx={{ fontSize: 12 }}>
            {`${String(n)} / ${String(r.row.ranks)}`}
          </MenuItem>
        ))}
      </Select>
      {r.source === 'log' && (
        <Tooltip title={FROM_LOG_TIP}>
          <Typography variant="caption" color="text.secondary" data-testid="aa-from-log">
            from log
          </Typography>
        </Tooltip>
      )}
      {r.source === 'pick' && (
        <Tooltip title={CLEAR_TIP}>
          <IconButton
            size="small"
            onClick={() => {
              setPick(r.key, null)
            }}
            aria-label="Use the log's rank"
            data-testid="aa-clear-pick"
          >
            <UndoIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  )
}

function AaRowLine({ r, setPick, special }: { r: AaRanked; setPick: SetPick; special: boolean }): JSX.Element {
  return (
    <TableRow hover data-testid="aa-row">
      <TableCell sx={{ ...CELL_SX, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.key}</TableCell>
      <TableCell sx={{ ...CELL_SX, whiteSpace: 'nowrap' }}>{special ? (r.row.values ?? []).join(' / ') : r.row.cost}</TableCell>
      <TableCell sx={CELL_SX}>
        <Tooltip title={r.row.hk === undefined ? r.row.text : `${r.row.text} Hotkey: ${r.row.hk}`} cursor="inherit">
          <Box sx={TEXT_SX}>{r.row.text}</Box>
        </Tooltip>
      </TableCell>
      <TableCell sx={CELL_SX}>
        <RankControl r={r} setPick={setPick} />
      </TableCell>
    </TableRow>
  )
}

function Head({ special }: { special: boolean }): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        <TableCell sx={CELL_SX}>Name</TableCell>
        <TableCell sx={CELL_SX}>
          <Tooltip title={special ? VALUES_TIP : COST_TIP}>
            <span>{special ? 'Per rank' : 'Cost'}</span>
          </Tooltip>
        </TableCell>
        <TableCell sx={CELL_SX}>Description</TableCell>
        <TableCell sx={CELL_SX}>Rank</TableCell>
      </TableRow>
    </TableHead>
  )
}

/** One section's rows as a table. */
export function AaTable({ rows, setPick, special = false }: { rows: AaRanked[]; setPick: SetPick; special?: boolean }): JSX.Element {
  return (
    <Table size="small" stickyHeader data-testid="aa-table">
      <Head special={special} />
      <TableBody>
        {rows.map((r) => (
          <AaRowLine key={r.key} r={r} setPick={setPick} special={special} />
        ))}
      </TableBody>
    </Table>
  )
}

/** The Class tables, one heading row per class. */
export function AaClassTable({ groups, setPick }: { groups: AaClassGroup[]; setPick: SetPick }): JSX.Element {
  return (
    <Table size="small" stickyHeader data-testid="aa-table">
      <Head special={false} />
      <TableBody>
        {groups.map((g) => (
          <Fragment key={g.cls}>
            <TableRow data-testid="aa-class-heading">
              <TableCell colSpan={4} sx={{ ...CELL_SX, fontWeight: 700, bgcolor: 'action.hover' }}>
                {g.cls}
                {g.mine && (
                  <Typography component="span" variant="caption" color="primary" sx={{ ml: 1 }}>
                    your class
                  </Typography>
                )}
              </TableCell>
            </TableRow>
            {g.rows.map((r) => (
              <AaRowLine key={`${g.cls}:${r.key}`} r={r} setPick={setPick} special={false} />
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
