// character/SlotGrid — the armory grid: two flanking columns and the bottom row.
//
// The column split is the game's own inventory window (shared/characterSheet.ts SHEET_SLOTS),
// which is also the armory shape: eight down the left, eight down the right, hands/rings/ammo
// along the bottom. On a narrow window the three groups stack instead of squeezing.
//
// EVERY CELL IS ALWAYS DRAWN, filled or not. An empty slot is the point of a character sheet —
// it is the thing you have not equipped — so it renders quiet (the slot's name, dimmed) rather
// than being omitted, and it is never an error or a warning.
//
// The item name is the hover surface, through `KnownItemTooltip` — the SAME card every other
// item name in the app opens, which fetches its knowledge only while the tooltip is open. The
// icon is `eqimg://item/<id>` off the permanent cache and hides itself if the fetch 404s.
//
// ---------------------------------------------------------------------------
// AND SINCE JOS-327 A CELL SHOWS WHAT IS SOCKETED INTO IT
// ---------------------------------------------------------------------------
// An exaltation is the whole point of the Exaltations tab, and until now the one place the game
// states which ones a player has ALREADY SOCKETED — the inventory dump — was parsed for them
// (`SheetItem.exaltations`) and then not drawn. Each worn item's exaltations render as small chips
// under its name: no hover, no click, no count line. They are a fact about the item, so they sit on
// the item.
//
// THE CHIPS ARE CONFIDENT HERE, AND THAT IS A PROPERTY OF *WORN* SLOTS. The dump spells bag
// CONTENTS and exaltation SOCKETS the same way — both are `-Slot<n>` children, and `Slots` is
// merely how many child slots the parent provides (shared/outputs/inventory.ts, "what the file does
// NOT say"). The one thing the file volunteers is the child's NAME: `<Item> (Exaltation)`. That
// suffix is what `exaltationsOf` reads, so a chip here is the client's own word and not an
// inference — and the ambiguity that would matter, a ten-slot BAG being read as a ten-socket item,
// cannot arise in a cell of this grid, because a top-level `Location` equipment row is a thing worn
// on the body and nobody wears a backpack in an ear. The general case is left to
// `looksLikeContainer()`, which is an opt-in guess with its evidence attached; this surface never
// needs it. None of that reaches the screen: there is no "probably" chip and no footnote.
//
// ---------------------------------------------------------------------------
// AND TWO MORE ROWS SINCE THE OWNER ASK OF 2026-08-23 (slotSockets.ts owns the join)
// ---------------------------------------------------------------------------
// Under the socketed chips, the SOCKET LINE — which of the four transferable sockets the item's
// ` +N` has opened — and, last, the WISH CHIPS: every wish on this character's list whose corpus row
// fits the cell's slot, gear wishes and donor wishes alike. Both rows are read, never inferred: the
// socket line is the wiki's unlock table at the tier the dump's own name stated, and a wish chip is
// a line the user already wrote. The grid closes with a one-line legend for the two rows, because a
// filled chip and a dimmed chip are a code, and a code with no key is a guess.

import type { JSX } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import Tooltip from '../../lib/Tooltip'
import type { SheetCellView, SheetColumn } from '@shared/characterSheet'
import type { EquipSlot } from '@shared/planner/types'
import { cellsShowingWishes, slotOfCell, socketStates, type SlotWish } from './slotSockets'
import { EQ_ITEM_COLORS, itemIconUrl } from '../../lib/ItemWindow'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'

const ICON = 28

/** The one chip geometry every row under an item name shares. */
const SMALL_CHIP = {
  height: 16,
  maxWidth: '100%',
  '& .MuiChip-label': { px: 0.5, fontSize: 10, lineHeight: 1.6 }
}

/** The one row geometry those chips wrap in. */
const CHIP_ROW = { display: 'flex', flexWrap: 'wrap', gap: 0.3, mt: 0.3 } as const

/** The item's icon, or a same-sized empty frame so every cell lines up. */
function SlotIcon({ cell }: { cell: SheetCellView }): JSX.Element {
  const iconId = cell.item?.iconId
  return (
    <Box
      sx={{
        width: ICON,
        height: ICON,
        flexShrink: 0,
        borderRadius: 0.5,
        border: '1px solid',
        borderColor: cell.item ? EQ_ITEM_COLORS.border : 'divider',
        bgcolor: 'rgba(255,255,255,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {iconId !== undefined && (
        <Box
          component="img"
          src={itemIconUrl(iconId)}
          alt=""
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            e.currentTarget.style.display = 'none'
          }}
          sx={{ width: ICON - 4, height: ICON - 4, imageRendering: 'pixelated' }}
        />
      )}
    </Box>
  )
}

