// tradeskills/RecipeTable.tsx — the workbench's recipe book: one fixed-height line per recipe,
// ascending by trivial, windowed the Bazaar's way (only the lines in view are mounted). Picking a
// line shows the recipe in the panel above; the table opens on the recipe to make next.
//
// The lines, their order and their marks are shared/tradeskillBook.ts `recipeLadder`.

import { type JSX, memo, useEffect, useLayoutEffect, useRef } from 'react'
import { Box, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import {
  materialsText,
  qtyPrefix,
  sourceWords,
  type BookIngredient,
  type BookRecipe,
  type LadderLine,
  type LadderState
} from '@shared/tradeskillBook'
import { Tooltip } from '../../lib/Tooltip'
import { parkReturn } from '../../lib/navReturn'
import { useWindowedRows } from '../../lib/useWindowedRows'
import { EraChip } from '../planner/PlannerChips'
import { ItemLabel, ItemLink } from './tradeskillLinks'

export const ROW_HEIGHT = 36
const COLUMNS = 4
/** Lines of what is already trivial left in view above the line the table opens on. */
const CONTEXT_LINES = 2

const CHIP_SX = { height: 18, fontSize: 10 } as const
const CUT_SX = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as const

const NEXT_TIP = 'The first recipe above your level: the one to make next.'
const TRIVIAL_TIP = 'At or under your level, so it no longer raises the skill.'

/** The mark a recipe wears: next, trivial, or nothing. */
export function StateChip({ state }: { state: LadderState }): JSX.Element | null {
  if (state === 'next') {
    return (
      <Tooltip title={NEXT_TIP}>
        <Chip size="small" color="primary" label="next" sx={CHIP_SX} data-testid="tradeskill-next-chip" />
      </Tooltip>
    )
  }
  if (state !== 'trivial') return null
  return (
    <Tooltip title={TRIVIAL_TIP}>
      <Chip size="small" variant="outlined" label="trivial" sx={CHIP_SX} data-testid="tradeskill-trivial-chip" />
    </Tooltip>
  )
}

function Material({ ingredient, first }: { ingredient: BookIngredient; first: boolean }): JSX.Element {
  const words = sourceWords(ingredient)
  return (
    <>
      {!first && ', '}
      {qtyPrefix(ingredient)}
      <ItemLink name={ingredient.name} />
      {words !== '' && (
        <Box component="span" sx={{ color: 'text.secondary' }}>
          {' '}
          ({words})
        </Box>
      )}
    </>
  )
}

/** Every material on one line, cut off with the whole list on hover; the panel has them in full. */
function MaterialsCell({ recipe }: { recipe: BookRecipe }): JSX.Element {
  return (
    <TableCell sx={CUT_SX} title={materialsText(recipe)}>
      {recipe.ingredients.map((ingredient, i) => (
        <Material key={`${ingredient.key}:${String(i)}`} ingredient={ingredient} first={i === 0} />
      ))}
    </TableCell>
  )
}

interface RowProps {
  recipe: BookRecipe
  state: LadderState
  picked: boolean
  onPick: (id: string) => void
}

const RecipeRow = memo(function RecipeRow({ recipe, state, picked, onPick }: RowProps): JSX.Element {
  return (
    <TableRow
      hover
      selected={picked}
      onClick={() => {
        onPick(recipe.id)
      }}
      sx={{ cursor: 'pointer', height: ROW_HEIGHT }}
      data-testid="tradeskill-recipe-row"
      data-state={state}
    >
      <TableCell align="right">{recipe.trivial ?? ''}</TableCell>
      <TableCell sx={{ fontWeight: picked ? 700 : 400 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'nowrap', minWidth: 0 }}>
          <ItemLabel name={recipe.item} bold={state === 'next'} />
          <StateChip state={state} />
          <EraChip subject={recipe} />
        </Stack>
      </TableCell>
      <TableCell sx={CUT_SX}>{recipe.container ?? ''}</TableCell>
      <MaterialsCell recipe={recipe} />
    </TableRow>
  )
})

/** The line that sets apart the recipes the wiki gives no trivial for. */
function UnratedHeading({ count }: { count: number }): JSX.Element {
  return (
    <TableRow sx={{ height: ROW_HEIGHT }} data-testid="tradeskill-unrated-heading">
      <TableCell colSpan={COLUMNS} sx={{ bgcolor: 'action.hover' }}>
        <Typography variant="overline" sx={{ lineHeight: 1 }}>
          No trivial on the wiki ({count})
        </Typography>
      </TableCell>
    </TableRow>
  )
}

function PadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMNS} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

