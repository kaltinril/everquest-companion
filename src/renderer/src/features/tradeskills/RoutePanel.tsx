// tradeskills/RoutePanel.tsx — "Your route" on a workbench (owner, 2026-11-20: level "efficently
// (for money reduction) or fast ... or fun"; "this person should think DANG this is THE PLACE to
// go"): a goal switch, the route for the open tradeskill from the player's level up, and beside
// it the shopping list for the route's next step (ShoppingPanel.tsx).
//
// "Only use materials I have" sits beside the goals, remembered per tradeskill like the goal: on,
// Cheapest and Fastest are built only from recipes the player holds every material for
// (shared/tradeskillRouteHeld.ts), and Faction lists only the turn-ins that can be made now. It
// is disabled, with the reason beside it, when nothing says what is held, and on the two goals it
// does not change.
//
// Four goals are a route from the recipe book (`BookRoute` below): the route, its ranking and
// every word are shared/tradeskillRoute.ts, and this file maps over what it returns. No chance,
// no number of combines and no total is drawn: nobody has measured them, and the route's own
// lines say so. A step opens its recipe on the Recipes tab. The fifth goal, Faction, is a
// faction's turn-ins and not a climb: FactionRoute.tsx draws it, with the same shopping list.

import { type JSX, useMemo } from 'react'
import { Box, Chip, FormControlLabel, Paper, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useHideTrivial } from './tradeskillMemory'
import { HELD_ONLY_LABEL, HELD_ONLY_TIP, heldKnown, heldOnlyBlockedText } from '@shared/tradeskillHeld'
import { haveLookup } from '@shared/tradeskillMaterials'
import {
  GOAL_LABELS,
  ROUTE_GOALS,
  ROUTE_STEP_TIP,
  buildRoute,
  capTop,
  heldOnlyApplies,
  isBookGoal,
  moreStepsText,
  routeEndText,
  type BookGoal,
  type Route,
  type RouteGoal,
  type RouteGroup
} from '@shared/tradeskillRoute'
import { containerText, type RouteFacts, type RouteStep } from '@shared/tradeskillRouteStep'
import { SKILLS_MODULE } from '@shared/skills'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import OutputKindLine from '../../components/OutputKindLine'
import { Tooltip } from '../../lib/Tooltip'
import { EraChip } from '../planner/PlannerChips'
import { FactsProvider, type BenchFacts } from './benchFacts'
import { FactionRoute } from './FactionRoute'
import { useGoal, useHeldOnly } from './routeMemory'
import { ShoppingPanel } from './ShoppingPanel'
import { ItemLabel } from './tradeskillLinks'

const CHIP_SX = { height: 18, fontSize: 10 } as const

/** The stretch of skill, then the item and what the data says of it. */
const STEP_SX = {
  display: 'grid',
  gridTemplateColumns: '112px minmax(0, 1fr)',
  columnGap: 1.5,
  py: 0.75,
  px: 0.5,
  borderBottom: 1,
  borderColor: 'divider'
} as const

/** The two panes side by side on a wide window, stacked on a narrow one. */
const PANES_SX = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
  gap: 1.5,
  flexGrow: 1,
  minHeight: 0,
  overflow: { xs: 'auto', lg: 'hidden' }
} as const

const PANE_SX = { p: 1.5, minHeight: 0, overflow: { xs: 'visible', lg: 'auto' }, overscrollBehavior: 'contain' } as const

