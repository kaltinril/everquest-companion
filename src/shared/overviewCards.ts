// overviewCards.ts — the four Overview widgets of Phase 1's first batch, as pure selectors.
//
// Plan: docs/community/plans/2026-11-27-overview-widgets.md, quick wins 1, 2, 5 and 9. Each one
// reads data that already runs and calls the arithmetic its home surface calls, so a number on the
// Overview cannot disagree with the same number on its tab:
//   Buffs running out  `buildTimerRows` → the buffs surface → the allow-list (the Buffs overlay's)
//   Respawns here      the `respawn` module, `orderRespawnRows`, `respawnClockLabel` (Timers' words)
//   Motes              `potentialRates` over the session slice (the XP overlay's mote rows)
//   Coin               `rangeStats` coin over the session slice, sales credited (the XP overlay's)
//
// No React, no clock read: the caller hands in `nowMs`. VALUE imports are relative, so the node
// test runner reads this file as it is (tests/overviewCards.test.mts).

import type { BuffsSnap } from './buffTypes'
import { buildTimerRows, filterAllowedRows, rowsForSurface, timerReading, type BuffTimersSnap } from './buffTimers'
import type { BuffAllowPrefs } from './buffAllow'
import { orderRespawnRows, respawnClockLabel, respawnInZone, respawnReading, type RespawnSnap } from './respawn'
import type { ProgressionSnap } from './progressionTypes'
import type { LootEvent } from './types'
import { resolveSlice, type RecordBounds, type Timeslice } from './timeslice'
import { rangeStats } from './progressionStats'
import { basisRead, pickRate, type RateBasis } from './rateBasis'
import { potentialRates } from './xpOverlay'
import { attributeSales } from './coinAttribution'

/** How many rows a glance card lists. Its tab holds the rest. */
export const OVERVIEW_CARD_ROWS = 5

// ─── Buffs running out ─────────────────────────────────────────────────────────────────────

export interface BuffEndingRow {
  id: string
  name: string
  /** Who it is on, for a buff on your pet or a group-mate; absent for your own. */
  target?: string
  remainingMs: number
  /** Past its stated end, and the log has not cleared it yet. */
  overdue: boolean
}

/**
 * The buffs ending soonest, soonest first: the rows the Buffs overlay would draw (its surface,
 * its allow-list), keeping only those with a stated duration, since only a countdown runs out.
 */
export function buffsRunningOut(
  model: { buffs: BuffsSnap; timers: BuffTimersSnap; allow: BuffAllowPrefs },
  nowMs: number,
  limit = OVERVIEW_CARD_ROWS
): BuffEndingRow[] {
  const rows = filterAllowedRows(rowsForSurface(buildTimerRows(model.buffs, model.timers), 'buffs'), model.allow)
  const out: BuffEndingRow[] = []
  for (const row of rows) {
    if (row.mode !== 'countdown') continue
    const r = timerReading(row, nowMs)
    if (r.remainingMs === undefined) continue
    out.push({
      id: row.id,
      name: row.name,
      ...(row.group === 'target' && row.target !== undefined ? { target: row.target } : {}),
      remainingMs: r.remainingMs,
      overdue: r.overdue
    })
  }
  return out.sort((a, b) => a.remainingMs - b.remainingMs || a.name.localeCompare(b.name)).slice(0, limit)
}

// ─── Respawns here ─────────────────────────────────────────────────────────────────────────

export interface RespawnHereRow {
  id: string
  display: string
  /** The Timers tab's own clock words: `UP`, `due 2m 05s ago`, `4m 10s`, `+3m 00s`. */
  label: string
  /** The log named the mob since its clock started. */
  seen: boolean
  /** The estimate has run out. */
  due: boolean
}

export interface RespawnsHere {
  zone: string
  rows: RespawnHereRow[]
  /** How many mobs the watch list holds, for the empty state. */
  tracked: number
}

/**
 * The watched mobs with a live clock where you stand, in the Timers tab's order (seen first, then
 * soonest due). A clock that went stale long ago is left to the tab: a glance is about now.
 */
