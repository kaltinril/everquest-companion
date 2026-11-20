// tradeskills/RecipePanel.tsx — the picked recipe in full: each material with how many the combine
// takes, how many the inventory dump holds, the wiki's source words, the mobs and zones it drops
// in and the zones it is foraged in. A material that is itself made opens in place to its own
// recipe (shared/tradeskillBook.ts `subRecipes`: depth-limited, loop-guarded).

import { type JSX, createContext, useContext, useMemo, useState } from 'react'
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  NO_MATERIALS_TEXT,
  heldCount,
  materialDrops,
  recipeFacts,
  sourceWords,
  subRecipes,
  type BookIndex,
  type BookIngredient,
  type BookRecipe,
  type LadderState
} from '@shared/tradeskillBook'
import { formatDate } from '../../lib/formatDate'
import { mergeItemSources, sourcesFor } from '../../lib/itemSources'
import { Tooltip } from '../../lib/Tooltip'
import { useMetVersion } from '../../lib/useMetInLog'
import { EraChip } from '../planner/PlannerChips'
import { StateChip } from './RecipeTable'
import type { HeldState } from './tradeskillData'
import { ItemLabel, MobLink, ZoneList } from './tradeskillLinks'

/** What every material line reads: the book, the dump's counts and the era setting. */
export interface BenchFacts {
  index: BookIndex
  held: HeldState
  eraOnly: boolean
}

const FactsContext = createContext<BenchFacts | null>(null)

function useFacts(): BenchFacts {
  const facts = useContext(FactsContext)
  if (facts === null) throw new Error('RecipePanel: a material line outside its panel')
  return facts
}

/** Material, Need, Have, Where. Every nested recipe repeats the same columns. */
const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'minmax(200px, 2fr) 52px 52px minmax(0, 3fr)',
  columnGap: 1.5,
  alignItems: 'start',
  py: 0.25
} as const

const OPEN_COL = 28

const HAVE_TIP = 'How many your inventory dump lists: bags, bank and tradeskill depot.'

/** The mobs a material drops from, with their zones, cut to a few; the item's Loot page has them all. */
function DropsLine({ ingredient }: { ingredient: BookIngredient }): JSX.Element | null {
  const { index, eraOnly } = useFacts()
  // An out-of-era mob the player's log has met is shown again (lib/useMetInLog).
  const met = useMetVersion()
  const drops = useMemo(() => {
    void met
    const sources = mergeItemSources(sourcesFor(ingredient.key), index.materials.get(ingredient.key)?.dropsFrom)
    return materialDrops(sources, eraOnly)
  }, [ingredient.key, index, eraOnly, met])
  if (drops.shown.length === 0 && drops.outOfEra === 0) return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-material-drops">
      Drops:{' '}
      {drops.shown.map((source, i) => (
        <Box key={`${source.mobPage ?? ''}:${source.mob}`} component="span">
          {i > 0 && '; '}
          <MobLink source={source} />
          {source.zones.length > 0 && (
            <>
              {' ('}
              <ZoneList zones={source.zones} />
              {')'}
            </>
          )}
        </Box>
      ))}
      {drops.more > 0 && ` +${String(drops.more)} more`}
      {drops.outOfEra > 0 && `${drops.shown.length > 0 ? ' · ' : ''}${String(drops.outOfEra)} out of era, hidden`}
    </Typography>
  )
}

function ForageLine({ ingredient }: { ingredient: BookIngredient }): JSX.Element | null {
  const material = useFacts().index.materials.get(ingredient.key)
  const zones = material?.foraged ?? []
  if (zones.length === 0 && material?.foragedNote === undefined) return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-material-forage">
      Forage: <ZoneList zones={zones} />
      {zones.length > 0 && material?.foragedNote !== undefined && ', '}
      {material?.foragedNote}
    </Typography>
  )
}

/** The Have cell: blank with no dump, since nothing has said what is held. */
function Have({ ingredient }: { ingredient: BookIngredient }): JSX.Element {
  const { held } = useFacts()
  if (held.index === null) return <span />
  const count = heldCount(held.index, ingredient.name)
  const enough = count >= (ingredient.qty ?? 1)
  return (
    <Typography variant="body2" align="right" color={enough ? 'success.main' : 'text.secondary'} data-testid="tradeskill-material-have">
      {count}
    </Typography>
  )
}