function GoalSwitch({ goal, onGoal }: { goal: RouteGoal; onGoal: (goal: RouteGoal) => void }): JSX.Element {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={goal}
      onChange={(_e, next: RouteGoal | null) => {
        if (next !== null) onGoal(next)
      }}
      aria-label="Goal"
      data-testid="tradeskill-goals"
    >
      {ROUTE_GOALS.map((id) => (
        <ToggleButton key={id} value={id} data-testid={`tradeskill-goal-${id}`}>
          {GOAL_LABELS[id]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

interface HeldSwitchProps {
  on: boolean
  onChange: (on: boolean) => void
  /** Why the switch cannot be used here; '' when it can. */
  blocked: string
}

/** "Only use materials I have": disabled, with the reason beside it, where it cannot apply. */
function HeldSwitch({ on, onChange, blocked }: HeldSwitchProps): JSX.Element {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Tooltip title={HELD_ONLY_TIP}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={on && blocked === ''}
              disabled={blocked !== ''}
              onChange={(_e, next) => {
                onChange(next)
              }}
              data-testid="tradeskill-held-only"
            />
          }
          label={HELD_ONLY_LABEL}
        />
      </Tooltip>
      {blocked !== '' && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-held-only-why">
          {blocked}
        </Typography>
      )}
    </Stack>
  )
}

/** What the route ranks on, then what it does not know. */
function Basis({ route }: { route: Route }): JSX.Element {
  return (
    <Box>
      <Typography variant="body2" data-testid="tradeskill-route-basis">
        {route.basis}
      </Typography>
      {route.caveats.map((caveat) => (
        <Typography key={caveat} variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-route-caveat">
          {caveat}
        </Typography>
      ))}
    </Box>
  )
}

/** One fact of a step on its own line; nothing when the data states none. */
function StepLine({ text, id, color }: { text: string; id: string; color?: string }): JSX.Element | null {
  if (text === '') return null
  return (
    <Typography variant="caption" sx={{ color: color ?? 'text.secondary', display: 'block' }} data-testid={`tradeskill-route-${id}`}>
      {text}
    </Typography>
  )
}

/** The step's item: the standard item link for a wiki item, else the name as the guide wrote it. */
function StepName({ step }: { step: RouteStep }): JSX.Element {
  if (!step.linked) {
    return (
      <Typography variant="body2" component="span" sx={{ fontWeight: 600 }} data-testid="tradeskill-route-plain-name">
        {step.name}
      </Typography>
    )
  }
  return (
    // The name opens its Loot page; the click stops here so it does not also open the recipe.
    <Box
      component="span"
      sx={{ minWidth: 0 }}
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
      <ItemLabel name={step.name} bold />
    </Box>
  )
}

interface StepRowProps {
  step: RouteStep
  /** The route's first step: the one the shopping list is for. */
  next: boolean
  onOpenRecipe: (id: string) => void
}

function StepRow({ step, next, onOpenRecipe }: StepRowProps): JSX.Element {
  const { recipe } = step
  const open = recipe === null ? undefined : () => onOpenRecipe(recipe.id)
  return (
    <Box
      sx={{ ...STEP_SX, cursor: open === undefined ? 'default' : 'pointer', '&:hover': open === undefined ? {} : { bgcolor: 'action.hover' } }}
      onClick={open}
      title={open === undefined ? undefined : ROUTE_STEP_TIP}
      data-testid="tradeskill-route-step"
      data-recipe={recipe?.id ?? ''}
    >
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, color: next ? 'primary.main' : 'text.primary' }} data-testid="tradeskill-route-range">
          {step.range}
        </Typography>
        {next && <Chip size="small" color="primary" label="next step" sx={CHIP_SX} data-testid="tradeskill-route-next" />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
          <StepName step={step} />
          {containerText(recipe) !== '' && (
            <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }} data-testid="tradeskill-route-container">
              {containerText(recipe)}
            </Typography>
          )}
          {recipe !== null && <EraChip subject={recipe} outOnly />}
        </Stack>
        <StepLine id="why" text={step.why} color="text.primary" />
        <StepLine id="aside" text={step.aside} />
        <StepLine id="money" text={step.money} />
        <StepLine id="hand" text={step.handText} />
        <StepLine id="record" text={step.record} />
      </Box>
    </Box>
  )
}

interface GroupProps {
  group: RouteGroup
  route: Route
  onOpenRecipe: (id: string) => void
}

function Group({ group, route, onOpenRecipe }: GroupProps): JSX.Element {
  const more = moreStepsText(group, capTop(route))
  return (
    <Box data-testid="tradeskill-route-group" data-group={group.id}>
      {group.heading !== '' && (
        <Typography variant="subtitle2" sx={{ mt: 1 }} data-testid="tradeskill-route-heading">
          {group.heading}
        </Typography>
      )}
      {group.steps.map((step) => (
        <StepRow key={step.id} step={step} next={step === route.next} onOpenRecipe={onOpenRecipe} />
      ))}
      <StepLine id="more" text={more} />
    </Box>
  )
}

