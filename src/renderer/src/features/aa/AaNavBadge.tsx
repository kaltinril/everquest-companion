// aa/AaNavBadge.tsx — the Alt. Adv. nav row's "!" (owner, 2026-11-25): from 45 unspent AA points,
// so the player spends some before the cap at 50 stops their points and experience.

import type { JSX } from 'react'
import { Chip } from '@mui/material'
import { aaPointsWarnOf } from '@shared/aaPointsWarn'
import { Tooltip } from '../../lib/Tooltip'
import { useAaUnspent } from './useAaUnspent'

export default function AaNavBadge(): JSX.Element | null {
  const warn = aaPointsWarnOf(useAaUnspent())
  if (warn === null) return null
  return (
    <Tooltip title={warn.tip}>
      <Chip
        size="small"
        label="!"
        color={warn.cap ? 'error' : 'warning'}
        sx={{ height: 18, minWidth: 18, fontSize: 11, fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }}
        data-testid="nav-aa-warn"
      />
    </Tooltip>
  )
}
