// gear/BisCells.tsx — THE SHEET: one card per cell of the character sheet with the item the board
// picks, its icon and why; a hover compares it with what is worn there and says where it drops
// (BisCompare.tsx); a click shows the next five. Below it, the loadout's totals against what is worn.
//
// The owner's R1 pass (2026-11-24): the worn line and the source line left the card (the hover and
// the item window carry them); the card gained the item icon, a "+" that adds to the wish list, and
// an amber border when the slot's best is not what is worn; a worn runner-up is highlighted.

import { useEffect, useState, type JSX, type MouseEvent } from 'react'
import { Box, Chip, IconButton, Link, Stack, Tooltip, Typography, type Theme } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import type { ClassAbbr } from '@shared/classCombo'
import type { BisCell, BisSheet } from '@shared/planner/bisSheet'
import { isLoreRow } from '@shared/planner/bisSheet'
import type { GearRow } from '@shared/planner/gear'
import type { TierSetup } from '@shared/planner/tierChips'
import { REVAMP_ERA_TAGS, weaponKindOf, type TierModel } from '@shared/planner/tierWeights'
import type { PlanSlotId } from '@shared/planner/types'
import { ItemIcon } from '../../lib/ItemIcon'
import BisCompare, { type WornCell } from './BisCompare'
import { cellLabel, hasteNote, termText } from './bisText'

export type { WornCell } from './BisCompare'

/** The wish list's door, as the Gear table uses it: undefined until the list has loaded. */
export interface BisWishes {
  wished: ReadonlySet<string>
  onToggle?: (row: GearRow, wasWished: boolean) => void
}

export interface BisCellsProps {
  sheet: BisSheet
  worn: ReadonlyMap<PlanSlotId, WornCell>
  model: TierModel
  setup: TierSetup
  classes: readonly ClassAbbr[]
  owned: ReadonlyMap<string, number>
  wishes: BisWishes
  /** the slider's tier: every item on the sheet, worn ones too, is scaled to it */
  plus: number
  onOpenLoot?: (item: string) => void
}

const KIND_LABEL = { '1h': 'one-hander', '2h': 'two-hander', ranged: 'ranged' } as const

/** Is this row what the dump says is worn in the cell? By key when the data knows the worn item, else by name. */
function isWorn(row: GearRow, worn: WornCell | undefined): boolean {
  if (worn === undefined) return false
  return worn.row !== undefined ? worn.row.key === row.key : worn.name.toLowerCase() === row.name.toLowerCase()
}

function Tags({ cell, owned, worn }: { cell: BisCell; owned: ReadonlyMap<string, number>; worn: boolean }): JSX.Element | null {
  const row = cell.pick?.row
  if (row === undefined) return null
  const kind = weaponKindOf(row.skill)
  const tags: { label: string; color: 'warning' | 'success' | 'info' | 'default' }[] = []
  if (worn) tags.push({ label: 'worn', color: 'success' })
  if (isLoreRow(row)) tags.push({ label: 'Lore', color: 'warning' })
  if (!worn && (owned.get(row.key) ?? 0) > 0) tags.push({ label: 'owned', color: 'success' })
  if (row.eraTag !== undefined && REVAMP_ERA_TAGS.has(row.eraTag)) tags.push({ label: 'Legends revamp', color: 'info' })
  if (row.classes.length === 0) tags.push({ label: 'classes not stated', color: 'warning' })
  if (kind !== null) tags.push({ label: KIND_LABEL[kind], color: 'default' })
  if (tags.length === 0) return null
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {tags.map((t) => (
        <Chip key={t.label} size="small" variant="outlined" color={t.color} label={t.label} sx={{ height: 18, fontSize: 11 }} />
      ))}
    </Stack>
  )
}

/** The "+" (owner: *"Button with a + that on hover says "add to wishlist""*); a tick once it is on the list, which takes it off again. */
function WishButton({ row, wishes }: { row: GearRow; wishes: BisWishes }): JSX.Element | null {
  const { onToggle } = wishes
  if (onToggle === undefined) return null
  const wished = wishes.wished.has(row.key)
  return (
    <Tooltip title={wished ? 'On your wish list (click to take it off)' : 'Add to wishlist'}>
      <IconButton
        size="small"
        data-testid="bis-wish"
        aria-label={wished ? 'Remove from wish list' : 'Add to wishlist'}
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          onToggle(row, wished)
        }}
        sx={{ p: 0.25, color: wished ? 'success.main' : 'text.secondary' }}
      >
        {wished ? <CheckIcon sx={{ fontSize: 16 }} /> : <AddIcon sx={{ fontSize: 16 }} />}
      </IconButton>
    </Tooltip>
  )
}

