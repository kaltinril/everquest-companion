// tradeskills/GuidePanel.tsx — "From the guides" on a workbench: the leveling guide's route for
// the open tradeskill (which item to make across each stretch of skill, and what goes into it),
// its notes and its alternates, with the player's level placed on the route.
//
// The guide is another player's work. Its text is drawn as plain text, exactly as written; a name
// becomes the standard item link only when it is a wiki item's own name (shared/tradeskillGuide.ts
// `wikiNameOf`). The credit line is drawn under it.

import { type JSX, useMemo } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import type { GuideMaterial } from '@shared/guideData'
import {
  LEVEL_UNPLACED_TEXT,
  guideItemRecipe,
  guideMaterialTail,
  guideQtyPrefix,
  guideStepRecipe,
  levelMarkerText,
  levelingCreditText,
  noRouteText,
  placedLadder,
  wikiNameOf,
  type PlacedStep,
  type StepState
} from '@shared/tradeskillGuide'
import { ROUTE_STEP_TIP } from '@shared/tradeskillRoute'
import type { Tradeskill } from '@shared/tradeskills'
import { EraChip } from '../planner/PlannerChips'
import { FactsProvider, useFacts, type BenchFacts } from './benchFacts'
import { ItemLabel } from './tradeskillLinks'

const CHIP_SX = { height: 18, fontSize: 10 } as const

/** The skill range, the item, what goes into it. */
const STEP_SX = {
  display: 'grid',
  gridTemplateColumns: '108px minmax(0, 1fr)',
  columnGap: 1.5,
  py: 0.75,
  borderBottom: 1,
  borderColor: 'divider'
} as const

const RANGE_COLOR: Record<StepState, string> = { done: 'text.disabled', here: 'primary.main', ahead: 'text.primary' }

/** A name the guide wrote: the standard item link when it is a wiki item's name, else the text as written. */
function GuideName({ name, bold }: { name: string; bold?: boolean }): JSX.Element {
  const { guides, index } = useFacts()
  const wiki = wikiNameOf(guides, name)
  if (wiki === null) {
    return (
      <Typography variant="body2" component="span" sx={{ fontWeight: bold === true ? 600 : 400 }} data-testid="tradeskill-guide-name">
        {name}
      </Typography>
    )
  }
  const recipe = guideItemRecipe(index, wiki)
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      {/* The name opens its Loot page; the click stops here so it does not also open the step's recipe. */}
      <Box
        sx={{ minWidth: 0 }}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <ItemLabel name={wiki} bold={bold} />
      </Box>
      {recipe !== null && <EraChip subject={recipe} outOnly />}
    </Stack>
  )
}

/** A step's materials, one per line, each sub-combine's own materials indented under it. */
function MaterialTree({ materials }: { materials: readonly GuideMaterial[] }): JSX.Element | null {
  if (materials.length === 0) return null
  return (
    <Box sx={{ ml: 0.5, pl: 1.5, borderLeft: 1, borderColor: 'divider' }}>
      {materials.map((material, i) => (
        <Box key={`${material.name}:${String(i)}`} data-testid="tradeskill-guide-material-line">
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', py: 0.125 }}>
            {guideQtyPrefix(material) !== '' && <Typography variant="body2">{guideQtyPrefix(material)}</Typography>}
            <GuideName name={material.name} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {guideMaterialTail(material)}
            </Typography>
          </Stack>
          <MaterialTree materials={material.materials ?? []} />
        </Box>
      ))}
    </Box>
  )
}

interface StepOpen {
  tradeskill: Tradeskill
  onOpenRecipe: (id: string) => void
}

function StepRow({ placed, tradeskill, onOpenRecipe }: StepOpen & { placed: PlacedStep }): JSX.Element {
  const { step, state, range } = placed
  const { guides, index } = useFacts()
  const recipe = guideStepRecipe(index, tradeskill, wikiNameOf(guides, step.item))
  const open = recipe === null ? undefined : () => onOpenRecipe(recipe.id)
  return (
    <Box
      sx={{ ...STEP_SX, cursor: open === undefined ? 'default' : 'pointer', '&:hover': open === undefined ? {} : { bgcolor: 'action.hover' } }}
      onClick={open}
      title={open === undefined ? undefined : ROUTE_STEP_TIP}
      data-testid="tradeskill-guide-step"
      data-state={state}
      data-recipe={recipe?.id ?? ''}
    >
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, color: RANGE_COLOR[state] }}>
          {range}
        </Typography>
        {state === 'here' && <Chip size="small" color="primary" label="you are here" sx={CHIP_SX} data-testid="tradeskill-guide-here" />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <GuideName name={step.item} bold={state === 'here'} />
          {step.note !== undefined && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {step.note}
            </Typography>
          )}
        </Stack>
        <MaterialTree materials={step.materials} />
      </Box>
    </Box>
  )
}

/** The line that places the player's level between two steps. */
function LevelMarker({ level }: { level: number }): JSX.Element {
  return (
    <Typography variant="overline" color="primary" sx={{ display: 'block', lineHeight: 1.6, borderBottom: 2, borderColor: 'primary.main' }} data-testid="tradeskill-guide-level">
      {levelMarkerText(level)}
    </Typography>
  )
}

interface StepsProps extends StepOpen {
  steps: readonly PlacedStep[]
  markerAt: number | null
  level: number | null
}

function Steps({ steps, markerAt, level, tradeskill, onOpenRecipe }: StepsProps): JSX.Element {
  return (
    <Box>
      {steps.map((placed, i) => (
        <Box key={`${placed.range}:${placed.step.item}`}>
          {level !== null && markerAt === i && <LevelMarker level={level} />}
          <StepRow placed={placed} tradeskill={tradeskill} onOpenRecipe={onOpenRecipe} />
        </Box>
      ))}
      {level !== null && markerAt === steps.length && <LevelMarker level={level} />}
    </Box>
  )
}

export interface GuidePanelProps {
  tradeskill: Tradeskill
  /** Null: the log has not shown the skill, so nothing is placed. */
  level: number | null
  facts: BenchFacts
  onOpenRecipe: (id: string) => void
}

export function GuidePanel({ tradeskill, level, facts, onOpenRecipe }: GuidePanelProps): JSX.Element {
  const ladder = useMemo(() => placedLadder(facts.guides, tradeskill, level), [facts.guides, tradeskill, level])
  if (ladder === null) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }} data-testid="tradeskill-guide-empty">
        {noRouteText(tradeskill)}
      </Typography>
    )
  }
  return (
    <FactsProvider value={facts}>
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="tradeskill-guide">
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={0.75}>
            {ladder.notes.map((note, i) => (
              <Typography key={`${String(i)}:${note}`} variant="body2" data-testid="tradeskill-guide-note">
                {note}
              </Typography>
            ))}
            {level === null && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-guide-unplaced">
                {LEVEL_UNPLACED_TEXT}
              </Typography>
            )}
          </Stack>
          <Steps steps={ladder.steps} markerAt={ladder.markerAt} level={level} tradeskill={tradeskill} onOpenRecipe={onOpenRecipe} />
          {ladder.alternates.length > 0 && (
            <Box sx={{ mt: 1.5 }} data-testid="tradeskill-guide-alternates">
              <Typography variant="subtitle2">Alternates</Typography>
              <Steps steps={ladder.alternates} markerAt={null} level={null} tradeskill={tradeskill} onOpenRecipe={onOpenRecipe} />
            </Box>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }} data-testid="tradeskill-guide-credit">
            {levelingCreditText()}
          </Typography>
        </Paper>
      </Box>
    </FactsProvider>
  )
}
