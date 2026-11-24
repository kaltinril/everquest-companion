// shared/gapsAllCharacters.ts — THE GAPS TAB ACROSS EVERY CHARACTER (owner, 2026-10-19;
// docs/community/plans/2026-10-19-gaps-all-characters.md).
//
// DATA IS JOINED, LOGS NEVER ARE (owner ruling: "it should not create a combined set of log files, it
// should just aggregate the data together INTO a single source of gaps in the tab"). Each character
// keeps its own log, its own archive segments and its own saved Gaps inputs; only the tab's view is
// a join, made here from those per-character states with the archive's own merge rules.
//
// ONE CHARACTER'S STATE is its saved snapshot (the engine's `gaps`, `loot` and `kills` from its log as
// it stood when saved) plus its sealed archive segments, chosen by the archive's eligibility rule
// against THE SAVED LOG, not the file on disk today: the snapshot is what it holds, so a segment that
// the saved log contains is left out exactly as it is for the attached character. A character with
// archives and no snapshot yet is its archives alone.
//
// HOW FAR BACK is a player setting in days (owner: default 60): an archive that ended before the
// cut-off is left out whole, and a row last seen before it is dropped. A row's count still holds
// what one stretch saw before the cut-off; the stretch is the unit the log keeps. Loot and kills are
// never cut line by line: the window only chooses which rows show, so a drop's count and its rate
// (corpses over kills) are both whole, never drops in the window over kills of all time.

import { eligibleSegments } from './logArchive/eligible'
import { mergeGaps } from './logArchive/mergeGaps'
import { mergeKills } from './logArchive/mergeKills'
import { mergeLoot } from './logArchive/mergeLoot'
import { mergeModule } from './logArchive/mergeRules'
import type { Segment } from './logArchive/segment'
import type { GapDomain, GapRow, GapsSnap } from './gaps'
import { itemsSoldOf, unionSold, type SoldSeen } from './gapItemsSold'
import { aboutKnownPage } from './gapsRecheckPages'
import type { KillsSnap } from './kills'
import type { OwnershipPayload } from './planner/ownership'
import type { LootSnap } from './types'

/** The engine modules one character's Gaps are built from (useGapsData). */
export const GAP_SOURCE_MODULES = ['gaps', 'loot', 'kills'] as const
export type GapSourceModule = (typeof GAP_SOURCE_MODULES)[number]

/** How far back the joined view reads unless the player picks otherwise (owner, 2026-10-19). */
export const DEFAULT_GAP_DAYS = 60
export const MAX_GAP_DAYS = 3650

/** A saved snapshot older than this many months is flagged (owner, 2026-10-19: "2 months"). */
export const STALE_MONTHS = 2

/** The saved log's identity, as `eligible.ts` reads a live log. */
export interface SavedLog {
  /** How many bytes `headSha256` covers: 64 KiB, or the whole log when it was shorter. */
  headBytes: number
  headSha256: string
  /** The first line's stamp key, `2026-10-19 17:54:48`; null when no line was stamped. */
  firstStamp: string | null
}

export const SAVED_GAPS_VERSION = 1

/**
 * What a saved file's `gaps` rows hold, raised when the engine starts serving a kind of row an
 * older build's save never had. 2: a known item's forages, the proof its page's forage zones are
 * checked against (gaps-item-facts, 2026-10-21). A file without it was saved by an older build:
 * the rows cannot be rebuilt from the file (forage lines are not in the loot), so the tab says to
 * log that character in once, which saves it again. 3: a known item stored in the tradeskill depot,
 * the proof its page's Tradeskill Ingredient category is checked against (2026-10-27).
 */
export const SAVED_ROWS = 3

/** One character's saved Gaps inputs, one file per character. */
export interface SavedGaps {
  v: number
  /** `name_server`, lower-cased (log/config.ts `characterId`). */
  character: string
  name: string
  server: string
  /** When it was saved, ISO. */
  savedAt: string
  log: SavedLog
  modules: Record<GapSourceModule, { seq: number; state: unknown }>
  /** SAVED_ROWS when it was saved; absent on a file from before it. */
  rows?: number
}

