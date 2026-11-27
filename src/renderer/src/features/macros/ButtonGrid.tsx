// macros/ButtonGrid.tsx — one page of a character's buttons. A click picks a button; a filled one
// dragged onto another moves there, or the two swap. Each carries its mark against the game's file.

import { type DragEvent, type JSX, useRef, useState } from 'react'
import { Box, Button, Chip, Stack, type SxProps, type Theme, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import BoltIcon from '@mui/icons-material/Bolt'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import type { GridButton } from '@shared/macros/buttons'
import { firstLine } from '@shared/macros/library'
import type { HotbarSlots } from '@shared/macros/types'
import { Tooltip } from '../../lib/Tooltip'
import { ColorMark } from './MacroColor'
import { MARK_COLOR, MONO_SX } from './macroParts'

interface CellProps {
  cell: GridButton
  picked: boolean
  /** This button is the one being dragged. */
  lifted: boolean
  /** A dragged button is over this one. */
  target: boolean
  /** The game's copy of this button changed too, and the player's is the one kept. */
  clash: boolean
  /** While selecting: whether this button is selected. Null when not selecting. */
  check: boolean | null
  /** A hotbar button of the game points at this one. */
  onBar: boolean
  onPick: () => void
  drag: DragHandlers
}

interface DragHandlers {
  start: (e: DragEvent<HTMLElement>, slot: string) => void
  over: (e: DragEvent<HTMLElement>, slot: string) => void
  leave: (slot: string) => void
  drop: (e: DragEvent<HTMLElement>, slot: string) => void
  end: () => void
}

/** What a button says under its number: its macro, or that it is empty, or what the game still has there. */
function CellBody({ cell }: { cell: GridButton }): JSX.Element {
  const { macro, game } = cell
  if (macro !== null) {
    const line = firstLine(macro)
    return (
      <>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <ColorMark color={macro.color} />
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {macro.name === '' ? 'Unnamed' : macro.name}
          </Typography>
        </Stack>
        <Typography variant="caption" noWrap component="div" sx={{ color: 'text.secondary', ...MONO_SX }}>
          {line === '' ? 'no commands yet' : line}
        </Typography>
      </>
    )
  }
  if (cell.mark === 'removed' && game !== null) {
    return (
      <Typography variant="body2" noWrap sx={{ color: 'text.disabled', textDecoration: 'line-through' }}>
        {game.name}
      </Typography>
    )
  }
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      Empty
    </Typography>
  )
}

function cellLabel(cell: GridButton, clash: boolean, onBar: boolean): string {
  const what = cell.macro === null ? 'empty' : cell.macro.name
  const base = cell.mark === null ? `Button ${String(cell.button)}: ${what}` : `Button ${String(cell.button)}: ${what}, ${cell.mark}`
  const marked = clash ? `${base}, changed in game too` : base
  return onBar ? `${marked}, on a hotbar` : marked
}

/** The check mark a filled button carries while buttons are being selected. */
function CellCheck({ check }: { check: boolean }): JSX.Element {
  return check ? <CheckCircleIcon fontSize="small" color="primary" data-testid="macro-slot-check" /> : <RadioButtonUncheckedIcon fontSize="small" color="disabled" />
}

/** The mark on a button a hotbar uses. The button's children ignore the mouse; this one takes it for its tooltip. */
function HotbarMark(): JSX.Element {
  return (
    <Tooltip title="A hotbar button fires whatever macro sits on this button.">
      <Box component="span" data-testid="macro-slot-hotbar" sx={{ display: 'inline-flex', pointerEvents: 'auto' }}>
        <BoltIcon sx={{ fontSize: 16 }} color="action" />
      </Box>
    </Tooltip>
  )
}

/** A button's top row: its number, its marks against the game and the hotbars, and its check mark while selecting. */
function CellTop({ cell, check, onBar }: { cell: GridButton; check: boolean | null; onBar: boolean }): JSX.Element {
  const { mark } = cell
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {cell.button}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {onBar && <HotbarMark />}
        {mark !== null && <Chip size="small" variant="outlined" color={MARK_COLOR[mark]} label={mark} data-testid="macro-slot-mark" sx={{ height: 20 }} />}
        {check !== null && cell.macro !== null && <CellCheck check={check} />}
      </Stack>
    </Stack>
  )
}

