// shared/logArchive/mergeRespawn.ts — the `respawn` module across an archive and the live log
// (step 4.4).
//
// WHAT THE SNAPSHOT HOLDS. The fold (`respawn.rs`) keeps a history of up to 800 mobs, but publishes
// only two views of it: a clock row for each WATCHED mob (at most `RESPAWN_MAX_ROWS`), carrying its
// learned gaps, and the `RESPAWN_MAX_RECENT` most recently killed mobs as watch candidates. A
// segment holds those views, so the learned gaps an archive can give back are the gaps of mobs that
// were watched when it was captured. The 800 cap cannot bind on what is published.
//
// WHAT IS LEARNED, AND JOINED: per mob and zone, kills and samples add, the observed bound takes the
// smaller, and the gaps join newest first under the engine's own cap of six. The agreed gap is
// re-read over both logs' learned gaps (`withAgreed`, fork #8). The estimate is then re-read through
// the same ladder (`resolveRespawn`). A candidate's kills add and its last kill takes the later.
// A mob today's list marks "several mobs share this name" has each side's row read over the
// ten-minute floor before the join (`aboveFloor`), since an archived row was numbered without it.
//
// WHAT BELONGS TO THE PRESENT, AND IS NOT: the zone, the watch list and every custom number come
// from the live state only. An archived clock row is shown only for a mob the live watch list still
// watches, numbered with today's custom value. A gap that spans the cut (the last death in the
// archive to the first in the live log) is not recovered: neither side measured it.
//
// UNWATCHED MOBS (step 4.14). A segment captured since step 4.14 also keeps `respawnHistory`, the
// learned rows of every mob the fold remembered, read by watching them in batches
// (`main/logArchive/respawnHistory.ts`). `withHistoryRows` puts the rows of the mobs the live list
// watches today into an archived state, and gives it today's watch list, before the fold: so a mob
// first watched after its log was archived still gets the gaps learned there, and a fold over
// several archives filters by today's list rather than by each archive's own.
//
// THE ZONE ACROSS THE CUT (step 3.8). Before its first zone line the fold stands in zone '', so a
// fresh log's header is blank and its deaths are filed under ''. Read as one log, it stood in the
// zone the archive ended in, so the merge files those rows and candidates there (joining one the
// live side already holds for that zone), and a blank live header shows the archive's zone. Only ''
// moves: the fold never files a death under '' once it has read a zone line.

import {
  RESPAWN_MAX_GAPS,
  RESPAWN_MAX_RECENT,
  RESPAWN_MAX_ROWS,
  RESPAWN_SHARED_NAME_FLOOR_MS,
  resolveRespawn,
  respawnZoneKey,
  type RespawnCandidate,
  type RespawnRow,
  type RespawnSnap
} from '../respawn'
import { agreedGap, learnedOf as learnedEvidence, type LearnedEvidence } from '../respawnLearn'
import { zoneBaseName } from '../zones'
import { carriedValue } from './carryOver'

function isRespawnSnap(x: unknown): x is RespawnSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return typeof s.v === 'number' && Array.isArray(s.rows) && Array.isArray(s.recent)
}

function watchesOf(snap: RespawnSnap): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>()
  const watches = Array.isArray(snap.prefs?.watches) ? snap.prefs.watches : []
  for (const w of watches) out.set(w.key, typeof w.customSec === 'number' ? w.customSec * 1000 : undefined)
  return out
}

/** The estimate ladder over a row's (re)joined evidence. */
function withEstimate(row: RespawnRow): RespawnRow {
  const { estimateMs, source } = resolveRespawn(row)
  const out: RespawnRow = { ...row, source }
  if (estimateMs === undefined) delete out.estimateMs
  else out.estimateMs = estimateMs
  return out
}

