// tradeskills/RecipeTable.tsx — the workbench's recipe book: one fixed-height line per recipe,
// ascending by trivial, windowed the Bazaar's way (only the lines in view are mounted). Picking a
// line shows the recipe in the panel above; the table opens on the recipe to make next.
//
// Cost, Sells and You are the player's own log (shared/tradeskillMoney.ts, tradeskillHistory.ts):
// a cell is blank where the log states nothing.
//
// A recipe the player holds every material for wears "can make N" (shared/tradeskillHeld.ts). A
// recipe the wiki lists no materials or no trivial for carries one link to its wiki page
// (shared/tradeskillWiki.ts `wikiRowLink`, WikiGap.tsx), so a player who knows can add it there:
// in the Materials cell the wiki left empty, else beside the item's name.
//
// A line does not name the container or a material's source words: the container is one value
// down a whole tradeskill's list, and the picked recipe's panel states both.
//
// The lines, their order and their marks are shared/tradeskillBook.ts `recipeLadder`.

import { type JSX, memo, useEffect, useLayoutEffect, useRef } from 'react'
import { Box, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import {
  materialsText,
  qtyPrefix,
  type BookIngredient,
  type BookRecipe,
  type LadderLine,
  type LadderState
} from '@shared/tradeskillBook'
import { canMakeLabel, canMakeTip } from '@shared/tradeskillHeld'
import { historyWords, recipeHistory, type CraftBook } from '@shared/tradeskillHistory'
import { COST_TIP, SELLS_TIP, YOU_TIP, costCell, sellsCell, type MoneyBook } from '@shared/tradeskillMoney'
import { NO_WIKI_MATERIALS_CELL, WIKI_CELL_LINK, wikiRowLink } from '@shared/tradeskillWiki'
import { Tooltip } from '../../lib/Tooltip'
import { parkReturn } from '../../lib/navReturn'
import { useWindowedRows } from '../../lib/useWindowedRows'
import { EraChip } from '../planner/PlannerChips'
import { NoticeChip } from './RecipeYou'
import { ItemLabel, ItemLink } from './tradeskillLinks'
import { WikiPageLink } from './WikiGap'

export const ROW_HEIGHT = 36
const COLUMNS = 6
/** Lines of what is already trivial left in view above the line the table opens on. */
const CONTEXT_LINES = 2

const CHIP_SX = { height: 18, fontSize: 10 } as const
const CUT_SX = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as const

/**
 * The Cost and Sells columns. A price is never cut off: the table is `tableLayout: fixed`, so a
 * column is exactly as wide as its head says, and the cell's side padding comes out of that. At
 * 92 px with the small table's 16 px each side a price had 60 px, and "141.748 pp" ended in dots
 * (owner's screenshot, 2026-11-20). 112 px with 8 px each side leaves 96 px: room for
 * "12345.67 pp" in the table's font. The numbers line up on their decimals (tabular figures).
 */
const PRICE_WIDTH = 112
const PRICE_SX = { whiteSpace: 'nowrap', px: 1, fontVariantNumeric: 'tabular-nums' } as const

/**
 * Under this width the table scrolls sideways instead of narrowing: the fixed columns keep
 * their width, so a narrower table would take all of it out of Materials.
 */
const TABLE_MIN_WIDTH = 920

/**
 * Item and You are shares of the table and Materials takes what is left. Measured on the
 * owner's captures (2026-11-20, a 1500 px window, the table about 1205 px): with a Container
 * column Materials had 266 px and showed one material, and You had 207 px and cut
 * "made 3, failed 1, 2 raises (204 to 205)", which is about 234 px of text in the table's font.
 * Without Container, at that width: Item 313 px, Materials about 319 px (287 px of text, two
 * material names with their counts), You 277 px (261 px of text with 8 px either side).
 */
const ITEM_WIDTH = '26%'
const YOU_WIDTH = '23%'
const YOU_SX = { ...CUT_SX, px: 1 } as const

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

/** The mark of a recipe the held materials cover: "can make 23". Nothing for a count of 0. */
export function CanMakeChip({ combines }: { combines: number }): JSX.Element | null {
  if (combines <= 0) return null
  return (
    <Tooltip title={canMakeTip(combines)}>
      <Chip size="small" color="success" variant="outlined" label={canMakeLabel(combines)} sx={CHIP_SX} data-testid="tradeskill-can-make-chip" />
    </Tooltip>
  )
}

/** A line's link to its wiki page, drawn in the one place `wikiRowLink` names; nothing elsewhere or with no gap. */
function RowWikiLink({ recipe, place }: { recipe: BookRecipe; place: 'materials' | 'item' }): JSX.Element | null {
  const link = wikiRowLink(recipe)
  if (link?.place !== place) return null
  return (
    <Typography variant="caption" component="span" color="text.secondary" sx={{ flexShrink: 0 }}>
      <WikiPageLink recipe={recipe} label={WIKI_CELL_LINK} tip={link.tip} />
    </Typography>
  )
}

/** A material's count and name. Its source words are on hover and in the picked recipe's panel. */
function Material({ ingredient, first }: { ingredient: BookIngredient; first: boolean }): JSX.Element {
  return (
    <>
      {!first && ', '}
      {qtyPrefix(ingredient)}
      <ItemLink name={ingredient.name} />
    </>
  )
}

/** The materials' counts and names on one line, cut off when long; the hover lists every one with its source words. */
function MaterialsCell({ recipe }: { recipe: BookRecipe }): JSX.Element {
  if (recipe.ingredients.length === 0) {
    return (
      <TableCell sx={{ ...CUT_SX, color: 'text.secondary' }} data-testid="tradeskill-row-no-materials">
        {NO_WIKI_MATERIALS_CELL} <RowWikiLink recipe={recipe} place="materials" />
      </TableCell>
    )
  }
  return (
    <TableCell sx={CUT_SX} title={materialsText(recipe)}>
      {recipe.ingredients.map((ingredient, i) => (
        <Material key={`${ingredient.key}:${String(i)}`} ingredient={ingredient} first={i === 0} />
      ))}
    </TableCell>
  )
}

/** The player's own combines and prices, read per line (the engine's `crafting` module). */
export interface RowLog {
  craft: CraftBook
  money: MoneyBook
}

/** The player's combines of the recipe, cut off with the whole of it on hover; blank when the log shows none. */
function YouCell({ recipe, craft }: { recipe: BookRecipe; craft: CraftBook }): JSX.Element {
  const row = recipeHistory(craft, recipe)
  if (row === null) return <TableCell data-testid="tradeskill-row-you" />
  const words = historyWords(row)
  return (
    <TableCell sx={YOU_SX} title={words} data-testid="tradeskill-row-you">
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'nowrap', minWidth: 0 }}>
        <NoticeChip row={row} />
        <Box component="span" sx={CUT_SX}>
          {words}
        </Box>
      </Stack>
    </TableCell>
  )
}

