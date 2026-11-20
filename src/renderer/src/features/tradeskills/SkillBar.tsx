// tradeskills/SkillBar.tsx — a tradeskill's level as a thin bar (owner, 2026-11-20: "that bar you
// had showing the progress for each tradeskill"), on every Home tile and in a workbench's head.
//
// The bar's length, its fill, the 200 tick and every word are shared/tradeskillLevelBar.ts: the
// scale is the last skill milestone the game's achievements list for the tradeskill, and the
// "caps at 200" note is the wiki's rule, drawn only while another tradeskill is past 200. A
// tradeskill the log never showed has an empty bar; one with no measured scale has an empty bar
// and the level's number alone.

import type { JSX } from 'react'
import { Box, Typography } from '@mui/material'
import { CAP_NOTE, barLabel, barOfText, barTip, capTip, type LevelBar } from '@shared/tradeskillLevelBar'
import { Tooltip } from '../../lib/Tooltip'

const TRACK_HEIGHT = 6

/** The bar itself: the track, the fill, and the tick at 200 when the cap note applies. */
export function SkillBar({ bar }: { bar: LevelBar }): JSX.Element {
  return (
    <Tooltip title={barTip(bar)}>
      <Box
        role="img"
        aria-label={barLabel(bar)}
        data-testid="tradeskill-bar"
        data-fill={bar.fill.toFixed(3)}
        sx={{ position: 'relative', height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, bgcolor: 'action.selected' }}
      >
        <Box sx={{ width: `${String(bar.fill * 100)}%`, height: '100%', borderRadius: TRACK_HEIGHT / 2, bgcolor: 'primary.main' }} />
        {bar.capTick !== null && (
          <Box
            data-testid="tradeskill-bar-cap"
            sx={{ position: 'absolute', top: -2, bottom: -2, left: `${String(bar.capTick * 100)}%`, width: 2, bgcolor: 'text.secondary' }}
          />
        )}
      </Box>
    </Tooltip>
  )
}

/** "of 300" beside a level; nothing with no level or no scale. */
export function BarOf({ bar }: { bar: LevelBar }): JSX.Element | null {
  const of = barOfText(bar)
  if (of === '') return null
  return (
    <Typography variant="caption" color="text.secondary" data-testid="tradeskill-bar-of">
      {of}
    </Typography>
  )
}

/** The quiet "caps at 200 without Crafting Mastery" note; nothing when the wiki's rule does not apply. */
export function CapNote({ bar }: { bar: LevelBar }): JSX.Element | null {
  if (bar.cappedBy === null) return null
  return (
    <Tooltip title={capTip(bar.cappedBy)}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-cap-note">
        {CAP_NOTE}
      </Typography>
    </Tooltip>
  )
}
