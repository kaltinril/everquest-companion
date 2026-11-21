// tradeskills/RecipePanel.tsx — the picked recipe in full: what the player's log says of it (the
// combines, the cost at the prices last paid, the last sale), then each material with how many
// the combine takes, how many are held, the wiki's source words, the mobs and zones it drops in,
// the zones it is foraged in, where the player last bought it, and the merchant, zone and loc the
// recipe guide gives. A material that is itself made opens in place to its own recipe when that
// recipe lists materials (shared/tradeskillPicked.ts `madeBy`, over `subRecipes`: depth-limited,
// loop-guarded); a recipe that lists none is one line with its wiki page, never an empty list. A
// recipe the wiki lists no materials for shows the guide's, marked as the guide's, on the same
// grid; a line whose source states no count reads 1 (`needQty`). The wiki comes first
// (WikiGap.tsx): what its page lacks is said once, in one line above the materials with the
// page's link (the same line says when the materials under it are the guide's), and a guide that
// lists the recipe otherwise than the wiki gets one quiet line under the wiki's own materials.
//
// "Plan this item" in the head opens the recipe in the section's Make an item screen (Planner.tsx)
// through the section's doors, so the workbench threads nothing for it; beside it is the app's
// one wish control (RecipeWish.tsx). `WhereCell` is exported: the planner's tree and its gather
// list draw a material's sources with the same lines.

import { type JSX, useMemo, useState } from 'react'
import { Box, Button, IconButton, Paper, Stack, Typography } from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { dropCap, materialDrops, recipeFacts, sourceWords, type BookIngredient, type BookRecipe, type LadderState } from '@shared/tradeskillBook'
import {
  guideMaterialTail,
  guideMaterialsFor,
  locatedSource,
  recipeDrawsGuide,
  recipeGuideCreditText,
  type GuideMaterialLine
} from '@shared/tradeskillGuide'
import { combinesHeld, heldKnown } from '@shared/tradeskillHeld'
import { bareRecipeText, madeBy, needQty } from '@shared/tradeskillPicked'
import { haveSourceText, logCountsInUse, recipeHistory } from '@shared/tradeskillHistory'
import { haveLookup } from '@shared/tradeskillMaterials'
import { formatDate } from '../../lib/formatDate'
import { mergeItemSources, sourcesFor } from '../../lib/itemSources'
import { Tooltip } from '../../lib/Tooltip'
import { useMetVersion } from '../../lib/useMetInLog'
import { EraChip } from '../planner/PlannerChips'
import { FactsProvider, useFacts, type BenchFacts } from './benchFacts'
import { DEPTH_INDENT, GRID_SX, NAME_INDENT, NUMBER_SX, OPEN_COL, ROW_SX, WHERE_SX, nameCell } from './materialGrid'
import { GuideSourceLine, Have, MATERIAL_LINE, PaidLine } from './MaterialWhere'
import { CanMakeChip, StateChip } from './RecipeTable'
import { NoticeChip, RecipeYou } from './RecipeYou'
import { ItemLabel, MobLink, ZoneList, useDoors } from './tradeskillLinks'
import { RecipeWish } from './RecipeWish'
import { GuideDifferences, WikiGapLine, WikiPageLink } from './WikiGap'

const HAVE_TIP = 'How many your inventory dump lists: bags, bank and tradeskill depot. A count marked log is the depot count your log stated after the dump.'