interface RowProps {
  recipe: BookRecipe
  state: LadderState
  picked: boolean
  onPick: (id: string) => void
  log: RowLog
  /** Combines the held materials cover; 0 for none, or when nothing says what is held. */
  canMake: number
}

/** A name's click in the table: nothing of its own, so the click reaches the row and picks the recipe. */
const PICKS_WITH_ROW = (): void => undefined

const RecipeRow = memo(function RecipeRow({ recipe, state, picked, onPick, log, canMake }: RowProps): JSX.Element {
  const money = log.money.of(recipe)
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
          {/* The row's own click picks the recipe; the name joins it (the panel's head links the item's page). */}
          <ItemLabel name={recipe.item} bold={state === 'next'} act={PICKS_WITH_ROW} />
          <StateChip state={state} />
          <CanMakeChip combines={canMake} />
          <EraChip subject={recipe} />
          <RowWikiLink recipe={recipe} place="item" />
        </Stack>
      </TableCell>
      <MaterialsCell recipe={recipe} />
      <TableCell align="right" sx={PRICE_SX} data-testid="tradeskill-row-cost">
        {costCell(money)}
      </TableCell>
      <TableCell align="right" sx={PRICE_SX} data-testid="tradeskill-row-sells">
        {sellsCell(money)}
      </TableCell>
      <YouCell recipe={recipe} craft={log.craft} />
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
        <TableCell sx={{ width: ITEM_WIDTH }}>Item</TableCell>
        <TableCell>Materials</TableCell>
        <TableCell align="right" sx={{ ...PRICE_SX, width: PRICE_WIDTH }}>
          <Tooltip title={COST_TIP}>
            <span>Cost</span>
          </Tooltip>
        </TableCell>
        <TableCell align="right" sx={{ ...PRICE_SX, width: PRICE_WIDTH }}>
          <Tooltip title={SELLS_TIP}>
            <span>Sells</span>
          </Tooltip>
        </TableCell>
        <TableCell sx={{ width: YOU_WIDTH, px: 1 }}>
          <Tooltip title={YOU_TIP}>
            <span>You</span>
          </Tooltip>
        </TableCell>
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
  /**
   * Asked when the table unmounts: false when it is only the workbench changing tab, so the one
   * Back slot keeps what another tab parked there. Absent reads as true.
   */
  parkOnLeave?: () => boolean
  /** The player's combines and prices for the Cost, Sells and You cells. */
  log: RowLog
  /** By recipe `id`: the combines the held materials cover, for the recipes that can be made now. */
  makeable: ReadonlyMap<string, number>
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
  const { lines, pickedId, onPick, parkAs, parkOnLeave, log, makeable } = p
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: lines.length, rowHeight: ROW_HEIGHT, scrollRef })
  usePlacement(scrollRef, p)
  // The unmount parks where the table was. It reads a value kept from the last render: the
  // scroller's node is already gone when an effect's cleanup runs.
  const park = useRef<unknown>(null)
  const leaving = useRef(parkOnLeave)
  useEffect(() => {
    park.current = parkAs(win.scrollTop)
    leaving.current = parkOnLeave
  }, [parkAs, parkOnLeave, win.scrollTop])
  useEffect(
    () => () => {
      if (leaving.current?.() !== false) parkReturn('tradeskills', park.current)
    },
    []
  )
  return (
    <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 120, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="tradeskill-recipes-scroll">
      <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }} data-testid="tradeskill-recipes">
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
                log={log}
                canMake={makeable.get(line.recipe.id) ?? 0}
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
