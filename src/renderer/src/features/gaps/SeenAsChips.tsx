// SeenAsChips — the Seen as cell: the first two kinds and a count, the rest on hover (owner, 2026-11-10:
// the cell is "fixed width and gets chips cut off"); a second chip that does not fit stacks under the
// first, in the row's two lines (2026-11-21). The details pane lists every kind (GapsTable.tsx).

import type { JSX } from 'react'
import { Chip, Stack, Typography } from '@mui/material'
import { Tooltip } from '../../lib/Tooltip'

/** The first two kinds and how many more. */
export const seenAs = (kinds: readonly string[]): { shown: string[]; more: number } => ({ shown: kinds.slice(0, 2), more: Math.max(0, kinds.length - 2) })

export default function SeenAsChips({ kinds }: { kinds: readonly string[] }): JSX.Element {
  const { shown, more } = seenAs(kinds)
  return (
    <Stack direction="row" useFlexGap alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 0.5, rowGap: '2px' }}>
      {shown.map((k) => (
        <Chip key={k} label={k} size="small" variant="outlined" sx={{ height: 20, maxWidth: '100%' }} />
      ))}
      {more > 0 && (
        <Tooltip title={kinds.join(', ')}>
          <Typography variant="caption" color="text.secondary" component="span" data-testid="gaps-seen-more">
            +{more}
          </Typography>
        </Tooltip>
      )}
    </Stack>
  )
}
