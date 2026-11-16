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
 * IT MOVES WITH THE SLIDER SINCE 2026-11-15: a buff's point stats grow 3% a rank
 * (`spellScale.statAtRank`), so the totals are read at each spell's rank and the note says so.
 */
export default function BuffStatsPanel({
  totals,
  tier,
  grouped
}: {
  totals: BuffTotals
  tier: number
  /** True when the set was picked from a group's buffs, so the heading does not call them yours. */
  grouped?: boolean
}): JSX.Element {
  // ONE READING ORDER, points and percents interleaved - `buffTotals` states it (the fold keeps the
  // two KINDS apart for the arithmetic, which is a different claim from how they are drawn).
  const rows = totals.rows
  return (
    <Paper variant="outlined" sx={{ p: 1.25, position: 'sticky', top: 8 }} data-testid="buff-stats">
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2">{grouped === true ? "From the group's buffs" : 'From your buffs'}</Typography>
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
      {/* Since 2026-11-15 the totals move with rank: the game's spell windows show it. */}
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}
        data-testid="buff-stats-rank-note"
      >
        Each buff is read at your rank of it. The slider lifts them all; haste and run speed do not
        move.
      </Typography>
    </Paper>
  )
}

