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
// ── "CLOSEST" IS A SEARCH, SINCE THE OWNER ASKED FOR ONE ────────────────────────────────────
//
// The first version read only the map on screen - one hop - on the argument that two hops is a
// route. The owner disagreed the moment he stood in a zone whose neighbours had no port either
// (2026-09-12: *"it should show the closest zone that has a port right?"*), and he is right that
// "no port within one hop" is not an answer to "where is the closest port". So main builds the
// whole graph once from every map's labels (`main/zoneGraph.ts`) and `shared/zoneTravel.nearestPorts`
// walks it breadth-first, up to `MAX_HOPS`. Until the graph arrives the search runs over the one
// map in hand, which is the old behaviour as an interim rather than a blank.
//
// A ZONE WITH NO LABELLED SEAMS STILL ANSWERS NOTHING OF ITS OWN, and the card says so rather than
// implying the zone is isolated - but the reverse edges the search adds mean a neighbour that
// labelled the shared seam still reaches it. Map packs vary; 93 of the default 213 label theirs.

import { useEffect, useMemo, useState } from 'react'
import type { MapData } from '@shared/maps'
import {
  nearestPorts,
  travelSeams,
  zoneExits,
  type PortRoute,
  type ZoneExit,
  type ZoneGraph,
  type ZonePort
} from '@shared/zoneTravel'
import { zoneLevelBand, type ZoneLevelBand } from '@shared/zoneLevels'
import { mobsInZone } from '../mobs/mobZone'
// The one committed bestiary the whole app reads — the same export the mob search and the pins on
// this map use, so no second copy of "which mobs are here" can drift from it.
import { MOB_CATALOG } from '../mobs/mobSearch'

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
  /** ports landing here first, then the nearest through the graph, each with its walk */
  routes: PortRoute[]
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

/**
 * The whole graph, fetched once and kept - the port table's arrangement. Until it arrives the
 * search runs over the one map on screen, which is exactly what the first version did and is the
 * honest interim: one hop, from labels already in hand, rather than nothing.
 */
let pendingGraph: Promise<ZoneGraph> | null = null
function allGraph(): Promise<ZoneGraph> {
  pendingGraph ??= window.eq
    .getZoneGraph()
    .then((rows) => new Map(rows))
    .catch(() => new Map())
  return pendingGraph
}

/**
 * `stem` is the map-file stem (`commons`) and `zoneName` the bestiary's long name
 * (`West Commonlands`). They are the SAME ZONE in two dialects and this hook needs both: ports and
 * exits are keyed by stem, the mob catalog by long name. The first version passed only the long
 * name and compared it against port stems, so "does a port land HERE" never matched - Befallen
 * listed the Commons ports one hop away while Commons itself said none landed (owner, 2026-09-12:
 * *"this is wrong, you can port to west commons as a druid"*). He was right; the join was.
 */
export function useZoneTravel(stem: string | null, zoneName: string | null, data: MapData | null): ZoneTravel {
  const [ports, setPorts] = useState<ZonePort[] | null>(null)
  const [graph, setGraph] = useState<ZoneGraph | null>(null)
  useEffect(() => {
    let alive = true
    void allPorts().then((rows) => {
      if (alive) setPorts(rows)
    })
    void allGraph().then((g) => {
      if (alive) setGraph(g)
    })
    return () => {
      alive = false
    }
  }, [])

  const exits = useMemo(() => (data === null ? [] : zoneExits(data.points)), [data])

  const band = useMemo(() => {
    if (zoneName === null || zoneName === '') return null
    // The mob pins on this very map make the same join; reusing it is what stops the caption and
    // the pins ever describing two different sets of inhabitants.
    const rows = mobsInZone(zoneName, MOB_CATALOG)
    return zoneLevelBand(rows.map((m) => Number.parseInt(String(m.level), 10)))
  }, [zoneName])

  const routes = useMemo(() => {
    if (ports === null || stem === null) return []
    // The map on screen is the seed graph until the full one lands; either way, one search.
    const seed: ZoneGraph = graph ?? new Map([[stem, exits]])
    return nearestPorts(seed, ports, stem)
  }, [stem, exits, ports, graph])

  const rides = useMemo(() => travelSeams(exits), [exits])

  return { band, exits, rides, routes, ready: ports !== null }
}
