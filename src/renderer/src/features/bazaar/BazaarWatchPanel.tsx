// BazaarWatchPanel — the picked item's watch: on or off, this tier or every tier, and whether a WTS,
// a WTB, both or neither alert, each with its optional price (shared/bazaarWatch.ts says what each
// means). How an alert sounds and looks is the Alerts tab's "Bazaar watchlist match" alert, the
// same as every other alert's.

import { type JSX, useEffect, useState } from 'react'
import { Checkbox, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import { findWatch, watchOnItem } from '@shared/bazaarWatch'
import { formatPlat, parsePlat, type BazaarItem } from '@shared/bazaar'
import { useBazaarWatch } from './useBazaarWatch'

function PriceField({ label, value, onCommit, testId }: { label: string; value: number | null; onCommit: (v: number | null) => void; testId: string }): JSX.Element {
  const shown = value === null ? '' : formatPlat(value)
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  // The field shows the price rounded (12,345 reads 12k); leaving it untouched must not store the rounding.
  return (
    <TextField
      size="small"
      label={label}
      placeholder="any"
      value={text}
      onChange={(ev) => setText(ev.target.value)}
      onBlur={() => {
        if (text !== shown) onCommit(parsePlat(text))
      }}
      sx={{ width: 150 }}
      slotProps={{ htmlInput: { 'data-testid': testId } }}
    />
  )
}

function Tick({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (on: boolean) => void; testId?: string }): JSX.Element {
  return <FormControlLabel control={<Checkbox size="small" checked={checked} onChange={(_e, on) => onChange(on)} data-testid={testId} />} label={label} sx={{ minWidth: 270 }} />
}

export default function BazaarWatchPanel({ item }: { item: BazaarItem }): JSX.Element {
  const { list, put, remove } = useBazaarWatch()
  // A combined row stands for every tier, so its watch is any on the item, and a new one is every tier.
  const combined = item.combined !== undefined
  const w = combined ? watchOnItem(list, item.item) : findWatch(list, item.item, item.tier)
  const toggle = (on: boolean): void => {
    if (on) put({ item: item.item, tier: combined ? null : item.tier, wts: false, wtb: false, wtsMax: null, wtsShare: null, wtbMin: null })
    else if (w !== null) remove(w.item, w.tier)
  }
  return (
    <Stack spacing={0.5} data-testid="bazaar-watch">
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <FormControlLabel control={<Switch size="small" checked={w !== null} onChange={(_e, on) => toggle(on)} data-testid="bazaar-watch-on" />} label="Watch" />
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
      {w !== null && (
        <>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Tick label="Alert on WTS (someone selling)" checked={w.wts} onChange={(wts) => put({ ...w, wts })} testId="bazaar-watch-wts" />
            {w.wts && (
              <>
                <PriceField label="at or under" value={w.wtsMax} onCommit={(wtsMax) => put({ ...w, wtsMax })} testId="bazaar-watch-wts-max" />
                <TextField
                  size="small"
                  label="or under % of 7-day median"
                  placeholder="e.g. 80"
                  type="number"
                  value={w.wtsShare === null ? '' : Math.round(w.wtsShare * 100)}
                  onChange={(ev) => {
                    const pct = Number(ev.target.value)
                    put({ ...w, wtsShare: ev.target.value === '' || !(pct > 0) ? null : Math.min(pct, 100) / 100 })
                  }}
                  sx={{ width: 250 }}
                  slotProps={{ htmlInput: { 'data-testid': 'bazaar-watch-wts-share', min: 1, max: 100 } }}
                />
              </>
            )}
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Tick label="Alert on WTB (someone buying)" checked={w.wtb} onChange={(wtb) => put({ ...w, wtb })} testId="bazaar-watch-wtb" />
            {w.wtb && <PriceField label="at or over" value={w.wtbMin} onCommit={(wtbMin) => put({ ...w, wtbMin })} testId="bazaar-watch-wtb-min" />}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Blank prices alert on any offer; a WTB naming no price always alerts. Sound, voice and banner: the &quot;Bazaar watchlist match&quot; alert in the Alerts tab.
          </Typography>
        </>
      )}
    </Stack>
  )
}
