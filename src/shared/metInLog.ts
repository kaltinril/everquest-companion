// metInLog.ts — WHAT THE PLAYER'S OWN LOG SHOWS THEY MET (owner ruling, 2026-10-17: the log
// outranks an era banner, "I've seen it drop so it can't be out of era"). One blanket rule, no
// per-name list: a mob killed, conned or looted from, an item looted, a zone entered is in era for
// this player whatever a wiki banner says. The wiki rules still decide everything the log has not
// met. Filled at runtime from the engine's own modules (renderer `lib/useMetInLog`); empty until
// then and in tests unless a test fills it, so without evidence every verdict is the wiki's.
//
// Module state rather than a React context because the era predicates are pure shared functions
// that many surfaces call; `metVersion()` moves on every real change, so a memo or a cache over an
// era verdict that includes it recomputes. Pure, relative imports: the node test runner loads it.
//
// TWO VERSIONS (whole-app review 2026-11-06, #19). `metVersion()` moved on every newly met name,
// and the era caches keyed on it (Plan's folds, pool and route, Slayer's plan) recomputed on the
// first kill of any trash mob, though no verdict could read it. `eraVersion()` moves only when a
// key that arrived or left is one a mob or zone verdict has asked `wasMet` about: every verdict
// reads the evidence through `wasMet` alone, so a key never asked about cannot be in any cached
// answer, and one asked about is in the read set from that first ask on. Items are left out of it
// on purpose: an item verdict (plannerData's `donorEra`) keys on `metVersion()`, and the Gear tab
// asks about thousands of items, so counting them would move it on nearly every loot line.

import { gapMobKey as mobKey } from './gapMemo'
import { zoneKey } from './zones'

export type MetKind = 'mobs' | 'items' | 'zones'

const met: Record<MetKind, Set<string>> = { mobs: new Set(), items: new Set(), zones: new Set() }
/** Each kind's last fed names, raw to key (`keyOf` is pure): a re-feed keys only the new names, and
 *  the map holds no more than the last feed's names. */
const keyed: Record<MetKind, Map<string, string>> = { mobs: new Map(), items: new Map(), zones: new Map() }
/** The mob and zone keys a verdict has asked about (header): bounded by the catalog's names. */
const asked: Record<MetKind, Set<string>> = { mobs: new Set(), items: new Set(), zones: new Set() }
const ERA_KINDS: ReadonlySet<MetKind> = new Set<MetKind>(['mobs', 'zones'])
let version = 0
let eraEvidence = 0

/** Each kind joined its own way: a mob by `mobKey`, a zone by `zoneKey` (every tier is the place),
 *  an item lowercased with its ` +N` tier dropped (the item database's own key). */
function keyOf(kind: MetKind, name: string): string {
  if (kind === 'mobs') return mobKey(name)
  if (kind === 'zones') return zoneKey(name)
  return name.replace(/\s\+\d+$/, '').trim().toLowerCase()
}

/** Replace one kind's evidence; the version moves only when the set really changed. */
export function setMet(kind: MetKind, names: Iterable<string>): void {
  const next = new Set<string>()
  const was = keyed[kind]
  const now = new Map<string, string>()
  for (const n of names) {
    let k = now.get(n)
    if (k === undefined) {
      k = was.get(n) ?? keyOf(kind, n)
      now.set(n, k)
    }
    if (k) next.add(k)
  }
  keyed[kind] = now
  const cur = met[kind]
  if (next.size === cur.size && [...next].every((k) => cur.has(k))) return
  if (ERA_KINDS.has(kind) && readKeyMoved(asked[kind], cur, next)) eraEvidence++
  met[kind] = next
  version++
}

/** Whether a key that arrived or left is one a verdict has asked about. */
function readKeyMoved(read: ReadonlySet<string>, cur: ReadonlySet<string>, next: ReadonlySet<string>): boolean {
  if (read.size === 0) return false
  for (const k of next) if (!cur.has(k) && read.has(k)) return true
  for (const k of cur) if (!next.has(k) && read.has(k)) return true
  return false
}

/** Did the player's log meet this name? A mob or zone asked about joins the era read set (header). */
export function wasMet(kind: MetKind, name: string): boolean {
  const key = keyOf(kind, name)
  if (ERA_KINDS.has(kind)) asked[kind].add(key)
  return met[kind].has(key)
}

/** Moves whenever the evidence changes: key a memo over an item verdict, or over the raw evidence, by it. */
export function metVersion(): number {
  return version
}

/**
 * Moves only when a mob or zone key some verdict has read arrives or leaves (header): the key for
 * every cache over mob and zone era verdicts (`planner/eraCache.ts`, Plan's corpora and pool,
 * Slayer's `PlanOptions.met`). A first kill of a name no verdict ever asked about leaves it still.
 */
export function eraVersion(): number {
  return eraEvidence
}