/** One other character's Gaps inputs, its archives joined in, as main serves them to the tab. */
export interface CharacterGaps {
  character: string
  name: string
  server: string
  /** When its snapshot was saved; null for a character known only by its archives. */
  savedAt: string | null
  /** How many archive segments went in. */
  archives: number
  gaps: unknown
  loot: unknown
  kills: unknown
  /** Its OWN latest inventory export (`Name_server-Inventory.txt`), for "held by"; null when it has none. */
  inventory?: OwnershipPayload | null
  /** Saved by an older build whose rows lack a kind this one serves (SAVED_ROWS). */
  olderRows?: true
  /** Its saved state would not join (`othersGaps`): named on the line, nothing of it in the list. */
  unreadable?: true
}

/** A saved file as read back, or null when it is not one this build understands. */
export function parseSavedGaps(raw: unknown): SavedGaps | null {
  if (raw === null || typeof raw !== 'object') return null
  const s = raw as Partial<SavedGaps>
  if (s.v !== SAVED_GAPS_VERSION || typeof s.character !== 'string' || typeof s.savedAt !== 'string') return null
  if (s.log === undefined || typeof s.log.headSha256 !== 'string' || typeof s.log.headBytes !== 'number') return null
  // Each module is `{ seq, state }`: a null or a bare value in its place made the join throw.
  const modules: Partial<Record<GapSourceModule, unknown>> | undefined = s.modules
  if (modules === undefined || GAP_SOURCE_MODULES.some((m) => modules[m] === null || typeof modules[m] !== 'object')) return null
  return s as SavedGaps
}

/** `drywrought_oggok` -> Drywrought on oggok: the archive-only character's name, from its id. */
export function nameFromId(id: string): { name: string; server: string } {
  const cut = id.indexOf('_')
  const name = cut < 0 ? id : id.slice(0, cut)
  return { name: name.charAt(0).toUpperCase() + name.slice(1), server: cut < 0 ? '' : id.slice(cut + 1) }
}

/** The character's sealed segments that its saved log does not already hold, and that end on or after the cut-off. */
function shownSegments(segments: readonly Segment[], character: string, saved: SavedGaps | null, sinceStamp: string | null): Segment[] {
  const live = saved === null
    ? { headSha256: () => null, firstStamp: null }
    : { headSha256: (n: number) => (n === saved.log.headBytes ? saved.log.headSha256 : null), firstStamp: saved.log.firstStamp }
  const { shown } = eligibleSegments({ segments, character, live, sealedThisAttach: new Set() })
  return sinceStamp === null ? shown : shown.filter((s) => s.log.lastStamp >= sinceStamp)
}

/** One module over the shown segments (oldest first) and the saved state on top. */
function foldModule(id: GapSourceModule, shown: readonly Segment[], saved: SavedGaps | null): unknown {
  const states = shown.filter((s) => Object.prototype.hasOwnProperty.call(s.modules, id)).map((s) => s.modules[id].state)
  if (saved !== null) return mergeModule(id, states, saved.modules[id].state).state
  if (states.length === 0) return null
  return mergeModule(id, states.slice(0, -1), states[states.length - 1]).state
}

/** One character's Gaps inputs: the saved snapshot with its eligible archives, or null when it has neither. */
export function characterGaps(character: string, saved: SavedGaps | null, segments: readonly Segment[], sinceStamp: string | null): CharacterGaps | null {
  const shown = shownSegments(segments, character, saved, sinceStamp)
  if (saved === null && shown.length === 0) return null
  const who = saved === null ? nameFromId(character) : { name: saved.name, server: saved.server }
  return {
    character,
    ...who,
    savedAt: saved?.savedAt ?? null,
    ...(saved !== null && (saved.rows ?? 1) < SAVED_ROWS ? { olderRows: true as const } : {}),
    archives: shown.length,
    gaps: foldModule('gaps', shown, saved),
    loot: foldModule('loot', shown, saved),
    kills: foldModule('kills', shown, saved)
  }
}

