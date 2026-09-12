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
