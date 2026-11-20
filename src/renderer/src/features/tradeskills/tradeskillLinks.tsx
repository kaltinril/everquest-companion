// tradeskills/tradeskillLinks.tsx — every name in the Tradeskills section, drawn the way the other
// tabs draw it (owner, 2026-11-20: "the standard item viewing on hover, hyper link etc").
//
//   item   `DonorName` with its card: the item window on hover, its Loot page on click, as on the
//          Wish list and the Bazaar.
//   mob    `CellLink` to the mob's page, resolved by `gear/dropLinks.dropMobTarget`.
//   zone   `CellLink` to the Maps tab when `dropZoneTarget` resolves the spelling; plain text when
//          it refuses (`Various`), never a nearest guess.
//
// The doors are the app router's own openers, handed down once through a context.

import { createContext, useContext, type JSX } from 'react'
import { Box } from '@mui/material'
import type { ZoneShort } from '@shared/maps'
import type { ItemSource } from '@shared/itemSources'
import { CellLink } from '../../lib/CellLink'
import { ItemIcon } from '../../lib/ItemIcon'
import { dropMobTarget, dropZoneTarget } from '../gear/dropLinks'
import type { MobTarget } from '../mobs/mobTarget'
import { DonorName } from '../planner/PlannerChips'

export interface TradeskillDoors {
  /** An item's page on the Loot tab (App's `openLoot`). */
  onOpenLoot: (item: string) => void
  /** A mob's page (App's `openMob`). */
  onOpenMob: (target: MobTarget) => void
  /** A zone on the Maps tab (App's `openMapZone`). */
  onOpenMapZone: (zone: ZoneShort) => void
  /** The Gear tab with its search box filled (App's `openGearSearch`). */
  onOpenGearSearch: (text: string) => void
}

const DoorsContext = createContext<TradeskillDoors | null>(null)

export const DoorsProvider = DoorsContext.Provider

/** The section's doors, or null outside a provider: the caller then draws plain text. */
export function useDoors(): TradeskillDoors | null {
  return useContext(DoorsContext)
}

/** An item name. Outside a provider it is the same name with its card and no click. */
export function ItemLink({ name, bold }: { name: string; bold?: boolean }): JSX.Element {
  const doors = useContext(DoorsContext)
  return <DonorName name={name} bold={bold} card onOpen={doors?.onOpenLoot} />
}

/** An item's icon and name on one line. */
export function ItemLabel({ name, bold }: { name: string; bold?: boolean }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <ItemIcon name={name} />
      <ItemLink name={name} bold={bold} />
    </Box>
  )
}

export function ZoneLink({ zone }: { zone: string }): JSX.Element {
  const doors = useContext(DoorsContext)
  const stem = doors === null ? null : dropZoneTarget(zone)
  if (doors === null || stem === null) return <>{zone}</>
  return (
    <span data-testid="tradeskill-zone-link">
      <CellLink
        text={zone}
        onOpen={() => {
          doors.onOpenMapZone(stem)
        }}
      />
    </span>
  )
}

export function MobLink({ source }: { source: ItemSource }): JSX.Element {
  const doors = useContext(DoorsContext)
  if (doors === null) return <>{source.mob}</>
  return (
    <span data-testid="tradeskill-mob-link">
      <CellLink
        text={source.mob}
        onOpen={() => {
          doors.onOpenMob(dropMobTarget(source.mob, source.mobPage ?? ''))
        }}
      />
    </span>
  )
}

/** Zones as a comma list of links. */
export function ZoneList({ zones }: { zones: readonly string[] }): JSX.Element {
  return (
    <>
      {zones.map((zone, i) => (
        <Box key={zone} component="span">
          {i > 0 && ', '}
          <ZoneLink zone={zone} />
        </Box>
      ))}
    </>
  )
}