function joinRow(older: RespawnRow, newer: RespawnRow): RespawnRow {
  const out: RespawnRow = { ...newer, kills: older.kills + newer.kills, samples: older.samples + newer.samples }
  const bounds = [older.observedMs, newer.observedMs].filter((n): n is number => typeof n === 'number')
  if (bounds.length > 0) out.observedMs = Math.min(...bounds)
  // The agreed gap of either side lowers the wiki floor: the smaller one, as for the bound.
  if (older.agreedMs !== undefined) out.agreedMs = Math.min(older.agreedMs, newer.agreedMs ?? older.agreedMs)
  const gaps = [...(newer.gapsMs ?? []), ...(older.gapsMs ?? [])].slice(0, RESPAWN_MAX_GAPS)
  if (gaps.length > 0) out.gapsMs = gaps
  return withEstimate(out)
}

/** An archived row for a mob the live list still watches, numbered with today's custom value. */
function archivedRow(row: RespawnRow, customMs: number | undefined): RespawnRow {
  const out: RespawnRow = { ...row }
  if (customMs === undefined) delete out.customMs
  else out.customMs = customMs
  return withEstimate(out)
}

function mergeRows(older: RespawnSnap, newer: RespawnSnap): RespawnRow[] {
  const olderById = new Map(older.rows.map((r) => [r.id, r]))
  const newerIds = new Set(newer.rows.map((r) => r.id))
  const watches = watchesOf(newer)
  const rows = newer.rows.map((r) => {
    const prev = olderById.get(r.id)
    return prev === undefined ? { ...r } : joinRow(prev, r)
  })
  const archivedOnly = older.rows
    .filter((r) => !newerIds.has(r.id) && watches.has(r.key))
    .sort((a, b) => b.baseTs - a.baseTs)
    .map((r) => archivedRow(r, watches.get(r.key)))
  return [...rows, ...archivedOnly].slice(0, RESPAWN_MAX_ROWS)
}

const candidateId = (c: RespawnCandidate): string => `${respawnZoneKey(c.zone)}::${c.key}`

function mergeRecent(older: RespawnSnap, newer: RespawnSnap): RespawnCandidate[] {
  const watches = watchesOf(newer)
  const byId = new Map<string, RespawnCandidate>()
  for (const c of newer.recent) byId.set(candidateId(c), { ...c })
  for (const c of older.recent) {
    const prev = byId.get(candidateId(c))
    if (prev === undefined) {
      byId.set(candidateId(c), { ...c, watched: watches.has(c.key) })
      continue
    }
    prev.kills += c.kills
    prev.lastTs = Math.max(prev.lastTs, c.lastTs)
  }
  // Stable, so ties keep the fold's own order: the live log's first, then the archive's.
  return [...byId.values()].sort((a, b) => b.lastTs - a.lastTs).slice(0, RESPAWN_MAX_RECENT)
}

/** `newer` with what it filed under zone '' moved to `zone`, the zone the older side ended in. */
function carryZone(newer: RespawnSnap, zone: string): RespawnSnap {
  if (zone === '') return newer
  const rows = new Map<string, RespawnRow>()
  for (const r of newer.rows) {
    const before = r.zone === ''
    const row = before ? { ...r, zone, id: `${respawnZoneKey(zone)}::${r.key}` } : r
    const prev = rows.get(row.id)
    rows.set(row.id, prev === undefined ? row : before ? joinRow(row, prev) : joinRow(prev, row))
  }
  const recent = new Map<string, RespawnCandidate>()
  for (const c of newer.recent) {
    const cand = c.zone === '' ? { ...c, zone } : c
    const prev = recent.get(candidateId(cand))
    const joined = prev === undefined ? cand : { ...prev, kills: prev.kills + cand.kills, lastTs: Math.max(prev.lastTs, cand.lastTs) }
    recent.set(candidateId(cand), joined)
  }
  return { ...newer, zone: carriedValue(zone, newer.zone), rows: [...rows.values()], recent: [...recent.values()] }
}

/** `older` then `newer`, or null when either is not a respawn snapshot of the same shape version. */
export function mergeRespawn(older: unknown, newer: unknown): RespawnSnap | null {
  if (!isRespawnSnap(older) || !isRespawnSnap(newer) || older.v !== newer.v) return null
  const live = carryZone(newer, older.zone)
  const learned = mergeLearned(learnedOf(older), learnedOf(newer), older.zone)
  const shared = sharedNames(live)
  const joined = mergeRows(withFloor(older, shared), withFloor(live, shared))
  const rows = learned === null ? joined : joined.map((r) => withAgreed(r, learned, shared))
  return { ...live, rows, recent: mergeRecent(older, live), ...(learned === null ? {} : { learned }) }
}

