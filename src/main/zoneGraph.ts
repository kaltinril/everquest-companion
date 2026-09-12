// zoneGraph.ts — EVERY ZONE'S STATED EXITS, read once off every map the player has.
//
// Owner (2026-09-12), standing in a zone whose neighbours had no port either: *"it should show
// the closest zone that has a port right?"* - and then, in West Freeport: *"freeport doesn't seem
// to give that you can come from west commons or nektulos forest, OR, from the islands via the dock
// NPC port"*. Those are two-hop answers. The renderer had been reading only the map on screen, so
// it could see one hop and nothing further; this is the whole graph, and
// `shared/zoneTravel.nearestPorts` walks it.
//
// ── IT IS THE MAP LIBRARY'S OWN PARSE, WALKED ONCE ───────────────────────────────────────────
//
// No second reader of the maps directory. `mapLibrary()` already indexes the packs, resolves each
// zone's layers and caches the parse; this asks it for every zone in turn and keeps the labels'
// verdict (`zoneExits`). The first call therefore parses every map in the default pack - measured
// 213 files on the owner's install - which is a one-time second or so per window and is why the
// result is memoized rather than rebuilt per request.
//
// MEMOIZED AGAINST THE LIBRARY INSTANCE, not forever: `mapLibrary()` hands back a fresh object when
// the EQ directory changes (its own header says so), and a graph read off the old directory would
// then describe maps the player no longer has.
//
// A ZONE WITH NO LABELLED SEAMS IS ABSENT, not present-and-empty. Measured: 90 of 213 maps label
// at least one seam. The search adds the reverse of every stated edge, so a zone absent here is
// still reachable from a neighbour that labelled the shared seam.

import { mapLibrary } from './maps'
import { zoneExits, type ZoneExit, type ZoneGraph } from '../shared/zoneTravel'
import type { ZoneShort } from '../shared/maps'

let CACHE: { library: unknown; graph: ZoneGraph } | null = null

/** Every zone with at least one stated exit, keyed by map stem. */
export function zoneGraph(): ZoneGraph {
  const library = mapLibrary()
  if (CACHE !== null && CACHE.library === library) return CACHE.graph
  const out = new Map<ZoneShort, ZoneExit[]>()
  for (const stem of library.zones()) {
    const got = library.get(stem, {})
    if (!got.ok) continue
    const exits = zoneExits(got.data.points)
    if (exits.length > 0) out.set(stem, exits)
  }
  CACHE = { library, graph: out }
  return out
}
