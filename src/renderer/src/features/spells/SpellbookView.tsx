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
// ── NOTHING HERE FILTERS OR SORTS (ruling 4) ──────────────────────────────────────────────────
//
// `spellbookRows` does all of it, in `src/shared`, and this file maps its answer to rows. That is
// not a formality: the sort's null rule (an absent figure trails in BOTH directions) and the
// empty-filter reading (an untouched picker filters nothing) are decisions with tests on them, and
// a component that re-derived either would be a second opinion nobody could see.
//
// ============================================================================
// IT IS THE GEAR TAB'S TABLE NOW, AND THAT IS ONE FIX FOR TWO COMPLAINTS
// ============================================================================
// The owner, 2026-09-10: *"spellbook takes a long time to load for some reason why?"* and *"the
// tabs look like crap compared to the gear tab, why are you not reusing controls"*. One cause.
//
// THIS FILE USED TO CAP THE DRAW AT 200 ROWS AND HANG A MUI TOOLTIP ON NEARLY EVERY CELL - five on
// the payoff column alone, plus the name card and the grants line, which is about 1,400 poppers
// mounted synchronously before the first paint. `GearTable.tsx` has carried the rule against
// exactly that since JOS-143 (*"NO MUI TOOLTIP ANYWHERE... these are dense rows under a toolbar
// full of selects and a slider"*), and it draws 6,766 rows without a cap because it WINDOWS them.
//
// So this is the same shape now, for the same reasons and under the same contract:
//   * `useWindowedRows` over the whole result, so the DOM holds a screenful whatever the filter
//     matches - and the 200-row cap, with the footer that had to apologise for it, is gone.
//   * THE FIXED-HEIGHT CONTRACT (`GearTable.tsx`'s header states it in full): every row is exactly
//     `ROW_HEIGHT` with one clipped line per cell, or the spacer arithmetic desyncs as you scroll.
//     That is why the out-of-era CHIP became a coloured name with a `title` - a chip inside a dense
//     cell is what makes a row two lines tall.
//   * NATIVE `title` FOR EVERY EXPLANATION. The one exception is the spell NAME, which keeps the
//     app's spell card for the reason the gear tab kept its compare card (JOS-338): it is the whole
//     point of this surface, it is one popper rather than one per cell, and it opens on a 250ms
//     hover intent rather than on mount.

import { type JSX, useDeferredValue, useMemo, useRef, useState } from 'react'
import {
  Box,
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
import { useLevelUnlocks } from '../leveling/useLevelUnlocks'
// THE GEAR TAB'S CLASS-FILTER STATE, under this tab's own key (owner, 2026-09-10). See
// `useFollowingClasses` for why the shape is shared and the storage deliberately is not.
import { useFollowingClasses } from '../gear/gearData'
import { SpellTooltip } from '../../lib/SpellCard'
import { useWindowedRows } from '../../lib/useWindowedRows'
import SpellbookToolbar from './SpellbookToolbar'
import SpellIcon from './SpellIcon'
import { classesText, grantsText, headlineFigure, seconds, whole, UNSTATED } from './spellbookFormat'

/** Dense row height (px), MUI `size="small"` - the number the windowing hook is handed. */
const ROW_HEIGHT = 37

/** The fixed-height contract, as one style. See the header. */
const FIXED_ROW = {
  height: ROW_HEIGHT,
  maxHeight: ROW_HEIGHT,
  '& td': {
    py: 0,
    maxHeight: ROW_HEIGHT,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  }
} as const

/** How many columns a spacer has to span. */
const COLUMN_COUNT = 8

/** The spacer rows that reserve the full scroll height - see `useWindowedRows`. */
function PadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMN_COUNT} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

/**
 * The payoff column: which of the five things a mote tier moves for this row.
 *
 * The owner's question 2 answered ACROSS A LIST rather than one spell at a time, which is the thing
 * a page cannot do for you. A lit glyph is a gain; an unlit one is a gain this spell does not get.
 * Both are drawn, because "M C" with nothing beside it reads as missing data, while a dim `N` beside
 * a bright `M` reads as the fact it is: upgrading this buys mana and not numbers.
 *
 * ONE `title` FOR THE WHOLE CELL rather than one per glyph. Five poppers a row was most of this
 * tab's first paint (see the header), and the legend a reader wants is all five lines anyway.
 */
