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
// No second reader of the maps directory. `mapLibrary()` already indexes the packs and resolves
// each zone's layers; this asks it for every zone's LABELS in turn (`labels`, the label-only
// reader) and keeps their verdict (`zoneExits`). It used to ask for the full parse, and that was
// the whole of the owner's 2026-09-12 report that the Maps tab took seconds to draw: 581 layers,
// 215 MB of geometry parsed on the main thread to read about 1,500 label lines, 3.9 s measured,
// with the map the tab asked for queued behind it. Labels alone are 0.13 s, which is the disk
// read; the result is memoized, and ipc/maps.ts builds it at idle so the tab never pays it.
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

/**
 * Every zone with at least one stated exit, keyed by map stem.
 *
 * EVERY PACK IS READ, NOT THE PREFERRED ONE. The Maps tab picks one label pack per zone
 * (brewall first, for its 26,607 points to the default set's 285), and this used to ask for the
 * same pick - so a seam only the OTHER pack labelled was invisible. Measured (owner report,
 * 2026-09-23: *"the plane of hate ... incorrectly showing no ports near"*): the Oasis entrance to
 * Hate (`to_The_Plane_of_Hate_(click)`) and East Freeport's portal to Sky are stated by the
 * default pack's `oasis_1.txt` / `freporte_1.txt` alone, and brewall's Oasis labels only the two
 * deserts. A seam is a fact about the zone whichever pack wrote it down, so the graph is the
 * union across packs, deduped the way `zoneExits` dedupes within one map.
 */
export function zoneGraph(): ZoneGraph {
  const library = mapLibrary()
  if (CACHE !== null && CACHE.library === library) return CACHE.graph
  const packIds = library.packs().map((p) => p.id)
  const out = new Map<ZoneShort, ZoneExit[]>()
  for (const stem of library.zones()) {
    const exits = statedExits(library, stem, packIds)
    if (exits.length > 0) out.set(stem, exits)
  }
  CACHE = { library, graph: out }
  return out
}

/** One zone's exits across every pack, each (kind, destination) once. */
function statedExits(library: ReturnType<typeof mapLibrary>, stem: ZoneShort, packIds: readonly string[]): ZoneExit[] {
  const exits: ZoneExit[] = []
  const seen = new Set<string>()
  for (const labels of packIds) {
    // A pack that lacks the zone hands back another pack's file (resolveLayer's fallback); the
    // dedupe makes that a harmless repeat rather than a doubled seam.
    const points = library.labels(stem, { labels })
    if (points === null) continue
    for (const exit of zoneExits(points)) {
      const key = `${exit.kind}|${exit.zone}`
      if (seen.has(key)) continue
      seen.add(key)
      exits.push(exit)
    }
  }
  return exits
}