function ItemLine({ row, props }: { row: GearRow; props: BisCellsProps }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
      <ItemIcon name={row.name} />
      {/* ONLY THE NAME IS THE LINK (owner: *"if i'm clikcing to the RIGHT of the text for the item name, don't make
          that a hyperlink"*): the box takes the row's width, the link only its text, so a click beside the
          name falls through to the card and opens the next five. */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Link component="button" variant="body2" underline="hover" data-testid="bis-cell-item" onClick={(e: MouseEvent) => { e.stopPropagation(); props.onOpenLoot?.(row.name) }} sx={{ fontWeight: 600, textAlign: 'left', overflowWrap: 'anywhere', maxWidth: '100%' }}>
          {row.name}
        </Link>
      </Box>
      <WishButton row={row} wishes={props.wishes} />
    </Stack>
  )
}

/** The hover's own surface: SOLID, not the theme's paper (the owner's screenshot showed the cards behind bleeding through). */
const TIP_SLOT = { tooltip: { sx: { maxWidth: 400, bgcolor: (t: Theme) => (t.palette.mode === 'dark' ? '#15171d' : '#ffffff'), backgroundImage: 'none', opacity: 1, color: 'text.primary', border: 1, borderColor: 'divider', boxShadow: 8 } } }

/**
 * The next five; the one worn in this cell is highlighted (owner: *"it needs to indicate that row is
 * worn"*). Each row has its own hover comparing IT with what is worn (owner: *"when i hover over a next
 * best, can we compare that hovred next best item to what i'm wearing?"*); `onInner` tells the card to
 * hold its own hover back meanwhile.
 */
function NextBest({ cell, worn, props, onInner }: { cell: BisCell; worn: WornCell | undefined; props: BisCellsProps; onInner: (on: boolean) => void }): JSX.Element {
  return (
    <Stack sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }} spacing={0.25} data-testid="bis-cell-next" onMouseEnter={() => onInner(true)} onMouseLeave={() => onInner(false)}>
      <Typography variant="overline" color="text.secondary">Next best</Typography>
      {cell.runnersUp.length === 0 && <Typography variant="caption" color="text.secondary">None.</Typography>}
      {cell.runnersUp.map((r) => {
        const on = isWorn(r.row, worn)
        return (
          <Tooltip
            key={r.row.key}
            placement="right-start"
            enterDelay={250}
            enterNextDelay={100}
            title={<BisCompare cell={{ ...cell, pick: { ...r, reasons: [] } }} worn={worn} model={props.model} setup={props.setup} classes={props.classes} plus={props.plus} label="Next best:" />}
            slotProps={TIP_SLOT}
          >
          <Stack
            key={r.row.key}
            direction="row"
            spacing={0.75}
            alignItems="center"
            data-testid="bis-next-row"
            data-worn={on ? 'true' : undefined}
            sx={{ px: 0.5, mx: -0.5, borderRadius: 0.5, bgcolor: on ? 'rgba(102, 187, 106, 0.18)' : undefined, outline: on ? '1px solid' : 'none', outlineColor: 'success.main' }}
          >
            <ItemIcon name={r.row.name} />
            <Typography variant="caption" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
              {r.row.name}
              {on && <Box component="span" sx={{ ml: 0.5, color: 'success.main', fontWeight: 700 }}>worn</Box>}
            </Typography>
            {r.damageFirst !== undefined && <Typography variant="caption" color="info.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>{`ratio ${r.damageFirst.toFixed(2)}`}</Typography>}
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.score.toFixed(1)}</Typography>
            <WishButton row={r.row} wishes={props.wishes} />
          </Stack>
          </Tooltip>
        )
      })}
    </Stack>
  )
}