/** Every character the saved files or the archive know, other than `except` (the attached one). */
export function otherCharacters(saved: readonly SavedGaps[], segments: readonly Segment[], except: string | null): string[] {
  const ids = new Set<string>([...saved.map((s) => s.character), ...segments.map((s) => s.character)])
  if (except !== null) ids.delete(except)
  return [...ids].sort()
}

/**
 * Every other character's inputs. One whose saved state will not join (a row shape from another
 * build, a damaged segment) is handed to `onError` and named `unreadable`, with nothing of it in
 * the list: thrown out of the loop it failed the whole read, and the tab then showed no other
 * character at all.
 */
export function othersGaps(
  from: { saved: readonly SavedGaps[]; segments: readonly Segment[] },
  except: string | null,
  sinceStamp: string | null,
  onError: (character: string, err: unknown) => void
): CharacterGaps[] {
  const out: CharacterGaps[] = []
  for (const id of otherCharacters(from.saved, from.segments, except)) {
    const own = from.saved.find((s) => s.character === id) ?? null
    try {
      const one = characterGaps(id, own, from.segments, sinceStamp)
      if (one !== null) out.push(one)
    } catch (err) {
      onError(id, err)
      const who = own === null ? nameFromId(id) : { name: own.name, server: own.server }
      out.push({ character: id, ...who, savedAt: own?.savedAt ?? null, archives: 0, gaps: null, loot: null, kills: null, unreadable: true })
    }
  }
  return out
}

// ---- the cut-off -------------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0')

/** The log's stamp key for a local time, `2026-10-19 17:54:48` (the log writes local wall clock). */
export function stampKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** The cut-off `days` before `now`, as a stamp key and as epoch ms. */
export function cutoffOf(days: number, now: Date): { stamp: string; ms: number } {
  const d = new Date(now.getTime())
  d.setDate(d.getDate() - days)
  return { stamp: stampKeyOf(d), ms: d.getTime() }
}

/** Whether a snapshot saved at `savedAt` is older than STALE_MONTHS before `now`. */
export function isStale(savedAt: string, now: Date): boolean {
  const d = new Date(savedAt)
  if (Number.isNaN(d.getTime())) return false
  d.setMonth(d.getMonth() + STALE_MONTHS)
  return d.getTime() < now.getTime()
}

function asGaps(x: unknown): GapsSnap | null {
  return x !== null && typeof x === 'object' && Array.isArray((x as GapsSnap).rows) ? (x as GapsSnap) : null
}

/** The rows last seen on or after the cut-off; each domain's total recounted when a row was dropped. */
export function gapsSince(snap: GapsSnap, stamp: string): GapsSnap {
  const rows = snap.rows.filter((r) => r.last === '' || r.last >= stamp)
  if (rows.length === snap.rows.length) return snap
  const totals = { ...snap.totals }
  const dropped = new Map<GapDomain, number>()
  for (const r of snap.rows) if (!(r.last === '' || r.last >= stamp)) dropped.set(r.domain, (dropped.get(r.domain) ?? 0) + 1)
  for (const [d, n] of dropped) totals[d] = Math.max(0, (totals[d] ?? 0) - n)
  return { ...snap, rows, totals }
}

/** The attached character's inputs as the derivation reads them. */
export interface OwnGaps {
  gaps: GapsSnap
  loot: LootSnap
  kills: KillsSnap | null
}

/**
 * The one-character view cut to the window (owner, 2026-10-21: "days back should be for any
 * character yes"), the same cut the join makes per character: rows last seen before it are left
 * out; a row also seen since keeps its whole count, as in the join. Loot and kills stay whole: the
 * rows derived from them (drops, factions, images) are cut after they are built (`gapsSince` on the
 * derived list, useGapsData), so their counts and rates read the whole log.
 */
