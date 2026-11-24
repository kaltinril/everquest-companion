// dropObs/events.ts — the player's own loot rows as the wiki's drop-database events (schema 1 of
// `action=eozobservations`; docs/community/requirements/drop-db-submit.md). Pure: no Electron, no
// network, no clock but the one handed in. `tests/dropObsEvents.test.mts` runs it.
//
// WHAT IS SENT (the requirements file's defaults): loot only, the player's own loot only, and only
// a row whose line named the corpse it came from (`explicit-corpse`). Not sent: a destroyed item,
// Reward Chest loot, loot with no source, a player's corpse (the player's own characters and the
// group's members), a row folded before the log reached a zone line. No `characterName`, ever.
//
// IDS ARE DETERMINISTIC, so a resend after a reinstall is a duplicate on the wiki's side, never a
// second report: `eqc-` + the first 40 hex of sha256 over the row's own facts and its place among
// identical rows at the same instant (EQ stamps to the second; three bone chips off one rat are
// three rows at one ts). The batch ID is a hash of the batch's own content, so an exact retry
// reuses it and a different payload can never share it.

import { createHash } from 'node:crypto'
import type { LootEvent } from '../../shared/types'

/** One `loot` module row as the engine serves it (engine/crates/fold/src/modules/loot.rs). */
export type LootRowIn = Pick<LootEvent, 'ts' | 'item' | 'source' | 'zone' | 'count'> & { disposition?: string }

/** A schema 1 loot event, keys in the order they are sent. */
export interface ObsEvent {
  id: string
  kind: 'loot'
  observedAt: string
  server: string
  zone: string
  npc: string
  item: string
  quantity: number
  tier?: number
  instance: 'unknown'
  sourceKind: 'explicit-corpse'
}

export interface ObservationBatch {
  schemaVersion: 1
  batchId: string
  clientVersion: string
  events: ObsEvent[]
}

/** Who the rows belong to, and the names that are players rather than NPCs. */
export interface EventContext {
  server: string
  character: string
  /** Lower-cased: the player's own characters and anyone else the app knows is a player. */
  players: ReadonlySet<string>
  /** Epoch ms. A row stamped past this (plus a minute) is refused by the wiki; it is left out. */
  now: number
}

/** The wiki's limits (schema 1): names 230, server 80, quantity 1..1000, event 4096 bytes. */
export const LIMITS = { name: 230, server: 80, maxQuantity: 1000, eventBytes: 4096, events: 100, bytes: 262_144 } as const

/** How far ahead of `now` a stamp may be (the wiki refuses more than five minutes ahead). */
const FUTURE_SLACK_MS = 60_000

const REWARD_CHEST = 'reward chest'

/** `Shin Greaves +2` → 2; `Shin Greaves +3 (Exaltation)` → 3; anything else → null. Tiers run 0..10. */
export function itemTier(item: string): number | null {
  const m = /^(.+?)\s*\+(10|[0-9])(?:\s*\(Exaltation\))?$/i.exec(item.trim())
  return m !== null && m[1].trim() !== '' ? Number(m[2]) : null
}

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** Control characters out, runs of space folded: what the wiki normalizes to anyway. */
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed here.
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The corpse the row names, or null when the row is not one this feature sends. */
function corpseOf(row: LootRowIn, players: ReadonlySet<string>): string | null {
  if (row.disposition === 'destroyed') return null
  const source = clean(row.source ?? '')
  if (source === '' || source.toLowerCase() === REWARD_CHEST) return null
  if (/ from Reward Chest$/i.test(row.item)) return null
  if (players.has(source.toLowerCase())) return null
  return source
}

function quantityOf(row: LootRowIn): number | null {
  const n = row.count ?? 1
  return Number.isInteger(n) && n >= 1 && n <= LIMITS.maxQuantity ? n : null
}

/** The row's event, or null when it is not sent. `occurrence`: identical rows before it at its ts. */
export function obsEvent(row: LootRowIn, ctx: EventContext, occurrence: number): ObsEvent | null {
  const npc = corpseOf(row, ctx.players)
  const zone = clean(row.zone ?? '')
  const item = clean(row.item)
  const quantity = quantityOf(row)
  const server = clean(ctx.server)
  if (npc === null || zone === '' || item === '' || quantity === null || server === '') return null
  if (!Number.isFinite(row.ts) || row.ts <= 0 || row.ts > ctx.now + FUTURE_SLACK_MS) return null
  if ([npc, zone, item].some((s) => s.length > LIMITS.name) || server.length > LIMITS.server) return null
  const key = JSON.stringify([server, ctx.character, row.ts, item, npc, quantity, occurrence])
  const tier = itemTier(item)
  return {
    id: `eqc-${sha(key).slice(0, 40)}`,
    kind: 'loot',
    observedAt: new Date(row.ts).toISOString(),
    server,
    zone,
    npc,
    item,
    quantity,
    // Omitted, never null, when the name carries no tier (the spec: a default null changes hashes).
    ...(tier !== null ? { tier } : {}),
    instance: 'unknown',
    sourceKind: 'explicit-corpse'
  }
}

/** Every sendable event in the rows, newest first (ties by id). */
export function obsEvents(rows: readonly LootRowIn[], ctx: EventContext): ObsEvent[] {
  const seen = new Map<string, number>()
  const out: ObsEvent[] = []
  for (const row of rows) {
    const same = JSON.stringify([row.ts, row.item, row.source ?? '', row.count ?? 1])
    const occurrence = seen.get(same) ?? 0
    seen.set(same, occurrence + 1)
    const event = obsEvent(row, ctx, occurrence)
    if (event !== null) out.push(event)
  }
  return out.sort((a, b) => (a.observedAt === b.observedAt ? (a.id < b.id ? -1 : 1) : a.observedAt < b.observedAt ? 1 : -1))
}

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8')

/** The batch ID: the hash of everything else in the batch. */
export function batchIdFor(clientVersion: string, events: readonly ObsEvent[]): string {
  return `eqcb-${sha(JSON.stringify([1, clientVersion, events])).slice(0, 40)}`
}

export interface BatchLimits {
  events: number
  bytes: number
  eventBytes: number
}

/** The next batch from `ready` (already newest first), within the limits; null when nothing fits. */
export function nextBatch(ready: readonly ObsEvent[], clientVersion: string, limits: BatchLimits): ObservationBatch | null {
  const maxEvents = Math.min(LIMITS.events, Math.max(1, limits.events))
  const maxBytes = Math.min(LIMITS.bytes, limits.bytes)
  // The envelope with a placeholder ID of the real ID's length, so the byte count is exact.
  let bytes = bytesOf({ schemaVersion: 1, batchId: 'x'.repeat(45), clientVersion, events: [] })
  const events: ObsEvent[] = []
  for (const event of ready) {
    if (events.length >= maxEvents) break
    const size = bytesOf(event)
    if (size > Math.min(LIMITS.eventBytes, limits.eventBytes)) continue
    if (bytes + size + 1 > maxBytes) break
    events.push(event)
    bytes += size + 1
  }
  if (events.length === 0) return null
  return { schemaVersion: 1, batchId: batchIdFor(clientVersion, events), clientVersion, events }
}
