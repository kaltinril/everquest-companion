// BazaarWatchPanel — the picked item's watch: on or off, this tier or every tier, and whether a WTS,
// a WTB, both or neither alert (shared/bazaarWatch.ts). How an alert sounds and looks is the Alerts
// tab's "Bazaar watchlist match" alert, the same as every other alert's.

import { type JSX } from 'react'
import { Checkbox, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import { findWatch, watchOnItem } from '@shared/bazaarWatch'
import { type BazaarItem } from '@shared/bazaar'
import { useBazaarWatch } from './useBazaarWatch'

function Tick({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (on: boolean) => void; testId?: string }): JSX.Element {
  return <FormControlLabel control={<Checkbox size="small" checked={checked} onChange={(_e, on) => onChange(on)} data-testid={testId} />} label={label} />
}

export default function BazaarWatchPanel({ item }: { item: BazaarItem }): JSX.Element {
  const { list, put, remove } = useBazaarWatch()
  // A combined row stands for every tier, so its watch is any on the item, and a new one is every tier.
  const combined = item.combined !== undefined
  const w = combined ? watchOnItem(list, item.item) : findWatch(list, item.item, item.tier)
  const toggle = (on: boolean): void => {
    if (on) put({ item: item.item, tier: combined ? null : item.tier, wts: false, wtb: false })
    else if (w !== null) remove(w.item, w.tier)
  }
  return (
    <Stack spacing={0.5} data-testid="bazaar-watch">
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <FormControlLabel control={<Switch size="small" checked={w !== null} onChange={(_e, on) => toggle(on)} data-testid="bazaar-watch-on" />} label="Watch" />
        {w !== null && (
          <>
            <Tick label="Alert on WTS (someone selling)" checked={w.wts} onChange={(wts) => put({ ...w, wts })} testId="bazaar-watch-wts" />
            <Tick label="Alert on WTB (someone buying)" checked={w.wtb} onChange={(wtb) => put({ ...w, wtb })} testId="bazaar-watch-wtb" />
            {!combined && (
              <Tick
                label="Every tier"
                checked={w.tier === null}
                onChange={(every) => {
                  remove(w.item, w.tier)
                  put({ ...w, tier: every ? null : item.tier })
                }}
              />
            )}
          </>
        )}
      </Stack>
      {w !== null && (w.wts || w.wtb) && (
        <Typography variant="caption" color="text.secondary">
          Sound, voice and banner: the &quot;Bazaar watchlist match&quot; alert in the Alerts tab.
        </Typography>
      )}
    </Stack>
  )
}
