// shared/respawnTiers.ts — the Respawn overlay's view across the PLACES of one zone: the open
// pickzone tiers (+0 … +4), your private instance, a dungeon crawl. Tracking is by mob and a clock
// is per place, so the overlay answers "where is it up?" from wherever you stand (owner,
// 2026-11-03: "Tracking is at the MOB level. Timers for when it respawns is shown per
// level/instance/raid"; "know which instance to jump to without having to GO to the instance").
//
// WHAT A PLACE IS. The fold keys a clock by the zone line it stood in, plus the `[instance N]` tag
// respawn.rs gives a private instance's stay (its zone line is the open world's). Two axes (owner,
// 2026-11-03): open (anyone can join) against inst (yours), and the difficulty +0 … +4 on either.
// A `- Solo` / `- Group` zone line is a dungeon crawl, where nothing respawns, so its clocks are
// never shown. The instance number is never shown either: you hold one at a time.
//
// THE WINDOW. Another place's clock is shown while the kill is within twice the mob's respawn
// (owner, 2026-11-03; no estimate: RESPAWN_LINGER_MS). The place you stand in always shows its
// clock, stale or not, as the overlay always has. A mob is listed when it has a clock anywhere in
// the zone; in a fresh private instance, one with no kill there yet is simply UP (owner: "in an
// instance, every mob is up at spawn time").
//
// Pure, like respawn.ts; tests/respawnTiers.test.mts.

import {
  RESPAWN_LINGER_MS,
  orderRespawnRows,
  respawnReading,
  respawnZoneKey,
  type RespawnRow,
  type RespawnSnap
} from './respawn'
import type { RespawnOverlaySort } from './respawnOverlayConfig'
import { zoneKey } from './zones'

export type RespawnPlaceKind = 'open' | 'inst' | 'crawl'

export interface RespawnPlace {
  kind: RespawnPlaceKind
  tier: number
  /** `open +3`, `inst +4`, `crawl +4`: the short label a column or a line wears. */
  tag: string
}

const INSTANCE_TAG_RE = /\s*\[instance \d+\]\s*$/i
const CRAWL_RE = /\s-\s*(?:Solo|Group)\b/i
const TIER_ORDINAL_RE = /\s(\d+)\s*\([^)]*\)\s*$/
const TIER_ADJECTIVE_RE = /\s\((Awakened|Adaptive|Fused|Refined)\)\s*$/i
const ADJECTIVE_TIER: Readonly<Record<string, number>> = { awakened: 1, adaptive: 2, fused: 3, refined: 4 }

/** The place a zone line names; null for the empty zone (before any zone line). */
export function respawnPlaceOf(zone: string): RespawnPlace | null {
  const raw = zone.trim()
  if (raw === '') return null
  const inst = INSTANCE_TAG_RE.test(raw)
  const bare = raw.replace(INSTANCE_TAG_RE, '')
  const kind: RespawnPlaceKind = CRAWL_RE.test(bare) ? 'crawl' : inst ? 'inst' : 'open'
  const ordinal = TIER_ORDINAL_RE.exec(bare)
  const adjective = TIER_ADJECTIVE_RE.exec(bare)
  const tier = ordinal ? Number(ordinal[1] ?? '0') : adjective ? (ADJECTIVE_TIER[(adjective[1] ?? '').toLowerCase()] ?? 0) : 0
  return { kind, tier, tag: `${kind} +${String(tier)}` }
}

const KIND_ORDER: Readonly<Record<RespawnPlaceKind, number>> = { open: 0, inst: 1, crawl: 2 }

/** Open tiers first, then the private instance, each by difficulty: the grid's column order. */
export function comparePlaces(a: RespawnPlace, b: RespawnPlace): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.tier - b.tier
}

/** Still worth showing from another place: killed within twice the respawn, or the linger window with no estimate. */
export function respawnWithinWindow(row: RespawnRow, nowMs: number): boolean {
  const windowMs = row.estimateMs === undefined ? RESPAWN_LINGER_MS : 2 * row.estimateMs
  return nowMs - row.baseTs <= windowMs
}

/**
 * What the place you stand in says about a mob: its clock, UP with no clock (a fresh private
 * instance), no kill here yet (the open world), or nothing respawns here (a dungeon crawl).
 */
export type RespawnHereState = 'clock' | 'up' | 'none' | 'noRespawn'

export interface RespawnTierEntry {
  place: RespawnPlace
  row: RespawnRow
  /** The place you stand in. */
  here: boolean
}

