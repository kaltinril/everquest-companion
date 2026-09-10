// spells/SpellbookToolbar.tsx — THE FILTERS, AND THE ONE SLIDER THAT MOVES EVERY NUMBER BELOW.
//
// Split from `SpellbookView` because that file is at this tree's 400-code-line factoring ceiling
// and because these are two subjects: a toolbar is about ASKING, and the view under it is about
// answering. Nothing here holds state - every control is driven by the view's `SpellbookQuery` and
// reports a whole new one, which is what keeps "what is the list showing" a single value.
//
// ── THE TIER SLIDER IS THE GEAR TAB'S, IN THIS TAB'S VOCABULARY ────────────────────────────────
//
// `gear/UpgradeSlider.tsx` is the precedent and its law is the one that matters: the control says
// what it is simulating PERMANENTLY, at every position including base, so nobody reads a scaled
// number thinking it is their own. The gear tab measured 6,766 rows at ~18 ms and shipped a live
// slider on that; this corpus is a third of that size and does strictly less per row, so a live one
// is affordable here too - and the view still reads the tier through `useDeferredValue`, so the
// thumb never waits on a re-sort.
//
// AND IT SAYS WHICH NUMBERS ARE ACTUALLY MOVING, which the gear slider never had to. A gear tier
// lifts every stat on the item; a spell tier lifts damage on a nuke, ticks on a DoT, nothing at all
// on a buff's grants. A slider that silently did nothing for half the corpus would read as broken,
// so the caption names the rate the CURRENT category filter implies, and says plainly when the
// filtered set has no magnitudes to move.

import type { JSX } from 'react'
import { Box, Chip, Slider, Stack, TextField, Typography } from '@mui/material'
import { CLASS_ABBRS, type ClassAbbr } from '@shared/classCombo'
import {
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_LABEL,
  type UpgradeCategory
} from '@shared/spellUpgrade'
import { magnitudeRatePercent, type SpellbookQuery } from '@shared/spellbook'
import { SPELL_MAX_RANK, romanRank } from './spellbookFormat'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import { Tooltip } from '../../lib/Tooltip'

/** One stop per tier, base included - the ladder `spellUpgrade` states. */
const TIER_MARKS = Array.from({ length: SPELL_MAX_RANK + 1 }, (_, i) => ({ value: i }))

/**
 * What the slider's label says at a position.
 *
 * BASE IS A REAL ANSWER AND GETS WORDS OF ITS OWN (`SpellRankSlider`'s rule), so the label is drawn
 * at every stop rather than appearing once you move it.
 */
export function tierLabel(tier: number): string {
  return tier <= 0 ? 'base ranks' : `every spell at ${romanRank(tier)}`
}

/**
 * What the slider is DOING to the visible list, in one clause.
 *
 * The categories currently filtered to decide this: with `nuke` picked it is "+6% damage a tier",
 * with `buff` picked it is the honest "no magnitudes move". With nothing picked the corpus holds
 * both kinds and the caption says so rather than picking a number that is wrong for half the rows.
 */
export function tierEffectNote(categories: readonly UpgradeCategory[]): string {
  const picked = categories.length > 0 ? categories : UPGRADE_CATEGORIES
  const rates = new Set(picked.map(magnitudeRatePercent))
  if (rates.size === 1) {
    const only = [...rates][0]
    return only === null
      ? 'these categories gain duration, mana and cast time only - their numbers do not change'
      : `+${String(only)}% to the numbers per tier, plus mana and cast time`
  }
  return 'mixed categories - each row moves at its own rate'
}

export interface SpellbookToolbarProps {
  query: SpellbookQuery
  onQuery: (next: SpellbookQuery) => void
  tier: number
  onTier: (next: number) => void
  /** The loadout's classes, offered as a one-click filter. Empty when the app cannot name them. */
  combo: readonly ClassAbbr[]
  /** How many rows survived, so the toolbar can say what it did. */
  shown: number
  total: number
}

/** The props the two rows share. Split out so neither row re-declares the query contract. */
type RowProps = Pick<SpellbookToolbarProps, 'query' | 'onQuery'>

/**
 * ROW ONE - what to show. Search, the two pickers, and the two one-click questions.
 *
 * Its own component because the toolbar crossed this tree's 100-line-per-function ceiling, and the
 * seam the ceiling was pointing at is the real one: this row asks WHICH SPELLS and the row below
 * asks AT WHAT TIER, which are different questions that happen to sit together.
 */
