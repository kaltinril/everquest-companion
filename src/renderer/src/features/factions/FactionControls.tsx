// factions/FactionControls.tsx — the tab's two control rows: the WORK filters (class, reward
// slot) and the ROW filters (search, the two hide-toggles, the shown-of-total count). Split out
// of FactionsView.tsx at the measured file ceiling (split, never ratchet).

import { type JSX } from 'react'
import { Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { CLASS_ABBRS, type ClassAbbr } from '@shared/classCombo'
import { classDisplayName } from '@shared/spellLevels'
import { EQUIP_SLOTS } from '@shared/planner/types'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import type { SlotFilter } from './factionFilters'

/** The WORK filters: which class the quests must serve, which slot their gear rewards must fill.
 *  `ANY` on the slot deliberately keeps quests with no gear rewards at all (factionFilters.ts). */
export function WorkFilterControls({
  classes,
  onClasses,
  slot,
  onSlot
}: {
  classes: ClassAbbr[]
  onClasses: (v: ClassAbbr[]) => void
  slot: SlotFilter
  onSlot: (v: SlotFilter) => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
      <ChipMultiSelect
        options={CLASS_ABBRS}
        value={classes}
        onChange={onClasses}
        label="Filter quests by class"
        placeholder="Any class"
        optionLabel={classDisplayName}
        minWidth={260}
        testId="factions-class-filter"
      />
      <TextField
        select
        size="small"
        label="Reward slot"
        value={slot}
        onChange={(e) => {
          onSlot(e.target.value as SlotFilter)
        }}
        slotProps={{ htmlInput: { 'data-testid': 'factions-slot-filter' } }}
        sx={{ width: 160 }}
      >
        <MenuItem value="ANY">Any reward</MenuItem>
        {EQUIP_SLOTS.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  )
}

/** One filter switch: a small labelled toggle with its own count. */
function FilterSwitch({
  label,
  checked,
  onChange,
  testId
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  testId: string
}): JSX.Element {
  return (
    <FormControlLabel
      control={
        <Switch
          size="small"
          checked={checked}
          onChange={(e) => {
            onChange(e.target.checked)
          }}
          data-testid={testId}
        />
      }
      label={label}
      slotProps={{ typography: { variant: 'caption', color: 'text.secondary' } }}
    />
  )
}

/** The row controls: search, the two hide-toggles, and the shown-of-total count on the far end. */
export function FilterBar({
  query,
  onQuery,
  toggles,
  counts
}: {
  query: string
  onQuery: (q: string) => void
  toggles: {
    hideUntouched: boolean
    onHideUntouched: (on: boolean) => void
    hideMaxed: boolean
    onHideMaxed: (on: boolean) => void
  }
  counts: { untouched: number; maxed: number; shown: number; total: number }
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
      <TextField
        size="small"
        placeholder="Filter factions…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value)
        }}
        slotProps={{ htmlInput: { 'data-testid': 'factions-search' } }}
        sx={{ width: 260 }}
      />
      <FilterSwitch
        label={`Hide untouched (${String(counts.untouched)})`}
        checked={toggles.hideUntouched}
        onChange={toggles.onHideUntouched}
        testId="factions-hide-untouched"
      />
      <FilterSwitch
        label={`Hide maxed (${String(counts.maxed)})`}
        checked={toggles.hideMaxed}
        onChange={toggles.onHideMaxed}
        testId="factions-hide-maxed"
      />
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" color="text.secondary" data-testid="factions-count">
        {counts.shown} of {counts.total}
      </Typography>
    </Stack>
  )
}