/** The mobs a material drops from, with their zones, cut to a few; the item's Loot page has them all. */
function DropsLine({ ingredient }: { ingredient: BookIngredient }): JSX.Element | null {
  const { index, eraOnly } = useFacts()
  // An out-of-era mob the player's log has met is shown again (lib/useMetInLog).
  const met = useMetVersion()
  const drops = useMemo(() => {
    void met
    const sources = mergeItemSources(sourcesFor(ingredient.key), index.materials.get(ingredient.key)?.dropsFrom)
    return materialDrops(sources, eraOnly, dropCap(ingredient))
  }, [ingredient, index, eraOnly, met])
  if (drops.shown.length === 0) return null
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

export function OpenToggle({ open, name, onToggle }: { open: boolean; name: string; onToggle: () => void }): JSX.Element {
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
export function WhereCell({ ingredient, own }: { ingredient: BookIngredient; own?: GuideMaterialLine }): JSX.Element {
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

/** A recipe that makes the material but lists nothing to open: one line, with its wiki page. */
function BareRecipeLine({ recipe }: { recipe: BookRecipe }): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-material-bare">
      {bareRecipeText(recipe)} <WikiPageLink recipe={recipe} />
    </Typography>
  )
}

/** What follows a guide material's name: that the combine gives it back, and the guide's remark. */
function GuideTail({ line }: { line: GuideMaterialLine | undefined }): JSX.Element | null {
  const tail = line === undefined ? '' : guideMaterialTail(line)
  if (tail === '') return null
  return (
    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, flexShrink: 0 }}>
      {tail}
    </Typography>
  )
}

/**
 * One material, and under it, when opened, the recipes that make it. It opens only to a recipe
 * that lists materials (shared/tradeskillPicked.ts `madeBy`); a recipe that lists none is one
 * line in the Where cell.
 */
