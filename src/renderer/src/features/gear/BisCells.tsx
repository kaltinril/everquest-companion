// gear/BisCells.tsx — THE SHEET: one card per cell of the character sheet with the item the board
// picks, why, its budget, where it drops, and what is worn there now (at +0, the base-vs-base law);
// a click shows the next five. Below it, the loadout's totals against what is worn.

import { useState, type JSX, type MouseEvent } from 'react'
import { Box, Chip, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { BisCell, BisSheet } from '@shared/planner/bisSheet'
import { isLoreRow } from '@shared/planner/bisSheet'
import { REVAMP_ERA_TAGS, itemBudget, weaponKindOf, type TierModel } from '@shared/planner/tierWeights'
import type { PlanSlotId } from '@shared/planner/types'
import { budgetText, cellLabel, sourceText, termText, type TotalsRow } from './bisText'

/** What the dump says is worn in a cell, and its score on the board there. */
export interface WornCell {
  name: string
  tier?: number
  /** its score at +0 in this cell; undefined when the item data does not know the item */
  score?: number
}

export interface BisCellsProps {
  sheet: BisSheet
  worn: ReadonlyMap<PlanSlotId, WornCell>
  model: TierModel
  owned: ReadonlyMap<string, number>
  onOpenLoot?: (item: string) => void
}

const TONE_COLOUR = { good: 'success.main', warn: 'warning.main', plain: 'text.secondary' } as const
const KIND_LABEL = { '1h': 'one-hander', '2h': 'two-hander', ranged: 'ranged' } as const

function Tags({ cell, owned }: { cell: BisCell; owned: ReadonlyMap<string, number> }): JSX.Element | null {
  const row = cell.pick?.row
  if (row === undefined) return null
  const kind = weaponKindOf(row.skill)
  const tags: { label: string; color: 'warning' | 'success' | 'info' | 'default' }[] = []
  if (isLoreRow(row)) tags.push({ label: 'Lore', color: 'warning' })
  if ((owned.get(row.key) ?? 0) > 0) tags.push({ label: 'owned', color: 'success' })
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

function WornLine({ worn, cell }: { worn: WornCell | undefined; cell: BisCell }): JSX.Element | null {
  if (worn === undefined) return null
  const same = cell.pick?.row.name === worn.name
  const name = `Worn now: ${worn.name}${worn.tier === undefined ? '' : ` +${String(worn.tier)}`}`
  return (
    <Typography variant="caption" data-testid="bis-cell-worn" sx={{ borderTop: 1, borderColor: 'divider', pt: 0.25, color: same ? 'success.main' : 'text.secondary' }}>
      {name}
      {same ? ' (already best)' : worn.score === undefined ? '' : ` (${worn.score.toFixed(1)} at +0)`}
    </Typography>
  )
}

function Card({ cell, props, open, onToggle }: { cell: BisCell; props: BisCellsProps; open: boolean; onToggle: () => void }): JSX.Element {
  const pick = cell.pick
  const budget = pick === undefined ? undefined : budgetText(itemBudget(pick.row, props.model))
  return (
    <Box
      data-testid="bis-cell"
      data-cell={cell.cell}
      onClick={onToggle}
      sx={{ bgcolor: 'background.paper', border: 1, borderColor: open ? 'primary.main' : 'divider', borderRadius: 1, p: 1, display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0, cursor: 'pointer' }}
    >
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="overline" sx={{ lineHeight: 1.4 }} color="text.secondary">{cellLabel(cell.cell)}</Typography>
        {pick !== undefined && <Typography variant="caption" color="primary.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>{pick.score.toFixed(1)}</Typography>}
      </Stack>
      {pick === undefined ? (
        <Typography variant="body2" color="text.secondary">
          {cell.closedByTwoHander === true ? 'Closed: the two-hander in Primary scores more than a one-hander and an offhand.' : 'Nothing you could wear here adds to your board.'}
        </Typography>
      ) : (
        <>
          <Link component="button" variant="body2" underline="hover" data-testid="bis-cell-item" onClick={(e: MouseEvent) => { e.stopPropagation(); props.onOpenLoot?.(pick.row.name) }} sx={{ fontWeight: 600, textAlign: 'left', overflowWrap: 'anywhere' }}>
            {pick.row.name}
          </Link>
          <Tags cell={cell} owned={props.owned} />
          <Typography variant="caption" color="text.secondary">{pick.reasons.map((t) => termText(pick.row, t)).join('  ·  ')}</Typography>
          {budget !== undefined && <Typography variant="caption" color={TONE_COLOUR[budget.tone]}>{budget.text}</Typography>}
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{sourceText(pick.row)}</Typography>
        </>
      )}
      <WornLine worn={props.worn.get(cell.cell)} cell={cell} />
      {open && (
        <Stack sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }} data-testid="bis-cell-next">
          <Typography variant="overline" color="text.secondary">Next best</Typography>
          {cell.runnersUp.length === 0 && <Typography variant="caption" color="text.secondary">None.</Typography>}
          {cell.runnersUp.map((r) => (
            <Stack key={r.row.key} direction="row" justifyContent="space-between" spacing={1}>
              <Typography variant="caption">{r.row.name}</Typography>
              <Typography variant="caption" color="text.secondary">{r.score.toFixed(1)}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
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

export function BisTotals({ rows }: { rows: readonly TotalsRow[] }): JSX.Element {
  return (
    <Table size="small" data-testid="bis-totals">
      <TableHead>
        <TableRow>
          <TableCell>Stat</TableCell>
          <TableCell>Tier</TableCell>
          <TableCell align="right">Best in slot</TableCell>
          <TableCell align="right">Worn now (+0)</TableCell>
          <TableCell align="right">Cap</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.chip}>
            <TableCell>{r.label}</TableCell>
            <TableCell>{r.tier}</TableCell>
            <TableCell align="right" sx={{ color: r.capped ? 'success.main' : undefined }}>{r.best}</TableCell>
            <TableCell align="right" sx={{ color: 'text.secondary' }}>{r.worn}</TableCell>
            <TableCell align="right">{r.cap}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