/** The mobs today's watch list marks "several mobs share this name". */
function sharedNames(snap: RespawnSnap): ReadonlySet<string> {
  const watches = Array.isArray(snap.prefs?.watches) ? snap.prefs.watches : []
  return new Set(watches.filter((w) => w.sharedName === true).map((w) => w.key))
}

/** A zone's places as the engine pools them (`respawn_places.rs zone_base`): no tier, no instance tag. */
const zoneBase = (zone: string): string => zoneBaseName(zone).toLowerCase()

/**
 * THE SHARED-NAME FLOOR ACROSS THE CUT (owner 2026-11-09). The live engine numbers a shared-name
 * watch from its gaps of ten minutes or more (`respawn_places.rs pooled_gaps_above`) and says so on
 * the row. An archived row was numbered before the switch was set, or read with a bare watch (the
 * history rows), so its bound is two spawns' short gap. Re-read here as the engine reads it: the
 * lowest gap over the floor in the side's learned gaps (the mob, in every place of the row's zone)
 * and the row's own, and how many there are. A log with no learned list has the row's six newest
 * gaps only, so the clock can read longer for it, never under the floor.
 */
function aboveFloor(row: RespawnRow, learned: readonly Learned[]): RespawnRow {
  if (row.sharedName === true) return row
  const out: RespawnRow = { ...row, sharedName: true }
  if (row.agreedMs !== undefined && row.agreedMs < RESPAWN_SHARED_NAME_FLOOR_MS) delete out.agreedMs
  // The bound is the lowest gap of all: at or over the floor, no gap is under it.
  if (row.observedMs === undefined || row.observedMs >= RESPAWN_SHARED_NAME_FLOOR_MS) return withEstimate(out)
  const base = zoneBase(row.zone)
  const over = (gaps: readonly number[]): number[] => gaps.filter((g) => g >= RESPAWN_SHARED_NAME_FLOOR_MS)
  const pooled = over(learned.filter((l) => l.key === row.key && zoneBase(l.zone) === base).flatMap((l) => l.gapsMs))
  const own = over(row.gapsMs ?? [])
  // The learned list holds every gap the row does, so the count is the larger, never the sum.
  out.samples = Math.max(pooled.length, own.length)
  if (out.samples === 0) delete out.observedMs
  else out.observedMs = Math.min(...pooled, ...own)
  return withEstimate(out)
}

/** `snap` with the rows of today's shared-name watches read over the floor. */
function withFloor(snap: RespawnSnap, shared: ReadonlySet<string>): RespawnSnap {
  if (!snap.rows.some((r) => shared.has(r.key) && r.sharedName !== true)) return snap
  const learned = learnedOf(snap) ?? []
  return { ...snap, rows: snap.rows.map((r) => (shared.has(r.key) ? aboveFloor(r, learned) : r)) }
}

/**
 * AGREEMENT ACROSS THE CUT (fork #8). The engine reads a row's agreed gap off one log's gaps, so two
 * gaps in the archive and one in the live log agree on neither side, and a log archived before the
 * field has none. Re-read here over the joined learned gaps, pooled as the engine pools them (the
 * mob, in every place of the row's zone; a shared name's gaps under ten minutes left out, by the
 * row or by today's watch list). It only ever lowers `agreedMs`, so it can lower a wiki floor and
 * never raise an estimate; the row's own gaps, samples and typed number are not touched.
 */
function withAgreed(row: RespawnRow, learned: readonly Learned[], shared: ReadonlySet<string>): RespawnRow {
  const base = zoneBase(row.zone)
  const pool = learned.filter((l) => l.key === row.key && zoneBase(l.zone) === base).flatMap((l) => l.gapsMs)
  const agreed = agreedGap(pool, row.sharedName === true || shared.has(row.key) ? RESPAWN_SHARED_NAME_FLOOR_MS : 0)
  if (agreed === undefined || (row.agreedMs !== undefined && row.agreedMs <= agreed)) return row
  return withEstimate({ ...row, agreedMs: agreed })
}

