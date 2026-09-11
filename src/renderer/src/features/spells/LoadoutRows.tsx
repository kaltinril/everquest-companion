// spells/LoadoutRows — the four rows the Loadout tab draws, and nothing about which set is on screen.
//
// Split out of `SpellLoadoutView` when that file crossed this tree's 400-line ceiling. The seam is
// the same one `BuffStatsPanel` came out of: the view decides WHICH set to show and these decide
// what one line of a set looks like. Every claim they make is read off a value the shared folds
// produced - nothing here computes, ranks or filters anything (ruling 4).

import type { JSX } from 'react'
import { Alert, Box, Chip, Stack, Typography } from '@mui/material'
import { spellStatText } from '@shared/spellStats'
import { TAB_LABEL } from '@shared/bestSpells'
import type { CombatPick, CombatSet, LoadoutCandidate, LoadoutRejection } from '@shared/spellLoadout'
import { SpellTooltip } from '../../lib/SpellCard'
import SpellIcon from './SpellIcon'
import { romanRank } from './spellbookFormat'

/** A chip that fits on a dense line. One style, so a row of them never wobbles. */
export const TINY_CHIP = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.6 } } as const

/**
 * One buff in the recommended set, with the rank YOU HAVE beside it.
 *
 * The owner's ask (2026-09-10): *"the spells here should also reflect the current version upgraded
 * I have, so if i have a IV, it should show the stats for that one"*. `max(observed, simulated)` is
 * JOS-447's rule and the Leveling tab's, so the two surfaces read a rank the same way: the log's
 * own highest sighting, lifted to whatever the slider is asking for.
 *
 * WHAT IT CHANGES ABOUT THE STATS IS NOTHING, AND THAT IS NOT THIS ROW'S FAILURE TO REPORT. A
 * buff's grants are the same at every rank (`BuffStatsPanel` states it where a reader will look),
 * so the chip is here to show the rank is ACCOUNTED FOR rather than to explain a number that moved.
 * A rank of 1 draws nothing: every spell starts there, and a chip on every row would say nothing
 * (`observedRankLabel`'s own display rule).
 */
export function KeepRow({ c, rank }: { c: LoadoutCandidate; rank: number }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      data-testid="loadout-keep"
      data-spell={c.name}
      sx={{ py: 0.35 }}
    >
      <SpellIcon iconId={c.iconId} />
      <SpellTooltip name={c.name} placement="right">
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 170 }}>
          {c.name}
        </Typography>
      </SpellTooltip>
      {rank > 1 && (
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          data-testid="loadout-rank"
          data-rank={rank}
          label={romanRank(rank)}
          title="The rank this reads at: the highest your log has seen, lifted to the slider."
          sx={TINY_CHIP}
        />
      )}
      {c.grants.map((g, i) => (
        <Chip
          key={`${g.key}-${String(i)}`}
          size="small"
          variant="outlined"
          label={spellStatText(g)}
          sx={TINY_CHIP}
        />
      ))}
    </Stack>
  )
}

/** One buff that lost its slot, and what that cost. */
export function RejectRow({ r }: { r: LoadoutRejection }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      data-testid="loadout-rejected"
      data-spell={r.name}
      sx={{ py: 0.25, opacity: 0.85 }}
    >
      <SpellTooltip name={r.name} placement="right">
        <Typography variant="body2" sx={{ minWidth: 170 }}>
          {r.name}
        </Typography>
      </SpellTooltip>
      <Typography variant="caption" color="text.secondary" data-testid="loadout-beaten-by">
        {r.certainty === 'exact' ? 'loses its slot to' : 'probably contests'} {r.beatenBy}
      </Typography>
      {/* THE HALF WORTH PRINTING: what you give up by taking the winner. */}
      {r.loses.length > 0 && (
        <>
          <Typography variant="caption" color="warning.main" data-testid="loadout-loses">
            you lose
          </Typography>
          {r.loses.map((g, i) => (
            <Chip
              key={`${g.key}-${String(i)}`}
              size="small"
              color="warning"
              variant="outlined"
              label={spellStatText(g)}
              sx={TINY_CHIP}
            />
          ))}
        </>
      )}
    </Stack>
  )
}

/** A whole number, or the placeholder every figure in this area uses for "the source says nothing". */
function figure(v: number | undefined | null): string {
  return v === undefined || v === null ? '-' : String(Math.round(v))
}

/** One damage spell in the combat set. */
export function CombatRow({ p }: { p: CombatPick }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      data-testid="combat-pick"
      data-spell={p.name}
      data-tab={p.tab}
      sx={{ py: 0.35 }}
    >
      <SpellIcon iconId={p.iconId} />
      <SpellTooltip name={p.name} placement="right">
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 170 }}>
          {p.name}
        </Typography>
      </SpellTooltip>
      <Chip size="small" variant="outlined" label={TAB_LABEL[p.tab]} sx={TINY_CHIP} />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {figure(p.metrics.damage)} dmg · {figure(p.metrics.dps)} dps · {figure(p.mana)} mana
      </Typography>
    </Stack>
  )
}


/**
 * A CAST SET - combat or heals. One component for both because they differ only in their words:
 * the spend policy, the row and the "nothing here contests anything" reasoning are identical.
 */
export function CastSection({
  title,
  set,
  level,
  blurb,
  empty,
  testId
}: {
  title: string
  set: CombatSet
  level: number
  blurb: string
  empty: string
  testId: string
}): JSX.Element {
  return (
    <Box data-testid={testId}>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="h6">{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {String(set.picks.length)} of {String(set.gems)} gems, read at level {String(level)}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {blurb}
      </Typography>
      {set.picks.length === 0 ? (
        <Alert severity="info" data-testid={`${testId}-empty`}>
          {empty}
        </Alert>
      ) : (
        <Stack>
          {set.picks.map((p) => (
            <CombatRow key={p.name} p={p} />
          ))}
        </Stack>
      )}
    </Box>
  )
}