export function ownSince(own: OwnGaps, cut: { stamp: string; ms: number }): OwnGaps {
  return { ...own, gaps: gapsSince(own.gaps, cut.stamp) }
}

// ---- the join ----------------------------------------------------------------------------------

/** One character's inputs, as the tab joins them. */
export interface CharacterInputs {
  /** The name the details print ("Seen by"). */
  label: string
  gaps: unknown
  loot: unknown
  kills: unknown
}

/** Every character's inputs joined, and who saw each row. */
export interface JoinedGaps {
  gaps: GapsSnap | null
  loot: LootSnap
  kills: KillsSnap | null
  /** `domain|name` lower-cased -> the characters whose rows it joined, in input order. */
  seenBy: ReadonlyMap<string, readonly string[]>
}

export const seenByKey = (r: Pick<GapRow, 'domain' | 'name'>): string => `${r.domain}|${r.name.toLowerCase()}`

/** Each row of one character's cut snapshot noted as seen by it. */
function noteSeen(seenBy: Map<string, string[]>, rows: readonly GapRow[], label: string): void {
  for (const r of rows) {
    // A known item's forage or depot proof (domain `forage` / `depot`, gapForage.ts) is shown as its Items row.
    const k = seenByKey(['forage', 'depot'].includes(r.domain) ? { ...r, domain: 'item' } : r)
    const had = seenBy.get(k)
    if (had === undefined) seenBy.set(k, [label])
    else if (!had.includes(label)) had.push(label)
  }
}

function asKills(x: unknown): KillsSnap | null {
  return x !== null && typeof x === 'object' && typeof (x as KillsSnap).mobs === 'object' ? (x as KillsSnap) : null
}

/** One module's join step: the cut state on top of what came before, or what came before when the rule refuses. */
function joinStep<T>(acc: T | null, next: T | null, rule: (a: unknown, b: unknown) => unknown): T | null {
  if (next === null) return acc
  if (acc === null) return next
  return (rule(acc, next) as T | null) ?? acc
}

/**
 * Two characters' Gaps joined: the archive's rules, except that one character's turn-ins are never
 * added to another's (owner, 2026-11-23: "each character shows it's own turn in"; `GapsJoin`).
 */
const acrossCharacters = (a: unknown, b: unknown): unknown => mergeGaps(a, b, 'acrossCharacters')

/** One character's rows cut to the window, or null when its state is no gaps snapshot. */
function cutGaps(c: CharacterInputs, cut: { stamp: string; ms: number } | null): GapsSnap | null {
  const g = asGaps(c.gaps)
  return g === null || cut === null ? g : gapsSince(g, cut.stamp)
}

/**
 * A snapshot's rows with their tallies emptied: joined once more as the newest side it adds nothing
 * and re-states each row's served fields, which `mergeGaps.ts mergeRow` takes from the newer side
 * (`itemsSold`, `greeting`, `role`, `questFacts`). Only the rows the join still serves: one past a
 * domain's cap must not come back as an empty row.
 */
function servedOnly(g: GapsSnap, joined: GapsSnap): GapsSnap {
  const kept = new Set(joined.rows.map(seenByKey))
  const rows = g.rows.filter((row) => kept.has(seenByKey(row))).map((row) => {
    const { fight: _fight, ...r } = row as GapRow & { fight?: unknown }
    return { ...r, kinds: [], count: 0, first: '', last: '', details: { samples: [] } }
  })
  return { rows, totals: g.totals, seen: g.seen }
}

/**
 * A merchant the attached character never met, as every other character saw its stock. The join
 * takes `itemsSold` from the last side, so of two alts the one joined last decided the list. A row
 * the attached character has is left alone: its reading stands (`joinCharacters`).
 */
