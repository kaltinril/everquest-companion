// spells/SpellUpgradePanel.tsx — SECTIONS 5 AND 6 OF THE SPELL PAGE: what it grants, and what a
// mote tier buys (docs/plans/spell-upgrades-and-loadout.md §4.4).
//
// Its own file because `SpellPage.tsx` is at this tree's 400-code-line factoring ceiling and because
// these two sections are one subject - the UPGRADE question - where the three sections above them
// are about the spell's identity, its line and its classes.
//
// ── SECTION 5 IS THE OWNER'S REPORT, ANSWERED ─────────────────────────────────────────────────
//
// *"spells and exaltations don't really tell me WHAT it does, it just says the name of the spell"*.
// The card above already prints the wiki's effect list verbatim, which is honest and unreadable:
// `Increase AC by 7 (L19) to 14 (L65)` is four numbers and a range where the reader wanted one
// figure. So this section states the PARSED grant at his own level and keeps the verbatim line on
// the hover, which is the arrangement the rest of the app uses for a derived number.
//
// ── SECTION 6 IS THE LADDER, AND IT DRAWS THE WHOLE THING ─────────────────────────────────────
//
// A slider would have been the Spellbook's answer and it is the wrong one here. That surface moves
// a whole table and needs one control; this is ONE spell, the reader is deciding whether to spend
// 512 motes on it, and every rung between here and there is part of the decision. Eleven rows fit
// on a page. So the page draws the table and marks the rank the log has watched you hold.
//
// ── AND IT SAYS HOW WELL IT KNOWS EACH NUMBER ─────────────────────────────────────────────────
//
// The rates are three different kinds of claim (`shared/spellUpgrade.ts`'s header): our own log
// measurement, a community model's tooltip captures, and that model's own extrapolations. A table
// that printed all three in one weight would be laundering the weakest into the strongest. The
// confidence chip is one word and it is the whole reason this feature is defensible.

