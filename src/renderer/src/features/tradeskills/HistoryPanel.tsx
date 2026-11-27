// tradeskills/HistoryPanel.tsx — "Your history" on a workbench (fork #6: "number of combines,
// successes and failures"): the open tradeskill's totals and pace per crafting hour, and the item
// rows behind them, from the engine's `crafting` module (joined across archived logs).
//
// The totals, the rows and every word are shared/tradeskillHistory.ts. A row whose item the recipe
// book makes in this tradeskill opens that recipe on the recipes tab.
//
// On the Fishing workbench the tab opens with GatherPanel.tsx: the log's casts, catches and what
// was caught. Fishing has recipes too, so its combines follow as on any other workbench.

import type { JSX } from 'react'
import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { CRAFTING_MODULE } from '@shared/crafting'
import {
  PACE_SHORT_TEXT,
  PACE_TIP,
  levelsText,
  noCombinesText,
  paceLine,
  paceTooShort,
  percentText,
  totalsFigures,
  unplacedText,
  type HistoryRow,
  type SkillHistory
} from '@shared/tradeskillHistory'
import type { Tradeskill } from '@shared/tradeskills'
import { LogReadInline } from '../../components/LogReadInline'
import { formatDate } from '../../lib/formatDate'
import { Tooltip } from '../../lib/Tooltip'
import type { BenchFacts } from './benchFacts'
import { GatherPanel } from './GatherPanel'
import { NoticeChip } from './RecipeYou'
import { ItemLabel } from './tradeskillLinks'

const OPEN_TIP = 'Open this recipe on the recipes tab.'

/** The totals as a row of figures, then the pace per crafting hour. */
function Totals({ history }: { history: SkillHistory }): JSX.Element | null {
  if (history.totals === null) return null
  const pace = paceLine(history.pace)
  return (
    <Box data-testid="tradeskill-history-totals">
      <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3, rowGap: 0.5 }}>
        {totalsFigures(history.totals).map((figure) => (
          <Box key={figure.id} data-testid={`tradeskill-history-${figure.id}`}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.2 }}>
              {figure.label}
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {figure.value}
            </Typography>
          </Box>
        ))}
      </Stack>
      {pace !== '' && (
        <Tooltip title={PACE_TIP}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }} data-testid="tradeskill-history-pace">
            {pace}
          </Typography>
        </Tooltip>
      )}
      {paceTooShort(history.pace) && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }} data-testid="tradeskill-history-pace-short">
          {PACE_SHORT_TEXT}
        </Typography>
      )}
    </Box>
  )
}

function Head(): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        <TableCell>Item</TableCell>
        <TableCell align="right">Made</TableCell>
        <TableCell align="right">Failed</TableCell>
        <TableCell align="right">Success</TableCell>
        <TableCell align="right">Raises</TableCell>
        <TableCell>Levels</TableCell>
        <TableCell>Last combine</TableCell>
      </TableRow>
    </TableHead>
  )
}

function ItemRow({ line, onOpenRecipe }: { line: HistoryRow; onOpenRecipe: (id: string) => void }): JSX.Element {
  const { row, recipeId } = line
  const open = recipeId === null ? undefined : () => onOpenRecipe(recipeId)
  return (
    <TableRow hover={open !== undefined} onClick={open} title={open === undefined ? undefined : OPEN_TIP} sx={{ cursor: open === undefined ? 'default' : 'pointer' }} data-testid="tradeskill-history-row">
      <TableCell>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
          <ItemLabel name={row.item} />
          <NoticeChip row={row} />
        </Stack>
      </TableCell>
      <TableCell align="right">{row.made}</TableCell>
      <TableCell align="right">{row.failed}</TableCell>
      <TableCell align="right">{percentText(line.successRate)}</TableCell>
      <TableCell align="right">{row.raises > 0 ? row.raises : ''}</TableCell>
      <TableCell>{levelsText(row)}</TableCell>
      <TableCell>{formatDate(row.lastTs)}</TableCell>
    </TableRow>
  )
}

export interface HistoryPanelProps {
  tradeskill: Tradeskill
  facts: BenchFacts
  /** The tradeskill's totals, pace and item rows (`skillHistory`), folded once by the workbench. */
  history: SkillHistory
  /** Opens a recipe (by its `id`) on the recipes tab. */
  onOpenRecipe: (id: string) => void
}

export function HistoryPanel({ tradeskill, facts, history, onOpenRecipe }: HistoryPanelProps): JSX.Element {
  const { craft } = facts
  // Until the engine has served the module nothing is known: say what the app waits on, not "none".
  if (!craft.served) {
    return (
      <Box data-testid="tradeskill-history">
        <LogReadInline module={CRAFTING_MODULE} served={false} />
      </Box>
    )
  }
  const unplaced = unplacedText(history.unplaced)
  return (
    <Stack spacing={1} sx={{ flexGrow: 1, minHeight: 0 }} data-testid="tradeskill-history">
      {/* Fishing's own outcomes (casts, catches, what was caught) come before its combines. */}
      {tradeskill === 'Fishing' && <GatherPanel />}
      {history.totals === null && (
        <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }} data-testid="tradeskill-history-empty">
          {noCombinesText(tradeskill)}
        </Typography>
      )}
      <Totals history={history} />
      {history.rows.length > 0 && (
        <Box sx={{ flexGrow: 1, minHeight: 120, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="tradeskill-history-scroll">
          <Table size="small" stickyHeader data-testid="tradeskill-history-table">
            <Head />
            <TableBody>
              {history.rows.map((line) => (
                <ItemRow key={line.row.item} line={line} onOpenRecipe={onOpenRecipe} />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      {unplaced !== '' && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }} data-testid="tradeskill-history-unplaced">
          {unplaced}
        </Typography>
      )}
    </Stack>
  )
}
