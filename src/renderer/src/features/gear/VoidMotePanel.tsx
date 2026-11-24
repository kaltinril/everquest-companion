// gear/VoidMotePanel.tsx — where to spend a void mote (Void-Touched Potential): the list the Void
// motes tab draws (VoidMoteView.tsx).
//
// One row per WORN item below +10: what the next tier gains the chosen target, the hours of play
// it would otherwise cost, and where copies come from; above the list, where the week's three
// motes go. The ranking and every number are `shared/planner/voidMotes.ts` (the supply estimate is
// on each gear row, `itemSupply.ts`); the words are `voidMotePrefs.ts`; this file lays them out.
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
import type { SupplyKind } from '@shared/planner/itemSupply'
import { planSlotLabel } from '@shared/planner/types'
import {
  MOTE_ORDERS,
  MOTE_TARGET_STATS,
  isMoteReady,
  moteAdvice,
  motePlan,
  moteUnranked,
  planMotesOn,
  sortMoteAdvice,
  type MoteAdvice,
  type MoteOrder,
  type MoteTarget
} from '@shared/planner/voidMotes'
import { segmented } from '../combat/segmented'
import { DonorName } from '../planner/PlannerChips'
import type { GearCompareData } from './gearData'
import {
  MOTE_ORDER_HINT,
  MOTE_ORDER_LABEL,
  MOTE_TARGET_ROLES,
  MOTES_ON_HAND,
  moteChangesText,
  moteEmptyText,
  moteGainHint,
  moteGainText,
  moteGateText,
  moteHoursText,
  moteHoursTitle,
  motePlanLine,
  moteSourceText,
  moteSourceTitle,
  moteTargetLabel,
  moteUnrankedText,
  type VoidMotePrefs
} from './voidMotePrefs'

/** The command, from the registry that owns its spelling (the hover card's rule). */
const INVENTORY_COMMAND = outputKind('inventory').command

const HINT = 'Void-Touched Potential: three a week from raids, each skips a whole tier.'

/** One clause per header (the tooltip diet). */
const HEAD: readonly { label: string; hint: string; align?: 'right' }[] = [
  { label: '#', hint: "How many of this week's motes it gets; a dash means not yet" },
  { label: 'Item', hint: "A worn item and its next tier, or where this week's motes take it" },
  { label: 'Slot', hint: 'Where your inventory dump says you wear it' },
  { label: 'Gain', hint: 'What the next tier adds for your target', align: 'right' },
  { label: 'Next tier', hint: 'Every stat the next tier changes' },
  { label: 'Saves', hint: 'Hours of play the next tier costs without a void mote', align: 'right' },
  { label: 'Copies come from', hint: 'The easiest listed source, and what prices it' }
]

/** A raid boss reads loudest: it is the source the owner's order puts first. */
const SOURCE_COLOR: Record<SupplyKind, string> = {
  raid: 'warning.main',
  raidZone: 'warning.light',
  quest: 'info.main',
  crafted: 'text.secondary',
  camp: 'text.secondary',
  unknown: 'text.disabled'
}

const CELL = { py: 0.25, px: 1, fontSize: 12, whiteSpace: 'nowrap' } as const

interface ControlsProps {
  motes: VoidMotePrefs
  setMotes: (next: VoidMotePrefs) => void
  /** Greyed while there is no list: a pick would change nothing on screen. */
  disabled: boolean
}

/**
 * The three picks: how many motes there are to spend, what a gain is measured in, and what the list
 * is ranked by. The count stays live with no list: it is a fact about the player, not the rows.
 */
