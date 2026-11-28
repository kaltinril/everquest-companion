// The Leveling tab's four headline numbers — level, AA earned, AA spent, AA unspent.
//
// Split out of LevelingView (which sits at the measured 400-code-line ceiling) the day the tab
// gained the "New at this level" panel. Pure presentation: every number is computed in the view
// and every caption states the honesty the analytics owe — CURRENT level is the one the log last
// STATED (a ding, or your own `/who` row — JOS-192), never max(), because a loadout swap re-reports
// the level of the new (lowest) class, so the peak belongs to a class that may no longer be in the
// loadout and rides the caption instead. The card says WHICH line stated it and how long ago,
// because that is the difference between a level and a level that has since been overtaken.

import { type JSX } from 'react'
import { Stack } from '@mui/material'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import BoltIcon from '@mui/icons-material/Bolt'
import { StatTile } from '../../lib/StatTile'

export interface LevelingHeroesProps {
  currentLevel: number | null
  /** '/who' or 'Nh ago' beside the number; '' when the bare number is the whole fact. */
  levelCue: string
  /** which line stated that level and how long ago; '' when nothing has stated one. */
  levelTitle: string
  levelCount: number
  peak: number | null
  swaps: number
  aaEarned: number
  aaSpent: number
  aaUnspent: number | null
  boughtCount: number
}

export function LevelingHeroes({
  currentLevel,
  levelCue,
  levelTitle,
  levelCount,
  peak,
  swaps,
  aaEarned,
  aaSpent,
  aaUnspent,
  boughtCount
}: LevelingHeroesProps): JSX.Element {
  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }} useFlexGap>
      <StatTile
        size="hero"
        icon={<MilitaryTechIcon fontSize="large" />}
        value={currentLevel != null ? String(currentLevel) : '-'}
        label="Character level"
        hover={levelTitle || undefined}
        // THE CUE RIDES THE CAPTION, NOT THE LABEL (measured, JOS-192). The caption is already a
        // list of qualifiers about the level-up record and has a line to spare; the LABEL is the
        // card's one-line name, and appending to it wrapped the tallest hero card by a line at
        // every width — which pushed the whole two-column band down and drew the timeslice
        // control under the panel above it (tests/e2e/leveling.e2e.mts caught exactly that).
        sub={
          (levelCue ? `${levelCue} · ` : '') +
          (levelCount
            ? `${levelCount} level-ups logged` +
              (swaps > 0 ? ` · peak ${peak} · ${swaps} class swap${swaps === 1 ? '' : 's'}` : '')
            : 'no level-ups in log')
        }
        accent="#d9b25f"
        valueTestId="leveling-hero-level"
      />
      <StatTile
        size="hero"
        icon={<AutoAwesomeIcon fontSize="large" />}
        value={aaEarned ? aaEarned.toLocaleString() : '-'}
        label="AA points earned"
        sub="spent + unspent"
        accent="#6fb3d2"
      />
      {/* `boughtCount` counts paid (ability, RANK) steps, not abilities — 91 of them across 50
          abilities on the real log. The caption read "abilities allocated" until the AA ledger
          grouped the ranks into ladders and made the two visibly different numbers. */}
      <StatTile
        size="hero"
        icon={<AutoAwesomeIcon fontSize="large" />}
        value={aaSpent ? aaSpent.toLocaleString() : '-'}
        label="AA points spent"
        sub={`${boughtCount} ranks allocated`}
        valueTestId="leveling-hero-aa-spent"
        accent="#b07fd0"
      />
      <StatTile
        size="hero"
        icon={<BoltIcon fontSize="large" />}
        value={aaUnspent != null ? aaUnspent.toLocaleString() : '-'}
        label="AA unspent"
        sub="last reported balance"
        accent="#5fbf72"
      />
    </Stack>
  )
}
