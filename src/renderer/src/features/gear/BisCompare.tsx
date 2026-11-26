// gear/BisCompare.tsx — THE HOVER ON A SLOT (owner, 2026-11-24: *"On hover of a slot, show the comparison
// between the recommended BiS item and the worn item. Along with the source (location/mob/crafted) to
// obtain it."*). Both items are scored the same way the card is (`cellScore`: this cell, haste counted
// only above what the other slots give), the worn one at +0 (the base-vs-base law). The stat budget
// estimate lives here too, worded as our own estimate that ranks nothing.

import { type JSX } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import type { ClassAbbr } from '@shared/classCombo'
import { cellScore, type BisCell, type CellScore } from '@shared/planner/bisSheet'
import type { GearRow } from '@shared/planner/gear'
import { isRatioChip, type TierSetup } from '@shared/planner/tierChips'
import { itemBudget, ratioCounts, type TierModel } from '@shared/planner/tierWeights'
import { budgetText, compareRows, hasteNote, sourceText, type CompareRow, type Tone } from './bisText'

/** What the dump says is worn in a cell: the name and tier as worn, and the item data's row when it knows it. */
export interface WornCell {
  name: string
  tier?: number
  row?: GearRow
}

export interface BisCompareProps {
  cell: BisCell
  worn: WornCell | undefined
  model: TierModel
  setup: TierSetup
  classes: readonly ClassAbbr[]
  /** the slider's tier both items are scored at */
  plus: number
  /** item haste that can still count (`itemHasteRoom`) */
  hasteRoom?: number
  /** the item's label: "Best:" for the slot's pick, "Next best:" when a runner-up is hovered */
  label?: string
}

const TONE_COLOUR: Readonly<Record<Tone, string>> = { good: 'success.main', warn: 'warning.main', plain: 'text.secondary' }

/** Everything the hover says, worked out before anything is drawn. */
interface CompareModel {
  wornScore?: CellScore
  /** the best item is the one worn */
  same: boolean
  rows: CompareRow[]
  notes: string[]
  budget?: { text: string; tone: Tone }
}

function compareModel({ cell, worn, model, setup, classes, hasteRoom }: BisCompareProps): CompareModel {
  const pick = cell.pick
  const wornRow = worn?.row
  const wornScore = wornRow === undefined ? undefined : cellScore(wornRow, cell.cell, cell.otherHaste, { model, setup, classes, hasteRoom })
  const same = pick !== undefined && wornRow?.key === pick.row.key
  const rows = compareRows(
    pick === undefined ? {} : model.valuesOf(pick.row),
    wornRow === undefined ? {} : model.valuesOf(wornRow),
    setup,
    (chip) => !isRatioChip(chip) || ratioCounts(chip, cell.cell, classes)
  )
  const notes = [
    pick === undefined ? undefined : hasteNote(pick.row.stats.HASTE, pick.hasteCounted, cell.otherHaste),
    wornRow === undefined || wornScore === undefined || same ? undefined : hasteNote(wornRow.stats.HASTE, wornScore.hasteCounted, cell.otherHaste)
  ].filter((n): n is string => n !== undefined)
  return { wornScore, same, rows, notes, budget: pick === undefined ? undefined : budgetText(itemBudget(pick.row, model)) }
}

/** Which tier the numbers are at, and the tier the worn copy really is when that differs. */
function plusNote(plus: number, worn: WornCell | undefined): string {
  const head = `Both at +${String(plus)} (the slider)`
  return worn?.row !== undefined && (worn.tier ?? 0) !== plus ? `${head}; you wear yours at +${String(worn.tier ?? 0)}.` : `${head}.`
}

function wornName(worn: WornCell): string {
  return `${worn.name}${worn.tier === undefined || worn.tier === 0 ? '' : ` +${String(worn.tier)}`}`
}

function Line({ label, name, score }: { label: string; name: string; score?: number }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="baseline">
      <Typography variant="caption" sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ color: 'text.secondary' }}>{label} </Box>
        <Box component="span" sx={{ fontWeight: 600 }}>{name}</Box>
      </Typography>
      {score !== undefined && <Typography variant="caption" color="primary.main" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{score.toFixed(1)}</Typography>}
    </Stack>
  )
}

function WornPart({ worn, score, same }: { worn: WornCell | undefined; score: number | undefined; same: boolean }): JSX.Element {
  if (worn === undefined) return <Typography variant="caption" color="text.secondary">Nothing worn here (from your last /outputfile inventory).</Typography>
  return (
    <>
      <Line label="Worn:" name={wornName(worn)} score={score} />
      {worn.row === undefined && <Typography variant="caption" color="text.secondary">The item data does not know the worn item, so it cannot be scored.</Typography>}
      {same && <Typography variant="caption" color="success.main">You already wear this item here.</Typography>}
    </>
  )
}

function CompareTable({ rows, head }: { rows: readonly CompareRow[]; head: string }): JSX.Element {
  return (
    <Box component="table" sx={{ borderCollapse: 'collapse', '& td, & th': { fontSize: 12, py: 0.125, px: 0.75, textAlign: 'right' }, '& th': { color: 'text.secondary', fontWeight: 500 }, '& .stat': { textAlign: 'left' } }}>
      <thead>
        <tr>
          <th className="stat">Stat</th>
          <th>{head}</th>
          <th>Worn</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.chip}>
            <td className="stat">{r.label}</td>
            <Box component="td" sx={{ color: r.ahead === 'best' ? 'success.main' : undefined }}>{r.best}</Box>
            <Box component="td" sx={{ color: r.ahead === 'worn' ? 'warning.main' : undefined }}>{r.worn}</Box>
          </tr>
        ))}
      </tbody>
    </Box>
  )
}

export default function BisCompare(props: BisCompareProps): JSX.Element {
  const { cell, worn } = props
  const pick = cell.pick
  const m = compareModel(props)
  return (
    <Stack spacing={0.5} sx={{ p: 0.5, minWidth: 260, maxWidth: 380 }} data-testid="bis-compare">
      {pick !== undefined && <Line label={props.label ?? 'Best:'} name={pick.row.name} score={pick.score} />}
      <WornPart worn={worn} score={m.wornScore?.score} same={m.same} />
      {m.rows.length > 0 && !m.same && <CompareTable rows={m.rows} head={(props.label ?? 'Best:').replace(/:$/, '')} />}
      {m.notes.map((n) => (
        <Typography key={n} variant="caption" color="text.secondary">{n}</Typography>
      ))}
      {pick !== undefined && (
        <Typography variant="caption" sx={{ borderTop: 1, borderColor: 'divider', pt: 0.25 }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>Where to get it: </Box>
          {sourceText(pick.row)}
        </Typography>
      )}
      {m.budget !== undefined && <Typography variant="caption" color={TONE_COLOUR[m.budget.tone]}>{m.budget.text}</Typography>}
      <Typography variant="caption" color="text.disabled">{plusNote(props.plus, worn)}</Typography>
    </Stack>
  )
}
