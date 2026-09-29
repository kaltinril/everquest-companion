// slayer/useSlayerController.ts — all of the Slayer tab's state and derivation, as one hook. The
// view is a render shell; the two lists take the bundles this returns.
//
// TWO PLANS ARE MADE, and they answer different questions:
//   - over EVERY open counter, to say how many zones each counter has (the left list's reach);
//   - over the PICKED counters, which is the ranking on the right. With nothing picked the
//     second plan is the first one, so the tab opens on "where is the most to do".
// Both read the same options, so a level cap that empties a counter's reach empties it in both.

import { useCallback, useMemo, useState } from 'react'
import type { CharacterSnap } from '@shared/characterTypes'
import type { ZoneShort } from '@shared/maps'
import type { SlayerGoal } from '@shared/outputs/slayer'
import { planZones, targetReach, type PlanOptions, type PlanZone } from '@shared/slayer/slayerPlan'
import type { View } from '../../appViews'
import { useModule } from '../../lib/useModule'
// The Maps tab's own pin is the zone deep link: write the selection it persists, then switch
// tabs. MapsView reads it on mount, exactly as if the zone had been picked in its selector.
import { onPick, saveZoneSelection } from '../maps/zoneFollow'
import type { MobTarget } from '../mobs/mobTarget'
import { slayerCatalog, useSlayerData } from './slayerData'
import {
  MAX_LEVEL_KEY,
  OUT_OF_ERA_KEY,
  PICKS_KEY,
  REQUIRED_ONLY_KEY,
  counterRows,
  loadFlag,
  loadMaxLevel,
  loadPicks,
  nearlyDone,
  savePref,
  visibleCounters,
  type CounterRow
} from './slayerRows'

/** What the app hands the tab: the two drill-downs its names link out to. */
export interface SlayerViewProps {
  onOpenMob?: (t: MobTarget) => void
  /** the app's MANUAL navigator, which is how a zone link becomes the Maps tab */
  onSelectView?: (v: View) => void
}

export interface CounterListBundle {
  rows: CounterRow[]
  total: number
  picks: ReadonlySet<string>
  query: string
  requiredOnly: boolean
  onQuery: (q: string) => void
  onRequiredOnly: (on: boolean) => void
  onToggle: (id: string) => void
  onPickNearlyDone: () => void
  onClear: () => void
}

export interface ZoneListBundle {
  zones: PlanZone[]
  /** the counters the ranking is for, by id, with the name each is drawn under */
  names: ReadonlyMap<string, string>
  picked: number
  maxLevel: number | null
  outOfEra: boolean
  onMaxLevel: (level: number | null) => void
  onOutOfEra: (on: boolean) => void
  onOpenZone: (zone: ZoneShort) => void
  onOpenMob?: (t: MobTarget) => void
}

export interface SlayerController {
  ready: boolean
  hasDump: boolean
  readAt: number | null
  goals: SlayerGoal[]
  list: CounterListBundle
  plan: ZoneListBundle
}

/** The picks, stored on every change. */
function usePicks(): [ReadonlySet<string>, (next: ReadonlySet<string>) => void] {
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set(loadPicks()))
  const store = useCallback((next: ReadonlySet<string>) => {
    setPicks(next)
    savePref(PICKS_KEY, JSON.stringify([...next]))
  }, [])
  return [picks, store]
}

/** The plan's options, stored on every change. The level cap follows the character until set. */
function usePlanOptions(): {
  opts: PlanOptions
  onMaxLevel: (level: number | null) => void
  onOutOfEra: (on: boolean) => void
} {
  const own = useModule<CharacterSnap>('character')?.level?.level
  const [stored, setStored] = useState(() => loadMaxLevel())
  const [outOfEra, setOutOfEra] = useState(() => loadFlag(OUT_OF_ERA_KEY))
  const maxLevel = stored === undefined ? (own ?? null) : stored
  const opts = useMemo(() => ({ maxLevel, outOfEra }), [maxLevel, outOfEra])
  const onMaxLevel = useCallback((level: number | null) => {
    setStored(level)
    savePref(MAX_LEVEL_KEY, level === null ? '' : String(level))
  }, [])
  const onOutOfEra = useCallback((on: boolean) => {
    setOutOfEra(on)
    savePref(OUT_OF_ERA_KEY, on ? '1' : '0')
  }, [])
  return { opts, onMaxLevel, onOutOfEra }
}

function toggled(picks: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(picks)
  if (!next.delete(id)) next.add(id)
  return next
}

export function useSlayerController(props: SlayerViewProps): SlayerController {
  const { onOpenMob, onSelectView } = props
  const { record, readAt, ready } = useSlayerData()
  const [picks, setPicks] = usePicks()
  const { opts, onMaxLevel, onOutOfEra } = usePlanOptions()
  const [query, setQuery] = useState('')
  const [requiredOnly, setRequiredOnly] = useState(() => loadFlag(REQUIRED_ONLY_KEY))

  const all = useMemo(() => {
    if (record === null) return { rows: [], zones: [] }
    const targets = counterRows(record, new Map()).map((r) => r.target)
    const zones = planZones(slayerCatalog(), targets, opts)
    return { rows: counterRows(record, targetReach(zones)), zones }
  }, [record, opts])

  const picked = useMemo(() => all.rows.filter((r) => picks.has(r.id)), [all.rows, picks])
  const zones = useMemo(() => {
    if (picked.length === 0) return all.zones
    return planZones(slayerCatalog(), picked.map((r) => r.target), opts)
  }, [all.zones, picked, opts])
  const names = useMemo(
    () => new Map(all.rows.map((r) => [r.id, r.counter.achievement])),
    [all.rows]
  )
  const rows = useMemo(
    () => visibleCounters(all.rows, { query, requiredOnly }),
    [all.rows, query, requiredOnly]
  )
  const onOpenZone = useCallback(
    (zone: ZoneShort) => {
      saveZoneSelection(onPick(zone))
      onSelectView?.('maps')
    },
    [onSelectView]
  )

  return {
    ready,
    hasDump: record !== null,
    readAt,
    goals: record?.goals ?? [],
    list: {
      rows,
      total: all.rows.length,
      picks,
      query,
      requiredOnly,
      onQuery: setQuery,
      onRequiredOnly: (on) => {
        setRequiredOnly(on)
        savePref(REQUIRED_ONLY_KEY, on ? '1' : '0')
      },
      onToggle: (id) => {
        setPicks(toggled(picks, id))
      },
      onPickNearlyDone: () => {
        setPicks(new Set(nearlyDone(all.rows)))
      },
      onClear: () => {
        setPicks(new Set())
      }
    },
    plan: {
      zones,
      names,
      picked: picked.length,
      maxLevel: opts.maxLevel,
      outOfEra: opts.outOfEra,
      onMaxLevel,
      onOutOfEra,
      onOpenZone,
      ...(onOpenMob === undefined ? {} : { onOpenMob })
    }
  }
}
