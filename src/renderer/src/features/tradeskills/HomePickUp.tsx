// tradeskills/HomePickUp.tsx — "Pick up where you left off", at the top of the section's Home:
// the tradeskill the log last showed a combine of (else the highest-level one), its next recipe
// with how many the held materials cover, and the last run of combines in plain words. One click
// opens that tradeskill's workbench.
//
// Which tradeskill, which recipe, every count and every sentence are shared/tradeskillHome.ts.
// A piece the log or the dump does not state is left out; with no combine and no tradeskill
// level in the log, the panel is not drawn. It waits for the engine's skills and crafting
// modules: until both are served, "no combine yet" would be a default and not an answer.

import { type JSX, useMemo } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import type { BookIndex } from '@shared/tradeskillBook'
import type { GuideIndex } from '@shared/tradeskillGuide'
import { heldKnown } from '@shared/tradeskillHeld'
import type { CraftBook } from '@shared/tradeskillHistory'
import { PICK_UP_HEADING, PICK_UP_TOPPED_TEXT, lastRunText, pickUp, pickUpHeldText, pickUpOpenLabel, pickUpWhyText, type PickUp } from '@shared/tradeskillHome'
import { haveLookup } from '@shared/tradeskillMaterials'
import type { Tradeskill } from '@shared/tradeskills'
import { formatDate } from '../../lib/formatDate'
import type { HeldState, SkillLevels } from './tradeskillData'
import { ItemLink } from './tradeskillLinks'

/** What Home has already read, handed to its panels. */
export interface HomeFacts {
  index: BookIndex
  guides: GuideIndex
  levels: SkillLevels
  craft: CraftBook
  held: HeldState
}

/** The recipe to make next, with what the held materials cover of it; or that nothing is above the level. */
function NextLine({ pick }: { pick: PickUp }): JSX.Element | null {
  if (pick.next === null) {
    if (!pick.topped) return null
    return (
      <Typography variant="body2" color="text.secondary">
        {PICK_UP_TOPPED_TEXT}
      </Typography>
    )
  }
  const heldText = pickUpHeldText(pick)
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0, flexWrap: 'wrap' }} data-testid="tradeskills-pickup-next">
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        Next:
      </Typography>
      <Typography variant="body2" component="span" sx={{ minWidth: 0, display: 'flex' }}>
        <ItemLink name={pick.next.item} />
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        trivial {pick.next.trivial}
      </Typography>
      {heldText !== '' && (
        <Typography variant="body2" color={pick.canMake === 0 ? 'text.secondary' : 'success.main'} data-testid="tradeskills-pickup-held">
          {heldText}
        </Typography>
      )}
    </Stack>
  )
}

export function HomePickUp({ facts, onOpen }: { facts: HomeFacts; onOpen: (tradeskill: Tradeskill) => void }): JSX.Element | null {
  const { index, guides, levels, craft, held } = facts
  const pick = useMemo(() => {
    if (!levels.served || !craft.served) return null
    return pickUp({ index, guides, rows: levels.rows, craft, have: heldKnown(held, craft) ? haveLookup(held, craft) : null })
  }, [index, guides, levels, craft, held])
  if (pick === null) return null
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid="tradeskills-pickup" data-tradeskill={pick.tradeskill}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {PICK_UP_HEADING}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            onOpen(pick.tradeskill)
          }}
          data-testid="tradeskills-pickup-open"
        >
          {pickUpOpenLabel(pick.tradeskill)}
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {pick.tradeskill}
        </Typography>
        {pick.level !== null && (
          <Typography variant="body1" color="primary" sx={{ fontWeight: 600 }}>
            {pick.level}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" data-testid="tradeskills-pickup-why">
          {pickUpWhyText(pick, pick.lastCombine === null ? '' : formatDate(pick.lastCombine))}
        </Typography>
      </Stack>
      <NextLine pick={pick} />
      {pick.lastRun !== null && (
        <Typography variant="body2" color="text.secondary" data-testid="tradeskills-pickup-run">
          {lastRunText(pick.lastRun, formatDate(pick.lastRun.end))}
        </Typography>
      )}
    </Paper>
  )
}
