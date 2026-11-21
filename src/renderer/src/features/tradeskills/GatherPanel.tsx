// tradeskills/GatherPanel.tsx — "Fishing in your log" on the Fishing workbench's history tab
// (fork #6: "Fishing and Foraging also come to mind"; "successes, failures").
//
// The counts are the engine's `crafting` snapshot (`fishing`, joined across archived logs): casts,
// caught, nothing and the catch rate over the casts that printed an outcome; lost bait, spilled
// beer and a broken pole as their own small counts (each printed beside a miss, so they are parts
// of Nothing, never extra misses); this session's numbers when the session has any; and what was
// caught, item by item, with each one's part of all catches. Item names are the section's
// standard item links.
//
// Self-contained: it reads the module itself. Every figure and word is shared/tradeskillGather.ts.
// Until the module is served it draws nothing (the history tab says what the app waits on); with
// no fishing line in the log it says so in one line.

import type { JSX } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'
import { CRAFTING_MODULE, type CraftingSnap, type FishingSnap } from '@shared/crafting'
import {
  FISHING_HEADING,
  FISHING_REASONS_TIP,
  NO_FISHING_TEXT,
  fishingFigures,
  fishingItems,
  fishingNoOutcomeText,
  fishingReasons,
  fishingSessionText,
  fishingUnnamedText,
  hasFishing,
  type GatherFigure,
  type GatherItemLine
} from '@shared/tradeskillGather'
import { Tooltip } from '../../lib/Tooltip'
import { useModule } from '../../lib/useModule'
import { ItemLabel } from './tradeskillLinks'

/** One labelled number; a figure that carries a tip explains itself on hover. */
function Figure({ figure, testid }: { figure: GatherFigure; testid: string }): JSX.Element {
  const box = (
    <Box data-testid={testid}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
        {figure.label}
      </Typography>
      <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
        {figure.value}
      </Typography>
    </Box>
  )
  return figure.tip === undefined ? box : <Tooltip title={figure.tip}>{box}</Tooltip>
}

/** A row of labelled numbers, the history tab's own arrangement. `prefix` names the testids. */
export function GatherFigures({ figures, prefix }: { figures: readonly GatherFigure[]; prefix: string }): JSX.Element {
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3, rowGap: 0.5 }} data-testid={`${prefix}-figures`}>
      {figures.map((figure) => (
        <Figure key={figure.id} figure={figure} testid={`${prefix}-${figure.id}`} />
      ))}
    </Stack>
  )
}

/** Items caught or foraged: the standard item link, how many, and the part of the whole. */
export function GatherItems({ items, prefix }: { items: readonly GatherItemLine[]; prefix: string }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 2.5, rowGap: 0.5 }} data-testid={`${prefix}-items`}>
      {items.map((line) => (
        <Stack key={line.item} direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }} data-testid={`${prefix}-item`}>
          <ItemLabel name={line.item} />
          <Typography variant="caption" color="text.secondary" noWrap data-testid={`${prefix}-item-count`}>
            {line.count} · {line.share}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

/** Lost bait, spilled beer, pole broke: small counts on one line, with why they are not misses of their own. */
function Reasons({ fishing }: { fishing: FishingSnap }): JSX.Element | null {
  const reasons = fishingReasons(fishing)
  if (reasons.length === 0) return null
  return (
    <Tooltip title={FISHING_REASONS_TIP}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2, width: 'fit-content' }} data-testid="tradeskill-fishing-reasons">
        {reasons.map((reason) => (
          <Typography key={reason.id} variant="caption" color="text.secondary" data-testid={`tradeskill-fishing-${reason.id}`}>
            {reason.label} {reason.value}
          </Typography>
        ))}
      </Stack>
    </Tooltip>
  )
}

/** One quiet line; nothing for ''. */
function Quiet({ text, testid }: { text: string; testid: string }): JSX.Element | null {
  if (text === '') return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid={testid}>
      {text}
    </Typography>
  )
}

export function GatherPanel(): JSX.Element | null {
  const snap = useModule<CraftingSnap>(CRAFTING_MODULE)
  if (snap === null) return null
  const { fishing } = snap
  if (!hasFishing(fishing)) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="tradeskill-fishing-empty">
        {NO_FISHING_TEXT}
      </Typography>
    )
  }
  const items = fishingItems(fishing)
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 1, flexShrink: 0 }} data-testid="tradeskill-fishing">
      <Stack spacing={0.5}>
        <Typography variant="subtitle2">{FISHING_HEADING}</Typography>
        <GatherFigures figures={fishingFigures(fishing)} prefix="tradeskill-fishing" />
        <Reasons fishing={fishing} />
        <Quiet text={fishingNoOutcomeText(fishing)} testid="tradeskill-fishing-no-outcome" />
        <Quiet text={fishingSessionText(fishing.session)} testid="tradeskill-fishing-session" />
        {items.length > 0 && <GatherItems items={items} prefix="tradeskill-fishing" />}
        <Quiet text={fishingUnnamedText(fishing)} testid="tradeskill-fishing-unnamed" />
      </Stack>
    </Paper>
  )
}
