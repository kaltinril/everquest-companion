// maps/useZoneTravel — what the zone on screen is for, and how you get to it.
//
// Owner ask (kaltinril 2026-09-11): *"could we update the maps section so that it shows the closest
// druid, wizard, boat, or item port? so if i'm on say befallen map, it should show the druid port
// to west commons"* and *"also to show the level range of the map area?"*.
//
// THREE ANSWERS, THREE WITNESSES, ONE HOOK:
//
//   THE EXITS come from the map on screen (`shared/zoneTravel.zoneExits`) - the client labels its
//   own zone lines and this app already parses them into `MapData.points`.
//   THE LEVEL BAND comes from the committed bestiary, through the SAME zone join the mob pins on
//   this map already make (`mobsInZone`). No second notion of "which mobs are here".
//   THE PORTS come from main, once (`getZonePorts`), because they are derived from the spell and
//   item corpora that live there.
//
// ── WHY "CLOSEST" IS ONE HOP AND NOT A SEARCH ────────────────────────────────────────────────
//
// The owner's example is the whole specification: Befallen has no port of its own, West Commons
// does, and Befallen's map states `to_West_Commonlands`. That is one hop, and one hop is what a
// player can act on - "cast Ring of Commons, then run east". A two-hop answer would be a route,
// which is a different feature and needs a graph this hook deliberately does not build: it reads
// only the map it was handed, so it costs nothing and can never disagree with what is on screen.
//
// A ZONE WITH NO LABELLED SEAMS ANSWERS NOTHING, and the card says so rather than implying the
// zone is isolated. Map packs vary; 90 of the default pack's 213 files label their lines.

import { useEffect, useMemo, useState } from 'react'
import type { MapData } from '@shared/maps'
import { travelSeams, zoneExits, type ZoneExit, type ZonePort } from '@shared/zoneTravel'
import { zoneLevelBand, type ZoneLevelBand } from '@shared/zoneLevels'
import { mobsInZone } from '../mobs/mobZone'
// The one committed bestiary the whole app reads — the same export the mob search and the pins on
// this map use, so no second copy of "which mobs are here" can drift from it.
import { MOB_CATALOG } from '../mobs/mobSearch'

/** One way in, with the exit you take after landing — absent when the port lands here. */
export interface TravelOption {
  port: ZonePort
  /** null when the port lands in THIS zone; otherwise the seam you walk after arriving */
  then: ZoneExit | null
}

export interface ZoneTravel {
  /** what the zone's own mobs say it is for, or null when the bestiary states no level here */
  band: ZoneLevelBand | null
  /** every seam this map labels — walk, dock crossing and portal alike */
  exits: ZoneExit[]
  /**
   * THE SEAMS THAT ARE THEMSELVES TRAVEL — dock crossings and portals, which the owner's ask
   * named beside the spells ("druid, wizard, boat, or item port"). In Legends the dock is served
   * by a TRANSLOCATOR NPC rather than a boat (owner, 2026-09-11); `shared/zoneTravel.travelSeams`
   * translates the map file's older wording once, and nothing downstream repeats it.
   *
   * A walk is not in here and that is the distinction: every zone touches something on foot, so
   * listing walks as ways to arrive would bury the crossings that matter under the ordinary.
   *
   * THE SEAM IS READ BOTH WAYS. This map states the dock; a translocator takes you either
   * direction, which is why these are drawn as arrivals rather than departures.
   */
  rides: ZoneExit[]
  /** ports landing here first, then ports landing one labelled hop away */
  options: TravelOption[]
  /** false until the port table has crossed from main; the card draws nothing rather than "none" */
  ready: boolean
}

/**
 * The port table is STATIC and shared by every zone, so it is fetched once per window and kept.
 * `useLevelUnlocks`'s arrangement exactly, and for the same reason: the corpora it derives from
 * cannot change while the app runs, so there is no invalidation to get wrong.
 */
let pending: Promise<ZonePort[]> | null = null
function allPorts(): Promise<ZonePort[]> {
  pending ??= window.eq.getZonePorts().catch(() => [])
  return pending
}

/** Ports that land in `zone`, then ports that land in a zone this map names a seam to. */
function optionsFor(zone: string, exits: readonly ZoneExit[], ports: readonly ZonePort[]): TravelOption[] {
  const out: TravelOption[] = []
  for (const port of ports) if (port.zone === zone) out.push({ port, then: null })
  for (const exit of exits) {
    for (const port of ports) if (port.zone === exit.zone) out.push({ port, then: exit })
  }
  return out
}

export function useZoneTravel(zone: string | null, data: MapData | null): ZoneTravel {
  const [ports, setPorts] = useState<ZonePort[] | null>(null)
  useEffect(() => {
    let alive = true
    void allPorts().then((rows) => {
      if (alive) setPorts(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  const exits = useMemo(() => (data === null ? [] : zoneExits(data.points)), [data])

  const band = useMemo(() => {
    if (zone === null || zone === '') return null
    // The mob pins on this very map make the same join; reusing it is what stops the caption and
    // the pins ever describing two different sets of inhabitants.
    const rows = mobsInZone(zone, MOB_CATALOG)
    return zoneLevelBand(rows.map((m) => Number.parseInt(String(m.level), 10)))
  }, [zone])

  const options = useMemo(
    () => (ports === null || zone === null ? [] : optionsFor(zone, exits, ports)),
    [zone, exits, ports]
  )

  const rides = useMemo(() => travelSeams(exits), [exits])

  return { band, exits, rides, options, ready: ports !== null }
}
