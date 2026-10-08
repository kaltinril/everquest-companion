// BazaarItemCells — an item as the Bazaar draws it: its icon (the Gear tab's way), its name (the
// in-game window on hover, its Loot page on click, as everywhere else an item is named), and a
// price that says when it is an estimate.

import { type JSX } from 'react'
import { Box } from '@mui/material'
import { formatPlat, type BazaarItem } from '@shared/bazaar'
import { itemIconUrl } from '../../lib/ItemWindow'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'
import { DonorName } from '../planner/PlannerChips'

export const nameOf = (i: BazaarItem): string => (i.combined !== undefined ? i.item : `${i.item}${i.tier > 0 ? ` +${i.tier}` : ''}`)

/** The item's icon, the Gear tab's way: hidden when the image fails or the page names none. */
export function ItemIcon({ iconId }: { iconId: number | undefined }): JSX.Element {
  if (iconId === undefined) return <Box sx={{ width: 22, flexShrink: 0 }} />
  return (
    <Box
      component="img"
      src={itemIconUrl(iconId)}
      alt=""
      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.display = 'none'
      }}
      sx={{ width: 22, height: 22, imageRendering: 'pixelated', flexShrink: 0 }}
    />
  )
}

/** A price, with ≈ when a combined row is read at a tier nobody priced: the rate's estimate, not a listing. */
export function priceOf(item: BazaarItem, pp: number | null): string {
  const guessed = item.combined !== undefined && !item.combined.atSeen && pp !== null
  return `${guessed ? '≈' : ''}${formatPlat(pp)}`
}

/** The item's name: its in-game window on hover, its page on the Loot tab on click. */
export function ItemName({ item, bold, onOpenLoot }: { item: BazaarItem; bold?: boolean; onOpenLoot: (item: string) => void }): JSX.Element {
  return (
    <KnownItemTooltip name={item.item} clickThrough>
      <span>
        <DonorName name={nameOf(item)} bold={bold} onOpen={() => onOpenLoot(item.item)} />
      </span>
    </KnownItemTooltip>
  )
}
