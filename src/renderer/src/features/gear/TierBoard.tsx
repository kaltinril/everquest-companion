// gear/TierBoard.tsx — THE S-TO-F BOARD (Malkil, 2026-11-24: *"assigning each stat a tier using a
// drag-and-drop S, A, B, C, D, F system"*; owner: the reference image *"should be saved and be the one
// actually used"*). Six lanes in the image's colours, the Off lane under them (the owner's *"cross a
// stat off"*; named Unassigned since the owner's 2026-11-24 R1 pass), chips dragged
// between lanes with the browser's own drag and drop (as
// features/macros/ButtonGrid.tsx), or clicked for a menu, so nothing is drag-only.

import { useState, type DragEvent, type JSX } from 'react'
import { Box, Button, Popover, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import {
  TIERS,
  TIER_STEPS,
  activeChips,
  boardToText,
  chipLabel,
  isRatioChip,
  tierWeight,
  type Tier,
  type TierChip,
  type TierSetup,
  type TierStep
} from '@shared/planner/tierChips'
import { chipUnit, type TierModel } from '@shared/planner/tierWeights'
import { LANE_COLOUR, LANE_INK, LANE_TRAY, chipFamily, chipHint, unitText } from './bisText'

export interface TierBoardProps {
  setup: TierSetup
  model: TierModel
  level: number
  /** chips some item the player could wear states; the rest are drawn faded */
  stated: ReadonlySet<TierChip>
  onLane: (chip: TierChip, tier: Tier) => void
  onCap: (chip: TierChip, cap: number | undefined) => void
  onStep: (step: TierStep) => void
  onSplit: () => void
  /** every stat to Unassigned */
  onClear: () => void
  /** a pasted board; false when the text is not one */
  onLoad: (text: string) => boolean
}

const FAMILY_BG = { weapon: '#3a2f22', resist: '#22313a', pool: '#2b2540', plain: '#2e3240' } as const
const DRAG_TYPE = 'text/plain'

function laneTitle(t: Tier): string {
  return t === 'Off' ? 'Unassigned' : t
}

function BoardChip({ chip, setup, faded, onOpen }: { chip: TierChip; setup: TierSetup; faded: boolean; onOpen: (el: HTMLElement, chip: TierChip) => void }): JSX.Element {
  const off = setup.board[chip] === 'Off'
  const cap = setup.caps[chip]
  return (
    <Box
      component="span"
      role="button"
      tabIndex={0}
      draggable
      data-testid={`bis-chip-${chip}`}
      title={faded ? 'No item you could wear states this' : undefined}
      onDragStart={(e: DragEvent) => e.dataTransfer.setData(DRAG_TYPE, chip)}
      onClick={(e) => onOpen(e.currentTarget, chip)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(e.currentTarget, chip)
        }
      }}
      sx={{
        cursor: 'grab',
        userSelect: 'none',
        borderRadius: 0.5,
        px: 1,
        py: 0.5,
        fontSize: 12,
        fontWeight: 600,
        bgcolor: off ? '#262833' : FAMILY_BG[chipFamily(chip)],
        color: off ? '#a9aebb' : '#f1ede2',
        border: '1px solid #454b5b',
        borderStyle: faded ? 'dashed' : 'solid',
        opacity: faded ? 0.45 : 1,
        '&:hover': { borderColor: 'primary.main' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.light' }
      }}
    >
      {chipLabel(chip)}
      {cap !== undefined && <Box component="span" sx={{ ml: 0.5, fontSize: 10, color: 'primary.main' }}>cap {cap}</Box>}
    </Box>
  )
}

function Lane({ tier, props, onOpen }: { tier: Tier; props: TierBoardProps; onOpen: (el: HTMLElement, chip: TierChip) => void }): JSX.Element {
  const [over, setOver] = useState(false)
  const { setup } = props
  const chips = activeChips(setup.split).filter((c) => setup.board[c] === tier)
  const weight = tierWeight(tier, setup.step)
  return (
    <Box data-testid={`bis-lane-${tier}`} sx={{ display: 'grid', gridTemplateColumns: '64px 1fr', minHeight: 52 }}>
      <Box sx={{ bgcolor: LANE_COLOUR[tier], color: tier === 'Off' ? '#e7e3d8' : LANE_INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.1 }}>
        <Typography sx={{ fontSize: tier === 'Off' ? 11 : 22, fontWeight: tier === 'Off' ? 700 : 500, color: 'inherit' }}>{laneTitle(tier)}</Typography>
        {tier !== 'Off' && <Typography sx={{ fontSize: 10, fontWeight: 700, opacity: 0.75, color: 'inherit' }}>x{Number(weight.toPrecision(3))}</Typography>}
      </Box>
      <Box
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const chip = e.dataTransfer.getData(DRAG_TYPE) as TierChip
          if (chip in setup.board) props.onLane(chip, tier)
        }}
        sx={{ bgcolor: over ? '#24261e' : LANE_TRAY, boxShadow: over ? 'inset 0 0 0 2px #d9b25f' : 'none', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 0.5, p: 0.75, minWidth: 0 }}
      >
        {chips.map((c) => (
          <BoardChip key={c} chip={c} setup={setup} faded={!props.stated.has(c)} onOpen={onOpen} />
        ))}
      </Box>
    </Box>
  )
}