function PayoffCell({ row }: { row: SpellbookRow }): JSX.Element {
  const legend = PAYOFF_MARKS.map(
    (m) => `${m.glyph}  ${row.payoff[m.key] === true ? m.title : `no change: ${m.title}`}`
  ).join('\n')
  return (
    <Stack
      direction="row"
      spacing={0.25}
      title={legend}
      data-testid="spellbook-payoff"
      data-spell={row.name}
    >
      {PAYOFF_MARKS.map((m) => {
        const on = row.payoff[m.key] === true
        return (
          <Typography
            key={m.glyph}
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
        )
      })}
    </Stack>
  )
}

/** One spell. The name keeps the app's spell card; everything else explains itself with `title`. */
function SpellRow({ row }: { row: SpellbookRow }): JSX.Element {
  const figure = headlineFigure(row)
  const era = row.outOfEra === true
  return (
    <TableRow
      hover
      sx={FIXED_ROW}
      data-testid="spellbook-row"
      data-spell={row.name}
      data-tier={row.tier}
    >
      <TableCell>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <SpellIcon iconId={row.iconId} />
          <SpellTooltip name={row.name} placement="right">
            <Typography
              variant="body2"
              noWrap
              sx={{ fontWeight: 500 }}
              color={era ? 'warning.main' : undefined}
              title={era ? 'the wiki places this spell out of era' : undefined}
              data-testid={era ? 'spellbook-out-of-era' : undefined}
            >
              {row.name}
            </Typography>
          </SpellTooltip>
        </Stack>
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary" noWrap title={classesText(row.at)}>
          {classesText(row.at)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary" noWrap data-testid="spellbook-category">
          {UPGRADE_CATEGORY_LABEL[row.category]}
        </Typography>
      </TableCell>
      {/* THE COLUMN THE OWNER ASKED FOR: what it actually does, in the row itself. */}
      <TableCell data-testid="spellbook-grants">
        <Typography variant="caption" noWrap title={row.grants.map((g) => g.line).join('\n')}>
          {grantsText(row.grants)}
        </Typography>
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

const PAYOFF_HEADER_TITLE =
  'What a mote tier buys: N numbers, T duration, M mana, C cast time, R resist. A dim letter is a gain this spell does not get.'

export default function SpellbookView(): JSX.Element {
  const data = useLevelUnlocks()
  // Mounted HERE and passed down, never inside the toolbar: two mounts of one storage key would
  // each hold their own copy and only one would re-read after the other wrote.
  const classes = useFollowingClasses('eq.spells.classes')
  const [query, setQuery] = useState<SpellbookQuery>({ sort: 'level' })
  const [tier, setTier] = useState(0)
  // THE STANDING SEARCH LAW: the controls echo instantly and the LIST follows. The gear tab's own
  // slider header states the same rule - the thumb is never waiting on a re-sort of a corpus.
  // THE CLASS FILTER IS PART OF THE QUERY, and it lives outside `query` because it is remembered
  // across restarts while the rest of the form is not. Joined here, once, so `spellbookRows` still
  // receives one whole question - the renderer composes the query, it never filters the corpus.
  const asked = useMemo<SpellbookQuery>(
    () => ({ ...query, classes: classes.classes }),
    [query, classes.classes]
  )
  const deferredQuery = useDeferredValue(asked)
  const deferredTier = useDeferredValue(tier)
  const rows = useMemo(
    () => spellbookRows(data.spells, deferredQuery, deferredTier),
    [data.spells, deferredQuery, deferredTier]
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: rows.length, rowHeight: ROW_HEIGHT, scrollRef })
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }} data-testid="spellbook-view">
      <SpellbookToolbar
        query={query}
        onQuery={setQuery}
        tier={tier}
        onTier={setTier}
        classes={classes}
        shown={rows.length}
        total={data.spells.length}
      />
      {data.spells.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="spellbook-empty">
          the spell catalogue has not loaded yet
        </Typography>
      ) : (
        <TableContainer ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0 }}>
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
                <TableCell title={PAYOFF_HEADER_TITLE}>Upgrade</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <PadRow height={win.topPad} />
              {rows.slice(win.start, win.end).map((r) => (
                <SpellRow key={r.key} row={r} />
              ))}
              <PadRow height={win.bottomPad} />
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary" data-testid="spellbook-no-hits">
                no spell matches those filters
              </Typography>
            </Box>
          )}
        </TableContainer>
      )}
    </Stack>
  )
}

export { UNSTATED }