/**
 * What is socketed into this cell's item, as the client named it — nothing at all when the item
 * carries none, which is most of them.
 *
 * The names are printed with the ` (Exaltation)` suffix ALREADY REMOVED: `SheetItem.exaltations`
 * holds `parsedName.base`, so the chip reads `Golden Efreeti Boots` rather than repeating a word
 * that the row of chips is already saying by existing. The chips wrap; a cell with four of them is
 * two lines tall, which is fine here because this grid is not windowed and no hook is assuming a
 * row height.
 */
function ExaltationChips({ names }: { names: readonly string[] }): JSX.Element | null {
  if (names.length === 0) return null
  return (
    <Box data-testid="character-exaltations" sx={CHIP_ROW}>
      {names.map((name, i) => (
        <Chip
          // The same exaltation can legitimately be socketed twice into one item, so the name is
          // not a key — the position is.
          key={`${name}#${String(i)}`}
          label={name}
          size="small"
          variant="outlined"
          data-testid="character-exaltation"
          sx={{ ...SMALL_CHIP, borderColor: EQ_ITEM_COLORS.border }}
        />
      ))}
    </Box>
  )
}

/**
 * THE SOCKET LINE (owner ask, 2026-08-23): which of the four transferable sockets this item's
 * ` +N` has unlocked, off the wiki's own unlock table (`slotSockets.socketStates`). A filled chip
 * is an OPEN socket; a dimmed one names the tier that opens it, so the line doubles as "merge to
 * +3 and Worn opens". NOTHING AT ALL for a name that stated no tier — `socketStates` returns no
 * rows and the line does not mount — because four locked chips under a quest token would promise
 * a ladder the dump never mentioned. What is IN a socket is the row above this one — the client's
 * own chips — because the dump names contents and this line names capacity, and the two are
 * different facts from different sources.
 *
 * The hover is the wiki's one-line description of the socket type, through `lib/Tooltip` like
 * every other hover in the app (the hand-cursor rule); the tier lives on the chip's own label.
 */
function SocketLine({ tier }: { tier: number | undefined }): JSX.Element | null {
  const states = socketStates(tier)
  if (states.length === 0) return null
  return (
    <Box data-testid="character-sockets" sx={CHIP_ROW}>
      {states.map((s) => (
        <Tooltip key={s.type} title={s.what}>
          <Chip
            label={s.unlocked ? s.type : `${s.type} @+${String(s.unlocksAt)}`}
            size="small"
            variant={s.unlocked ? 'filled' : 'outlined'}
            data-testid={`character-socket-${s.type.toLowerCase()}`}
            sx={{ ...SMALL_CHIP, opacity: s.unlocked ? 1 : 0.5 }}
          />
        </Tooltip>
      ))}
    </Box>
  )
}

/**
 * One clause per hover, and the clause is the thing the chip's own label does not say: a donor
 * chip is labelled by EFFECT, so its hover names the item it comes out of (and the merge tier that
 * lets it out); a gear chip is labelled by ITEM, so its hover says only why it is here. The route
 * to go and get either is the Wish list tab's, and the legend under the grid says so once rather
 * than every chip saying it.
 */
function wishHover(w: SlotWish): string {
  if (w.kind === 'gear') return 'On your wish list'
  return w.tierRequired === undefined ? `From ${w.name}` : `From ${w.name} at +${String(w.tierRequired)}`
}

/**
 * THE WISHES THAT BELONG HERE — every wish whose corpus row fits this cell's slot
 * (`slotSockets.wishesBySlot`, the R2 transfer rule read for display). Drawn on EMPTY cells too:
 * "what I want for each slot" is exactly as much a fact about a bare wrist as a full one. A DONOR
 * chip names the effect (what the wish was about) and a GEAR chip names the item (the wish IS the
 * item); the two wear different colours so a cell that carries both reads as two questions.
 */
function SlotWishChips({ wishes }: { wishes: readonly SlotWish[] }): JSX.Element | null {
  if (wishes.length === 0) return null
  return (
    <Box data-testid="character-slot-wishes" sx={CHIP_ROW}>
      {wishes.map((w, i) => (
        <Tooltip key={`${w.name}#${String(i)}`} title={wishHover(w)}>
          <Chip
            label={w.effect ?? w.name}
            size="small"
            color={w.kind === 'donor' ? 'warning' : 'info'}
            variant="outlined"
            data-testid={`character-slot-wish-${w.kind}`}
            sx={SMALL_CHIP}
          />
        </Tooltip>
      ))}
    </Box>
  )
}

/**
 * One cell: icon, slot label, then — for a worn item — the item name (hoverable), its socketed
 * exaltations and its socket line, or a quiet empty line; and last, filled or not, the wishes
 * placed at this cell's slot.
 */
