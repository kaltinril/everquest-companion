// BazaarWatchPanel — the picked item's watch: want to buy, want to sell or watching, for this tier
// or every tier, and the prices that raise an alert (shared/bazaarWatch.ts says what each means).

import { type JSX, useEffect, useState } from 'react'
import { Checkbox, FormControlLabel, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { findWatch, watchOnItem, type BazaarWatch, type WatchStatus } from '@shared/bazaarWatch'
import { formatPlat, type BazaarItem } from '@shared/bazaar'
import { useBazaarWatch } from './useBazaarWatch'

/** `5k`, `2.5k`, `500`, `500pp` → platinum; blank or unreadable → null. */
export function parsePlat(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(k|pp|p)?\s*$/i.exec(s)
  if (m === null) return null
  const n = Number(m[1]) * (m[2]?.toLowerCase() === 'k' ? 1000 : 1)
  return n > 0 ? n : null
}

function PriceField({ label, value, onCommit, testId }: { label: string; value: number | null; onCommit: (v: number | null) => void; testId: string }): JSX.Element {
  const [text, setText] = useState(value === null ? '' : formatPlat(value))
  useEffect(() => setText(value === null ? '' : formatPlat(value)), [value])
  return (
    <TextField
      size="small"
      label={label}
      placeholder="any"
      value={text}
      onChange={(ev) => setText(ev.target.value)}
      onBlur={() => onCommit(parsePlat(text))}
      sx={{ width: 150 }}
      slotProps={{ htmlInput: { 'data-testid': testId } }}
    />
  )
}

function Thresholds({ w, put }: { w: BazaarWatch; put: (w: BazaarWatch) => void }): JSX.Element | null {
  if (w.status === 'watch') return null
  const buy = w.status === 'buy'
  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
      <FormControlLabel
        control={<Switch size="small" checked={w.alert} onChange={(_e, on) => put({ ...w, alert: on })} data-testid="bazaar-watch-alert" />}
        label={buy ? 'Alert me when someone sells it' : 'Alert me when someone wants it'}
      />
      <PriceField
        label={buy ? 'at or under' : 'at or over'}
        value={w.price}
        onCommit={(price) => put({ ...w, price })}
        testId="bazaar-watch-price"
      />
      {buy && (
        <TextField
          size="small"
          label="or under % of 7-day median"
          placeholder="e.g. 80"
          type="number"
          value={w.medianShare === null ? '' : Math.round(w.medianShare * 100)}
          onChange={(ev) => {
            const pct = Number(ev.target.value)
            put({ ...w, medianShare: ev.target.value === '' || !(pct > 0) ? null : Math.min(pct, 100) / 100 })
          }}
          sx={{ width: 200 }}
          slotProps={{ htmlInput: { 'data-testid': 'bazaar-watch-share', min: 1, max: 100 } }}
        />
      )}
    </Stack>
  )
}

export default function BazaarWatchPanel({ item }: { item: BazaarItem }): JSX.Element {
  const { list, put, remove } = useBazaarWatch()
  // A combined row stands for every tier, so its watch is any on the item, and a new one is every tier.
  const combined = item.combined !== undefined
  const w = combined ? watchOnItem(list, item.item) : findWatch(list, item.item, item.tier)
  const tier = combined ? null : item.tier
  const pick = (status: WatchStatus | 'none'): void => {
    if (status === 'none') {
      if (w !== null) remove(w.item, w.tier)
      return
    }
    put(w === null ? { item: item.item, tier, status, alert: status !== 'watch', price: null, medianShare: null } : { ...w, status, alert: status !== 'watch' && w.alert, medianShare: status === 'buy' ? w.medianShare : null })
  }
  return (
    <Stack spacing={1} data-testid="bazaar-watch">
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" color="text.secondary">
          Watchlist
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={w?.status ?? 'none'} onChange={(_e, v: WatchStatus | 'none' | null) => v !== null && pick(v)}>
          <ToggleButton value="none">Not watched</ToggleButton>
          <ToggleButton value="buy">Want to buy</ToggleButton>
          <ToggleButton value="sell">Want to sell</ToggleButton>
          <ToggleButton value="watch">Watching</ToggleButton>
        </ToggleButtonGroup>
        {w !== null && !combined && (
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={w.tier === null}
                onChange={(_e, every) => {
                  remove(w.item, w.tier)
                  put({ ...w, tier: every ? null : item.tier })
                }}
              />
            }
            label="Every tier"
          />
        )}
      </Stack>
      {w !== null && <Thresholds w={w} put={put} />}
    </Stack>
  )
}