export interface RespawnTierGroup {
  key: string
  display: string
  hereState: RespawnHereState
  /** This mob's clocks across the zone's places, soonest up first (`orderRespawnRows`), here included. */
  entries: RespawnTierEntry[]
}

export interface RespawnTierView {
  /** Where you stand; null before any zone line. */
  here: RespawnPlace | null
  /** The grid's columns: where you stand, then every place a listed clock is in, in place order. */
  places: RespawnPlace[]
  groups: RespawnTierGroup[]
  /** How many mobs the watch list holds, for the empty state. */
  tracked: number
  /** Clocks the fold holds for other zones, for the empty state. */
  elsewhere: number
}

type Snap = Pick<RespawnSnap, 'rows' | 'zone' | 'prefs'>

/** Where you stand, as `groupOf` needs it: the place and the exact zone key. */
interface Standing {
  here: RespawnPlace | null
  hereKey: string
}

function groupOf(watch: { key: string; display: string }, rows: readonly RespawnRow[], at: Standing, nowMs: number): RespawnTierGroup {
  const { here, hereKey } = at
  const hereRow = here?.kind === 'crawl' ? undefined : rows.find((r) => respawnZoneKey(r.zone) === hereKey)
  const others = rows.filter(
    (r) => r !== hereRow && respawnPlaceOf(r.zone)?.kind !== 'crawl' && respawnWithinWindow(r, nowMs)
  )
  const ordered = orderRespawnRows(hereRow === undefined ? others : [hereRow, ...others], nowMs)
  const entries = ordered.flatMap((row): RespawnTierEntry[] => {
    const place = respawnPlaceOf(row.zone)
    return place === null ? [] : [{ place, row, here: row === hereRow }]
  })
  const hereState: RespawnHereState =
    hereRow !== undefined ? 'clock' : here?.kind === 'crawl' ? 'noRespawn' : here?.kind === 'inst' ? 'up' : 'none'
  return { key: watch.key, display: watch.display, hereState, entries }
}

/** Each row's place in `orderRespawnRows`' order, by id. */
function rankOf(rows: readonly RespawnRow[], nowMs: number): ReadonlyMap<string, number> {
  const out = new Map<string, number>()
  orderRespawnRows(rows, nowMs).forEach((r, i) => out.set(r.id, i))
  return out
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return a.length - b.length
}

/**
 * `here`: the mobs UP in a fresh instance, then the clocks where you stand soonest first, then the
 * rest by their soonest place. `soon`: UP here, then every mob by its soonest place (layout D).
 * Watch order breaks ties, so the list never shuffles under a re-render.
 */
function sortGroups(groups: readonly RespawnTierGroup[], sort: RespawnOverlaySort, nowMs: number): RespawnTierGroup[] {
  const leadOf = (g: RespawnTierGroup): RespawnRow | undefined => g.entries[0]?.row
  const hereOf = (g: RespawnTierGroup): RespawnRow | undefined => g.entries.find((e) => e.here)?.row
  const present = (row: RespawnRow | undefined): RespawnRow[] => (row === undefined ? [] : [row])
  const leadRank = rankOf(groups.flatMap((g) => present(leadOf(g))), nowMs)
  const hereRank = rankOf(groups.flatMap((g) => present(hereOf(g))), nowMs)
  const keyOf = (g: RespawnTierGroup, i: number): number[] => {
    const up = g.hereState === 'up' ? 0 : 1
    const lead = leadOf(g)
    const leadIx = lead === undefined ? Number.MAX_SAFE_INTEGER : (leadRank.get(lead.id) ?? 0)
    if (sort === 'soon') return [up, leadIx, i]
    const hereRow = hereOf(g)
    if (hereRow !== undefined) return [1, hereRank.get(hereRow.id) ?? 0, i]
    return [up === 0 ? 0 : 2, leadIx, i]
  }
  return groups
    .map((g, i) => ({ g, k: keyOf(g, i) }))
    .sort((a, b) => compareKeys(a.k, b.k))
    .map((x) => x.g)
}