function Head(): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        <TableCell align="right" sx={{ width: 72 }}>
          Trivial
        </TableCell>
        <TableCell sx={{ width: '34%' }}>Item</TableCell>
        <TableCell sx={{ width: '16%' }}>Container</TableCell>
        <TableCell>Materials</TableCell>
      </TableRow>
    </TableHead>
  )
}

export interface RecipeTableProps {
  lines: readonly LadderLine[]
  /** The `id` of the recipe the panel shows. */
  pickedId: string | null
  onPick: (id: string) => void
  /** The line to open on: the picked recipe's, else the one to make next. */
  anchorLine: number
  /** Changes when the list is a different list (a search, the switch): the table opens again. */
  resetKey: string
  /** False while the level is not known yet: the table waits to place itself. */
  ready: boolean
  /** Where the table was when a link left the tab, once, after Back. */
  restoreTop: number | null
  /** What to park for Back when the tab is left (lib/navReturn). */
  parkAs: (scrollTop: number) => unknown
}

/**
 * Places the scroller: on the first ready paint where Back left it, else on the anchor line, and
 * again on the anchor whenever `resetKey` moves. A level that rises while the player crafts moves
 * the marks, never the scroll.
 */
function usePlacement(scrollRef: React.RefObject<HTMLDivElement | null>, p: RecipeTableProps): void {
  const placed = useRef<string | null>(null)
  const { anchorLine, resetKey, ready, restoreTop } = p
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el === null || !ready || placed.current === resetKey) return
    const first = placed.current === null
    placed.current = resetKey
    el.scrollTop = first && restoreTop !== null ? restoreTop : Math.max(0, (anchorLine - CONTEXT_LINES) * ROW_HEIGHT)
    // The browser's own scroll event comes a frame later (and far later in a hidden window), and
    // until then the windowed slice is the old position's: a blank table. Said now, the slice
    // is redrawn before the paint.
    el.dispatchEvent(new Event('scroll'))
  }, [scrollRef, anchorLine, resetKey, ready, restoreTop])
}

export function RecipeTable(p: RecipeTableProps): JSX.Element {
  const { lines, pickedId, onPick, parkAs } = p
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: lines.length, rowHeight: ROW_HEIGHT, scrollRef })
  usePlacement(scrollRef, p)
  // The unmount parks where the table was. It reads a value kept from the last render: the
  // scroller's node is already gone when an effect's cleanup runs.
  const park = useRef<unknown>(null)
  useEffect(() => {
    park.current = parkAs(win.scrollTop)
  }, [parkAs, win.scrollTop])
  useEffect(
    () => () => {
      parkReturn('tradeskills', park.current)
    },
    []
  )
  return (
    <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 120, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="tradeskill-recipes-scroll">
      <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }} data-testid="tradeskill-recipes">
        <Head />
        <TableBody>
          <PadRow height={win.topPad} />
          {lines.slice(win.start, win.end).map((line) =>
            line.kind === 'recipe' ? (
              <RecipeRow
                key={line.recipe.id}
                recipe={line.recipe}
                state={line.state}
                picked={line.recipe.id === pickedId}
                onPick={onPick}
              />
            ) : (
              <UnratedHeading key="unrated-heading" count={line.count} />
            )
          )}
          <PadRow height={win.bottomPad} />
        </TableBody>
      </Table>
    </Box>
  )
}