function FilterRow({
  query,
  onQuery,
  combo
}: RowProps & { combo: readonly ClassAbbr[] }): JSX.Element {
  const classes = query.classes ?? []
  const categories = query.categories ?? []
  const mine =
    combo.length > 0 && classes.length === combo.length && combo.every((c) => classes.includes(c))
  const worth = query.payoffMagnitudeOnly === true
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
      <TextField
        size="small"
        label="Search spells"
        value={query.text ?? ''}
        onChange={(e) => onQuery({ ...query, text: e.target.value })}
        slotProps={{ htmlInput: { 'data-testid': 'spellbook-search' } }}
        sx={{ minWidth: 200 }}
      />
      <ChipMultiSelect
        options={CLASS_ABBRS}
        value={[...classes]}
        onChange={(next) => onQuery({ ...query, classes: next })}
        label="Classes"
        placeholder="every class"
        minWidth={150}
      />
      <ChipMultiSelect
        options={UPGRADE_CATEGORIES}
        value={[...categories]}
        onChange={(next) => onQuery({ ...query, categories: next })}
        label="Kind"
        placeholder="every kind"
        optionLabel={(c) => UPGRADE_CATEGORY_LABEL[c]}
        minWidth={150}
      />
      {/* ONE CLICK TO THE QUESTION MOST READERS ARRIVE WITH. It is a chip rather than a default
          because a browser that opened pre-filtered to your trio would answer a question the reader
          had not asked yet - and the owner's standing ask was explicitly to be able to look OUTSIDE
          his classes in order to compare. */}
      {combo.length > 0 && (
        <Chip
          size="small"
          label={`My classes (${combo.join('/')})`}
          data-testid="spellbook-mine"
          color={mine ? 'primary' : 'default'}
          variant={mine ? 'filled' : 'outlined'}
          onClick={() => onQuery({ ...query, classes: mine ? [] : [...combo] })}
        />
      )}
      {/* The owner's question 2, as one click: hide everything a tier does not improve. */}
      <Tooltip title="Only spells whose damage or healing actually rises with a mote tier. Everything else buys duration, mana and cast time only.">
        <Chip
          size="small"
          label="Worth upgrading"
          data-testid="spellbook-worth-upgrading"
          color={worth ? 'primary' : 'default'}
          variant={worth ? 'filled' : 'outlined'}
          onClick={() => onQuery({ ...query, payoffMagnitudeOnly: worth ? undefined : true })}
        />
      </Tooltip>
    </Stack>
  )
}

/** ROW TWO - at what tier, what that does, and how many rows survived. */
function TierRow({
  categories,
  tier,
  onTier,
  shown,
  total
}: {
  categories: readonly UpgradeCategory[]
  tier: number
  onTier: (next: number) => void
  shown: number
  total: number
}): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
        Simulate upgrade
      </Typography>
      <Box sx={{ width: 200, flexShrink: 0, px: 1 }}>
        <Slider
          size="small"
          min={0}
          max={SPELL_MAX_RANK}
          step={1}
          marks={TIER_MARKS}
          value={tier}
          data-testid="spellbook-tier-slider"
          aria-label="Simulated mote tier"
          onChange={(_e, v) => onTier(typeof v === 'number' ? v : v[0])}
        />
      </Box>
      <Typography
        variant="caption"
        data-testid="spellbook-tier-label"
        color={tier > 0 ? 'primary.main' : 'text.secondary'}
        sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
      >
        {tierLabel(tier)}
      </Typography>
      <Typography variant="caption" color="text.secondary" data-testid="spellbook-tier-note">
        {tierEffectNote(categories)}
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" color="text.secondary" data-testid="spellbook-count">
        {shown === total ? `${String(total)} spells` : `${String(shown)} of ${String(total)} spells`}
      </Typography>
    </Stack>
  )
}

export default function SpellbookToolbar({
  query,
  onQuery,
  tier,
  onTier,
  combo,
  shown,
  total
}: SpellbookToolbarProps): JSX.Element {
  return (
    <Stack spacing={1} sx={{ mb: 1 }} data-testid="spellbook-toolbar">
      <FilterRow query={query} onQuery={onQuery} combo={combo} />
      <TierRow
        categories={query.categories ?? []}
        tier={tier}
        onTier={onTier}
        shown={shown}
        total={total}
      />
    </Stack>
  )
}
