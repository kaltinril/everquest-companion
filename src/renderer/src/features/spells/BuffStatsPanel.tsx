// spells/BuffStatsPanel — what the whole buff set adds up to, beside the set itself.
//
// Split out of `SpellLoadoutView` when that file crossed this tree's 400-line ceiling, and the seam
// the ceiling pointed at is a real one: the view is about CHOOSING a set and this is about READING
// one. It is also the file whose header has the thing a reader most needs to know about these
// numbers, which is that they do not move.

import type { JSX } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { spellStatLabel } from '@shared/spellStats'
import type { BuffTotals } from '@shared/spellLoadout'
import { romanRank } from './spellbookFormat'

/** A chip that fits on a dense line - the Loadout view's own, kept in step by hand (one value). */
const TINY_CHIP = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.6 } } as const

/**
 * WHAT THE WHOLE BUFF SET ADDS UP TO.
 *
 * The owner's ask (2026-09-10): *"a summary for the stats on the right side panel, showing all the
 * stats total combined next to the character, sort of like the gear tab has that stats for gear,
 * but this will be stats from buffs"*. `character/GearStats.tsx` is the counterpart - it sums what
 * your ITEMS say and its header states in three words that that is all it knows, explicitly
 * declining to lecture about buffs. This is the sentence it refused to write.
 *
 * ============================================================================
 * IT DOES NOT MOVE WHEN YOU DRAG THE SLIDER, AND IT SAYS SO
 * ============================================================================
 * The rest of the owner's ask was *"lets me imagine what it would look like for each individual
 * spell updated"* - so this panel sits beside a 0-to-10 slider and the honest answer is that these
 * numbers are the same at rank 0 and at rank X. No category scales a stat grant (`spellUpgrade.ts`
 * carries that claim and the Form of the Bear measurement behind it), so upgrading a buff buys
 * mana, duration and cast time and never a bigger number here.
 *
 * That is his question 2 - *"which spells are important to upgrade"* - answered for a whole set at
 * once, and it is the most useful thing this panel can tell him. A summary that simply sat still
 * while the control beside it moved would read as broken, so the stillness is LABELLED rather than
 * left to be discovered.
 */
export default function BuffStatsPanel({ totals, tier }: { totals: BuffTotals; tier: number }): JSX.Element {
  // ONE READING ORDER, points and percents interleaved - `buffTotals` states it (the fold keeps the
  // two KINDS apart for the arithmetic, which is a different claim from how they are drawn).
  const rows = totals.rows
  return (
    <Paper variant="outlined" sx={{ p: 1.25, position: 'sticky', top: 8 }} data-testid="buff-stats">
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2">From your buffs</Typography>
        <Chip
          size="small"
          variant="outlined"
          data-testid="buff-stats-tier"
          label={tier > 0 ? `at ${romanRank(tier)}` : 'base'}
          sx={TINY_CHIP}
        />
      </Stack>
      {rows.length === 0 ? (
        <Typography variant="caption" color="text.secondary" data-testid="buff-stats-empty">
          No buff in the set states a stat this app reads.
        </Typography>
      ) : (
        <Box>
          {rows.map((r) => (
            <Stack
              key={`${r.key}-${r.percent ? 'pct' : 'pt'}`}
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              sx={{ gap: 1 }}
              data-testid="buff-stat-row"
              data-stat={r.key}
              title={`from ${r.from.join(', ')}`}
            >
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
                {spellStatLabel(r.key)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              >
                {r.amount >= 0 ? '+' : '-'}
                {String(Math.abs(r.amount))}
                {r.percent ? '%' : ''}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
      {/* THE LABEL THAT MAKES THE STILLNESS INFORMATIVE. See this component's header. */}
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}
        data-testid="buff-stats-static-note"
      >
        These do not change with the slider. Upgrading a buff buys mana, duration and cast time; the
        stats it grants stay where they are.
      </Typography>
    </Paper>
  )
}

