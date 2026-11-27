// tradeskills/ItemPlanGather.tsx — "What to gather" for N of a planned item: the tree's leaf
// materials rolled up through every made material, with need, have and to get, the price the
// player's log last showed for each, and a total only when every line still to get has a price.
// Under it, the materials made on the way.
//
// Numbers only: where each material comes from is said once, in "What it takes" above (owner,
// 2026-11-20: "do we really need to list where things come from again").
//
// The roll-up and every sentence are shared/tradeskillPlanGather.ts. The counts are for combines
// that succeed; nothing is added for failures, and the panel says why.

import { type JSX, useEffect, useState } from 'react'
import { Box, Paper, Stack, TextField, Typography } from '@mui/material'
import { recipeFacts } from '@shared/tradeskillBook'
import {
  GATHER_EMPTY_TEXT,
  GATHER_NOTE,
  MAX_PLAN_COUNT,
  TO_GET_TIP,
  gatherHeading,
  gatherTotalText,
  lineCostText,
  makeText,
  unitText,
  type Gather,
  type GatherLine,
  type MakeLine
} from '@shared/tradeskillPlanGather'
import { Tooltip } from '../../lib/Tooltip'
import { ItemLabel } from './tradeskillLinks'

/** Material, Need, Have, To get, Each, Cost. Held to a readable width: six short columns. */
const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'minmax(170px, 1fr) 56px 56px 60px 100px 92px',
  columnGap: 1.5,
  alignItems: 'start',
  maxWidth: 720,
  py: 0.25
} as const

const NUM = { variant: 'body2', align: 'right' } as const

/**
 * How many to gather for. The box holds what is typed; the plan takes it once it is a whole
 * number, and leaving the box shows the count in force again.
 */
function CountField({ count, onCount }: { count: number; onCount: (raw: string) => void }): JSX.Element {
  const [text, setText] = useState(String(count))
  useEffect(() => {
    setText(String(count))
  }, [count])
  return (
    <TextField
      size="small"
      type="number"
      label="How many"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        if (/^\d+$/.test(e.target.value)) onCount(e.target.value)
      }}
      onBlur={() => {
        setText(String(count))
      }}
      slotProps={{ htmlInput: { min: 1, max: MAX_PLAN_COUNT, 'data-testid': 'tradeskill-plan-count-input', 'aria-label': 'How many to gather for' } }}
      sx={{ width: 110 }}
    />
  )
}

function Heads(): JSX.Element {
  return (
    <Box sx={{ ...GRID_SX, color: 'text.secondary', borderBottom: 1, borderColor: 'divider', mb: 0.5 }}>
      <Typography variant="caption">Material</Typography>
      <Typography variant="caption" align="right">
        Need
      </Typography>
      <Typography variant="caption" align="right">
        Have
      </Typography>
      <Tooltip title={TO_GET_TIP}>
        <Typography variant="caption" align="right">
          To get
        </Typography>
      </Tooltip>
      <Typography variant="caption" align="right">
        Last paid
      </Typography>
      <Typography variant="caption" align="right">
        Cost
      </Typography>
    </Box>
  )
}

function LeafRow({ line }: { line: GatherLine }): JSX.Element {
  const { node } = line
  return (
    <Box sx={GRID_SX} data-testid="tradeskill-plan-gather-line">
      {node.linked ? <ItemLabel name={node.name} /> : <Typography variant="body2">{node.name}</Typography>}
      <Typography {...NUM} data-testid="tradeskill-plan-gather-need">
        {line.need}
      </Typography>
      <Typography {...NUM} sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-gather-have">
        {line.have ?? ''}
      </Typography>
      <Typography {...NUM} color={line.toGet === 0 ? 'success.main' : 'text.primary'} sx={{ fontWeight: 600 }} data-testid="tradeskill-plan-gather-toget">
        {line.toGet}
      </Typography>
      <Typography {...NUM} sx={{ color: 'text.secondary' }}>
        {unitText(line)}
      </Typography>
      <Typography {...NUM} data-testid="tradeskill-plan-gather-cost">
        {lineCostText(line)}
      </Typography>
    </Box>
  )
}

function MadeRow({ line }: { line: MakeLine }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.25, flexWrap: 'wrap' }} data-testid="tradeskill-plan-make-line">
      <ItemLabel name={line.node.name} />
      <Typography variant="body2">
        {line.need} needed, {makeText(line)}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {recipeFacts(line.recipe, true)}
      </Typography>
    </Stack>
  )
}

export interface ItemPlanGatherProps {
  gather: Gather
  /** The planned item's name, for the heading. */
  item: string
  onCount: (raw: string) => void
}

export function ItemPlanGather({ gather, item, onCount }: ItemPlanGatherProps): JSX.Element {
  const total = gatherTotalText(gather)
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }} data-testid="tradeskill-plan-gather">
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.75, flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="subtitle2" data-testid="tradeskill-plan-gather-heading">
          {gatherHeading(gather.count, item)}
        </Typography>
        <CountField count={gather.count} onCount={onCount} />
      </Stack>
      {gather.leaves.length === 0 && gather.made.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-gather-empty">
          {GATHER_EMPTY_TEXT}
        </Typography>
      ) : (
        <>
          <Heads />
          {gather.leaves.map((line) => (
            <LeafRow key={line.node.id} line={line} />
          ))}
          {total !== '' && (
            <Typography variant="body2" sx={{ mt: 0.75, fontWeight: 600 }} data-testid="tradeskill-plan-gather-total">
              {total}
            </Typography>
          )}
          {gather.made.length > 0 && (
            <Box sx={{ mt: 1 }} data-testid="tradeskill-plan-gather-made">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Made on the way
              </Typography>
              {gather.made.map((line) => (
                <MadeRow key={line.node.id} line={line} />
              ))}
            </Box>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }} data-testid="tradeskill-plan-gather-note">
            {GATHER_NOTE}
          </Typography>
        </>
      )}
    </Paper>
  )
}
