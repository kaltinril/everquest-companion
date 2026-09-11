// spells/SpellbookView.tsx — THE CORPUS, BROWSABLE (docs/plans/spell-upgrades-and-loadout.md §4.1).
//
// The owner's ask, verbatim (2026-09-10): *"allow spells to be looked at, because right now spells
// and exaltations don't really tell me WHAT it does, it just says the name of the spell which isn't
// helpful on how much stats or what it does."*
//
// ── WHAT THIS IS NOT ──────────────────────────────────────────────────────────────────────────
//
// It is not the Leveling tab's best-spells readout and it deliberately does not rank. That surface
// answers "of everything I own, what should I be casting", over your loadout's slice, on damage and
// healing. This one is the CORPUS: every spell any class gains, filterable, with what it grants and
// what a mote tier buys beside each row. `shared/spellbook.ts`'s header sets the two side by side.
//
// A reader who wants a ranking is one click from it; a reader who wants to know what Talisman of
// Altuna actually gives has, until now, had nowhere in this app to find out.
//
// ── NOTHING HERE FILTERS OR SORTS (ruling 4) ──────────────────────────────────────────────────
//
// `spellbookRows` does all of it, in `src/shared`, and this file maps its answer to rows. That is
// not a formality: the sort's null rule (an absent figure trails in BOTH directions) and the
// empty-filter reading (an untouched picker filters nothing) are decisions with tests on them, and
// a component that re-derived either would be a second opinion nobody could see.
//
// ── THE LIST IS VIRTUALIZED-BY-CAP, NOT BY WINDOW ─────────────────────────────────────────────
//
// ~1,900 rows is small enough to fold on every keystroke (the gear tab's own measurement puts three
// times that at ~18 ms) and far too many to DRAW. So the fold is complete and the draw is capped,
// with the cap stated in the footer rather than silently applied - a reader who cannot find a spell
// must be able to see that the list stopped, and a count that says `showing 200 of 1,431` tells him
// to type rather than to scroll.

import { type JSX, useDeferredValue, useMemo, useState } from 'react'
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import { UPGRADE_CATEGORY_LABEL } from '@shared/spellUpgrade'
import { PAYOFF_MARKS, spellbookRows, type SpellbookQuery, type SpellbookRow } from '@shared/spellbook'
import { useCurrentComboClasses, useLevelUnlocks } from '../leveling/useLevelUnlocks'
import { SpellTooltip } from '../../lib/SpellCard'
import { Tooltip } from '../../lib/Tooltip'
import SpellbookToolbar from './SpellbookToolbar'
import { classesText, grantsText, headlineFigure, seconds, whole, UNSTATED } from './spellbookFormat'

/** How many rows are DRAWN. See the header: the fold is complete, the draw is capped. */
const DRAW_CAP = 200

/**
 * The payoff column: which of the five things a mote tier moves for this row.
 *
 * The owner's question 2 answered ACROSS A LIST rather than one spell at a time, which is the thing
 * a page cannot do for you. A lit glyph is a gain; an unlit one is a gain this spell does not get.
 * Both are drawn, because "M C" with nothing beside it reads as missing data, while a dim `N` beside
 * a bright `M` reads as the fact it is: upgrading this buys mana and not numbers.
 */
function PayoffCell({ row }: { row: SpellbookRow }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.25} data-testid="spellbook-payoff" data-spell={row.name}>
      {PAYOFF_MARKS.map((m) => {
        const on = row.payoff[m.key] === true
        return (
          <Tooltip key={m.glyph} title={on ? m.title : `no change: ${m.title}`}>
            <Typography
              variant="caption"
              component="span"
              data-testid="spellbook-payoff-mark"
              data-mark={m.key}
              data-on={on ? 'yes' : 'no'}
              sx={{
                fontFamily: 'monospace',
                fontWeight: on ? 700 : 400,
                color: on ? 'primary.main' : 'text.disabled'
              }}
            >
              {m.glyph}
            </Typography>
          </Tooltip>
        )
      })}
    </Stack>
  )
}