/** The overlay's whole view at `nowMs`: one group per tracked mob with a clock in this zone. */
export function respawnTierView(snap: Snap, nowMs: number, sort: RespawnOverlaySort): RespawnTierView {
  const here = respawnPlaceOf(snap.zone)
  const base = zoneKey(snap.zone)
  const hereKey = respawnZoneKey(snap.zone)
  const inZone = base === '' ? [] : snap.rows.filter((r) => zoneKey(r.zone) === base)
  const byMob = new Map<string, RespawnRow[]>()
  for (const r of inZone) {
    const list = byMob.get(r.key) ?? []
    list.push(r)
    byMob.set(r.key, list)
  }
  const at: Standing = { here, hereKey }
  const groups = snap.prefs.watches.flatMap((w): RespawnTierGroup[] => {
    const rows = byMob.get(w.key)
    return rows === undefined ? [] : [groupOf(w, rows, at, nowMs)]
  })
  const places = new Map<string, RespawnPlace>()
  if (here !== null) places.set(here.tag, here)
  for (const g of groups) for (const e of g.entries) places.set(e.place.tag, e.place)
  return {
    here,
    places: [...places.values()].sort(comparePlaces),
    groups: sortGroups(groups, sort, nowMs),
    tracked: snap.prefs.watches.length,
    elsewhere: snap.rows.length - inZone.length
  }
}

export interface RespawnRowPlan {
  /** The entry the big clock shows; null when the headline is a state (UP, no kill here, no respawn). */
  head: RespawnTierEntry | null
  /** What the headline says when it is not a clock. */
  state: RespawnHereState
  /** The places under it, soonest first. */
  rest: RespawnTierEntry[]
}

/**
 * One row of the rows layout. `here`: the clock where you stand leads, the other places follow.
 * `soon`: the soonest place leads, wherever it is (layout D); a mob UP in a fresh private instance
 * is up HERE, which is the soonest there is.
 */
export function respawnRowPlan(group: RespawnTierGroup, sort: RespawnOverlaySort): RespawnRowPlan {
  if (sort === 'here' || group.hereState === 'up') {
    const head = group.entries.find((e) => e.here) ?? null
    return { head, state: group.hereState, rest: group.entries.filter((e) => !e.here) }
  }
  const head = group.entries[0] ?? null
  return { head, state: head === null ? group.hereState : 'clock', rest: group.entries.slice(1) }
}

/** The grid's cell for one mob in one place, when it has a clock there. */
export function respawnCellOf(group: RespawnTierGroup, place: RespawnPlace): RespawnTierEntry | undefined {
  return group.entries.find((e) => e.place.tag === place.tag)
}

/** The grid's columns after folding: where you stand always; the others unless folded or hidden one by one. */
export function respawnVisiblePlaces(view: RespawnTierView, folded: boolean, hidden: ReadonlySet<string>): RespawnPlace[] {
  return view.places.filter((p) => p.tag === view.here?.tag || (!folded && !hidden.has(p.tag)))
}

/** The title bar's zone: the zone line, and ` · inst` in a private instance; never the instance number. */
export function respawnZoneTitle(zone: string): string {
  const place = respawnPlaceOf(zone)
  if (place === null) return 'Respawn'
  const bare = zone.trim().replace(INSTANCE_TAG_RE, '')
  return place.kind === 'inst' ? `${bare} · inst` : bare
}

/** The empty state's sentence: what is tracked and where the clocks are, never "nothing running" while something is watched. */
export function respawnTierEmptyText(view: RespawnTierView, zone: string): string {
  if (view.tracked === 0) return 'No clocks running - watch a mob on the Timers tab.'
  const where = zone.length > 0 ? zone.replace(INSTANCE_TAG_RE, '') : 'this zone'
  const mobs = `Tracking ${String(view.tracked)} ${view.tracked === 1 ? 'mob' : 'mobs'}, none killed in ${where} yet`
  return view.elsewhere > 0 ? `${mobs} - ${String(view.elsewhere)} running elsewhere.` : `${mobs}.`
}

function clockMmSs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`
}

/**
 * A grid cell's clock, short: `UP` (the log named it), `up 3m` (the estimate elapsed), `m:ss`
 * (running), `await` (no estimate), `long due` (stale). The same facts `respawnClockLabel` spells.
 */
export function respawnCellLabel(row: RespawnRow, nowMs: number): string {
  const r = respawnReading(row, nowMs)
  if (r.seen) return 'UP'
  if (r.stale) return row.estimateMs === undefined ? 'await' : 'long due'
  if (r.due) return `up ${String(Math.max(1, Math.round(r.overdueMs / 60_000)))}m`
  if (row.estimateMs === undefined) return 'await'
  return clockMmSs(r.remainingMs ?? 0)
}