function OpenToggle({ open, name, onToggle }: { open: boolean; name: string; onToggle: () => void }): JSX.Element {
  return (
    <IconButton
      size="small"
      onClick={onToggle}
      aria-label={open ? `Hide the recipe for ${name}` : `Show the recipe for ${name}`}
      aria-expanded={open}
      data-testid="tradeskill-material-open"
      sx={{ p: 0.25, width: OPEN_COL, flexShrink: 0 }}
    >
      {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
    </IconButton>
  )
}

/** One material, and under it, when opened, the recipes that make it. */
function MaterialRow({ ingredient, trail }: { ingredient: BookIngredient; trail: readonly string[] }): JSX.Element {
  const { index } = useFacts()
  const [open, setOpen] = useState(false)
  const made = subRecipes(index, ingredient.key, trail)
  const words = sourceWords(ingredient)
  return (
    <>
      <Box sx={GRID_SX} data-testid="tradeskill-material">
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          {made.length > 0 ? (
            <OpenToggle
              open={open}
              name={ingredient.name}
              onToggle={() => {
                setOpen(!open)
              }}
            />
          ) : (
            <Box sx={{ width: OPEN_COL, flexShrink: 0 }} />
          )}
          <ItemLabel name={ingredient.name} />
        </Box>
        <Typography variant="body2" align="right">
          {ingredient.qty ?? ''}
        </Typography>
        <Have ingredient={ingredient} />
        <Box sx={{ minWidth: 0 }}>
          {words !== '' && <Typography variant="body2">{words}</Typography>}
          <DropsLine ingredient={ingredient} />
          <ForageLine ingredient={ingredient} />
        </Box>
      </Box>
      {open && made.map((recipe) => <SubRecipe key={recipe.id} recipe={recipe} trail={[...trail, ingredient.key]} />)}
    </>
  )
}

/** A recipe's materials. `trail` is the keys of the items open above, the recipe's own included. */
function MaterialList({ recipe, trail }: { recipe: BookRecipe; trail: readonly string[] }): JSX.Element {
  if (recipe.ingredients.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="tradeskill-no-materials">
        {NO_MATERIALS_TEXT}
      </Typography>
    )
  }
  return (
    <>
      {recipe.ingredients.map((ingredient, i) => (
        <MaterialRow key={`${ingredient.key}:${String(i)}`} ingredient={ingredient} trail={trail} />
      ))}
    </>
  )
}

/** A material's own recipe, opened in place under it. */
function SubRecipe({ recipe, trail }: { recipe: BookRecipe; trail: readonly string[] }): JSX.Element {
  return (
    <Box sx={{ ml: 1.5, pl: 1.5, my: 0.5, borderLeft: 2, borderColor: 'divider' }} data-testid="tradeskill-subrecipe">
      <Typography variant="caption" color="text.secondary">
        Made with: {recipeFacts(recipe, true)}
      </Typography>
      <MaterialList recipe={recipe} trail={trail} />
    </Box>
  )
}

function ColumnHeads({ dumpedAt }: { dumpedAt: number | null }): JSX.Element {
  const have = dumpedAt === null ? HAVE_TIP : `${HAVE_TIP} Dump of ${formatDate(dumpedAt)}.`
  return (
    <Box sx={{ ...GRID_SX, color: 'text.secondary', borderBottom: 1, borderColor: 'divider', mb: 0.5 }}>
      <Typography variant="caption" sx={{ pl: `${String(OPEN_COL)}px` }}>
        Material
      </Typography>
      <Typography variant="caption" align="right">
        Need
      </Typography>
      <Tooltip title={have}>
        <Typography variant="caption" align="right">
          Have
        </Typography>
      </Tooltip>
      <Typography variant="caption">Where</Typography>
    </Box>
  )
}

export interface RecipePanelProps {
  recipe: BookRecipe
  /** Null for a recipe the table no longer lists. */
  state: LadderState | null
  facts: BenchFacts
}

export function RecipePanel({ recipe, state, facts }: RecipePanelProps): JSX.Element {
  const { dumpedAt } = facts.held
  return (
    <FactsContext.Provider value={facts}>
      <Paper variant="outlined" sx={{ p: 1.5, maxHeight: '40vh', overflow: 'auto', flexShrink: 0 }} data-testid="tradeskill-picked">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, mb: 1 }}>
          <ItemLabel name={recipe.item} bold />
          {state !== null && <StateChip state={state} />}
          <EraChip subject={recipe} />
          <Typography variant="body2" color="text.secondary" data-testid="tradeskill-picked-facts">
            {recipeFacts(recipe, false)}
          </Typography>
        </Stack>
        <ColumnHeads dumpedAt={dumpedAt} />
        {/* Keyed by recipe so a material opened under one recipe is not open under the next. */}
        <MaterialList key={recipe.id} recipe={recipe} trail={[recipe.key]} />
        {dumpedAt !== null && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }} data-testid="tradeskill-have-date">
            Have is from your inventory dump of {formatDate(dumpedAt)}.
          </Typography>
        )}
      </Paper>
    </FactsContext.Provider>
  )
}
