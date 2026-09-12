// zoneTravel.ts — WHERE YOU CAN GET TO FROM HERE, read off the map the player already has.
//
// Owner ask (kaltinril 2026-09-11): *"could we update the maps section so that it shows the closest
// druid, wizard, boat, or item port? so if i'm on say befallen map, it should show the druid port to
// west commons as an example"*.
//
// ── THE ZONE GRAPH WAS ALREADY ON DISK, AND I SAID IT WAS NOT ────────────────────────────────
//
// The first answer to that ask was that this repo has no zone graph - `ZoneEntry` is
// `{ short, name, era }` and nothing states what touches what - so "closest" could not be answered
// without either a hand-authored table or a scrape. The owner pushed back: *"i mean, the zones
// should know what they connect to do they not?"*. He was right, and the data is in the last place
// a feature about maps should have had to look for it: THE MAP FILES.
//
//     P -31.9430, 75.5264, -0.8014, 150, 0, 200, 3, to_West_Commonlands     (befallen_1.txt)
//
// That is his exact example, stated by the client, in a file this app already parses into
// `MapData.points`. MEASURED over the default pack: 213 map files, 93 carrying at least one
// labelled zone line, 66 distinct destinations - and the boats name themselves
// (`to_Erud's_Crossing_or_Freeport_(boat_or_translocator)`), which is the other half of the ask.
//
// SO THIS MODULE READS POINTS AND NOTHING ELSE. No new file access, no network, no committed
// table: the exits of a zone are whatever the map of that zone says they are, which is also the
// honest bound on the answer. A pack whose author never labelled the zone lines yields nothing
// here, and the surface says so rather than inventing an edge.
//
// ── WHAT IS NOT DECIDED HERE ─────────────────────────────────────────────────────────────────
//
// Which PORTS land in a zone is a different question with a different witness - the spell corpus
// and the item corpus - and it lives in `main/zonePorts.ts`. This module answers only "what does
// this map say you can walk, sail or step to", and the two are joined at the surface.

import { ZONES, zoneEntryFor, type ZoneEntry } from './zones'
import type { MapPoint, ZoneShort } from './maps'

/** How the map says you make this crossing. */
export type ExitKind = 'walk' | 'translocator' | 'portal'

/** One way out of the zone whose map this is. */
export interface ZoneExit {
  kind: ExitKind
  /** the destination's map stem, folded through `zones.ts` - the join key for everything else */
  zone: ZoneShort
  /** the destination's display name, as `zones.ts` spells it */
  name: string
  /** the point's RAW label, so a surface can show the map's own words (law 2) */
  label: string
}

/**
 * WHO TAKES YOU THERE — a port's witness, as opposed to an exit's.
 *
 * The TYPES live here beside `ZoneExit` and the DERIVATION lives in `main/zonePorts.ts`, because
 * the two corpora it reads (`spells.json`, and the 8.6 MB `items.json`) are main's. Preload
 * carries the shape across the wire and must never import the module that builds it.
 */
export type PortVia = 'druid' | 'wizard' | 'item'

/** One way to arrive in one zone by magic — the port half of `ZoneExit`'s walk/boat/portal half. */
export interface ZonePort {
  /** the destination's map stem — the same join key `ZoneExit.zone` carries */
  zone: ZoneShort
  /** the destination's display name, as `zones.ts` spells it */
  zoneName: string
  via: PortVia
  /** the spell's own name, whether cast or clicked */
  spell: string
  /** the caster level the class line states; absent on an item port, which needs none */
  level?: number
  /** the item you click, by its PAGE TITLE (not the corpus key), on an item port only */
  item?: string
  /** true when the spell takes the whole group rather than only the caster */
  group: boolean
}

/**
 * The parenthetical the client uses when a crossing is not a walk. Measured: every non-walk `to_`
 * label in the default pack carries `(boat_or_translocator)`, and no other parenthetical appears.
 *
 * THE CLIENT'S OWN HEDGE IS THE ANSWER. The label offers both words because the maps predate the
 * change; the owner settled which one Legends uses (2026-09-11): *"there are no boats, there are
 * teleport NPCs at the docks now"*. So the pattern still matches the boat spelling - that is what
 * the file says - and nothing this app draws calls it a boat.
 */
const DOCK = /\(.*(boat|translocat|ferry).*\)/i

/**
 * `to_West_Commonlands` → `West Commonlands`, and
 * `to_Erud's_Crossing_or_Freeport_(boat_or_translocator)` → `Erud's Crossing`, `Freeport`.
 *
 * THE `_or_` FORM NAMES TWO REAL DESTINATIONS, not an uncertainty - one dock, two runs - so both
 * are returned and the caller decides. Splitting on it is safe because no zone in the catalog
 * contains the word `or` as its own space-delimited token (checked against `ZONES`).
 *
 * BOTH CANDIDATES STILL HAVE TO NAME A ZONE. `Freeport` above does not - the catalog has East,
 * West and North and no plain one - so that half is dropped upstream and only Erud's Crossing
 * becomes an exit. The boat does land in East Freeport and saying so here would be a guess; the
 * raw label rides on the exit instead, so the reader still sees the client's own wording.
 */
