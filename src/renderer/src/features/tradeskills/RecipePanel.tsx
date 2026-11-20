// tradeskills/RecipePanel.tsx — the picked recipe in full: what the player's log says of it (the
// combines, the cost at the prices last paid, the last sale), then each material with how many
// the combine takes, how many are held, the wiki's source words, the mobs and zones it drops in,
// the zones it is foraged in, where the player last bought it, and the merchant, zone and loc the
// recipe guide gives. A material that is itself made opens in place to its own recipe
// (shared/tradeskillBook.ts `subRecipes`: depth-limited, loop-guarded). A recipe the wiki lists
// no materials for shows the guide's, marked as the guide's.

import { type JSX, useMemo, useState } from 'react'
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  NO_MATERIALS_TEXT,
  materialDrops,
  recipeFacts,
  sourceWords,
  subRecipes,
  type BookIngredient,
  type BookRecipe,
  type LadderState
} from '@shared/tradeskillBook'
import {
  GUIDE_MATERIALS_TEXT,
  guideMaterialTail,
  guideMaterialsFor,
  locatedSource,
  recipeDrawsGuide,
  recipeGuideCreditText,
  type GuideMaterialLine
} from '@shared/tradeskillGuide'
import { haveSourceText, logCountsInUse, recipeHistory } from '@shared/tradeskillHistory'
import { formatDate } from '../../lib/formatDate'
import { mergeItemSources, sourcesFor } from '../../lib/itemSources'
import { Tooltip } from '../../lib/Tooltip'
import { useMetVersion } from '../../lib/useMetInLog'
import { EraChip } from '../planner/PlannerChips'
import { FactsProvider, useFacts, type BenchFacts } from './benchFacts'
import { GuideSourceLine, Have, PaidLine } from './MaterialWhere'
import { StateChip } from './RecipeTable'
import { NoticeChip, RecipeYou } from './RecipeYou'
import { ItemLabel, MobLink, ZoneList } from './tradeskillLinks'

/** Material, Need, Have, Where. Every nested recipe repeats the same columns. */
const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'minmax(200px, 2fr) 52px 52px minmax(0, 3fr)',
  columnGap: 1.5,
  alignItems: 'start',
  py: 0.25
} as const

const OPEN_COL = 28

const HAVE_TIP = 'How many your inventory dump lists: bags, bank and tradeskill depot. A count marked log is the depot count your log stated after the dump.'

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

/**
 * Where a material comes from: the wiki's words, drops and forage, the player's last purchase,
 * and the recipe guide's merchant. `own` is the guide's line for this very recipe, when the
 * materials themselves are the guide's; otherwise the guide's merchant for the item, if it has one.
 */
function WhereCell({ ingredient, own }: { ingredient: BookIngredient; own?: GuideMaterialLine }): JSX.Element {
  const { guides } = useFacts()
  const words = sourceWords(ingredient)
  const guide = own?.source ?? locatedSource(guides, ingredient.key)
  return (
    <Box sx={{ minWidth: 0 }}>
      {words !== '' && <Typography variant="body2">{words}</Typography>}
      <DropsLine ingredient={ingredient} />
      <ForageLine ingredient={ingredient} />
      <PaidLine ingredient={ingredient} />
      {guide !== null && <GuideSourceLine source={guide} />}
    </Box>
  )
}

/** One material, and under it, when opened, the recipes that make it. */
function MaterialRow({ ingredient, trail, own }: { ingredient: BookIngredient; trail: readonly string[]; own?: GuideMaterialLine }): JSX.Element {
  const { index } = useFacts()
  const [open, setOpen] = useState(false)
  const made = subRecipes(index, ingredient.key, trail)
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
          {own !== undefined && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              {guideMaterialTail(own)}
            </Typography>
          )}
        </Box>
        <Typography variant="body2" align="right">
          {ingredient.qty ?? ''}
        </Typography>
        <Have ingredient={ingredient} />
        <WhereCell ingredient={ingredient} own={own} />
      </Box>
      {open && made.map((recipe) => <SubRecipe key={recipe.id} recipe={recipe} trail={[...trail, ingredient.key]} />)}
    </>
  )
}

