// tradeskills/SkillGearPanel.tsx — "Gear that raises this skill" on a workbench (owner, 2026-11-20:
// "recommended to the person if they are on tradeskills looking at fishing").
//
// The items are the Gear index's own rows (`gear/gearData.useGearIndex`: one fetch per window,
// shared with the Gear tab), narrowed and ordered by shared/tradeskillGear.ts. Each name is the
// section's standard item link; the last link opens the Gear tab searched for the same mods.
// With no item for the tradeskill the panel draws nothing.

import { type JSX, useMemo } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'
import { heldCount } from '@shared/tradeskillBook'
import {
  SKILL_GEAR_HEADING,
  skillGear,
  skillGearHeldText,
  skillGearHiddenText,
  skillGearModText,
  skillGearSlots,
  type SkillGearLine
} from '@shared/tradeskillGear'
import type { Tradeskill } from '@shared/tradeskills'
import { CellLink } from '../../lib/CellLink'
import { Tooltip } from '../../lib/Tooltip'
import { useEraHidden, useGearIndex, type GearViewRow } from '../gear/gearData'
import { EraChip } from '../planner/PlannerChips'
import type { HeldState } from './tradeskillData'
import { ItemLabel, useDoors } from './tradeskillLinks'

const GEAR_LINK_TIP = 'Opens the Gear tab searched for these items, with their stats and where they drop.'

/** Whether the inventory dump lists the item. With no dump nothing has said, so nothing is drawn (the Have column's rule). */
function HeldWords({ name, held }: { name: string; held: HeldState }): JSX.Element | null {
  if (held.index === null) return null
  const count = heldCount(held.index, name)
  return (
    <Typography variant="caption" color={count > 0 ? 'success.main' : 'text.disabled'} noWrap data-testid="tradeskill-gear-held">
      {skillGearHeldText(count)}
    </Typography>
  )
}

/** One item: its name (card on hover, Loot page on click), what it adds, where it is worn, and whether it is held. */
function GearEntry({ line, held }: { line: SkillGearLine<GearViewRow>; held: HeldState }): JSX.Element {
  const slots = skillGearSlots(line.row)
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }} data-testid="tradeskill-gear-item">
      <ItemLabel name={line.row.name} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap data-testid="tradeskill-gear-mod">
        {skillGearModText(line.mod)}
        {slots !== '' && ` · ${slots}`}
      </Typography>
      <HeldWords name={line.row.name} held={held} />
      <EraChip subject={line.row} />
    </Stack>
  )
}

export function SkillGearPanel({ tradeskill, held, eraOnly }: { tradeskill: Tradeskill; held: HeldState; eraOnly: boolean }): JSX.Element | null {
  const gear = useGearIndex()
  const { eraHidden } = useEraHidden()
  const doors = useDoors()
  const found = useMemo(() => skillGear(gear.rows, tradeskill, eraOnly ? eraHidden : undefined), [gear.rows, tradeskill, eraOnly, eraHidden])
  if (found.lines.length === 0) return null
  const hidden = skillGearHiddenText(found.eraHidden)
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 0.75, flexShrink: 0 }} data-testid="tradeskill-gear">
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.5 }}>
        <Typography variant="subtitle2">{SKILL_GEAR_HEADING}</Typography>
        {found.lines.map((line) => (
          <GearEntry key={line.row.key} line={line} held={held} />
        ))}
        {hidden !== null && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-gear-era-hidden">
            {hidden}
          </Typography>
        )}
        {doors !== null && (
          <Tooltip title={GEAR_LINK_TIP}>
            <Box component="span" sx={{ typography: 'caption' }} data-testid="tradeskill-gear-open">
              <CellLink
                text="Show on the Gear tab"
                onOpen={() => {
                  doors.onOpenGearSearch(found.search)
                }}
              />
            </Box>
          </Tooltip>
        )}
      </Stack>
    </Paper>
  )
}
