// maps/MapZoneAdviceBar — the controls over the "Where to level" table: level, goal, search, fit.
//
// Owner (2026-09-12): *"need filters/search/sort"*. The sort is the table header's; everything
// else is here, in the Gear bar's idiom - a search box, one-lit chips for a single choice, and
// toggle chips for a filter - so a reader who knows the Gear tab knows this one.
//
// THE LEVEL IS TYPED, NOT DETECTED, AND THAT IS THE POINT. The app can often infer a level, and this
// control deliberately does not use it. Half the reason anybody opens this list is to plan for
// someone ELSE - the level you will be next week, the friend you are about to group with, the alt.

import type { JSX } from 'react'
import { Chip, Stack, TextField, Typography } from '@mui/material'
import { moteGradeCap, type ZoneGoal } from '@shared/zoneAdvice'
import type { ZoneFit } from '@shared/zoneLevels'
import { FIT, FIT_ORDER, GOALS, GOAL_ORDER } from './zoneAdviceUi'

/** Everything the bar edits, as one object so the view holds one state and the bar one prop. */
export interface AdviceQuery {
  /** the level as typed - kept as text so an emptied field is empty rather than NaN */
  level: string
  goal: ZoneGoal
  search: string
  /** the fits kept; empty means every fit the goal admits */
  fits: ReadonlySet<ZoneFit>
}

export const DEFAULT_QUERY: AdviceQuery = { level: '20', goal: 'exp', search: '', fits: new Set() }

/** The bar's ON/OFF chip - lit when on, the Exaltations bar's `ToggleChip` exactly. */
function ToggleChip({
  label,
  hint,
  on,
  color,
  testId,
  onToggle
}: {
  label: string
  hint: string
  on: boolean
  color?: 'success' | 'warning' | 'error' | 'default'
  testId: string
  onToggle: () => void
}): JSX.Element {
  return (
    <Chip
      size="small"
      label={label}
      title={hint}
      data-testid={testId}
      color={on ? (color === undefined || color === 'default' ? 'primary' : color) : 'default'}
      variant={on ? 'filled' : 'outlined'}
      onClick={onToggle}
      sx={{ flexShrink: 0 }}
    />
  )
}

export default function MapZoneAdviceBar({
  query,
  onChange,
  count
}: {
  query: AdviceQuery
  onChange: (next: AdviceQuery) => void
  /** rows on screen after every filter, for the count at the right */
  count: number
}): JSX.Element {
  const level = Number.parseInt(query.level, 10)
  const toggleFit = (fit: ZoneFit): void => {
    const next = new Set(query.fits)
    if (next.has(fit)) next.delete(fit)
    else next.add(fit)
    onChange({ ...query, fits: next })
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
      <TextField
        size="small"
        label="Level"
        value={query.level}
        onChange={(e) => {
          onChange({ ...query, level: e.target.value.replace(/\D/g, '').slice(0, 2) })
        }}
        slotProps={{ htmlInput: { 'data-testid': 'zone-advice-level', inputMode: 'numeric' } }}
        sx={{ width: 80 }}
      />
      <TextField
        size="small"
        label="Search zones"
        value={query.search}
        data-testid="zone-advice-search"
        onChange={(e) => {
          onChange({ ...query, search: e.target.value })
        }}
        sx={{ minWidth: 160 }}
      />
      <Stack direction="row" spacing={0.5}>
        {GOAL_ORDER.map((g) => (
          <ToggleChip
            key={g}
            label={GOALS[g].label}
            hint={GOALS[g].hint}
            on={g === query.goal}
            testId={`zone-advice-goal-${g}`}
            onToggle={() => {
              onChange({ ...query, goal: g })
            }}
          />
        ))}
      </Stack>
      <Stack direction="row" spacing={0.5}>
        {FIT_ORDER.map((fit) => (
          <ToggleChip
            key={fit}
            label={FIT[fit].label}
            hint={`Show only zones that con ${FIT[fit].label} at this level`}
            on={query.fits.has(fit)}
            color={FIT[fit].color}
            testId={`zone-advice-fit-${fit}`}
            onToggle={() => {
              toggleFit(fit)
            }}
          />
        ))}
      </Stack>
      {Number.isFinite(level) && level > 0 && query.goal !== 'wish' && (
        <Typography variant="caption" color="text.disabled">
          {`motes cap at grade ${String(moteGradeCap(level))}`}
        </Typography>
      )}
      <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }} data-testid="zone-advice-count">
        {`${String(count)} zones`}
      </Typography>
    </Stack>
  )
}