interface RouteListProps {
  route: Route
  tradeskill: Tradeskill
  onOpenRecipe: (id: string) => void
}

/** The route's steps, or why it has none; then where the data ends and whose work it drew from. */
function RouteList({ route, tradeskill, onOpenRecipe }: RouteListProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={PANE_SX} data-testid="tradeskill-route-list">
      <Typography variant="subtitle2">Your route</Typography>
      {route.empty !== '' && (
        <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }} data-testid="tradeskill-route-empty">
          {route.empty}
        </Typography>
      )}
      {route.groups.map((group) => (
        <Group key={group.id} group={group} route={route} onOpenRecipe={onOpenRecipe} />
      ))}
      <StepLine id="end" text={routeEndText(route, tradeskill)} />
      {route.credits.map((credit) => (
        <Typography key={credit} variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }} data-testid="tradeskill-route-credit">
          {credit}
        </Typography>
      ))}
    </Paper>
  )
}

interface BookRouteProps {
  tradeskill: Tradeskill
  level: number | null
  goal: BookGoal
  heldOnly: boolean
  facts: RouteFacts
  eraOnly: boolean
  onOpenRecipe: (id: string) => void
}

/** One of the four goals built from the recipe book: what it ranks on, its steps, and the shopping list for the next one. */
function BookRoute({ tradeskill, level, goal, heldOnly, facts, eraOnly, onOpenRecipe }: BookRouteProps): JSX.Element {
  // The Recipes tab's switch, read here too: a recipe hidden there as trivial is not offered here.
  const [hideTrivial] = useHideTrivial()
  const route = useMemo(() => buildRoute(facts, { tradeskill, level, goal, heldOnly, hideTrivial }), [facts, tradeskill, level, goal, heldOnly, hideTrivial])
  return (
    <>
      <Basis route={route} />
      <Box sx={PANES_SX}>
        <RouteList route={route} tradeskill={tradeskill} onOpenRecipe={onOpenRecipe} />
        <ShoppingPanel step={route.next} facts={facts} eraOnly={eraOnly} />
      </Box>
    </>
  )
}

export interface RoutePanelProps {
  tradeskill: Tradeskill
  /** Null: the log has not shown the skill; the route then starts from 0. */
  level: number | null
  /** False while the level is not known yet: no route is drawn from a level that is about to change. */
  ready: boolean
  facts: BenchFacts
  /** Opens a recipe (by its `id`) on the recipes tab. */
  onOpenRecipe: (id: string) => void
}

export function RoutePanel({ tradeskill, level, ready, facts, onOpenRecipe }: RoutePanelProps): JSX.Element {
  const { index, craft, guides, money, held, eraOnly } = facts
  const [goal, setGoal] = useGoal(tradeskill)
  const [heldChoice, setHeldChoice] = useHeldOnly(tradeskill)
  // The switch is the player's choice; it takes effect only where the held counts are known and the goal reads it.
  const blocked = heldOnlyBlockedText(heldKnown(held, craft), heldOnlyApplies(goal))
  const heldOnly = heldChoice && blocked === ''
  const routeFacts = useMemo((): RouteFacts => ({ index, craft, guides, money, have: haveLookup(held, craft) }), [index, craft, guides, money, held])
  const shared = { tradeskill, level, heldOnly, facts: routeFacts, eraOnly, onOpenRecipe }
  return (
    <FactsProvider value={facts}>
      <Stack spacing={1} sx={{ flexGrow: 1, minHeight: 0 }} data-testid="tradeskill-route" data-goal={goal} data-held-only={heldOnly}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <GoalSwitch goal={goal} onGoal={setGoal} />
          <HeldSwitch on={heldChoice} onChange={setHeldChoice} blocked={blocked} />
          <OutputKindLine kind="inventory" quiet loadedAt={held.readAt} testId="tradeskills-route-dump-line" />
        </Stack>
        {/* Until the engine serves the skills module the level is unknown, not 0: say what the app waits on. */}
        {!ready && <LogReadInline module={SKILLS_MODULE} served={false} />}
        {ready && isBookGoal(goal) && <BookRoute {...shared} goal={goal} />}
        {ready && goal === 'faction' && <FactionRoute {...shared} />}
      </Stack>
    </FactsProvider>
  )
}
