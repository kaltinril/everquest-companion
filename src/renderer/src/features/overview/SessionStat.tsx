// SessionStat — the Motes and Coin widgets' shared pieces: a headline amount with its rate, and
// the "in this zone" line under it. Display only; the numbers arrive from shared/overviewCards.ts.

import type { JSX } from 'react'
import { Stack, Typography } from '@mui/material'
import { NONE } from '../leveling/rangeStatsRows'
import { Tooltip } from '../../lib/Tooltip'

const TOO_SHORT = 'Too little play time this session to give an hourly rate yet.'

/** A rate, or the dash with its reason. */
function Rate({ text, testId }: { text: string | null; testId: string }): JSX.Element {
  if (text !== null) {
    return (
      <Typography variant="body2" data-testid={testId} sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        {text}
      </Typography>
    )
  }
  return (
    <Tooltip title={TOO_SHORT}>
      <Typography variant="body2" data-testid={testId} sx={{ color: 'text.disabled' }}>
        {NONE}
      </Typography>
    </Tooltip>
  )
}

/** The big number for this session, and its hourly rate beside it. */
export function SessionHeadline({ amount, rate, testId }: { amount: string; rate: string | null; testId: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline', minWidth: 0 }}>
      <Typography variant="h5" data-testid={`${testId}-session`} sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
        {amount}
      </Typography>
      <Rate text={rate} testId={`${testId}-rate`} />
    </Stack>
  )
}

/** "In <zone>: amount · rate", or nothing before the log names a zone. */
export function ZoneLine({ zone, amount, rate, testId }: { zone: string; amount: string; rate: string | null; testId: string }): JSX.Element {
  return (
    <Typography variant="caption" noWrap data-testid={testId} sx={{ color: 'text.secondary', minWidth: 0, mt: 0.75 }}>
      In {zone}: {amount} · {rate ?? NONE}
    </Typography>
  )
}

/** The caption under the card's title: which stretch the numbers cover. */
export function SessionCaption(): JSX.Element {
  return (
    <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5 }}>
      This session
    </Typography>
  )
}