function MoteControls({ motes, setMotes, disabled }: ControlsProps): JSX.Element {
  return (
    <>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
        <Typography variant="caption" color="text.secondary" component="span">
          Motes on hand
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          data-testid="gear-motes-onhand"
          value={motes.onHand}
          onChange={(_e: unknown, v: number | null) => {
            if (v !== null) setMotes({ ...motes, onHand: v })
          }}
          sx={segmented('quiet')}
        >
          {MOTES_ON_HAND.map((n) => (
            <ToggleButton key={n} value={n} title={`You have ${String(n)} void ${n === 1 ? 'mote' : 'motes'} to spend`} data-testid={`gear-motes-onhand-${String(n)}`}>
              {n}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      <TextField
        select
        size="small"
        disabled={disabled}
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
        disabled={disabled}
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
  /** how many of the week's motes land on this item */
  picks: number
  target: MoteTarget
  onOpenLoot?: (item: string) => void
}

function MoteRow({ advice, picks, target, onOpenLoot }: RowProps): JSX.Element {
  const changes = moteChangesText(advice)
  const opens = advice.opens === undefined ? '' : `opens the ${advice.opens} socket`
  const pick = picks > 0
  const gate = moteGateText(advice)
  const kind = advice.supply?.kind ?? 'unknown'
  return (
    <TableRow data-testid="gear-motes-row" data-pick={pick ? 'true' : 'false'} data-gate={advice.gate} selected={pick} sx={{ opacity: isMoteReady(advice) || pick ? 1 : 0.6 }}>
      <TableCell title={gate === '' ? undefined : gate} sx={{ ...CELL, color: pick ? 'primary.main' : 'text.disabled', fontWeight: pick ? 700 : 400 }}>
        {pick ? picks : isMoteReady(advice) ? '' : '-'}
      </TableCell>
      <TableCell sx={{ ...CELL, maxWidth: 260 }}>
        <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }}>
          <DonorName name={advice.name} onOpen={onOpenLoot} bold={pick} />
          <Box component="span" data-testid="gear-motes-tier" sx={{ color: 'text.secondary', flexShrink: 0 }}>
            +{advice.tier}→+{advice.tier + Math.max(1, picks)}
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
      <TableCell align="right" data-testid="gear-motes-hours" title={moteHoursTitle(advice)} sx={CELL}>
        {moteHoursText(advice)}
      </TableCell>
      <TableCell data-testid="gear-motes-source" title={moteSourceTitle(advice.supply)} sx={{ ...CELL, color: SOURCE_COLOR[kind] }}>
        {moteSourceText(advice.supply)}
      </TableCell>
    </TableRow>
  )
}

export interface VoidMotePanelProps {
  /** what is worn, and the corpus by key — the hover card's own join */
  compare: GearCompareData
  /** the item data's own read (`useGearIndex`): until it settles no worn item finds its row */
  indexReady: boolean
  indexRefused: boolean
  /** the gear area's class picks, for the focus scores' class gate */
  classes: readonly ClassAbbr[]
  motes: VoidMotePrefs
  setMotes: (next: VoidMotePrefs) => void
  onOpenLoot?: (item: string) => void
}

export default function VoidMotePanel({ compare, indexReady, indexRefused, classes, motes, setMotes, onOpenLoot }: VoidMotePanelProps): JSX.Element {
  const { equipped, byKey } = compare
  const hosts = useMemo(() => [...equipped.values()], [equipped])
  const opts = useMemo(() => ({ target: motes.target, classes }), [motes.target, classes])
  const list = useMemo(() => sortMoteAdvice(moteAdvice(hosts, byKey, opts), motes.order), [hosts, byKey, opts, motes.order])
  const plan = useMemo(() => motePlan(hosts, byKey, opts, motes.onHand), [hosts, byKey, opts, motes.onHand])
  const unranked = useMemo(() => moteUnranked(hosts, byKey), [hosts, byKey])

  return (
    <Box
      data-testid="gear-motes"
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, border: 1, borderColor: 'divider', borderRadius: 1 }}
    >
      {/* The row WRAPS: at the minimum window with larger text the two picks ran out of the panel and
          the page scrolled sideways. The plan line takes what is left of the first line (basis 0),
          so in a wide window nothing moves and the picks drop to a second line only when they must. */}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ px: 1, py: 0.75, flexShrink: 0, rowGap: 0.75 }}>
        <Typography variant="subtitle2" sx={{ flexShrink: 0 }}>
          Void motes
        </Typography>
        {/* The week's answer first; the list under it is the working. */}
        <Typography
          variant="body2"
          data-testid="gear-motes-plan"
          title={list.length === 0 ? HINT : `${motePlanLine(plan, motes.onHand)}. ${HINT}`}
          noWrap
          sx={{ flex: '1 1 0', minWidth: 160 }}
        >
          {list.length === 0 ? 'One lifts a worn item a full tier' : motePlanLine(plan, motes.onHand)}
        </Typography>
        <MoteControls motes={motes} setMotes={setMotes} disabled={list.length === 0} />
      </Stack>
      {list.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="gear-motes-empty" sx={{ px: 1, pb: 1 }}>
          {moteEmptyText({
            indexReady,
            indexRefused,
            hasRows: byKey.size > 0,
            inventoryReady: compare.ready,
            hasDump: compare.hasDump,
            unranked: unranked.length,
            command: INVENTORY_COMMAND
          })}
        </Typography>
      ) : (
        <Box data-testid="gear-motes-list" sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {HEAD.map((h) => (
                  <TableCell key={h.label} title={h.label === 'Gain' ? moteGainHint(motes.target, classes) : h.hint} align={h.align} sx={{ ...CELL, color: 'text.secondary' }}>
                    {h.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((a) => (
                <MoteRow key={a.cell} advice={a} picks={planMotesOn(plan, a.cell)} target={motes.target} onOpenLoot={onOpenLoot} />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      {/* A worn piece with no row in the item data is named, never dropped in silence. */}
      {unranked.length > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid="gear-motes-unranked" sx={{ px: 1, py: 0.5, flexShrink: 0 }}>
          {moteUnrankedText(unranked)}
        </Typography>
      )}
    </Box>
  )
}