/** One spell. The name is a `SpellTooltip` like every other spell name in the app, so it links. */
function SpellRow({ row }: { row: SpellbookRow }): JSX.Element {
  const figure = headlineFigure(row)
  return (
    <TableRow hover data-testid="spellbook-row" data-spell={row.name} data-tier={row.tier}>
      <TableCell>
        <SpellTooltip name={row.name} placement="right">
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {row.name}
          </Typography>
        </SpellTooltip>
        {row.outOfEra === true && (
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            label="out of era"
            data-testid="spellbook-out-of-era"
            sx={{ height: 16, fontSize: 10, ml: 0.5, '& .MuiChip-label': { px: 0.5 } }}
          />
        )}
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary">
          {classesText(row.at)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary" data-testid="spellbook-category">
          {UPGRADE_CATEGORY_LABEL[row.category]}
        </Typography>
      </TableCell>
      {/* THE COLUMN THE OWNER ASKED FOR: what it actually does, in the row itself. */}
      <TableCell data-testid="spellbook-grants">
        <Tooltip title={row.grants.map((g) => g.line).join('\n')}>
          <Typography variant="caption">{grantsText(row.grants)}</Typography>
        </Tooltip>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography variant="caption" data-testid="spellbook-figure" data-kind={figure.label}>
          {figure.value}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography variant="caption" data-testid="spellbook-mana">
          {whole(row.mana)}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography variant="caption">{seconds(row.castSeconds)}</Typography>
      </TableCell>
      <TableCell>
        <PayoffCell row={row} />
      </TableCell>
    </TableRow>
  )
}

export default function SpellbookView(): JSX.Element {
  const data = useLevelUnlocks()
  const combo = useCurrentComboClasses()
  const [query, setQuery] = useState<SpellbookQuery>({ sort: 'level' })
  const [tier, setTier] = useState(0)
  // THE STANDING SEARCH LAW: the controls echo instantly and the LIST follows. The gear tab's own
  // slider header states the same rule - the thumb is never waiting on a re-sort of a corpus.
  const deferredQuery = useDeferredValue(query)
  const deferredTier = useDeferredValue(tier)
  const rows = useMemo(
    () => spellbookRows(data.spells, deferredQuery, deferredTier),
    [data.spells, deferredQuery, deferredTier]
  )
  const drawn = rows.slice(0, DRAW_CAP)
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }} data-testid="spellbook-view">
      <SpellbookToolbar
        query={query}
        onQuery={setQuery}
        tier={tier}
        onTier={setTier}
        combo={combo.resolved}
        shown={rows.length}
        total={data.spells.length}
      />
      {data.spells.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="spellbook-empty">
          the spell catalogue has not loaded yet
        </Typography>
      ) : (
        <TableContainer sx={{ flexGrow: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Spell</TableCell>
                <TableCell>Classes</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Grants</TableCell>
                <TableCell align="right">Dmg / heal</TableCell>
                <TableCell align="right">Mana</TableCell>
                <TableCell align="right">Cast</TableCell>
                <Tooltip title="What a mote tier buys: N numbers, T duration, M mana, C cast time, R resist. A dim letter is a gain this spell does not get.">
                  <TableCell>Upgrade</TableCell>
                </Tooltip>
              </TableRow>
            </TableHead>
            <TableBody>
              {drawn.map((r) => (
                <SpellRow key={r.name} row={r} />
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary" data-testid="spellbook-no-hits">
                no spell matches those filters
              </Typography>
            </Box>
          )}
          {/* STATED, NEVER SILENT (see the header): a reader who cannot find a spell has to be able
              to see that the list stopped rather than that the spell does not exist. */}
          {rows.length > DRAW_CAP && (
            <Box sx={{ p: 1 }}>
              <Typography variant="caption" color="text.secondary" data-testid="spellbook-capped">
                showing the first {String(DRAW_CAP)} of {String(rows.length)} matches - narrow the
                search to see the rest
              </Typography>
            </Box>
          )}
        </TableContainer>
      )}
    </Stack>
  )
}

export { UNSTATED }