/** A guide's material whose name is no wiki item: the name as the guide wrote it, with the guide's source. */
function GuideOnlyRow({ line }: { line: GuideMaterialLine }): JSX.Element {
  return (
    <Box sx={GRID_SX} data-testid="tradeskill-guide-material">
      <Typography variant="body2" sx={{ pl: `${String(OPEN_COL)}px` }}>
        {line.name}
        {guideMaterialTail(line)}
      </Typography>
      <Typography variant="body2" align="right">
        {line.qty ?? ''}
      </Typography>
      <span />
      <Box sx={{ minWidth: 0 }}>
        <GuideSourceLine source={line.source} />
      </Box>
    </Box>
  )
}

/** The recipe guide's materials for a recipe the wiki lists none for. */
function GuideMaterials({ lines, trail }: { lines: readonly GuideMaterialLine[]; trail: readonly string[] }): JSX.Element {
  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-guide-materials">
        {GUIDE_MATERIALS_TEXT}
      </Typography>
      {lines.map((line, i) =>
        line.wikiName === null ? (
          <GuideOnlyRow key={`${line.key}:${String(i)}`} line={line} />
        ) : (
          <MaterialRow
            key={`${line.key}:${String(i)}`}
            ingredient={{ name: line.wikiName, key: line.key, ...(line.qty === undefined ? {} : { qty: line.qty }) }}
            trail={trail}
            own={line}
          />
        )
      )}
    </>
  )
}

/** A recipe's materials. `trail` is the keys of the items open above, the recipe's own included. */
function MaterialList({ recipe, trail }: { recipe: BookRecipe; trail: readonly string[] }): JSX.Element {
  const { guides } = useFacts()
  if (recipe.ingredients.length === 0) {
    const lines = guideMaterialsFor(guides, recipe)
    if (lines.length > 0) return <GuideMaterials lines={lines} trail={trail} />
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

/** Under the materials: where Have comes from, and the credit of the guide when the panel drew from it. */
function PanelFoot({ recipe }: { recipe: BookRecipe }): JSX.Element {
  const { index, held, craft, guides } = useFacts()
  const dump = held.index === null ? null : { at: held.dumpedAt }
  const have = haveSourceText(held.dumpedAt === null ? null : formatDate(held.dumpedAt), logCountsInUse(craft, dump))
  const credited = useMemo(() => recipeDrawsGuide(index, guides, recipe), [index, guides, recipe])
  return (
    <>
      {have !== '' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }} data-testid="tradeskill-have-date">
          {have}
        </Typography>
      )}
      {credited && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} data-testid="tradeskill-guide-credit">
          {recipeGuideCreditText()}
        </Typography>
      )}
    </>
  )
}

export interface RecipePanelProps {
  recipe: BookRecipe
  /** Null for a recipe the table no longer lists. */
  state: LadderState | null
  facts: BenchFacts
  /** Why the recipe is not in the table under the panel (a link from another tab opened it); null when it is. */
  unlisted?: string | null
}

export function RecipePanel({ recipe, state, facts, unlisted }: RecipePanelProps): JSX.Element {
  return (
    <FactsProvider value={facts}>
      <Paper variant="outlined" sx={{ p: 1.5, maxHeight: '40vh', overflow: 'auto', flexShrink: 0 }} data-testid="tradeskill-picked">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
          <ItemLabel name={recipe.item} bold />
          {state !== null && <StateChip state={state} />}
          <NoticeChip row={recipeHistory(facts.craft, recipe)} />
          <EraChip subject={recipe} />
          <Typography variant="body2" color="text.secondary" data-testid="tradeskill-picked-facts">
            {recipeFacts(recipe, false)}
          </Typography>
          {unlisted != null && (
            <Typography variant="caption" color="text.secondary" data-testid="tradeskill-picked-unlisted">
              {unlisted}
            </Typography>
          )}
        </Stack>
        <RecipeYou recipe={recipe} />
        <ColumnHeads dumpedAt={facts.held.dumpedAt} />
        {/* Keyed by recipe so a material opened under one recipe is not open under the next. */}
        <MaterialList key={recipe.id} recipe={recipe} trail={[recipe.key]} />
        <PanelFoot recipe={recipe} />
      </Paper>
    </FactsProvider>
  )
}
