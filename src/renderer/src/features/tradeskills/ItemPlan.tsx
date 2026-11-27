// tradeskills/ItemPlan.tsx — one planned item, the mockup's "Make an item" layout: a head with
// the item and the recipe shown (picked from several when several make it, with how many there
// are), then "What it takes" beside "Where you stand" and "Shortest way there", then "What to
// gather" for N. When every skill the plan needs is already met, "Where you stand" is one line in
// the head instead and "What it takes" has the full width.
//
// The tree, the skills, the routes and the roll-up are shared/tradeskillPlan*.ts; this file only
// calls them with the section's facts and lays the panels out.

import { type JSX, useMemo } from 'react'
import { Box, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { recipeFacts, type BookRecipe } from '@shared/tradeskillBook'
import { recipeGuideCreditText } from '@shared/tradeskillGuide'
import { haveSourceText, logCountsInUse } from '@shared/tradeskillHistory'
import { lastPaid } from '@shared/tradeskillMoney'
import { planTree, recipeCountText, recipeOptionText, treeDrawsGuide, type PlanDeps } from '@shared/tradeskillPlan'
import { PLAN_CAN_MAKE_LABEL, gatherFor, gatherHeld, planCanMakeTip, planHave, planPrice } from '@shared/tradeskillPlanGather'
import { skillNeeds, skillRoutes, skillsAllMet } from '@shared/tradeskillPlanLevels'
import { withCount, withExpanded, withRecipe, type PlanMemory } from '@shared/tradeskillPlanMemory'
import OutputKindLine from '../../components/OutputKindLine'
import { formatDate } from '../../lib/formatDate'
import { Tooltip } from '../../lib/Tooltip'
import { EraChip } from '../planner/PlannerChips'
import { FactsProvider, type BenchFacts } from './benchFacts'
import { ItemPlanGather } from './ItemPlanGather'
import { ItemPlanSkills, PlanStandLine, type OpenBench } from './ItemPlanSkills'
import { ItemPlanTree } from './ItemPlanTree'
import { RecipeWish } from './RecipeWish'
import type { SkillLevels } from './tradeskillData'
import { ItemLabel } from './tradeskillLinks'

/** Which of an item's recipes the plan shows, when several make it. */
function RecipePicker(props: { deps: PlanDeps; recipes: readonly BookRecipe[]; recipe: BookRecipe; onPick: (id: string) => void }): JSX.Element | null {
  const { deps, recipes, recipe, onPick } = props
  if (recipes.length < 2) return null
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mt: 0.75 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-recipe-count">
        {recipeCountText(recipes.length)}
      </Typography>
      <TextField
        select
        size="small"
        value={recipe.id}
        onChange={(e) => {
          onPick(e.target.value)
        }}
        slotProps={{ htmlInput: { 'aria-label': 'Which recipe to plan', 'data-testid': 'tradeskill-plan-recipe' } }}
        sx={{ minWidth: 260, maxWidth: '100%' }}
      >
        {recipes.map((option) => (
          <MenuItem key={option.id} value={option.id}>
            {recipeOptionText(deps, option)}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  )
}

/** Under the plan: where Have comes from, and the recipe guide's credit when the tree drew from it. */
function PlanFoot({ facts, credited }: { facts: BenchFacts; credited: boolean }): JSX.Element {
  const { held, craft } = facts
  const dump = held.index === null ? null : { at: held.dumpedAt }
  const have = haveSourceText(held.dumpedAt === null ? null : formatDate(held.dumpedAt), logCountsInUse(craft, dump))
  return (
    <Box>
      <OutputKindLine kind="inventory" quiet loadedAt={held.readAt} testId="tradeskill-plan-dump-line" />
      {have !== '' && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-plan-have-date">
          {have}
        </Typography>
      )}
      {credited && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} data-testid="tradeskill-plan-guide-credit">
          {recipeGuideCreditText()}
        </Typography>
      )}
    </Box>
  )
}

export interface ItemPlanProps {
  /** The recipe shown, and every recipe that makes the item (the picker's options). */
  recipe: BookRecipe
  recipes: readonly BookRecipe[]
  deps: PlanDeps
  facts: BenchFacts
  levels: SkillLevels
  plan: PlanMemory
  setPlan: (next: PlanMemory) => void
  onOpenBench: OpenBench
}

export function ItemPlan({ recipe, recipes, deps, facts, levels, plan, setPlan, onOpenBench }: ItemPlanProps): JSX.Element {
  const { held, craft } = facts
  const tree = useMemo(() => planTree(deps, recipe, { paid: (key) => lastPaid(craft, key) !== null }), [deps, recipe, craft])
  const skills = useMemo(() => skillNeeds(tree, levels.rows), [tree, levels.rows])
  const routes = useMemo(() => skillRoutes(deps, skills.needs), [deps, skills])
  const gather = useMemo(() => {
    const have = planHave({ index: held.index, dumpedAt: held.dumpedAt }, craft)
    return gatherFor(tree, { count: plan.count, have, price: planPrice(craft) })
  }, [tree, plan.count, held.index, held.dumpedAt, craft])
  const credited = useMemo(() => treeDrawsGuide(deps, tree), [deps, tree])
  // Nothing short and nothing to route: the standing is one line in the head, and the tree has the width.
  const clear = levels.served && routes.length === 0 && skillsAllMet(skills)
  return (
    <FactsProvider value={facts}>
      <Stack spacing={1.5} data-testid="tradeskill-plan">
        <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="tradeskill-plan-head">
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <ItemLabel name={recipe.item} bold />
            {/* Everything on the gather list is held: the same mark a recipe wears on the workbench. */}
            {gatherHeld(gather) && (
              <Tooltip title={planCanMakeTip(gather.count, recipe.item)}>
                <Chip size="small" color="success" variant="outlined" label={PLAN_CAN_MAKE_LABEL} sx={{ height: 18, fontSize: 10 }} data-testid="tradeskill-plan-can-make" />
              </Tooltip>
            )}
            <EraChip subject={recipe} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskill-plan-facts">
              {recipeFacts(recipe, true)}
            </Typography>
            {/* The app's one wish control: a wished item is listed on Home under Working towards. */}
            <Box sx={{ ml: 'auto', minWidth: 0, display: 'flex' }}>
              <RecipeWish recipe={recipe} testId="tradeskill-plan-wish" />
            </Box>
          </Stack>
          <RecipePicker
            deps={deps}
            recipes={recipes}
            recipe={recipe}
            onPick={(id) => {
              setPlan(withRecipe(plan, id))
            }}
          />
          {clear && <PlanStandLine skills={skills} onOpenBench={onOpenBench} />}
        </Paper>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: clear ? 'minmax(0, 1fr)' : 'minmax(0, 3fr) minmax(0, 2fr)' }, gap: 1.5, alignItems: 'start' }}>
          <ItemPlanTree
            tree={tree}
            controls={{
              expanded: new Set(plan.expanded),
              setExpanded: (key, open) => {
                setPlan(withExpanded(plan, key, open))
              }
            }}
          />
          {!clear && <ItemPlanSkills skills={skills} routes={routes} served={levels.served} onOpenBench={onOpenBench} />}
        </Box>
        <ItemPlanGather
          gather={gather}
          item={recipe.item}
          onCount={(raw) => {
            setPlan(withCount(plan, raw))
          }}
        />
        <PlanFoot facts={facts} credited={credited} />
      </Stack>
    </FactsProvider>
  )
}