function SlotCell({ cell, wishes }: { cell: SheetCellView; wishes: readonly SlotWish[] }): JSX.Element {
  const item = cell.item
  return (
    <Paper
      variant="outlined"
      data-testid={`character-slot-${cell.id}`}
      sx={{ p: 0.6, display: 'flex', gap: 0.75, alignItems: 'center', minWidth: 0 }}
    >
      <SlotIcon cell={cell} />
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }}>
          {cell.label}
        </Typography>
        {item ? (
          <>
            <KnownItemTooltip name={item.name}>
              <Box
                component="span"
                sx={{
                  display: 'block',
                  color: EQ_ITEM_COLORS.name,
                  fontSize: 12,
                  lineHeight: 1.3,
                  textDecoration: 'underline dotted',
                  textUnderlineOffset: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.name}
              </Box>
            </KnownItemTooltip>
            <ExaltationChips names={item.exaltations} />
            <SocketLine tier={item.tier} />
          </>
        ) : (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', opacity: 0.6 }}>
            empty
          </Typography>
        )}
        <SlotWishChips wishes={wishes} />
      </Box>
    </Paper>
  )
}

/** The empty default: a grid with no wish map draws exactly what it drew before this feature. */
const NO_WISHES: ReadonlyMap<EquipSlot, readonly SlotWish[]> = new Map()
const NONE: readonly SlotWish[] = []

type WishesOf = (cell: SheetCellView) => readonly SlotWish[]

/**
 * The one lookup every cell goes through: nothing unless this cell is the one of its slot's pair
 * that carries the wishes (`cellsShowingWishes`), else the slot's list.
 */
function wishLookup(
  slotWishes: ReadonlyMap<EquipSlot, readonly SlotWish[]>,
  showing: ReadonlySet<string>
): WishesOf {
  return (cell) => {
    if (!showing.has(cell.id)) return NONE
    const slot = slotOfCell(cell.location)
    return (slot && slotWishes.get(slot)) ?? NONE
  }
}

function Column({ cells, wishesOf }: { cells: SheetCellView[]; wishesOf: WishesOf }): JSX.Element {
  return (
    <Stack spacing={0.6} sx={{ flex: 1, minWidth: 190 }}>
      {cells.map((c) => (
        <SlotCell key={c.id} cell={c} wishes={wishesOf(c)} />
      ))}
    </Stack>
  )
}

/**
 * The key to the two coded rows, in one caption, shown only while there is something on the grid
 * for it to explain. It is also where "where to get them" is answered, once: the chips are dead
 * ends by construction (this tab takes no router), so the legend names the tab that has the route.
 */
function Legend({ sockets, wishes }: { sockets: boolean; wishes: boolean }): JSX.Element | null {
  if (!sockets && !wishes) return null
  const parts: string[] = []
  if (sockets) parts.push('Sockets: a filled chip is open, a dimmed one opens at the +N it names.')
  if (wishes) parts.push('Wish chips are your wish list - the Wish list tab has the route.')
  return (
    <Typography variant="caption" color="text.secondary" data-testid="character-slot-legend">
      {parts.join(' ')}
    </Typography>
  )
}

const inColumn = (cells: SheetCellView[], column: SheetColumn): SheetCellView[] =>
  cells.filter((c) => c.column === column)

export default function SlotGrid({
  cells,
  slotWishes = NO_WISHES
}: {
  cells: SheetCellView[]
  /** wishes placed by slot (`slotSockets.wishesBySlot`); absent draws the pre-feature grid */
  slotWishes?: ReadonlyMap<EquipSlot, readonly SlotWish[]>
}): JSX.Element {
  const bottom = inColumn(cells, 'bottom')
  const wishesOf = wishLookup(slotWishes, cellsShowingWishes(cells))
  return (
    <Stack spacing={0.6} data-testid="character-slot-grid">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.6} alignItems="stretch">
        <Column cells={inColumn(cells, 'left')} wishesOf={wishesOf} />
        <Column cells={inColumn(cells, 'right')} wishesOf={wishesOf} />
      </Stack>
      {/* The bottom row wraps rather than shrinking — a weapon name is world-supplied text. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
        {bottom.map((c) => (
          <Box key={c.id} sx={{ flex: '1 1 190px', minWidth: 190 }}>
            <SlotCell cell={c} wishes={wishesOf(c)} />
          </Box>
        ))}
      </Box>
      <Legend
        sockets={cells.some((c) => c.item?.tier !== undefined)}
        wishes={cells.some((c) => wishesOf(c).length > 0)}
      />
    </Stack>
  )
}
