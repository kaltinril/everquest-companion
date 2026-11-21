// tradeskills/RecipeFilters.tsx — the recipe table's two narrowing switches, beside Hide trivial:
//
//   Can make now          only recipes the player holds every material for, with how many there
//                         are. Disabled, with the reason, when nothing says what is held (no
//                         inventory dump and no depot line in the log).
//   Missing on the wiki   only recipes the wiki lists no materials or no trivial for, with how
//                         many there are. Each such line links to its wiki page (RecipeTable.tsx).
//
// Which recipes pass, the counts and every word are shared/tradeskillHeld.ts and
// shared/tradeskillWiki.ts; this file holds the two switches and remembers them.

import { type JSX, useMemo } from 'react'
import { FormControlLabel, Switch, Typography } from '@mui/material'
import type { BookRecipe, LadderFilter } from '@shared/tradeskillBook'
import { CAN_MAKE_SWITCH_TIP, HELD_UNKNOWN_SHORT, HELD_UNKNOWN_TEXT, benchFilters, canMakeSwitchLabel, heldKnown, makeableNow } from '@shared/tradeskillHeld'
import { haveLookup } from '@shared/tradeskillMaterials'
import { WIKI_GAP_TIP, wikiGapCount, wikiGapSwitchLabel } from '@shared/tradeskillWiki'
import { Tooltip } from '../../lib/Tooltip'
import type { BenchFacts } from './benchFacts'
import { useCanMakeOnly, useWikiGapsOnly } from './tradeskillMemory'

const NONE: ReadonlyMap<string, number> = new Map()

export interface RecipeFilterState {
  /** What the ladder keeps (`LadderAsk.only`): the switches that are on and usable. */
  only: readonly LadderFilter[]
  /** By recipe `id`: the combines the held materials cover. Empty when nothing says what is held. */
  makeable: ReadonlyMap<string, number>
  /** False when there is no inventory dump and no depot line: "Can make now" cannot be used. */
  known: boolean
  canMake: boolean
  setCanMake: (on: boolean) => void
  wikiGaps: boolean
  setWikiGaps: (on: boolean) => void
  /** How many of the tradeskill's recipes the wiki lacks something for. */
  gaps: number
  /** Changes when the switches change the list, for the table's `resetKey`. */
  key: string
}

/** The two switches' state for one tradeskill's recipes (`skillRecipes`, the era setting applied). */
export function useRecipeFilters(facts: BenchFacts, recipes: readonly BookRecipe[]): RecipeFilterState {
  const { index, guides, held, craft } = facts
  const [canMake, setCanMake] = useCanMakeOnly()
  const [wikiGaps, setWikiGaps] = useWikiGapsOnly()
  const known = heldKnown(held, craft)
  const makeable = useMemo(
    () => (known ? makeableNow({ index, guides, have: haveLookup(held, craft) }, recipes) : NONE),
    [known, index, guides, held, craft, recipes]
  )
  const gaps = useMemo(() => wikiGapCount(recipes), [recipes])
  const only = useMemo(() => benchFilters(canMake && known ? makeable : null, wikiGaps), [canMake, known, makeable, wikiGaps])
  return { only, makeable, known, canMake, setCanMake, wikiGaps, setWikiGaps, gaps, key: `${String(canMake && known)}|${String(wikiGaps)}` }
}

export function RecipeFilterSwitches({ state }: { state: RecipeFilterState }): JSX.Element {
  const { known } = state
  return (
    <>
      <Tooltip title={known ? CAN_MAKE_SWITCH_TIP : HELD_UNKNOWN_TEXT}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={state.canMake && known}
              disabled={!known}
              onChange={(_e, on) => {
                state.setCanMake(on)
              }}
              data-testid="tradeskill-can-make-only"
            />
          }
          label={canMakeSwitchLabel(known ? state.makeable.size : null)}
        />
      </Tooltip>
      {!known && (
        <Typography variant="caption" color="text.secondary" data-testid="tradeskill-can-make-why">
          {HELD_UNKNOWN_SHORT}
        </Typography>
      )}
      <Tooltip title={WIKI_GAP_TIP}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={state.wikiGaps}
              onChange={(_e, on) => {
                state.setWikiGaps(on)
              }}
              data-testid="tradeskill-wiki-gaps-only"
            />
          }
          label={wikiGapSwitchLabel(state.gaps)}
        />
      </Tooltip>
    </>
  )
}