function destinationsOf(raw: string): string[] {
  // THE BACKTICK IS THE CLIENT'S APOSTROPHE. Map labels write `Ak`Anon_Portal` and the zone
  // catalog writes `Ak'Anon`; measured, the fold rejects the backtick form outright. One
  // punctuation swap between two witnesses, not a fuzzy match - the letters have to agree.
  const words = raw.replace(/_/g, ' ').replace(/`/g, "'").replace(/\(.*\)/g, '').trim()
  return words
    .split(/\s+or\s+/i)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * A ZONE OUT OF ANY CORPUS TOKEN — the one door both travel witnesses knock on.
 *
 * They speak different dialects and neither is wrong. Map labels write DISPLAY names
 * (`to_West_Commonlands`), which `zoneEntryFor` already folds. The spell corpus writes MAP STEMS
 * (`Teleport to 478,1427,-48 in commons`), which it does not - measured, 46 of the 50 stated
 * teleport destinations fell on the floor until this existed.
 *
 * A TRAILING CLAUSE IS TRIMMED, once. The corpus carries `thurgadinb facing North`: a stem plus a
 * direction, which is a fact about where you arrive rather than about which zone. Only the first
 * token is retried, and only after the whole string has failed, so nothing that resolves whole is
 * ever re-read.
 *
 * NULL IS A REAL ANSWER and the common one for the tokens neither corpus means as a zone.
 */
export function resolveZone(raw: string): ZoneEntry | null {
  const token = raw.trim()
  if (token === '') return null
  const named = zoneEntryFor(token)
  if (named !== null) return named
  const lower = token.toLowerCase()
  const stem = ZONES.find((z) => z.short === lower)
  if (stem !== undefined) return stem
  const head = lower.split(/\s+/)[0]
  return head === lower ? null : (ZONES.find((z) => z.short === head) ?? null)
}

/** One point, as zero or more exits — zero when its label is not a crossing, or names no zone. */
function exitsOfPoint(point: MapPoint): ZoneExit[] {
  const raw = point.label.trim()
  const to = /^to[_\s]+(.+)$/i.exec(raw)
  const portal = /^(.+?)[_\s]+portal$/i.exec(raw)
  const body = to?.[1] ?? portal?.[1]
  if (body === undefined) return []
  const kind: ExitKind = portal !== null && to === null ? 'portal' : DOCK.test(raw) ? 'translocator' : 'walk'
  const out: ZoneExit[] = []
  for (const candidate of destinationsOf(body)) {
    // A label naming something the catalog does not know is DROPPED rather than guessed at: the
    // packs carry guild halls, merchants and non-classic destinations under the same shapes, and
    // inventing a zone from a label is exactly the fuzzy join law 12 refuses.
    const entry = resolveZone(candidate)
    if (entry === null) continue
    out.push({ kind, zone: entry.short, name: entry.name, label: raw })
  }
  return out
}

/**
 * EVERY EXIT THIS MAP STATES, deduped by (destination, kind) and in the map's own point order.
 *
 * Deduped because a zone line is usually labelled at BOTH ends of the seam and sometimes on two
 * layers, and a panel listing "West Commonlands" three times reads as three exits.
 */
export function zoneExits(points: readonly MapPoint[]): ZoneExit[] {
  const out: ZoneExit[] = []
  const seen = new Set<string>()
  for (const point of points) {
    for (const exit of exitsOfPoint(point)) {
      const key = `${exit.kind}|${exit.zone}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(exit)
    }
  }
  return out
}

/**
 * THE SEAMS THAT ARE THEMSELVES TRAVEL — boats and portals, out of a zone's exits.
 *
 * The owner's ask named four ways in and one of them is not a spell: *"the closest druid, wizard,
 * boat, or item port"*. In EQ Legends that crossing is a TRANSLOCATOR NPC standing at the dock
 * rather than a boat you ride (owner, 2026-09-11) - the map files still print the old word, and
 * this app does not. A WALK is not in here: every zone touches something on foot, and listing
 * those would bury the crossings that matter under the ordinary.
 *
 * READ BOTH WAYS ON PURPOSE. The map states the dock as a way OUT; a translocator at a dock takes
 * you either direction, so the surface draws these as arrivals too.
 *
 * It lives here rather than in the view because ruling 4 is exactly about this: the renderer is
 * handed collections already filtered, never a corpus to sift.
 */
export function travelSeams(exits: readonly ZoneExit[]): ZoneExit[] {
  const out: ZoneExit[] = []
  for (const exit of exits) if (exit.kind !== 'walk') out.push(exit)
  return out
}

// ---- the whole graph, and the nearest port through it ----------------------------------------
//
// Owner (2026-09-12), on a zone with no port and no ported neighbour: *"even if you can't, it
// should show the closest zone that has a port right?"*. Right. One hop was the first version's
// bound because it read only the map on screen; the answer to "closest" is a search over every
// map's labels, which main builds once (`main/zoneGraph.ts`) and this walks.

