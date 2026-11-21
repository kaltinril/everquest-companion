// tradeskills/tradeskillLinks.tsx — every name in the Tradeskills section, drawn the way the other
// tabs draw it (owner, 2026-11-20: "the standard item viewing on hover, hyper link etc").
//
//   item   `DonorName` with its card: the item window on hover, its Loot page on click, as on the
//          Wish list and the Bazaar.
//   mob    `CellLink` to the mob's page, resolved by `gear/dropLinks.dropMobTarget`.
//   zone   `CellLink` to the Maps tab when `dropZoneTarget` resolves the spelling; plain text when
//          it refuses (`Various`), never a nearest guess.
//   merchant  the mob link too, when the mob catalog holds the name on one page; else plain text.
//             Beside it, "Show on map" when the Maps tab would draw that mob's pin
//             (maps/mapFocus.ts `pinTarget`): the Maps tab opens with the pin ringed and centred.
//
// The doors are the app router's own openers, handed down once through a context.

import { createContext, useContext, type JSX } from 'react'
import { Box } from '@mui/material'
import type { ZoneShort } from '@shared/maps'
import type { ItemSource } from '@shared/itemSources'
import { merchantEntry, merchantIndex, type MerchantIndex } from '@shared/tradeskillMerchant'
import { CellLink } from '../../lib/CellLink'
import { ItemIcon } from '../../lib/ItemIcon'
import { Tooltip } from '../../lib/Tooltip'
import { dropMobTarget, dropZoneTarget } from '../gear/dropLinks'
import { pinTarget, type MapFocus } from '../maps/mapFocus'
import { useTravelEra } from '../maps/useMapData'
import { MOB_CATALOG } from '../mobs/mobSearch'
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
  /** The Maps tab at a mob's pin, with a Back to this section (App's `openMapAt`). */
  onOpenMapAt: (focus: MapFocus) => void
  /** The section's own "Make an item" screen on a recipe's item (TradeskillsView). */
  onPlanRecipe: (recipe: { key: string; id: string }) => void
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

const LABEL_SX = { display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 } as const

/**
 * `wrap`: the name runs onto a second line instead of ending in dots. The name's own style
 * (planner/PlannerChips `DonorName`) keeps it on one line and cuts it; a list whose reader has
 * to act on the name (the shopping list) undoes that here, for that list alone.
 */
const WRAP_SX = {
  ...LABEL_SX,
  alignItems: 'flex-start',
  '& [data-testid="planner-donor-name"]': { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', overflowWrap: 'anywhere' }
} as const

/** An item's icon and name on one line; with `wrap`, on as many lines as the name takes. */
export function ItemLabel({ name, bold, wrap }: { name: string; bold?: boolean; wrap?: boolean }): JSX.Element {
  return (
    <Box sx={wrap === true ? WRAP_SX : LABEL_SX}>
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

// Built once per window, off the catalog the Mobs tab already loaded (gear/dropLinks' arrangement).
let MERCHANTS: MerchantIndex | null = null

/**
 * A merchant's name, from the log's purchase lines or from the recipe guide: the standard mob
 * link when the catalog holds that name on one page (`shared/tradeskillMerchant`), plain text
 * when it does not. `zone` chooses between pages that share the name.
 */
export function MerchantLink({ name, zone }: { name: string; zone?: string }): JSX.Element {
  const doors = useContext(DoorsContext)
  MERCHANTS ??= merchantIndex(MOB_CATALOG)
  const entry = doors === null ? null : merchantEntry(MERCHANTS, name, zone)
  if (doors === null || entry === null) return <>{name}</>
  return (
    <span data-testid="tradeskill-merchant-link">
      <CellLink
        text={name}
        onOpen={() => {
          doors.onOpenMob({ mob: entry.name, entry })
        }}
      />
    </span>
  )
}

const MAP_LINK_TIP = "Opens the Maps tab on this merchant's pin."

/**
 * " · Show on map" after a merchant's line: the Maps tab on that merchant's own pin. Drawn only
 * when the catalog holds the merchant (`MerchantLink`'s rule) AND the Maps tab would pin it there
 * under its own era switch; otherwise nothing, and the line's zone link is the way to the map.
 */
export function MerchantMapLink({ name, zone }: { name: string; zone?: string }): JSX.Element | null {
  const doors = useContext(DoorsContext)
  const eraOnly = useTravelEra()
  MERCHANTS ??= merchantIndex(MOB_CATALOG)
  const entry = doors === null ? null : merchantEntry(MERCHANTS, name, zone)
  const target = entry === null ? null : pinTarget(entry, zone, eraOnly)
  if (doors === null || target === null) return null
  return (
    <>
      {' · '}
      <Tooltip title={MAP_LINK_TIP}>
        <span data-testid="tradeskill-map-link">
          <CellLink
            text="Show on map"
            onOpen={() => {
              doors.onOpenMapAt(target)
            }}
          />
        </span>
      </Tooltip>
    </>
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
