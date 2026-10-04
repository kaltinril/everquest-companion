// wishlist/WishReason.tsx — WHAT A WISH IS WANTED FOR, AND THE ONE PLACE TO CHANGE IT.
//
// A wish's kind used to be fixed by the tab it was added from: the Exaltations tab writes a donor
// wish (an effect to melt into an exaltation), the Gear tab a gear wish (an item to wear). Nothing
// could change it afterwards, so a belt wished from a Gear row for its focus effect read as a wish
// to wear it (owner ask, 2026-10-03). The reason line under the name is now that control: `gear`,
// plus every effect the donor corpus says the item carries.
//
// IT READS ITS OWN DATA rather than taking props through `WishGroups`' row and group: the wish list
// is one module-scope document (`useWishlist`) and the donor corpus is module-cached (`useDonors`),
// so mounting both here costs a subscription each and keeps the row signatures untouched.

import { useMemo, type JSX } from 'react'
import { MenuItem, Select, Typography } from '@mui/material'
import type { SocketType } from '@shared/planner/types'
import type { WishReason } from '@shared/planner/wishlist'
import { useDonors } from '../planner/plannerData'
import type { FarmNeed } from '../planner/plannerFarm'
import { useWishlist } from './useWishlist'

const GEAR = 'gear'
const CAPTION_SX = { display: 'block', color: 'text.secondary' } as const

interface ReasonOption {
  value: string
  label: string
  reason: WishReason
}

function donorValue(effect: string, socket: SocketType): string {
  return `${socket}:${effect}`
}

/** `gear`, the wish's own effect (kept even when the corpus no longer has it), then the corpus's. */
function reasonOptions(row: FarmNeed, donors: readonly { key: string; effect: string; socket: SocketType }[]): ReasonOption[] {
  const out: ReasonOption[] = [{ value: GEAR, label: GEAR, reason: { kind: 'gear' } }]
  const push = (effect: string, socket: SocketType): void => {
    const value = donorValue(effect, socket)
    if (!out.some((o) => o.value === value)) out.push({ value, label: effect, reason: { kind: 'donor', effect, socket } })
  }
  if (row.effect !== undefined && row.socket !== undefined) push(row.effect, row.socket)
  for (const d of donors) if (d.key === row.itemKey) push(d.effect, d.socket)
  return out
}

/** What a row is WANTED FOR — the effect on a donor wish, the honest word `gear` otherwise — and,
 *  when the item carries any effect, the picker that changes it. */
export function WantedFor({ row }: { row: FarmNeed }): JSX.Element {
  const { donors } = useDonors()
  const { ready, setReason } = useWishlist()
  const options = useMemo(() => reasonOptions(row, donors), [row, donors])
  const current = row.effect !== undefined && row.socket !== undefined ? donorValue(row.effect, row.socket) : GEAR
  if (options.length < 2 || !ready) {
    return (
      <Typography variant="caption" noWrap sx={CAPTION_SX}>
        {row.effect ?? GEAR}
      </Typography>
    )
  }
  return (
    <Select
      variant="standard"
      disableUnderline
      value={current}
      data-testid="wishlist-reason"
      inputProps={{ 'aria-label': `What ${row.name} is wanted for` }}
      onChange={(e) => {
        const picked = options.find((o) => o.value === e.target.value)
        if (picked !== undefined) setReason(row.itemKey, picked.reason)
      }}
      sx={{ ...CAPTION_SX, typography: 'caption', maxWidth: '100%', '& .MuiSelect-select': { py: 0 } }}
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value} dense>
          {o.label}
        </MenuItem>
      ))}
    </Select>
  )
}