function MaterialRow({ ingredient, trail, own }: { ingredient: BookIngredient; trail: readonly string[]; own?: GuideMaterialLine }): JSX.Element {
  const { index, guides } = useFacts()
  const [open, setOpen] = useState(false)
  const made = madeBy({ index, guides }, ingredient.key, trail)
  return (
    <>
      <Box sx={ROW_SX} data-testid="tradeskill-material">
        <Box sx={nameCell(trail.length - 1)}>
          {made.open.length > 0 ? (
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
          <GuideTail line={own} />
        </Box>
        <Typography variant="body2" align="right" sx={NUMBER_SX} data-testid="tradeskill-material-need">
          {needQty(ingredient)}
        </Typography>
        <Have ingredient={ingredient} line={MATERIAL_LINE} />
        <Box sx={WHERE_SX}>
          <WhereCell ingredient={ingredient} own={own} />
          {made.bare.map((recipe) => (
            <BareRecipeLine key={recipe.id} recipe={recipe} />
          ))}
        </Box>
      </Box>
      {open && made.open.map((recipe) => <SubRecipe key={recipe.id} recipe={recipe} trail={[...trail, ingredient.key]} />)}
    </>
  )
}

/** A guide's material whose name is no wiki item: the name as the guide wrote it, with the guide's source, on the same grid. */
function GuideOnlyRow({ line, depth }: { line: GuideMaterialLine; depth: number }): JSX.Element {
  return (
    <Box sx={ROW_SX} data-testid="tradeskill-guide-material">
      <Box sx={nameCell(depth)}>
        <Box sx={{ width: NAME_INDENT, flexShrink: 0 }} />
        <Typography variant="body2" noWrap>
          {line.name}
        </Typography>
        <GuideTail line={line} />
      </Box>
      <Typography variant="body2" align="right" sx={NUMBER_SX}>
        {needQty(line)}
      </Typography>
      <span />
      <Box sx={WHERE_SX}>
        <GuideSourceLine source={line.source} />
      </Box>
    </Box>
  )
}

interface MaterialListProps {
  recipe: BookRecipe
  /** The keys of the items open above, the recipe's own included. */
  trail: readonly string[]
  /** The column heads, drawn above the first line when there is one; a nested recipe passes none. */
  heads?: JSX.Element
}

/** The recipe guide's materials for a recipe the wiki lists none for; the gap line above them says whose they are. */
function GuideMaterials({ lines, trail, heads }: { lines: readonly GuideMaterialLine[]; trail: readonly string[]; heads?: JSX.Element }): JSX.Element {
  return (
    <>
      {heads}
      {lines.map((line, i) =>
        line.wikiName === null ? (
          <GuideOnlyRow key={`${line.key}:${String(i)}`} line={line} depth={trail.length - 1} />
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

/**
 * A recipe's materials: the wiki's, else the guide's, else nothing. What the wiki page lacks is
 * said once, by the one line above them (WikiGap.tsx `WikiGapLine`): it is the whole of a list
 * that has no material to draw, and it names the guide when the materials under it are the guide's.
 */
function MaterialList({ recipe, trail, heads }: MaterialListProps): JSX.Element {
  const { guides } = useFacts()
  if (recipe.ingredients.length === 0) {
    const lines = guideMaterialsFor(guides, recipe)
    if (lines.length === 0) {
      return (
        <Box data-testid="tradeskill-no-materials">
          <WikiGapLine recipe={recipe} />
        </Box>
      )
    }
    return (
      <>
        <WikiGapLine recipe={recipe} />
        <GuideMaterials lines={lines} trail={trail} heads={heads} />
      </>
    )
  }
  return (
    <>
      <WikiGapLine recipe={recipe} />
      {heads}
      {recipe.ingredients.map((ingredient, i) => (
        <MaterialRow key={`${ingredient.key}:${String(i)}`} ingredient={ingredient} trail={trail} />
      ))}
    </>
  )
}

/** A material's own recipe, opened in place under it. */
function SubRecipe({ recipe, trail }: { recipe: BookRecipe; trail: readonly string[] }): JSX.Element {
  return (
    <Box data-testid="tradeskill-subrecipe">
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: `${String((trail.length - 1) * DEPTH_INDENT + OPEN_COL)}px` }}>
        Made with: {recipeFacts(recipe, true)}
      </Typography>
      <MaterialList recipe={recipe} trail={trail} />
    </Box>
  )
}

/** The heads of the material grid. The rule under them is the first line's own. */
function ColumnHeads({ dumpedAt }: { dumpedAt: number | null }): JSX.Element {
  const have = dumpedAt === null ? HAVE_TIP : `${HAVE_TIP} Dump of ${formatDate(dumpedAt)}.`
  return (
    <Box sx={{ ...GRID_SX, color: 'text.secondary', py: 0.25 }}>
      <Typography variant="caption" sx={{ pl: `${String(NAME_INDENT)}px` }}>
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
      <GuideDifferences recipe={recipe} />
    </>
  )
}

/** "can make N" on the picked recipe, from the counts its own Have cells show. Nothing when nothing says what is held. */
function PickedCanMake({ recipe }: { recipe: BookRecipe }): JSX.Element {
  const { index, guides, held, craft } = useFacts()
  const combines = useMemo(
    () => (heldKnown(held, craft) ? combinesHeld({ index, guides, have: haveLookup(held, craft) }, recipe) : 0),
    [index, guides, held, craft, recipe]
  )
  return <CanMakeChip combines={combines} />
}

const PLAN_TIP = 'Opens Make an item on this recipe: every material down to its leaves, the skills it takes and what to gather.'

/** The door to the section's Make an item screen; nothing outside the section's provider. */
function PlanThis({ recipe }: { recipe: BookRecipe }): JSX.Element | null {
  const doors = useDoors()
  if (doors === null) return null
  return (
    <Tooltip title={PLAN_TIP}>
      <Button
        size="small"
        onClick={() => {
          doors.onPlanRecipe({ key: recipe.key, id: recipe.id })
        }}
        data-testid="tradeskill-plan-this"
        sx={{ flexShrink: 0 }}
      >
        Plan this item
      </Button>
    </Tooltip>
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
          <PickedCanMake recipe={recipe} />
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
          {/* The two doors out of the panel sit together at its right edge: plan it, wish for it. */}
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto', minWidth: 0 }}>
            <PlanThis recipe={recipe} />
            <RecipeWish recipe={recipe} testId="tradeskill-wish" />
          </Stack>
        </Stack>
        <RecipeYou recipe={recipe} />
        {/* Keyed by recipe so a material opened under one recipe is not open under the next. */}
        <MaterialList key={recipe.id} recipe={recipe} trail={[recipe.key]} heads={<ColumnHeads dumpedAt={facts.held.dumpedAt} />} />
        <PanelFoot recipe={recipe} />
      </Paper>
    </FactsProvider>
  )
}