/** How a button is drawn. `strong` is the heavier border: picked, selected, or about to take a drag. */
function cellSx(filled: boolean, strong: boolean, lifted: boolean, target: boolean): SxProps<Theme> {
  return {
    display: 'block',
    textAlign: 'left',
    textTransform: 'none',
    minWidth: 0,
    minHeight: 72,
    opacity: lifted ? 0.5 : 1,
    borderStyle: filled ? 'solid' : 'dashed',
    borderWidth: strong ? 2 : 1,
    borderColor: strong ? 'primary.main' : 'divider',
    bgcolor: target ? 'action.hover' : undefined,
    // Drag events land on the button itself, never on its text, so the target does not flicker.
    '& > *': { pointerEvents: 'none' }
  }
}

function Cell({ cell, picked, lifted, target, clash, check, onBar, onPick, drag }: CellProps): JSX.Element {
  const { slot, mark } = cell
  const filled = cell.macro !== null
  const strong = picked || target || check === true
  return (
    <Button
      variant="outlined"
      color={picked || check === true ? 'primary' : 'inherit'}
      disabled={check !== null && !filled}
      onClick={onPick}
      aria-label={cellLabel(cell, clash, onBar)}
      aria-pressed={check ?? picked}
      data-testid="macro-slot"
      data-mark={mark ?? 'same'}
      draggable={filled && check === null}
      onDragStart={(e) => {
        drag.start(e, slot)
      }}
      onDragOver={(e) => {
        drag.over(e, slot)
      }}
      onDragLeave={() => {
        drag.leave(slot)
      }}
      onDrop={(e) => {
        drag.drop(e, slot)
      }}
      onDragEnd={drag.end}
      sx={cellSx(filled, strong, lifted, target)}
    >
      <CellTop cell={cell} check={check} onBar={onBar} />
      <CellBody cell={cell} />
      {clash && (
        <Typography variant="caption" sx={{ color: 'warning.main' }} noWrap component="div" data-testid="macro-slot-clash">
          Changed in game too
        </Typography>
      )}
    </Button>
  )
}

interface GridProps {
  buttons: GridButton[]
  selected: string | null
  /** The slots changed both in the game and in the app. */
  clashes: readonly string[]
  /** The selected slots while selecting; null when not selecting. */
  checked: readonly string[] | null
  /** The buttons the game's hotbars point at. */
  hotbars: HotbarSlots
  onPick: (slot: string) => void
  /** A filled button was dropped on another button of the page. */
  onMove: (from: string, to: string) => void
}

export function ButtonGrid({ buttons, selected, clashes, checked, hotbars, onPick, onMove }: GridProps): JSX.Element {
  // The slot being dragged is read by the drop handlers at once, so it is a ref; the two states
  // only draw it.
  const from = useRef<string | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const end = (): void => {
    from.current = null
    setLifted(null)
    setOver(null)
  }
  const drag: DragHandlers = {
    start: (e, slot) => {
      from.current = slot
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', slot)
      // After the browser has taken its picture of the button, so the picture is not the faded one.
      setTimeout(() => {
        if (from.current === slot) setLifted(slot)
      }, 0)
    },
    over: (e, slot) => {
      if (from.current === null || from.current === slot) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver(slot)
    },
    leave: (slot) => {
      setOver((current) => (current === slot ? null : current))
    },
    drop: (e, slot) => {
      e.preventDefault()
      const source = from.current
      end()
      if (source !== null && source !== slot) onMove(source, slot)
    },
    end
  }
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1, alignContent: 'start' }} data-testid="macro-slot-grid">
      {buttons.map((cell) => (
        <Cell
          key={cell.slot}
          cell={cell}
          picked={cell.slot === selected}
          lifted={cell.slot === lifted}
          target={cell.slot === over}
          clash={clashes.includes(cell.slot)}
          check={checked === null ? null : checked.includes(cell.slot)}
          onBar={cell.slot in hotbars}
          drag={drag}
          onPick={() => {
            onPick(cell.slot)
          }}
        />
      ))}
    </Box>
  )
}