/**
 * THE LEARNED EVIDENCE (respawn-first-sight, owner 2026-10-25): each mob's same-stay gaps, read for
 * the wiki respawn time. Read here by shape, so an archive older than the field, or an engine without
 * it, simply has none.
 */
type Learned = LearnedEvidence

/** The engine's own cap on gaps per mob. */
const LEARNED_GAPS = 50
/** The engine's own cap on mobs (`MAX_LEARNED_STORE`), so the join does not grow with every archive. */
const LEARNED_MOBS = 1_000

/** The field's entries as the Gaps tab reads them (malformed ones dropped); null when it has none. */
function learnedOf(snap: RespawnSnap): Learned[] | null {
  return Array.isArray((snap as unknown as { learned?: unknown }).learned) ? learnedEvidence(snap) : null
}

/**
 * Both sides' evidence joined per mob and zone: the newer side's gaps first (each list is newest
 * first), capped as the engine caps them. What the newer side filed under zone '' (before its first
 * zone line) is the zone the older side ended in, as for the rows. Null when neither side has any.
 * Newest learned first, as the engine publishes: the newer side's mobs in its order, then the ones
 * only the older side has in its order; the 1,000 newest are kept.
 */
function mergeLearned(older: Learned[] | null, newer: Learned[] | null, olderZone: string): Learned[] | null {
  if (older === null && newer === null) return null
  const out = new Map<string, Learned>()
  for (const l of newer ?? []) {
    // Defensive: the engine learns no gap before a zone line (`zone_since > 0`), so it files none under ''.
    const zone = l.zone === '' ? olderZone : l.zone
    const id = `${respawnZoneKey(zone)}::${l.key}`
    const prev = out.get(id)
    out.set(id, prev === undefined ? { ...l, zone, id } : { ...prev, gapsMs: [...prev.gapsMs, ...l.gapsMs].slice(0, LEARNED_GAPS) })
  }
  for (const l of older ?? []) {
    const prev = out.get(l.id)
    out.set(l.id, prev === undefined ? l : { ...prev, gapsMs: [...prev.gapsMs, ...l.gapsMs].slice(0, LEARNED_GAPS) })
  }
  return [...out.values()].slice(0, LEARNED_MOBS)
}

/** What a mob's page says of its respawn today, by key: `data/respawns.json`, the file the engine embeds. */
export type RespawnWikiNow = (key: string) => { text: string; seconds?: number; page: string } | undefined

/**
 * An archived state's learned evidence with what each page says TODAY. The archive's copy is what
 * the page said the day it was captured, so a page fixed and re-scraped since would still read wrong.
 * Anything else comes back as is.
 */
export function withCurrentWiki(archived: unknown, wikiNow: RespawnWikiNow): unknown {
  if (!isRespawnSnap(archived)) return archived
  const learned = learnedOf(archived)
  if (learned === null) return archived
  return {
    ...archived,
    learned: learned.map((l): Learned => {
      const bare = { id: l.id, key: l.key, display: l.display, zone: l.zone, gapsMs: l.gapsMs }
      const says = wikiNow(l.key)
      if (says === undefined) return bare
      return { ...bare, wikiText: says.text, ...(says.seconds === undefined ? {} : { wikiMs: says.seconds * 1000 }), wikiPage: says.page }
    })
  }
}

/**
 * An archived state with its history rows for every mob `live` watches, and `live`'s watch list.
 * A row the archived state already has is left as captured. Anything else comes back as is.
 */
export function withHistoryRows(archived: unknown, history: readonly RespawnRow[], live: unknown): unknown {
  if (!isRespawnSnap(archived) || !isRespawnSnap(live)) return archived
  const watches = watchesOf(live)
  const have = new Set(archived.rows.map((r) => r.id))
  const extra = history.filter((r) => watches.has(r.key) && !have.has(r.id))
  return { ...archived, prefs: live.prefs, rows: [...archived.rows, ...extra] }
}