import type { JSX } from 'react'
import {
  Box,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import type { SpellDetail } from '@shared/spellDetail'
import { spellStatText } from '@shared/spellStats'
import {
  CONFIDENCE_LABEL,
  UPGRADE_CATEGORY_LABEL,
  UPGRADE_RATES,
  upgradePayoffSentence
} from '@shared/spellUpgrade'
import { Tooltip } from '../../lib/Tooltip'
import { romanRank, seconds, ticksText, whole } from './spellbookFormat'

/**
 * SECTION 5 — WHAT IT GRANTS, at the level main read it.
 *
 * Absent entirely when the page states no readable stat line, which is most detrimental spells: a
 * section headed "Grants" over nothing would read as a spell that grants nothing, and law 1 is
 * explicit that silence is not that claim.
 */
export function GrantsSection({ detail }: { detail: SpellDetail }): JSX.Element | null {
  const grants = detail.grants ?? []
  if (grants.length === 0) return null
  return (
    <Box data-testid="spell-grants-section">
      <Typography variant="overline" color="text.secondary">
        Grants
        {detail.grantsLevel !== undefined && ` · at level ${String(detail.grantsLevel)}`}
      </Typography>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
        {grants.map((g, i) => (
          <Tooltip
            // The wiki's own line, verbatim, on the hover - so the derived figure can always be
            // checked against the sentence it came from without leaving the page.
            key={`${g.key}-${String(i)}`}
            title={
              g.ramp === undefined
                ? g.line
                : `${g.line} - ${String(g.ramp.loAmount)} at L${String(g.ramp.loLevel)}, ${String(g.ramp.hiAmount)} at L${String(g.ramp.hiLevel)}`
            }
          >
            <Chip
              size="small"
              variant="outlined"
              data-testid="spell-grant"
              data-stat={g.key}
              label={spellStatText(g)}
            />
          </Tooltip>
        ))}
      </Stack>
    </Box>
  )
}

/** One rung. The row you are observed to hold is marked, the way the line ladder marks yours. */
function LadderRow({
  reading,
  here
}: {
  reading: NonNullable<SpellDetail['tierLadder']>[number]
  here: boolean
}): JSX.Element {
  return (
    <TableRow
      data-testid="spell-tier-row"
      data-tier={reading.tier}
      data-here={here ? 'yes' : 'no'}
      sx={{ '& td': { fontWeight: here ? 700 : 400 } }}
    >
      <TableCell>
        {reading.tier === 0 ? 'base' : romanRank(reading.tier)}
        {here && (
          <Chip
            size="small"
            color="primary"
            label="you"
            data-testid="spell-tier-yours"
            sx={{ height: 16, fontSize: 10, ml: 0.5, '& .MuiChip-label': { px: 0.5 } }}
          />
        )}
      </TableCell>
      <TableCell align="right">{whole(reading.mana)}</TableCell>
      <TableCell align="right">{seconds(reading.castSeconds)}</TableCell>
      <TableCell align="right">{seconds(reading.reuseSeconds)}</TableCell>
      <TableCell align="right">{ticksText(reading.durationTicks)}</TableCell>
      <TableCell align="right">{whole(reading.damage ?? reading.heal)}</TableCell>
      <TableCell align="right" data-testid="spell-tier-motes">
        {reading.tier === 0 ? '-' : whole(reading.motesTotal)}
      </TableCell>
    </TableRow>
  )
}

/**
 * SECTION 6 — THE MOTE LADDER.
 *
 * `metricsRank` is what the log has watched this character hold (`shared/spellRanks.ts`), so the
 * marked row is a fact about him rather than a default. Absent is the ordinary state and marks
 * nothing, which is correct: a character the log has never seen cast this line above base is not a
 * character at base, he is one nobody has observed (law 1).
 */
export function UpgradeSection({ detail }: { detail: SpellDetail }): JSX.Element | null {
  const ladder = detail.tierLadder
  const payoff = detail.payoff
  if (ladder === undefined || payoff === undefined || detail.upgradeCategory === undefined) {
    return null
  }
  const rates = UPGRADE_RATES[detail.upgradeCategory]
  const confidence = payoff.confidence
  return (
    <Box data-testid="spell-upgrade-section" data-category={detail.upgradeCategory}>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="overline" color="text.secondary">
          Upgrades · {UPGRADE_CATEGORY_LABEL[detail.upgradeCategory]}
        </Typography>
        {confidence !== undefined && (
          <Tooltip title="measured: this app fitted it to the owner's own combat log. reported: a community model's tooltip captures. inferred: that model's own extrapolation. The upgrade system is server-side, so none of it comes from client data.">
            <Chip
              size="small"
              variant="outlined"
              data-testid="spell-upgrade-confidence"
              data-confidence={confidence}
              color={confidence === 'measured' ? 'success' : 'default'}
              label={CONFIDENCE_LABEL[confidence]}
              sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
            />
          </Tooltip>
        )}
      </Stack>
      {/* THE ONE SENTENCE THE OWNER ASKED FOR, per spell. */}
      <Typography variant="body2" data-testid="spell-upgrade-payoff" sx={{ mb: 0.5 }}>
        {upgradePayoffSentence(payoff)}
      </Typography>
      <Table size="small" data-testid="spell-tier-table">
        <TableHead>
          <TableRow>
            <TableCell>Tier</TableCell>
            <TableCell align="right">Mana</TableCell>
            <TableCell align="right">Cast</TableCell>
            <TableCell align="right">Reuse</TableCell>
            <TableCell align="right">Duration</TableCell>
            <TableCell align="right">{payoff.magnitude ? 'Dmg / heal' : '-'}</TableCell>
            <Tooltip title="Total motes spent to stand at this tier. Each tier costs double the last, so the tenth alone costs more than the first nine together.">
              <TableCell align="right">Motes</TableCell>
            </Tooltip>
          </TableRow>
        </TableHead>
        <TableBody>
          {ladder.map((r) => (
            <LadderRow key={r.tier} reading={r} here={r.tier === (detail.metricsRank ?? -1)} />
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        {/* The rates in force, so the table is checkable rather than magic. */}
        cast -{String(rates.cast * 100)}% · mana -{String(rates.mana * 100)}% a tier
        {rates.duration !== null && ` · duration +${String(rates.duration * 100)}%`}
        {rates.damage !== null && ` · damage +${String(rates.damage * 100)}%`}
        {rates.heal !== null && ` · healing +${String(rates.heal * 100)}%`}
      </Typography>
      <Divider sx={{ mt: 1 }} />
    </Box>
  )
}
