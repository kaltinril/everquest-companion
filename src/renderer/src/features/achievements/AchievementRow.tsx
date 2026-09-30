// achievements/AchievementRow.tsx — ONE ACHIEVEMENT: its name, how far along it is, and what it
// requires.
//
// AN ACHIEVEMENT WITH ONE REQUIREMENT SHOWS IT IN THE ROW, because there is nothing to open: the
// line is drawn under the name unless it only repeats the name (`Arcane Scientists` requires
// `Arcane Scientists`). One with several opens into them.
//
// THE STATUS IS THE ACHIEVEMENT ROW'S OWN, never worked out from its lines: a class unlock
// completes on confirmation with a line still open (shared/outputs/achievements.ts).

import { type JSX, useMemo, useState } from 'react'
import { Box, Chip, Collapse, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import MapIcon from '@mui/icons-material/Map'
import {
  componentText,
  type BookAchievement,
  type BookComponent,
  type BookGroup
} from '@shared/outputs/achievementBook'
import { achievementKey } from '@shared/outputs/slayer'
import AchievementLines, {
  CHIP_SX,
  ComponentLine,
  PickBox,
  StatusIcon,
  reachText
} from './AchievementLines'
import {
  achievementPct,
  counterIds,
  namedZone,
  progressText
} from '@shared/achievements/bookRows'
import type { RowContext } from './useAchievementsController'

export interface RowProps {
  group: BookGroup
  achievement: BookAchievement
  ctx: RowContext
}

/** Width of the caret's column, kept when there is no caret so the names line up. */
const CARET_WIDTH = 30

/** The one line of a one-line achievement, when it says more than the name does. */
function soleLine(a: BookAchievement): BookComponent | null {
  if (a.components.length !== 1) return null
  const [only] = a.components
  return achievementKey(componentText(only)) === achievementKey(a.name) ? null : only
}

function Caret({
  name,
  open,
  onToggle
}: {
  name: string
  open: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <IconButton
      size="small"
      aria-label={open ? `Hide what ${name} requires` : `Show what ${name} requires`}
      data-testid="achievement-open"
      onClick={onToggle}
    >
      {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
    </IconButton>
  )
}

function Title({ achievement, ids, ctx }: RowProps & { ids: readonly string[] }): JSX.Element {
  const zone = namedZone(achievement.name)
  const optional = ids.length > 0 && ids.every((id) => ctx.picks.rows.get(id)?.required === false)
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Typography
        variant="body2"
        noWrap
        data-testid="achievement-name"
        sx={{ fontWeight: 600, color: achievement.done ? 'text.secondary' : 'text.primary' }}
      >
        {achievement.name}
      </Typography>
      {optional && <Chip size="small" variant="outlined" label="optional" sx={CHIP_SX} />}
      {zone !== null && (
        <Tooltip title="Open the map">
          <IconButton
            size="small"
            aria-label={`Open the map for ${achievement.name}`}
            data-testid="achievement-map"
            onClick={() => {
              ctx.onOpenZone(zone)
            }}
            sx={{ p: 0.25 }}
          >
            <MapIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  )
}

/** The right-hand figures: how far along, and where a single counter's mobs are known. */
function Figures({ achievement, ids, ctx }: RowProps & { ids: readonly string[] }): JSX.Element {
  const row = ids.length === 1 ? ctx.picks.rows.get(ids[0]) : undefined
  return (
    <Box sx={{ textAlign: 'right', minWidth: 96, flexShrink: 0, pr: 1 }}>
      <Typography variant="body2" color={achievement.done ? 'text.secondary' : 'text.primary'}>
        {progressText(achievement)}
      </Typography>
      {row !== undefined && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {row.left.toLocaleString('en-US')} left
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {reachText(row.zones)}
          </Typography>
        </>
      )}
    </Box>
  )
}

export default function AchievementRow(props: RowProps): JSX.Element {
  const { group, achievement, ctx } = props
  const [open, setOpen] = useState(false)
  const pct = useMemo(() => achievementPct(achievement, ctx.index), [achievement, ctx.index])
  const ids = useMemo(() => counterIds(group, achievement), [group, achievement])
  const sole = soleLine(achievement)
  const many = achievement.components.length > 1
  return (
    <Box
      data-testid="achievement-row"
      data-done={achievement.done ? 'true' : 'false'}
      sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 0.5 }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Box sx={{ width: CARET_WIDTH, flexShrink: 0 }}>
          {many && (
            <Caret
              name={achievement.name}
              open={open}
              onToggle={() => {
                setOpen(!open)
              }}
            />
          )}
        </Box>
        {ctx.pickable && ids.length > 0 && <PickBox ids={ids} label={achievement.name} ctx={ctx} />}
        <StatusIcon done={achievement.done} />
        <Box sx={{ flex: 1, minWidth: 0, pl: 0.5 }}>
          <Title {...props} ids={ids} />
          {sole !== null && (
            <ComponentLine
              group={group}
              parent={achievement}
              component={sole}
              ctx={ctx}
              depth={0}
              bare
            />
          )}
          {!achievement.done && (
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{ height: 4, borderRadius: 2, mt: 0.25 }}
            />
          )}
        </Box>
        <Figures {...props} ids={ids} />
      </Stack>
      {many && (
        <Collapse in={open} unmountOnExit>
          <Box sx={{ pl: `${String(CARET_WIDTH + 12)}px`, pr: 1, pt: 0.5 }}>
            <AchievementLines located={{ group, achievement }} ctx={ctx} depth={0} />
          </Box>
        </Collapse>
      )}
    </Box>
  )
}