/** The card's item half: the pick with its icon, tags and why, or why the cell is empty. */
function CardBody({ cell, props, pickWorn }: { cell: BisCell; props: BisCellsProps; pickWorn: boolean }): JSX.Element {
  const pick = cell.pick
  if (pick === undefined) {
    return (
      <Typography variant="body2" color="text.secondary">
        {cell.closedByTwoHander === true ? 'Closed: the two-hander in Primary scores more than a one-hander and an offhand.' : 'Nothing you could wear here adds to your board.'}
      </Typography>
    )
  }
  const note = hasteNote(pick.row.stats.HASTE, pick.hasteCounted, cell.otherHaste)
  return (
    <>
      <ItemLine row={pick.row} props={props} />
      <Tags cell={cell} owned={props.owned} worn={pickWorn} />
      <Typography variant="caption" color="text.secondary">{pick.reasons.map((t) => termText(pick.row, t)).join('  ·  ')}</Typography>
      {note !== undefined && <Typography variant="caption" color="text.disabled">{note}</Typography>}
      {pick.damageFirst !== undefined && (
        <Typography variant="caption" color="info.main" data-testid="bis-damage-first">
          {`Damage first: ratio ${pick.damageFirst.toFixed(2)} (your weapon ratio is in S; stats only break a tie)`}
        </Typography>
      )}
    </>
  )
}

/** A slot with a suggested change is tinted as well as bordered, so the suggestions stand out in a row of cards (owner: *"can we change the background slightly too not just the border? this way the recomendations POP"*). */
function cardBorder(open: boolean, differs: boolean): { border: number; borderColor: string; p: string | number; bgcolor: string } {
  return { border: differs ? 2 : 1, borderColor: open ? 'primary.main' : differs ? 'warning.main' : 'divider', p: differs ? '7px' : 1, bgcolor: differs ? 'rgba(255, 167, 38, 0.13)' : 'background.paper' }
}

function Card({ cell, props, open, onToggle }: { cell: BisCell; props: BisCellsProps; open: boolean; onToggle: () => void }): JSX.Element {
  const pick = cell.pick
  const worn = props.worn.get(cell.cell)
  const pickWorn = pick !== undefined && isWorn(pick.row, worn)
  // THE DIFFERENCE BORDER (owner: *"do some sort of border if there is a suggested difference for the slot"*).
  const differs = pick !== undefined && !pickWorn
  const [tip, setTip] = useState(false)
  const [inner, setInner] = useState(false)
  // A list closed under the pointer never sends its mouse-leave; the card's hover must come back.
  useEffect(() => {
    if (!open) setInner(false)
  }, [open])
  return (
    <Tooltip
      placement="right-start"
      enterDelay={350}
      enterNextDelay={200}
      open={tip && !inner}
      onOpen={() => setTip(true)}
      onClose={() => setTip(false)}
      title={<BisCompare cell={cell} worn={worn} model={props.model} setup={props.setup} classes={props.classes} plus={props.plus} />}
      slotProps={TIP_SLOT}
    >
      <Box
        data-testid="bis-cell"
        data-cell={cell.cell}
        data-differs={differs ? 'true' : undefined}
        data-worn={worn === undefined ? undefined : 'true'}
        onClick={onToggle}
        sx={{
          ...cardBorder(open, differs),
          borderRadius: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
          minWidth: 0,
          cursor: 'pointer'
        }}
      >
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="overline" sx={{ lineHeight: 1.4 }} color="text.secondary">{cellLabel(cell.cell)}</Typography>
          {pick !== undefined && <Typography variant="caption" color="primary.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>{pick.score.toFixed(1)}</Typography>}
        </Stack>
        <CardBody cell={cell} props={props} pickWorn={pickWorn} />
        {open && <NextBest cell={cell} worn={worn} props={props} onInner={setInner} />}
      </Box>
    </Tooltip>
  )
}

export default function BisCells(props: BisCellsProps): JSX.Element {
  const [open, setOpen] = useState<PlanSlotId | null>(null)
  return (
    <Box data-testid="bis-cells" sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
      {props.sheet.cells.map((cell) => (
        <Card key={cell.cell} cell={cell} props={props} open={open === cell.cell} onToggle={() => setOpen(open === cell.cell ? null : cell.cell)} />
      ))}
    </Box>
  )
}
