// tradeskills/Planner.tsx — "Make an item" (owner, 2026-11-20: "perhaps you want to level a
// tradeskill to make 1 specific item (like the quiver everyone wants)"). The section's third
// screen, beside Home and a workbench: a search over every craftable item, and the chosen item's
// plan (ItemPlan.tsx).
//
// It is reached from Home's "Make an item" panel (`PlannerHomePanel` below) and from "Plan this
// item" on a workbench's picked recipe. The chosen item, its recipe, the count and the materials
// marked "get it instead" are remembered across restarts, the search text for the session
// (plannerMemory.ts), so Back from a link out (an item's Loot page, a mob, the Maps tab) returns
// to the same plan; the scroll position rides lib/navReturn, the recipe table's way.

import { type JSX, type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import type { BookIndex } from '@shared/tradeskillBook'
import { itemRecipes, pickRecipe, type PlanChoice, type PlanDeps } from '@shared/tradeskillPlan'
import { withItem, type PlanMemory } from '@shared/tradeskillPlanMemory'
import { parkReturn } from '../../lib/navReturn'
import type { BenchFacts } from './benchFacts'
import { ItemPlan } from './ItemPlan'
import type { OpenBench } from './ItemPlanSkills'
import { PlanSearchBox, PlanSearchResults, usePlanSearchState } from './PlannerSearch'
import { usePlanSearch } from './plannerMemory'
import { useCrafting, useGuides, useHeld, useSkillLevels } from './tradeskillData'
import { ItemLabel } from './tradeskillLinks'

/** What Back restores (lib/navReturn) when the reader left from the planner: where it was scrolled. */
export interface PlanReturn {
  planner: true
  scrollTop: number
}

export function isPlanReturn(state: unknown): state is PlanReturn {
  return typeof state === 'object' && state !== null && (state as { planner?: unknown }).planner === true
}

/** The plan's facts and its dependencies, read the workbench's way. */
function usePlanFacts(index: BookIndex, eraOnly: boolean): { facts: BenchFacts; deps: PlanDeps } {
  const held = useHeld()
  const guides = useGuides()
  const { craft, money } = useCrafting(index)
  const facts = useMemo((): BenchFacts => ({ index, held, eraOnly, craft, money, guides }), [index, held, eraOnly, craft, money, guides])
  const deps = useMemo((): PlanDeps => ({ index, guides }), [index, guides])
  return { facts, deps }
}

/**
 * The scroller's place: put back once where Back left it, and parked when the screen unmounts.
 * The parked value is kept from the last scroll, since the node is gone when a cleanup runs.
 */
function usePlanScroll(restoreTop: number | null): { ref: RefObject<HTMLDivElement | null>; onScroll: () => void } {
  const ref = useRef<HTMLDivElement>(null)
  const top = useRef(restoreTop ?? 0)
  useLayoutEffect(() => {
    if (restoreTop !== null && ref.current !== null) ref.current.scrollTop = restoreTop
  }, [restoreTop])
  useEffect(
    () => () => {
      const parked: PlanReturn = { planner: true, scrollTop: top.current }
      parkReturn('tradeskills', parked)
    },
    []
  )
  const onScroll = (): void => {
    if (ref.current !== null) top.current = ref.current.scrollTop
  }
  return { ref, onScroll }
}

export interface PlannerProps {
  index: BookIndex
  eraOnly: boolean
  plan: PlanMemory
  setPlan: (next: PlanMemory) => void
  /** The way out of the planner: Home, or the workbench it was opened over. */
  back: { label: string; go: () => void }
  onOpenBench: OpenBench
  /** Where the plan was scrolled when a link left the tab, after Back; null on every other arrival. */
  restoreTop: number | null
}

export function Planner({ index, eraOnly, plan, setPlan, back, onOpenBench, restoreTop }: PlannerProps): JSX.Element {
  const levels = useSkillLevels()
  const { facts, deps } = usePlanFacts(index, eraOnly)
  const [query, setQuery] = usePlanSearch()
  const search = usePlanSearchState(deps, eraOnly, query)
  const scroll = usePlanScroll(restoreTop)
  const recipes = useMemo(() => (plan.item === null ? [] : itemRecipes(deps, plan.item)), [deps, plan.item])
  const recipe = pickRecipe(recipes, plan.recipe)
  const onPlan = (choice: PlanChoice): void => {
    setQuery('')
    setPlan(withItem(plan, choice.key))
  }
  return (
    <Stack spacing={1} sx={{ flexGrow: 1, minHeight: 0 }} data-testid="tradeskill-planner">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, flexShrink: 0 }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={back.go} data-testid="tradeskill-plan-back">
          {back.label}
        </Button>
        <Typography variant="h6">Make an item</Typography>
        <PlanSearchBox query={query} onQuery={setQuery} state={search} />
      </Stack>
      <Box ref={scroll.ref} onScroll={scroll.onScroll} sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="tradeskill-plan-scroll">
        <PlanSearchResults state={search} eraOnly={eraOnly} onPlan={onPlan} hint={recipe === null} />
        {!search.typed && recipe !== null && (
          <ItemPlan recipe={recipe} recipes={recipes} deps={deps} facts={facts} levels={levels} plan={plan} setPlan={setPlan} onOpenBench={onOpenBench} />
        )}
      </Box>
    </Stack>
  )
}

export interface PlannerHomePanelProps {
  index: BookIndex
  eraOnly: boolean
  plan: PlanMemory
  /** Opens the planner, on an item when one is given, else on the plan it remembers. */
  onPlan: (item?: string) => void
}

/** Home's door to the planner: the search over every craftable item, and the plan left open last time. */
export function PlannerHomePanel({ index, eraOnly, plan, onPlan }: PlannerHomePanelProps): JSX.Element {
  const guides = useGuides()
  const deps = useMemo((): PlanDeps => ({ index, guides }), [index, guides])
  const [query, setQuery] = usePlanSearch()
  const search = usePlanSearchState(deps, eraOnly, query)
  const last = plan.item === null ? null : pickRecipe(itemRecipes(deps, plan.item), plan.recipe)
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid="tradeskill-plan-home">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Make an item
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pick any craftable item: every material down to its leaves, the skills it takes, and what to gather.
        </Typography>
      </Stack>
      <PlanSearchBox query={query} onQuery={setQuery} state={search} />
      <Box sx={{ mt: 0.5, maxHeight: '40vh', overflow: 'auto' }}>
        <PlanSearchResults
          state={search}
          eraOnly={eraOnly}
          onPlan={(choice) => {
            setQuery('')
            onPlan(choice.key)
          }}
        />
      </Box>
      {!search.typed && last !== null && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, minWidth: 0 }} data-testid="tradeskill-plan-continue">
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            Your plan:
          </Typography>
          <ItemLabel name={last.item} />
          <Button
            size="small"
            onClick={() => {
              onPlan()
            }}
            data-testid="tradeskill-plan-open"
            sx={{ flexShrink: 0 }}
          >
            Open the plan
          </Button>
        </Stack>
      )}
    </Paper>
  )
}
