// NeedsChips — the filter chips under the Mobs tab (owner, 2026-11-10: "we need filters under mobs for
// these things"): one per need the list has, its count in mobs, ticked ones narrowing the list to rows
// with any of them; none ticked shows every row (shared/gapNeeds.ts, useGapsList `needs`).
import type { JSX } from 'react'
import { Chip, Stack, Typography } from '@mui/material'
import { NEED_KINDS, NEED_LABELS, NEED_TIPS } from '@shared/gapNeeds'
import { Tooltip } from '../../lib/Tooltip'
import type { NeedsState } from './useGapsList'

export default function NeedsChips({ needs }: { needs: NeedsState }): JSX.Element {
  const kinds = NEED_KINDS.filter((k) => (needs.counts.get(k) ?? 0) > 0 || needs.picked.has(k))
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap data-testid="gaps-needs-filter">
      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.06em', fontWeight: 600 }}>
        NEEDS
      </Typography>
      {kinds.map((k) => (
        <Tooltip key={k} title={NEED_TIPS[k]}>
          <Chip
            size="small"
            clickable
            variant={needs.picked.has(k) ? 'filled' : 'outlined'}
            color={needs.picked.has(k) ? 'primary' : 'default'}
            label={`${NEED_LABELS[k]} ${(needs.counts.get(k) ?? 0).toLocaleString()}`}
            onClick={() => needs.toggle(k)}
            data-testid={`gaps-needs-${k}`}
          />
        </Tooltip>
      ))}
      <Typography variant="caption" color="text.secondary">
        {needs.picked.size === 0 ? 'all rows; tick a need to narrow' : 'rows with any ticked need; counts are mobs'}
      </Typography>
    </Stack>
  )
}