function ChipMenu({ chip, anchor, props, onClose }: { chip: TierChip; anchor: HTMLElement; props: TierBoardProps; onClose: () => void }): JSX.Element {
  const [cap, setCap] = useState(props.setup.caps[chip] === undefined ? '' : String(props.setup.caps[chip]))
  const hint = chipHint(chip, props.model.conv, props.level)
  const applyCap = (): void => {
    const n = Number(cap)
    props.onCap(chip, cap.trim() === '' || !Number.isFinite(n) ? undefined : n)
    onClose()
  }
  return (
    <Popover open anchorEl={anchor} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <Stack spacing={1} sx={{ p: 1.5, width: 360 }} data-testid="bis-chip-menu">
        <Typography variant="subtitle2">{chipLabel(chip)}</Typography>
        <Stack direction="row" spacing={0.5}>
          {TIERS.map((t) => (
            <Button
              key={t}
              size="small"
              data-testid={`bis-menu-${t}`}
              onClick={() => {
                props.onLane(chip, t)
                onClose()
              }}
              sx={{ minWidth: 0, flex: 1, bgcolor: LANE_COLOUR[t], color: t === 'Off' ? '#e7e3d8' : LANE_INK, fontWeight: 700, outline: props.setup.board[chip] === t ? '2px solid #fff' : 'none', '&:hover': { bgcolor: LANE_COLOUR[t], opacity: 0.85 } }}
            >
              {laneTitle(t)}
            </Button>
          ))}
        </Stack>
        {hint !== undefined && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
        <Typography variant="caption" color="text.secondary">{unitText(chip, chipUnit(props.model.units, chip))}</Typography>
        {!isRatioChip(chip) && (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              label="Cap the loadout at"
              placeholder="none"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyCap()}
              slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'bis-cap-input' } }}
              sx={{ width: 150 }}
            />
            <Button size="small" onClick={applyCap} data-testid="bis-cap-set">Set</Button>
          </Stack>
        )}
      </Stack>
    </Popover>
  )
}

function BoardText({ setup, onLoad }: { setup: TierSetup; onLoad: (text: string) => boolean }): JSX.Element {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const copy = (): void => {
    const line = boardToText(setup)
    setText(line)
    navigator.clipboard.writeText(line).then(
      () => setMsg('Copied.'),
      () => setMsg('Select and copy the text.')
    )
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Button size="small" variant="outlined" onClick={copy} data-testid="bis-copy">Copy board</Button>
      <TextField size="small" placeholder="paste a board (bis2:...)" value={text} onChange={(e) => setText(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'bis-board-text' } }} sx={{ flex: 1, minWidth: 160 }} />
      <Button size="small" variant="outlined" onClick={() => setMsg(onLoad(text) ? 'Board loaded.' : 'That text is not a board. A board starts with bis2:')} data-testid="bis-load">Load</Button>
      {msg !== '' && <Typography variant="caption" color="text.secondary">{msg}</Typography>}
    </Stack>
  )
}

export default function TierBoard(props: TierBoardProps): JSX.Element {
  const [menu, setMenu] = useState<{ chip: TierChip; anchor: HTMLElement } | null>(null)
  const open = (anchor: HTMLElement, chip: TierChip): void => setMenu({ chip, anchor })
  const { setup } = props
  return (
    <Stack spacing={1} data-testid="bis-board">
      <Box sx={{ border: '2px solid #000', bgcolor: '#000', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {TIERS.map((t) => (
          <Lane key={t} tier={t} props={props} onOpen={open} />
        ))}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary">Each tier counts</Typography>
        <ToggleButtonGroup size="small" exclusive value={setup.step} onChange={(_e, v: TierStep | null) => v !== null && props.onStep(v)}>
          {TIER_STEPS.map((s) => (
            <ToggleButton key={s} value={s} data-testid={`bis-step-${String(s)}`} sx={{ py: 0.25 }}>
              {s === 25 ? 'S always wins' : `${String(s)}x the next`}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ToggleButton size="small" value="split" selected={setup.split} onChange={props.onSplit} data-testid="bis-split" sx={{ py: 0.25 }}>
          Split resists
        </ToggleButton>
        <Button size="small" variant="outlined" color="warning" onClick={props.onClear} data-testid="bis-clear" sx={{ py: 0.25 }}>
          Clear tiers
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Unassigned stats do not count: drop a stat there when you have maxed it or no longer need it. Clear tiers drops every stat there. Click a stat for its menu: its tier, what it does, and a cap (it then counts only up to that total across the loadout; Legends caps attributes at 510).
      </Typography>
      <BoardText setup={setup} onLoad={props.onLoad} />
      {menu !== null && <ChipMenu chip={menu.chip} anchor={menu.anchor} props={props} onClose={() => setMenu(null)} />}
    </Stack>
  )
}
