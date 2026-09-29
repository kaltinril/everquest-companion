// slayer/CounterList.tsx — WHAT IS LEFT: the open counters, least left first, each with a
// checkbox. The checked ones are the set the zone ranking beside it is made for.
//
// ITS OWN SCROLLER (AGENTS.md UI conventions): the list fills the column's height and scrolls in
// a bounded box. Ninety rows at most, so it is not windowed.

import { type JSX } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import type { CounterRow } from './slayerRows'
import type { CounterListBundle } from './useSlayerController'

const count = (n: number): string => n.toLocaleString('en-US')

/** Where the catalog knows this counter's mobs, in a few words. */
function reachText(row: CounterRow): string {
  if (row.zones === 0) return 'no known mobs'
  return `${count(row.zones)} ${row.zones === 1 ? 'zone' : 'zones'}`
}

function CounterLine({
  row,
  picked,
  onToggle
}: {
  row: CounterRow
  picked: boolean
  onToggle: (id: string) => void
}): JSX.Element {
  const { counter } = row
  return (
    <Box
      data-testid="slayer-counter"
      data-picked={picked ? 'true' : 'false'}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        pr: 1,
        py: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        opacity: row.zones === 0 ? 0.6 : 1
      }}
    >
      <Checkbox
        size="small"
        checked={picked}
        onChange={() => {
          onToggle(row.id)
        }}
        slotProps={{ input: { 'aria-label': `Pick ${counter.achievement}` } }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {counter.achievement}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {counter.group}
          </Typography>
          {!row.required && (
            <Chip
              size="small"
              variant="outlined"
              label="optional"
              sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
            />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {counter.label}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={row.pct}
          sx={{ height: 4, borderRadius: 2, mt: 0.25 }}
        />
      </Box>
      <Box sx={{ textAlign: 'right', minWidth: 96, flexShrink: 0 }}>
        <Typography variant="body2">{count(row.left)} left</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {count(counter.have)} of {count(counter.need)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {reachText(row)}
        </Typography>
      </Box>
    </Box>
  )
}

function ListControls(props: CounterListBundle): JSX.Element {
  return (
    <Stack spacing={0.5} sx={{ pb: 0.5 }}>
      <TextField
        size="small"
        placeholder="Search achievements or creatures"
        value={props.query}
        onChange={(e) => {
          props.onQuery(e.target.value)
        }}
        slotProps={{ htmlInput: { 'data-testid': 'slayer-search' } }}
      />
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button size="small" onClick={props.onPickNearlyDone} data-testid="slayer-pick-nearly">
          Pick nearly done
        </Button>
        <Button
          size="small"
          onClick={props.onClear}
          disabled={props.picks.size === 0}
          data-testid="slayer-pick-clear"
        >
          Clear picks
        </Button>
        <FormControlLabel
          sx={{ ml: 'auto', mr: 0 }}
          control={
            <Switch
              size="small"
              checked={props.requiredOnly}
              onChange={(e) => {
                props.onRequiredOnly(e.target.checked)
              }}
            />
          }
          label={<Typography variant="caption">Required only</Typography>}
        />
      </Stack>
    </Stack>
  )
}

export default function CounterList(props: CounterListBundle): JSX.Element {
  const { rows, total, picks, onToggle } = props
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Typography variant="subtitle2" data-testid="slayer-left-title">
        What is left - {count(total)} open
      </Typography>
      <ListControls {...props} />
      <Box data-testid="slayer-counters" sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        {rows.map((row) => (
          <CounterLine key={row.id} row={row} picked={picks.has(row.id)} onToggle={onToggle} />
        ))}
        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No achievement matches that.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