/** Every zone's stated exits, keyed by stem — what `main/zoneGraph.ts` ships once per window. */
export type ZoneGraph = ReadonlyMap<ZoneShort, readonly ZoneExit[]>

/** One zone entered on the way from a port's landing to where you are, with the seam crossed. */
export interface RouteStep {
  zone: ZoneShort
  name: string
  kind: ExitKind
}

/** A port and the walk after it. `path` empty means the port lands where you are. */
export interface PortRoute {
  port: ZonePort
  /** the zones entered after landing, in order, ending where you are */
  path: RouteStep[]
}

/** How far "closest" is allowed to look before the answer is a route rather than advice. */
export const MAX_HOPS = 4

interface Edge {
  to: ZoneShort
  name: string
  kind: ExitKind
}

/**
 * THE GRAPH READ AS UNDIRECTED, which is the physical truth and the labelling's cure.
 *
 * A zone line is two-way - you walk Befallen to Commons and back through the same seam - but only
 * 93 of the default pack's 213 maps label theirs, so the stated graph is one-way wherever the
 * neighbour's author did not. Adding the reverse of every stated edge recovers the seam from
 * whichever side labelled it. The reverse edge names its destination through the catalog, because
 * a `ZoneExit` only ever names where it GOES.
 */
function undirected(graph: ZoneGraph): Map<ZoneShort, Edge[]> {
  const adj = new Map<ZoneShort, Edge[]>()
  const push = (from: ZoneShort, edge: Edge): void => {
    const held = adj.get(from)
    if (held) held.push(edge)
    else adj.set(from, [edge])
  }
  for (const [from, exits] of graph) {
    const fromName = resolveZone(from)?.name ?? from
    for (const e of exits) {
      push(from, { to: e.zone, name: e.name, kind: e.kind })
      push(e.zone, { to: from, name: fromName, kind: e.kind })
    }
  }
  return adj
}

/** The steps from `zone` back to the search's start, read off the BFS parents. */
function pathBack(parents: ReadonlyMap<ZoneShort, Edge | null>, zone: ZoneShort): RouteStep[] {
  const out: RouteStep[] = []
  let at = zone
  for (;;) {
    const via = parents.get(at)
    if (via === null || via === undefined) return out
    out.push({ zone: via.to, name: via.name, kind: via.kind })
    at = via.to
  }
}

/** The zones reached from `start` in breadth-first order, each remembering the seam back. */
interface Walk {
  order: ZoneShort[]
  parents: Map<ZoneShort, Edge | null>
}

/**
 * Breadth-first from `start`, so the first time a zone is reached is the shortest way to it.
 *
 * `for-of` over a list that is appended to as it runs is deliberate and correct: the array
 * iterator reads the length live, which is exactly what a queue wants.
 */
function walkFrom(adj: ReadonlyMap<ZoneShort, Edge[]>, start: ZoneShort, maxHops: number): Walk {
  const parents = new Map<ZoneShort, Edge | null>([[start, null]])
  const hops = new Map<ZoneShort, number>([[start, 0]])
  const order: ZoneShort[] = [start]
  for (const zone of order) {
    const depth = hops.get(zone) ?? 0
    if (depth === maxHops) continue
    for (const edge of adj.get(zone) ?? []) {
      if (parents.has(edge.to)) continue
      // The parent edge points BACK toward start: it is the seam you cross after landing.
      parents.set(edge.to, { to: zone, name: resolveZone(zone)?.name ?? zone, kind: edge.kind })
      hops.set(edge.to, depth + 1)
      order.push(edge.to)
    }
  }
  return { order, parents }
}

/**
 * EVERY PORT WITHIN `maxHops` OF `start`, NEAREST FIRST - the whole of "closest".
 *
 * A port landing in a zone is offered with exactly the walk `walkFrom` found to it. Ties at one
 * distance go to the cheapest cast, items last. A port is offered once, through its nearest
 * landing.
 *
 * `start` is always distance zero, so a port landing where you are has an empty path - the card
 * says "lands here" and nothing about walking.
 */
export function nearestPorts(
  graph: ZoneGraph,
  ports: readonly ZonePort[],
  start: ZoneShort,
  maxHops = MAX_HOPS
): PortRoute[] {
  const { order, parents } = walkFrom(undirected(graph), start, maxHops)
  const out: PortRoute[] = []
  const seen = new Set<string>()
  for (const zone of order) {
    const here: PortRoute[] = []
    for (const port of ports) {
      const key = `${port.via}|${port.spell}|${port.item ?? ''}`
      if (port.zone !== zone || seen.has(key)) continue
      seen.add(key)
      here.push({ port, path: pathBack(parents, zone) })
    }
    here.sort((a, b) => (a.port.level ?? 99) - (b.port.level ?? 99))
    out.push(...here)
  }
  return out
}
