// BazaarControls — the Bazaar tab's toolbar: search, direction, which items to show (all, the wish
// list, the watchlist or one of its statuses), Popular with its price floor, whether items the
// wiki marks No Drop or No Trade show at all, and the offers list with its CSV export.

import { type JSX } from 'react'
import { Button, FormControlLabel, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import type { BazaarDir } from '@shared/bazaar'
import { WATCH_STATUS_LABEL, type WatchStatus } from '@shared/bazaarWatch'

export type BazaarShow = 'all' | 'wish' | 'watched' | WatchStatus

const SHOW_LABEL: Record<BazaarShow, string> = {
  all: 'All items',
  wish: 'On my wish list',
  watched: 'My watchlist',
  ...WATCH_STATUS_LABEL
}

/** Price floors for Popular, in platinum: anything under a platinum is not worth the trip. */
export const MIN_PRICES: { pp: number; label: string }[] = [
  { pp: 0, label: 'Any price' },
  { pp: 1, label: '1pp and up' },
  { pp: 100, label: '100pp and up' },
  { pp: 1000, label: '1k and up' },
  { pp: 5000, label: '5k and up' }
]

export interface BazaarControlState {
  text: string
  dir: BazaarDir | 'all'
  show: BazaarShow
  popular: boolean
  minPrice: number
  /** Leave out items the wiki marks No Drop or No Trade: chat sometimes offers what cannot trade. */
  hideNoTrade: boolean
  /** Show every offer as said, in a list, instead of only the per-item summary. */
  offers: boolean
  /** One row per item, every tier read as +0 (shared/bazaarTiers.ts). */
  combineTiers: boolean
}

export default function BazaarControls({
  state,
  set,
  onExport
}: {
  state: BazaarControlState
  set: (patch: Partial<BazaarControlState>) => void
  onExport: () => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
      <TextField
        size="small"
        placeholder="Search items"
        value={state.text}
        onChange={(ev) => set({ text: ev.target.value })}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-search' } }}
      />
      <ToggleButtonGroup size="small" exclusive value={state.dir} onChange={(_e, v: BazaarDir | 'all' | null) => v !== null && set({ dir: v })}>
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="sell">Selling</ToggleButton>
        <ToggleButton value="buy">Buying</ToggleButton>
        <ToggleButton value="trade">Trading</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        select
        size="small"
        label="Show"
        value={state.show}
        onChange={(ev) => set({ show: ev.target.value as BazaarShow })}
        sx={{ minWidth: 170 }}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-show' } }}
      >
        {(Object.keys(SHOW_LABEL) as BazaarShow[]).map((k) => (
          <MenuItem key={k} value={k}>
            {SHOW_LABEL[k]}
          </MenuItem>
        ))}
      </TextField>
      <ToggleButton
        size="small"
        value="popular"
        selected={state.popular}
        onChange={() => set({ popular: !state.popular })}
        data-testid="bazaar-popular"
        title="Rank by platinum changing hands over the last 30 days: price times offers"
      >
        Popular
      </ToggleButton>
      <TextField
        select
        size="small"
        label="Price"
        value={state.minPrice}
        onChange={(ev) => set({ minPrice: Number(ev.target.value) })}
        sx={{ minWidth: 140 }}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-min-price' } }}
      >
        {MIN_PRICES.map((m) => (
          <MenuItem key={m.pp} value={m.pp}>
            {m.label}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={<Switch size="small" checked={state.combineTiers} onChange={(_e, on) => set({ combineTiers: on })} data-testid="bazaar-combine-tiers" />}
        label="All tiers as one"
        title="One row per item: every tier's price read as its +0, by how much a tier adds for that item"
      />
      <FormControlLabel
        control={<Switch size="small" checked={state.hideNoTrade} onChange={(_e, on) => set({ hideNoTrade: on })} data-testid="bazaar-hide-notrade" />}
        label="Hide No Drop"
        title="Leave out items the wiki marks No Drop or No Trade"
      />
      <ToggleButton size="small" value="offers" selected={state.offers} onChange={() => set({ offers: !state.offers })} data-testid="bazaar-offers-toggle">
        Offers list
      </ToggleButton>
      <Button size="small" variant="outlined" onClick={onExport} data-testid="bazaar-export">
        Export CSV
      </Button>
    </Stack>
  )
}
