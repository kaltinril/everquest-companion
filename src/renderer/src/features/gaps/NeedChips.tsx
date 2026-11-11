// NeedChips — a Mobs row's Needs cell (owner, 2026-11-10: "mobs list can have a new column with npc,
// merchant, faction, drops, Images, respawn"): one chip per need (shared/gapNeeds.ts), the why on hover.
import type { JSX } from 'react'
import { memo } from 'react'
import { Chip, Stack, Typography } from '@mui/material'
import { NEED_TIPS, needLabel, seenAs, type GapNeed } from '@shared/gapNeeds'
import type { GapActionContext, GapRow, GapVerdict } from '@shared/gaps'
import { Tooltip } from '../../lib/Tooltip'
import GapActionChips from './GapActionChips'

const NeedChips = memo(function NeedChips({ needs }: { needs: readonly GapNeed[] }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'nowrap' }} data-testid="gaps-needs-cell">
      {needs.map((n) => (
        <Tooltip key={n.kind} title={NEED_TIPS[n.kind]}>
          <Chip size="small" variant="outlined" color={n.kind === 'page' ? 'secondary' : 'default'} label={needLabel(n)} data-testid={`gaps-need-${n.kind}`} />
        </Tooltip>
      ))}
    </Stack>
  )
})

export default NeedChips

/** Seen as: two chips and a count, the rest on hover (owner, 2026-11-10: the cell "gets chips cut off"). */
export function SeenAsChips({ kinds }: { kinds: readonly string[] }): JSX.Element {
  const { shown, more } = seenAs(kinds)
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'nowrap' }}>
      {shown.map((k) => (
        <Chip key={k} label={k} size="small" variant="outlined" />
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

/** The To do cell: a Mobs row's needs (gapNeeds.ts), any other row's action chips. */
export function ToDoCell({ row, verdict, ctx, needs }: { row: GapRow; verdict: GapVerdict; ctx?: GapActionContext; needs?: readonly GapNeed[] }): JSX.Element {
  if (needs !== undefined && needs.length > 0) return <NeedChips needs={needs} />
  return <GapActionChips row={row} verdict={verdict} ctx={ctx} />
}
