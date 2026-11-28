// AaPacePanel — the Leveling tab's answer once the level bar stops moving: how fast AA is
// coming in, when the next point lands, and what the item-shop bottle is doing to the points.
//
// Presentation ONLY. Every number arrives already computed by the pure `shared/aaPace.ts` and
// every string is shaped by the pure `aaPaceRows.ts` beside this file, so the one thing this
// panel exists to make visible — WHICH numbers the game printed and which are a model over
// them — is pinned by tests rather than buried in JSX. The two rate tiles are counts; the ETA
// and the charge count wear an `inferred` chip and say, on hover, exactly what the log stated
// and what was assumed on top of it.

import { type JSX } from 'react'
import { Paper, Stack, Typography } from '@mui/material'
import SpeedIcon from '@mui/icons-material/Speed'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom'
import ScienceIcon from '@mui/icons-material/Science'
import type { AaPace } from '@shared/aaPace'
import { StatTile } from '../../lib/StatTile'
import { aaPaceCaption, aaPaceTiles, type AaPaceTile } from './aaPaceRows'
import { BASIS_TITLE } from './rangeStatsRows'
import { useRateBasis } from '../timeslice/useRateBasis'

/** The leveling feature's existing hero hues, reused rather than re-invented. */
const ACCENT: Record<AaPaceTile['id'], string> = {
  rate: '#6fb3d2',
  points: '#b07fd0',
  eta: '#5fbf72',
  potion: '#d9b25f'
}

const ICON: Record<AaPaceTile['id'], JSX.Element> = {
  rate: <SpeedIcon />,
  points: <AutoAwesomeIcon />,
  eta: <HourglassBottomIcon />,
  potion: <ScienceIcon />
}

export interface AaPacePanelProps {
  pace: AaPace
  /** the window the rates cover, already worded (e.g. 'last hour of the log'). */
  windowLabel: string
}

/**
 * Rendered whenever the log holds any AA at all. A character with no AA yet sees nothing here
 * rather than a row of em-dashes: the panel is a set of facts, and its presence is one of them.
 */
export function AaPacePanel({ pace, windowLabel }: AaPacePanelProps): JSX.Element | null {
  // WHICH HOUR (JOS-288), from the app-wide store this tab's basis control writes.
  const { basis } = useRateBasis()
  const tiles = aaPaceTiles(pace, basis)
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="leveling-aa-pace">
      <Typography variant="subtitle2">AA pace</Typography>
      {/* The caption ends in 'over 42m active' — a native title says what that span is (JOS-249). */}
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', display: 'block' }}
        gutterBottom
        title={BASIS_TITLE[basis]}
      >
        {windowLabel} - {aaPaceCaption(pace, basis)}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
        {tiles.map((t) => (
          <StatTile
            key={t.id}
            value={t.value}
            unit={t.unit}
            label={t.label}
            labelNoWrap
            chip={t.inferred ? 'inferred' : undefined}
            icon={ICON[t.id]}
            accent={ACCENT[t.id]}
            hover={t.title}
            testId={`leveling-aa-tile-${t.id}`}
          />
        ))}
      </Stack>
    </Paper>
  )
}
