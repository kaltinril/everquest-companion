// spells/SpellTierSlider — the 0-to-10 mote slider, once, for every surface in this area.
//
// `gear/UpgradeSlider.tsx` is the precedent and its law is the one that matters: THE CONTROL SAYS
// WHAT IT IS SIMULATING PERMANENTLY, at every position including base, so nobody reads a scaled
// number thinking it is their own.
//
// ── WHY IT IS A COMPONENT NOW ─────────────────────────────────────────────────────────────────
//
// It was nine lines inside `SpellbookToolbar` and the Loadout tab wanted exactly it (owner,
// 2026-09-10: *"on the loadout tab, put the +0 to +10 slider"*). Two copies of a slider is two
// chances to disagree about how many stops it has, whether base gets a label, and whether the
// thumb waits on the list - so it moved here the moment a second surface asked, which is the same
// trip `ChipMultiSelect` made.
//
// THE CAPTION IS THE CALLER'S, because the two surfaces are simulating different things and have
// different honest things to say about it. The Spellbook says which rate the visible categories
// move at; the Loadout says that a buff set's STATS do not move at all, which is the whole reason
// there is a slider next to a totals panel.

import type { JSX } from 'react'
import { Box, Slider, Stack, Typography } from '@mui/material'
import { SPELL_MAX_RANK, romanRank } from './spellbookFormat'

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

export interface SpellTierSliderProps {
  tier: number
  onTier: (next: number) => void
  /** The caller's sentence about what the slider is doing to what is on screen. */
  note?: string
  /** `data-testid` for the slider itself, so each surface keeps its own handle. */
  testId?: string
  /** Drawn at the far right - the Spellbook's row count, the Loadout's gem count. */
  trailing?: JSX.Element
}

export default function SpellTierSlider({
  tier,
  onTier,
  note,
  testId = 'spell-tier-slider',
  trailing
}: SpellTierSliderProps): JSX.Element {
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
          data-testid={testId}
          aria-label="Simulated mote tier"
          onChange={(_e, v) => onTier(typeof v === 'number' ? v : v[0])}
        />
      </Box>
      <Typography
        variant="caption"
        data-testid={`${testId}-label`}
        color={tier > 0 ? 'primary.main' : 'text.secondary'}
        sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
      >
        {tierLabel(tier)}
      </Typography>
      {note !== undefined && (
        <Typography variant="caption" color="text.secondary" data-testid={`${testId}-note`}>
          {note}
        </Typography>
      )}
      {trailing !== undefined && (
        <>
          <Box sx={{ flexGrow: 1 }} />
          {trailing}
        </>
      )}
    </Stack>
  )
}