function withOthersStock(joined: GapsSnap, cuts: readonly (GapsSnap | null)[]): GapsSnap {
  const own = new Set((cuts[0]?.rows ?? []).map(seenByKey))
  const lists = new Map<string, SoldSeen[][]>()
  for (const g of cuts.slice(1)) {
    for (const r of g?.rows ?? []) {
      const sold = itemsSoldOf(r)
      const k = seenByKey(r)
      if (sold.length > 0 && !own.has(k)) lists.set(k, [...(lists.get(k) ?? []), sold])
    }
  }
  const rows = joined.rows.map((r) => {
    const seen = lists.get(seenByKey(r))
    return seen === undefined ? r : ({ ...r, itemsSold: unionSold(seen) } as GapRow)
  })
  return { ...joined, rows }
}

/**
 * The characters joined one after another with the archive's merge rules, each one's rows cut to
 * the window first; loot and kills join whole, as in `ownSince`. A character whose state the rule
 * will not join (a kills shape from another build) adds nothing to that module and is not counted
 * twice. Loot is put back in time order.
 *
 * `inputs[0]` IS THE ATTACHED CHARACTER, and its reading of a row stands over every other
 * character's, as the live fold's stands over its own archive: it is joined first (its spelling,
 * kinds and first `/loc` lead) and its served fields are joined once more at the end. Without that
 * the last character joined won them, and a merchant whose whole stock the live log quoted copied
 * with the one item an alt once saw.
 */
export function joinCharacters(inputs: readonly CharacterInputs[], cut: { stamp: string; ms: number } | null): JoinedGaps {
  let gaps: GapsSnap | null = null
  let loot: LootSnap = []
  let kills: KillsSnap | null = null
  const seenBy = new Map<string, string[]>()
  const cuts: (GapsSnap | null)[] = []
  for (const c of inputs) {
    const cutG = cutGaps(c, cut)
    cuts.push(cutG)
    if (cutG !== null) noteSeen(seenBy, cutG.rows, c.label)
    gaps = joinStep(gaps, cutG, acrossCharacters)
    const l = Array.isArray(c.loot) ? (c.loot as LootSnap) : null
    loot = joinStep(loot, l, mergeLoot) ?? loot
    kills = joinStep(kills, asKills(c.kills), mergeKills)
  }
  const own = inputs.length > 1 ? cutGaps(inputs[0], cut) : null
  if (own !== null && gaps !== null) gaps = joinStep(gaps, servedOnly(own, gaps), acrossCharacters)
  if (gaps !== null && inputs.length > 2) gaps = withOthersStock(gaps, cuts)
  return { gaps, loot: inputs.length > 1 ? [...loot].sort((x, y) => x.ts - y.ts) : loot, kills, seenBy }
}

/**
 * A saved Mobs row the catalog now answers: a plain unknown name whose page has been added. A row
 * about a name the wiki already has a page for (its quests to add, its redirect to check, a page
 * for this zone beside another zone's) is known by design, so the name test says nothing about it:
 * the one predicate main's re-check uses (`aboutKnownPage`), so the two cannot drift apart.
 */
const closedByCatalog = (r: GapRow, isMob: (name: string) => boolean): boolean => r.domain === 'mob' && !aboutKnownPage(r) && isMob(r.name)

/**
 * Another character's inputs for the join. Its saved mob rows are checked again against today's
 * catalog (a page added since it was saved closes the gap, `closedByCatalog`), as main already did
 * before serving them (gapsRecheck.ts, which also re-checks a quest-giver, redirect or zone-titled
 * row against today's data); spell known-ness is the engine's call and waits for that character's
 * next attach. Its label names it, with its server when two characters share a name.
 */
export function otherInputs(others: readonly CharacterGaps[], isMob: (name: string) => boolean): CharacterInputs[] {
  const names = others.map((o) => o.name)
  return others.map((o) => {
    const g = asGaps(o.gaps)
    const gaps = g === null ? null : { ...g, rows: g.rows.filter((r) => !closedByCatalog(r, isMob)) }
    const label = names.filter((n) => n === o.name).length > 1 ? `${o.name} (${o.server})` : o.name
    return { label, gaps, loot: o.loot, kills: o.kills }
  })
}
