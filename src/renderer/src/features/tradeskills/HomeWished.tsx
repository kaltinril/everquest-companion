// tradeskills/HomeWished.tsx — "Working towards" on the section's Home (owner, 2026-11-20: "so
// they can work towards it"): the wish list's items that a recipe makes, each with the recipe's
// tradeskill and trivial against the player's level, what one takes against what is held, and a
// link that opens Make an item on it.
//
// The wish list is the app's one (`wishlist/useWishlist`): a crafted item wished on the Gear tab
// or the Loot page is listed here too, and one wished here (RecipeWish.tsx) is on the Wish list
// tab like any other. Which wishes, which recipe and every count and sentence are
// shared/tradeskillWished.ts; the counts are the planner's own gather list for one.
//
// Not drawn: before the wish list and the skill levels have loaded, and when no wished item has
// a recipe.

import { type JSX, useMemo } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'
import type { PlanDeps } from '@shared/tradeskillPlan'
import { GATHER_NOTE, planHave } from '@shared/tradeskillPlanGather'
import { heldKnown } from '@shared/tradeskillHeld'
import { lastPaid } from '@shared/tradeskillMoney'
import {
  WISHED_HEADING,
  WISHED_SUBTITLE,
  wishedCrafts,
  wishedHeldText,
  wishedMaterialsText,
  wishedSkillText,
  type WishedCraft
} from '@shared/tradeskillWished'
import { Tooltip } from '../../lib/Tooltip'
import { EraChip } from '../planner/PlannerChips'
import { useWishlist } from '../wishlist/useWishlist'
import type { HomeFacts } from './HomePickUp'
import { ItemLabel } from './tradeskillLinks'

/** Opens Make an item on an item, with the recipe to show. */
export type OpenPlan = (item: string, recipe: string) => void

function WishedRow({ wished, onPlan }: { wished: WishedCraft; onPlan: OpenPlan }): JSX.Element {
  const heldText = wishedHeldText(wished)
  return (
    <Box sx={{ py: 0.5, borderTop: 1, borderColor: 'divider', minWidth: 0 }} data-testid="tradeskills-wished-row">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25, minWidth: 0 }}>
        {/* The name opens the plan for it. */}
        <Box sx={{ minWidth: 0, display: 'flex' }} data-testid="tradeskills-wished-plan">
          <ItemLabel
            name={wished.recipe.item}
            bold
            act={() => {
              onPlan(wished.key, wished.recipe.id)
            }}
          />
        </Box>
        <EraChip subject={wished.recipe} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskills-wished-skill">
          {wishedSkillText(wished)}
        </Typography>
        {heldText !== '' && (
          <Typography variant="body2" sx={{ color: 'success.main' }} data-testid="tradeskills-wished-held">
            {heldText}
          </Typography>
        )}
      </Stack>
      <Tooltip title={GATHER_NOTE}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="tradeskills-wished-materials">
          {wishedMaterialsText(wished)}
        </Typography>
      </Tooltip>
    </Box>
  )
}

export function HomeWished({ facts, onPlan }: { facts: HomeFacts; onPlan: OpenPlan }): JSX.Element | null {
  const { index, guides, levels, craft, held } = facts
  const wishlist = useWishlist()
  const rows = useMemo(() => {
    if (!wishlist.ready || !levels.served) return []
    const deps: PlanDeps = { index, guides }
    const have = heldKnown(held, craft) ? planHave({ index: held.index, dumpedAt: held.dumpedAt }, craft) : null
    return wishedCrafts({ deps, wishes: wishlist.list.entries, rows: levels.rows, have, paid: (key) => lastPaid(craft, key) !== null })
  }, [wishlist.ready, wishlist.list, index, guides, levels, craft, held])
  if (rows.length === 0) return null
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }} data-testid="tradeskills-wished">
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {WISHED_HEADING}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {WISHED_SUBTITLE}
        </Typography>
      </Stack>
      {rows.map((wished) => (
        <WishedRow key={wished.key} wished={wished} onPlan={onPlan} />
      ))}
    </Paper>
  )
}
