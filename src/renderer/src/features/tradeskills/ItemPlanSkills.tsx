// tradeskills/ItemPlanSkills.tsx — "Where you stand" and "Shortest way there" for a planned item:
// each tradeskill the tree needs with the trivial it needs it at and the player's level, and for
// each tradeskill that is short, what to make on the way (the leveling guide's steps, credited,
// or the wiki ladder's recipes where the guide has none).
//
// Every fold and every sentence is shared/tradeskillPlanLevels.ts. No success chance and no
// number of combines is drawn: nobody has measured this game's rates, and the panel says so.

import type { JSX } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { Tooltip } from '../../lib/Tooltip'
import { SKILLS_MODULE } from '@shared/skills'
import {
  ALL_MET_TEXT,
  CHANCE_NOTE,
  ROUTE_EMPTY_TEXT,
  ROUTE_UNPLACED_TEXT,
  alsoText,
  guideEndsText,
  levelText,
  routeHeading,
  routeMoreText,
  routeSourceText,
  skillMetText,
  skillNeedText,
  unskilledText,
  type PlanSkills,
  type RouteLine,
  type SkillNeed,
  type SkillRoute,
  type SkillStand
} from '@shared/tradeskillPlanLevels'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import { CellLink } from '../../lib/CellLink'
import { ItemLabel } from './tradeskillLinks'

const STAND_COLOR: Record<SkillStand, 'success' | 'warning' | 'default'> = { met: 'success', short: 'warning', unseen: 'default', unrated: 'default' }

/** Opens a tradeskill's workbench from the plan. */
export type OpenBench = (tradeskill: Tradeskill) => void

function BenchLink({ tradeskill, onOpenBench }: { tradeskill: Tradeskill; onOpenBench: OpenBench }): JSX.Element {
  return (
    <Box component="span" sx={{ typography: 'caption' }} data-testid="tradeskill-plan-bench">
      <CellLink
        text={`Open the ${tradeskill} workbench`}
        onOpen={() => {
          onOpenBench(tradeskill)
        }}
      />
    </Box>
  )
}

function NeedRow({ need, onOpenBench }: { need: SkillNeed; onOpenBench: OpenBench }): JSX.Element {
  const also = alsoText(need)
  return (
    <Box sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }} data-testid="tradeskill-plan-skill" data-stand={need.stand}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.25 }}>
        <Chip size="small" variant="outlined" color={STAND_COLOR[need.stand]} label={`${need.tradeskill}: ${levelText(need)}`} data-testid="tradeskill-plan-skill-level" />
        <Typography variant="body2">{skillNeedText(need)}</Typography>
      </Stack>
      {also !== '' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {also}
        </Typography>
      )}
      <BenchLink tradeskill={need.tradeskill} onOpenBench={onOpenBench} />
    </Box>
  )
}

/** One thing to make on the way: its range or trivial, the item, and the guide's materials as written. */
function RouteRow({ line }: { line: RouteLine }): JSX.Element {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', columnGap: 1.5, py: 0.25 }} data-testid="tradeskill-plan-step">
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {line.range}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        {line.wikiName === null ? <Typography variant="body2">{line.item}</Typography> : <ItemLabel name={line.wikiName} />}
        {line.detail !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {line.detail}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

function RouteBlock({ route, onOpenBench }: { route: SkillRoute; onOpenBench: OpenBench }): JSX.Element {
  const tail = [guideEndsText(route), routeMoreText(route)].join(' ').trim()
  return (
    <Box sx={{ pb: 1 }} data-testid="tradeskill-plan-route" data-source={route.source}>
      <Typography variant="body2" sx={{ fontWeight: 600 }} data-testid="tradeskill-plan-route-heading">
        {routeHeading(route)}
      </Typography>
      {!route.placed && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {ROUTE_UNPLACED_TEXT}
        </Typography>
      )}
      {route.lines.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {ROUTE_EMPTY_TEXT}
        </Typography>
      )}
      {route.lines.map((line) => (
        <RouteRow key={line.id} line={line} />
      ))}
      {tail !== '' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-plan-route-tail">
          {tail}
        </Typography>
      )}
      {route.lines.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-plan-route-source">
          {routeSourceText(route)} <BenchLink tradeskill={route.tradeskill} onOpenBench={onOpenBench} />
        </Typography>
      )}
    </Box>
  )
}

/**
 * The whole of "Where you stand" when every skill the plan needs is met (`skillsAllMet`): one
 * line in the plan's head, each tradeskill's level a chip that opens its workbench.
 */
export function PlanStandLine({ skills, onOpenBench }: { skills: PlanSkills; onOpenBench: OpenBench }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, mt: 0.75 }} data-testid="tradeskill-plan-stand">
      {skills.needs.map((need) => (
        <Stack key={need.tradeskill} direction="row" spacing={0.75} alignItems="center" data-testid="tradeskill-plan-stand-skill">
          <Tooltip title={`Open the ${need.tradeskill} workbench`}>
            <Chip
              size="small"
              variant="outlined"
              color="success"
              label={`Your ${need.tradeskill}: ${levelText(need)}`}
              onClick={() => {
                onOpenBench(need.tradeskill)
              }}
            />
          </Tooltip>
          <Typography variant="body2" color="text.secondary">
            {skillMetText(need)}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

export interface ItemPlanSkillsProps {
  skills: PlanSkills
  routes: readonly SkillRoute[]
  /** False until the engine has served the skills module: no level is known yet. */
  served: boolean
  onOpenBench: OpenBench
}

export function ItemPlanSkills({ skills, routes, served, onOpenBench }: ItemPlanSkillsProps): JSX.Element {
  const allMet = skills.needs.length > 0 && skills.needs.every((need) => need.stand === 'met')
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }} data-testid="tradeskill-plan-skills">
      <Typography variant="subtitle2">Where you stand</Typography>
      {!served && <LogReadInline module={SKILLS_MODULE} served={false} sx={{ my: 0.5 }} />}
      {skills.needs.map((need) => (
        <NeedRow key={need.tradeskill} need={need} onOpenBench={onOpenBench} />
      ))}
      {skills.other.map((recipe) => (
        <Typography key={recipe.item} variant="body2" color="text.secondary" sx={{ py: 0.5 }} data-testid="tradeskill-plan-unskilled">
          {unskilledText(recipe)}
        </Typography>
      ))}
      {allMet && (
        <Typography variant="body2" color="success.main" sx={{ pt: 0.5 }} data-testid="tradeskill-plan-all-met">
          {ALL_MET_TEXT}
        </Typography>
      )}
      {routes.length > 0 && (
        <Box sx={{ mt: 1.5 }} data-testid="tradeskill-plan-routes">
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Shortest way there
          </Typography>
          {routes.map((route) => (
            <RouteBlock key={route.tradeskill} route={route} onOpenBench={onOpenBench} />
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }} data-testid="tradeskill-plan-chance-note">
        {CHANCE_NOTE}
      </Typography>
    </Paper>
  )
}
