// factions/FactionControls.tsx — the tab's two control rows: the WORK filters (class, reward
// slot) and the ROW filters (search, the two hide-toggles, the shown-of-total count). Split out
// of FactionsView.tsx at the measured file ceiling (split, never ratchet).

import { type JSX } from 'react'
import {
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography
} from '@mui/material'
import { CLASS_ABBRS, type ClassAbbr } from '@shared/classCombo'
import { classDisplayName } from '@shared/spellLevels'
import { EQUIP_SLOTS } from '@shared/planner/types'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import type { RowSort, SortKey } from './factionDerive'
import type { SlotFilter } from './factionFilters'

/** The table's header: three sortable columns (Faction, Regard, Standing) and the bar's. */
export function FactionTableHead({
  sort,
  onSort
}: {
  sort: RowSort
  onSort: (key: SortKey) => void
}): JSX.Element {
  const cell = (key: SortKey, label: string, align?: 'right'): JSX.Element => (
    <TableCell align={align} sortDirection={sort.key === key ? sort.dir : false}>
      <TableSortLabel
        active={sort.key === key}
        direction={sort.key === key ? sort.dir : 'asc'}
        onClick={() => {
          onSort(key)
        }}
        data-testid={`factions-sort-${key}`}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  )
  return (
    <TableHead>
      <TableRow>
        {cell('name', 'Faction')}
        {cell('regard', 'Regard')}
        {cell('standing', 'Standing', 'right')}
        <TableCell>Toward max</TableCell>
      </TableRow>
    </TableHead>
  )
}

/** The WORK filters: which class the quests must serve, which slot their gear rewards must fill.
 *  `ANY` on the slot deliberately keeps quests with no gear rewards at all (factionFilters.ts). */
export function WorkFilterControls({
  classes,
  onClasses,
  slot,
  onSlot,
  coinOnly,
  onCoinOnly
}: {
  classes: ClassAbbr[]
  onClasses: (v: ClassAbbr[]) => void
  slot: SlotFilter
  onSlot: (v: SlotFilter) => void
  coinOnly: boolean
  onCoinOnly: (on: boolean) => void
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
      {/* The pure DONATION quests — a stated coin turn-in and nothing to farm first: the
          walk-up-with-2-gold faction work the guard quests are famous for. */}
      <FilterSwitch
        label="Gold only"
        checked={coinOnly}
        onChange={onCoinOnly}
        testId="factions-coin-only"
      />
    </Stack>
  )
}

/** One filter switch: a small labelled toggle with its own count. A `disabledHint` renders it
 *  inert with the reason on hover — a control that cannot work says why, never just (0). */
function FilterSwitch({
  label,
  checked,
  onChange,
  disabledHint,
  testId
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  disabledHint?: string
  testId: string
}): JSX.Element {
  return (
    <FormControlLabel
      title={disabledHint}
      disabled={disabledHint !== undefined}
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
  counts,
  unlocksKnown,
  expandedCount,
  onCollapseAll
}: {
  query: string
  onQuery: (q: string) => void
  toggles: {
    hideUntouched: boolean
    onHideUntouched: (on: boolean) => void
    hideMaxed: boolean
    onHideMaxed: (on: boolean) => void
    unlocksOnly: boolean
    onUnlocksOnly: (on: boolean) => void
    rewardsOnly: boolean
    onRewardsOnly: (on: boolean) => void
  }
  counts: { untouched: number; maxed: number; unlockers: number; shown: number; total: number }
  /** false until an achievements dump has been loaded — the race filter's whole data source */
  unlocksKnown: boolean
  /** how many rows are expanded — the collapse-all affordance shows only while any are */
  expandedCount: number
  onCollapseAll: () => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
      <TextField
        size="small"
        placeholder="Search factions, quests, items…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value)
        }}
        slotProps={{ htmlInput: { 'data-testid': 'factions-search' } }}
        sx={{ width: 260 }}
      />
      {/* The search's SCOPE, beside the box it scopes: rewards-only finds the quest that GRANTS
          an item (the chain's final step) instead of everything that consumes one. */}
      <FilterSwitch
        label="Rewards only"
        checked={toggles.rewardsOnly}
        onChange={toggles.onRewardsOnly}
        testId="factions-rewards-only"
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
      {/* Only the factions still GATING a race unlock — each row's chip says which race. The
          count is 0 without an achievements dump, and the switch is honest about that: it shows
          an empty table rather than pretending to know. */}
      <FilterSwitch
        label={`Unlocks a race (${String(counts.unlockers)})`}
        checked={toggles.unlocksOnly}
        onChange={toggles.onUnlocksOnly}
        disabledHint={
          unlocksKnown
            ? undefined
            : 'The race requirements come from the achievements export - type /outputfile achievements in game and this lights up.'
        }
        testId="factions-unlocks-only"
      />
      <Box sx={{ flexGrow: 1 }} />
      {expandedCount > 0 && (
        <Button
          size="small"
          variant="text"
          onClick={onCollapseAll}
          data-testid="factions-collapse-all"
          sx={{ minWidth: 0, px: 0.75, py: 0, textTransform: 'none', color: 'text.secondary' }}
        >
          Collapse all ({expandedCount})
        </Button>
      )}
      <Typography variant="caption" color="text.secondary" data-testid="factions-count">
        {counts.shown} of {counts.total}
      </Typography>
    </Stack>
  )
}
