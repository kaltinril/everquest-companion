// tradeskills/PlannerSearch.tsx — the "Make an item" search: one box over every craftable item
// across all tradeskills, and its results. Home draws it in a panel; the planner screen draws the
// box in its head and the results in place of the plan while something is typed.
//
// Which items there are, which match and in what order are shared/tradeskillPlan.ts
// (`planChoices`, `searchChoices`). A result's name is the section's standard item link (the item
// window on hover, the Loot page on click); "Plan" beside it is what opens the plan.

import { type JSX, useDeferredValue, useMemo } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import {
  PLAN_SEARCH_HINT,
  choiceCountText,
  choiceFacts,
  planChoices,
  searchChoices,
  searchEmptyText,
  searchMoreText,
  type PlanChoice,
  type PlanChoices,
  type PlanDeps,
  type PlanSearch
} from '@shared/tradeskillPlan'
import { SearchField } from '../../lib/SearchField'
import { EraChip } from '../planner/PlannerChips'
import { eraHides } from '../planner/plannerData'
import { ItemLabel } from './tradeskillLinks'

export interface PlanSearchState {
  choices: PlanChoices
  /** What the typed text finds; empty until something is typed. */
  found: PlanSearch
  /** Something is typed: the results stand in for whatever was under the box. */
  typed: boolean
  /** The list has caught up with the box: only then is "nothing matches" true. */
  settled: boolean
}

/** The search's choices under the era setting, and what the (deferred) text finds among them. */
export function usePlanSearchState(deps: PlanDeps, eraOnly: boolean, query: string): PlanSearchState {
  // `deps.index` is rebuilt when the player's log meets more (tradeskillData.useBookIndex), so the era verdicts follow.
  const choices = useMemo(() => planChoices(deps, eraOnly ? (recipe) => eraHides(recipe, true) : undefined), [deps, eraOnly])
  // Deferred, the workbench's way, so typing never waits on the list.
  const text = useDeferredValue(query)
  const found = useMemo(() => searchChoices(choices.list, text), [choices, text])
  return { choices, found, typed: query.trim() !== '', settled: text === query }
}

/**
 * The box and how many craftable items it searches. What the era setting hides is not counted
 * here: the section's header states it once, for Home and the planner alike (two different
 * counts stood side by side on Home, one of recipes and one of items).
 */
export function PlanSearchBox({ query, onQuery, state }: { query: string; onQuery: (q: string) => void; state: PlanSearchState }): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, flexShrink: 0 }}>
      <SearchField
        query={query}
        onChange={onQuery}
        placeholder="Search every craftable item"
        testid="tradeskill-plan-search"
        clearTestid="tradeskill-plan-search-clear"
        ariaLabel="Search every craftable item by name"
        clearLabel="Clear the search"
        sx={{ width: 320 }}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-count">
        {choiceCountText(state.choices.list.length)}
      </Typography>
    </Stack>
  )
}

function ResultRow({ choice, onPlan }: { choice: PlanChoice; onPlan: (choice: PlanChoice) => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.25, minWidth: 0 }} data-testid="tradeskill-plan-result">
      <Button
        size="small"
        variant="outlined"
        onClick={() => {
          onPlan(choice)
        }}
        aria-label={`Plan ${choice.item}`}
        data-testid="tradeskill-plan-pick"
        sx={{ flexShrink: 0, minWidth: 0, py: 0, px: 1 }}
      >
        Plan
      </Button>
      <ItemLabel name={choice.item} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap data-testid="tradeskill-plan-result-facts">
        {choiceFacts(choice)}
      </Typography>
      <EraChip subject={choice.recipes[0]} />
    </Stack>
  )
}

/** The results of a typed search; the hint line while nothing is typed and `hint` asks for it. */
export function PlanSearchResults(props: { state: PlanSearchState; eraOnly: boolean; onPlan: (choice: PlanChoice) => void; hint?: boolean }): JSX.Element | null {
  const { state, eraOnly, onPlan, hint } = props
  if (!state.typed) {
    if (hint !== true) return null
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-hint">
        {PLAN_SEARCH_HINT}
      </Typography>
    )
  }
  const more = searchMoreText(state.found.more)
  return (
    <Box data-testid="tradeskill-plan-results">
      {state.settled && state.found.shown.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-none">
          {searchEmptyText(eraOnly)}
        </Typography>
      )}
      {state.found.shown.map((choice) => (
        <ResultRow key={choice.key} choice={choice} onPlan={onPlan} />
      ))}
      {more !== '' && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-more">
          {more}
        </Typography>
      )}
    </Box>
  )
}