export function respawnsHere(
  snap: RespawnSnap,
  nowMs: number,
  fmt: (ms: number | null | undefined) => string,
  limit = OVERVIEW_CARD_ROWS
): RespawnsHere {
  const live = respawnInZone(snap.rows, snap.zone).filter((r) => !respawnReading(r, nowMs).stale)
  const rows = orderRespawnRows(live, nowMs)
    .slice(0, limit)
    .map((row) => {
      const r = respawnReading(row, nowMs)
      return { id: row.id, display: row.display, label: respawnClockLabel(row, nowMs, fmt), seen: r.seen, due: r.due }
    })
  return { zone: snap.zone, rows, tracked: snap.prefs.watches.length }
}

// ─── Motes and coin: this session, and this zone this session ──────────────────────────────

export interface SessionArgs {
  prog: ProgressionSnap
  /** Every loot event of this character, oldest first (the `loot` module). */
  loot: readonly LootEvent[]
  /** Where the record starts and ends (`dataBounds`); null when nothing has a timestamp. */
  bounds: RecordBounds | null
  /** Which hour the rates divide by: the one the Leveling tab and the XP overlay use. */
  basis: RateBasis
}

/** The two slices both cards read: the session, and the session in the zone you are in. */
function sessionSlices(args: SessionArgs): { session: Timeslice; zone: Timeslice | null } {
  const session = resolveSlice({ snap: args.prog, bounds: args.bounds, id: 'session' })
  const zone = resolveSlice({ snap: args.prog, bounds: args.bounds, id: 'zoneSession' })
  return { session, zone: zone.zoneKey === null ? null : zone }
}

function statsOf(prog: ProgressionSnap, slice: Timeslice): ReturnType<typeof rangeStats> {
  return rangeStats({ snap: prog, range: slice.range, zoneKey: slice.zoneKey, zoneExactKey: slice.zoneExactKey })
}

export interface MoteTierRow {
  tier: string
  /** The full item name, for the hover. */
  item: string
  drops: number
}

/** A count and its rate. `perHour` is null when the stretch is too short to rate. */
export interface CountRate {
  count: number
  perHour: number | null
}

export interface MotesCard {
  session: CountRate
  /** By tier, most looted first (the loot ledger's own order; nothing here ranks tiers). */
  tiers: MoteTierRow[]
  /** This zone this session; null before the log names a zone. */
  zone: (CountRate & { name: string }) | null
}

function moteCount(args: SessionArgs, slice: Timeslice): { rate: CountRate; tiers: MoteTierRow[] } {
  const stats = statsOf(args.prog, slice)
  const { motes } = potentialRates({
    events: args.loot,
    t0: slice.range.t0,
    t1: slice.range.t1,
    spans: stats,
    zoneKey: slice.zoneKey,
    zoneExactKey: slice.zoneExactKey
  })
  const count = motes.reduce((n, m) => n + m.drops, 0)
  const read = basisRead(args.basis, stats)
  const hours = read.ms / 3_600_000
  const perHour = read.measurable && hours > 0 ? count / hours : null
  return { rate: { count, perHour }, tiers: motes.map((m) => ({ tier: m.tier, item: m.item, drops: m.drops })) }
}

/** Motes looted this session, by tier and per hour, and how many of them in this zone. */
export function motesCard(args: SessionArgs): MotesCard {
  const { session, zone } = sessionSlices(args)
  const all = moteCount(args, session)
  const here = zone === null ? null : moteCount(args, zone)
  return {
    session: all.rate,
    tiers: all.tiers,
    zone: here === null || zone === null ? null : { ...here.rate, name: zone.zoneName ?? '' }
  }
}

export interface CoinCard {
  /** Copper received this session, merchant sales credited to where their items dropped. */
  session: CountRate
  zone: (CountRate & { name: string }) | null
}

function coinOf(prog: ProgressionSnap, slice: Timeslice, basis: RateBasis): CountRate {
  const stats = statsOf(prog, slice)
  const read = basisRead(basis, stats)
  return { count: stats.coinCopper, perHour: pickRate(read, stats.coinPerHourActive, stats.coinPerHourWall) }
}

/** Coin this session (copper) and per hour, and the same for this zone this session. */
export function coinCard(args: SessionArgs): CoinCard {
  const credited = attributeSales(args.prog, args.loot)
  const { session, zone } = sessionSlices({ ...args, prog: credited })
  return {
    session: coinOf(credited, session, args.basis),
    zone: zone === null ? null : { ...coinOf(credited, zone, args.basis), name: zone.zoneName ?? '' }
  }
}
