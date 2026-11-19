// gear/VoidMotePanel.tsx — where to spend a void mote (Void-Touched Potential): the list the Void
// motes tab draws (VoidMoteView.tsx).
//
// One row per WORN item below +10: what the next tier gains the chosen target, how many copies it
// would cost without the mote, and where those copies come from. The ranking and every number are
// `shared/planner/voidMotes.ts`; the words are `voidMotePrefs.ts`; this file only lays them out.
//
// It reads the same `plannerInventory` join the Gear tab's hover card does (`GearCompareData`), so
// both say one thing about the dump.
//
// IT FILLS ITS HOST (owner, 2026-11-19: as a 216 px box over the Gear tab's table it was a second
// list on a catalog page). The host gives it a height; the list scrolls inside and never grows the
// page. A host that wants it short bounds the box it sits in.

import { type JSX, useMemo } from 'react'
import {
  Box,
  ListSubheader,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import type { ClassAbbr } from '@shared/classCombo'
import { outputKind } from '@shared/outputs/kinds'
import { planSlotLabel } from '@shared/planner/types'
import {
  MOTE_ORDERS,
  MOTE_SOURCE_LABEL,
  MOTE_TARGET_STATS,
  isMotePick,
  moteAdvice,
  raidFactsOf,
  sortMoteAdvice,
  type MoteAdvice,
  type MoteOrder,
  type MoteSource,
  type MoteTarget
} from '@shared/planner/voidMotes'
import { getBossData } from '../../data'
import { segmented } from '../combat/segmented'
import { DonorName } from '../planner/PlannerChips'
import type { GearCompareData } from './gearData'
import {
  MOTE_ORDER_HINT,
  MOTE_ORDER_LABEL,
  MOTE_TARGET_ROLES,
  moteChangesText,
  moteCopiesText,
  moteGainText,
  moteSourceTitle,
  moteTargetLabel,
  type VoidMotePrefs
} from './voidMotePrefs'

/** The command, from the registry that owns its spelling (the hover card's rule). */
const INVENTORY_COMMAND = outputKind('inventory').command

const HINT = 'Void-Touched Potential: up to three a week from raids, each skips a whole tier.'

/** One clause per header (the tooltip diet). */
const HEAD: readonly { label: string; hint: string; align?: 'right' }[] = [
  { label: '#', hint: "The top three are this week's picks" },
  { label: 'Item', hint: 'A worn item, and the tier one mote takes it to' },
  { label: 'Slot', hint: 'Where your inventory dump says you wear it' },
  { label: 'Gain', hint: 'What the next tier adds for your target', align: 'right' },
  { label: 'Next tier', hint: 'Every stat the next tier changes' },
  { label: 'Skips', hint: 'Copies of the item the next tier costs without a mote', align: 'right' },
  { label: 'Source', hint: 'Where copies come from; the easiest listed source counts' }
]

/** Raid reads loudest: it is the source the owner's order puts first. */
const SOURCE_COLOR: Record<MoteSource, string> = {
  raid: 'warning.main',
  quest: 'info.main',
  high: 'info.main',
  crafted: 'text.secondary',
  farm: 'text.secondary',
  unknown: 'text.disabled'
}

const CELL = { py: 0.25, px: 1, fontSize: 12, whiteSpace: 'nowrap' } as const

interface ControlsProps {
  motes: VoidMotePrefs
  setMotes: (next: VoidMotePrefs) => void
}

/** The two picks: what a gain is measured in, and what the list is ranked by. */
function MoteControls({ motes, setMotes }: ControlsProps): JSX.Element {
  return (
    <>
      <TextField
        select
        size="small"
        label="Gain for"
        value={motes.target}
        data-testid="gear-motes-target"
        title="What a mote should improve: a focus, or one stat"
        onChange={(e) => {
          setMotes({ ...motes, target: e.target.value as MoteTarget })
        }}
        sx={{ minWidth: 140, flexShrink: 0 }}
      >
        <ListSubheader>Focus</ListSubheader>
        {MOTE_TARGET_ROLES.map((t) => (
          <MenuItem key={t} value={t} dense>
            {moteTargetLabel(t)}
          </MenuItem>
        ))}
        <ListSubheader>One stat</ListSubheader>
        {MOTE_TARGET_STATS.map((t) => (
          <MenuItem key={t} value={t} dense>
            {moteTargetLabel(t)}
          </MenuItem>
        ))}
      </TextField>
      <ToggleButtonGroup
        size="small"
        exclusive
        data-testid="gear-motes-order"
        value={motes.order}
        onChange={(_e: unknown, v: MoteOrder | null) => {
          if (v !== null) setMotes({ ...motes, order: v })
        }}
        sx={segmented('quiet')}
      >
        {MOTE_ORDERS.map((o) => (
          <ToggleButton key={o} value={o} title={MOTE_ORDER_HINT[o]} data-testid={`gear-motes-order-${o}`}>
            {MOTE_ORDER_LABEL[o]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </>
  )
}

interface RowProps {
  advice: MoteAdvice
  rank: number
  pick: boolean
  target: MoteTarget
  onOpenLoot?: (item: string) => void
}

function MoteRow({ advice, rank, pick, target, onOpenLoot }: RowProps): JSX.Element {
  const changes = moteChangesText(advice)
  const opens = advice.opens === undefined ? '' : `opens the ${advice.opens} socket`
  return (
    <TableRow data-testid="gear-motes-row" data-pick={pick ? 'true' : 'false'} selected={pick}>
      <TableCell sx={{ ...CELL, color: pick ? 'primary.main' : 'text.disabled', fontWeight: pick ? 700 : 400 }}>
        {rank}
      </TableCell>
      <TableCell sx={{ ...CELL, maxWidth: 260 }}>
        <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }}>
          <DonorName name={advice.name} onOpen={onOpenLoot} bold={pick} />
          <Box component="span" data-testid="gear-motes-tier" sx={{ color: 'text.secondary', flexShrink: 0 }}>
            +{advice.tier}→+{advice.tier + 1}
          </Box>
        </Stack>
      </TableCell>
      <TableCell sx={{ ...CELL, color: 'text.secondary' }}>{planSlotLabel(advice.cell)}</TableCell>
      <TableCell align="right" data-testid="gear-motes-gain" sx={{ ...CELL, color: 'success.light' }}>
        {moteGainText(advice, target)}
      </TableCell>
      {/* Wraps: a jewel moves a dozen stats, and a cut-off list hid the half that decides. */}
      <TableCell data-testid="gear-motes-changes" sx={{ ...CELL, whiteSpace: 'normal', color: 'text.secondary' }}>
        {opens !== '' && (
          <Box component="span" data-testid="gear-motes-opens" sx={{ color: 'primary.main', mr: 0.75 }}>
            {opens}
          </Box>
        )}
        {changes}
      </TableCell>
      <TableCell align="right" data-testid="gear-motes-copies" sx={CELL}>
        {moteCopiesText(advice)}
      </TableCell>
      <TableCell data-testid="gear-motes-source" title={moteSourceTitle(advice)} sx={{ ...CELL, color: SOURCE_COLOR[advice.source] }}>
        {MOTE_SOURCE_LABEL[advice.source]}
      </TableCell>
    </TableRow>
  )
}

/** Why there is no list: no dump is the command, never "you wear nothing" (the hover card's rule). */
function emptyText(compare: GearCompareData): string {
  if (!compare.ready) return 'Reading your inventory…'
  if (!compare.hasDump) return `No inventory dump for this character yet. Type ${INVENTORY_COMMAND} in game.`
  return 'Nothing you wear can go higher: every piece the item data knows is already +10.'
}

export interface VoidMotePanelProps {
  /** what is worn, and the corpus by key — the hover card's own join */
  compare: GearCompareData
  /** the gear area's class picks, for the focus scores' class gate */
  classes: readonly ClassAbbr[]
  motes: VoidMotePrefs
  setMotes: (next: VoidMotePrefs) => void
  onOpenLoot?: (item: string) => void
}

export default function VoidMotePanel({ compare, classes, motes, setMotes, onOpenLoot }: VoidMotePanelProps): JSX.Element {
  const raid = useMemo(() => raidFactsOf(getBossData().targets), [])
  const { equipped, byKey } = compare
  const advice = useMemo(
    () => moteAdvice([...equipped.values()], byKey, { target: motes.target, classes, raid }),
    [equipped, byKey, motes.target, classes, raid]
  )
  const list = useMemo(() => sortMoteAdvice(advice, motes.order), [advice, motes.order])

  return (
    <Box
      data-testid="gear-motes"
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, border: 1, borderColor: 'divider', borderRadius: 1 }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 1, py: 0.75, flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
          Void motes
        </Typography>
        <Typography variant="caption" color="text.secondary" title={HINT} noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
          One lifts a worn item a full tier
        </Typography>
        <MoteControls motes={motes} setMotes={setMotes} />
      </Stack>
      {list.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="gear-motes-empty" sx={{ px: 1, pb: 1 }}>
          {emptyText(compare)}
        </Typography>
      ) : (
        <Box data-testid="gear-motes-list" sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {HEAD.map((h) => (
                  <TableCell key={h.label} title={h.hint} align={h.align} sx={{ ...CELL, color: 'text.secondary' }}>
                    {h.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((a, i) => (
                <MoteRow
                  key={a.cell}
                  advice={a}
                  rank={i + 1}
                  pick={isMotePick(list, i)}
                  target={motes.target}
                  onOpenLoot={onOpenLoot}
                />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}
