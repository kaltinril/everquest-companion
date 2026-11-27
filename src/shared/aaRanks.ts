// aaRanks.ts — the rank a character holds in each AA of the wiki's tables, for the Alt. Advancement
// tab (owner, 2026-11-25; docs/community/requirements/alt-advancement.md) and the Best in slot
// sheet's soft cap. Pure: the committed table, the log's purchase lines and the player's picks in.
//
// WHERE A RANK COMES FROM (owner, 2026-11-25, the order of proof): the first source that says
// something wins. 1. the latest `/alt list` run (shared/aaList.ts; it reads a rank only for a row with
// more than one), except that a purchase line logged after the run, or after the last zone-in before
// it, raises it (a list is stale until a zone after a purchase, MEASURED.md); 2. the player's own
// lines using it (`You activate X.`, a ranked cast, the reuse timer ...: its rank, else at least 1);
// 3. the player's own pick for this character; 4. the highest rank the log's purchase
// lines state (`aaLedger`), and a free rank the game grants, laid over by shared/aaGranted.ts
// `withGranted` (the log writes no line for it). A one-rank row the list printed with none of 2-4 is
// `unknown`: the list prints it the same owned or not, so it is never guessed and never sold. THE LOG WINS OVER THE WIKI (owner,
// 2026-11-25): a row's top rank is the larger of the wiki's rank count and the log's rank.
//
// NAMES (shared/aaLogMatch.ts). A log name matches a row without case or apostrophes (`Warriors
// Endurance` is `Warrior's Endurance`), else the one row a couple of edits away. The name shown is
// the log's: `Race Reincarnation: Human` for the wiki's `Class Reincarnation: Human` (in a table
// without aaOfficial.ts's renames). A log AA no row is gets a General row of its own.
//
// THE TABLE is the wiki's with the game's corrections over it (shared/aaOfficial.ts `AA_ROWS`): a
// removed AA keeps its row and any log rank, but takes no pick and costs no points.

import type { AaSection, AaTableRow } from './aaTable.generated'
import { AA_ROWS, type AaRow } from './aaOfficial'
import { aaFold, aaLogAas, aaLogMatch, type LogAa } from './aaLogMatch'
import type { AASpendLike } from './aa'
import { aaActivatedRows, aaBeatsList, aaListRead, type AaActivation, type AaListRun } from './aaList'
import type { ClassAbbr } from './classCombo'
import { classAbbrForDisplayName } from './spellLevels'

export { aaFold } from './aaLogMatch'

/** `granted`: a free rank the game gives without a purchase line (shared/aaGranted.ts). */
export type AaRankSource = 'list' | 'activated' | 'pick' | 'log' | 'granted' | 'none'

export interface AaRanked {
  row: AaRow
  /** The name shown and the key a pick is stored under: the log's own form where it has one. */
  key: string
  rank: number
  /** The top rank: the wiki's rank count, or the log's rank when higher. */
  max: number
  source: AaRankSource
  /** The log's rank; null when the log names no purchase of it. */
  logRank: number | null
  /** The wiki's name when the one shown differs from it. */
  wikiName: string | null
  /** A log AA the wiki's AA page does not list. */
  unlisted: boolean
  /** A one-rank AA the list printed and nothing else in the log settles: held or not, unknown. */
  unknown?: true
  /** The `/alt list` run decided the rank (or a purchase after it did): no pick is read. */
  listed?: true
  /** The rank the player's own lines show: a pick below it is not read. */
  usedRank?: number
}

/** What the log says of one row besides its purchase lines (shared/aaList.ts). */
export interface AaEvidence {
  /** The rank the latest `/alt list` run shows. */
  list?: number
  /** The run printed the row (read or not). */
  printed?: boolean
  /** The highest rank a purchase line that beats the run states (`aaBeatsList`). */
  after?: number
  /** The rank the player's own lines show (at least 1); absent when none names it. */
  activated?: number
}

/** Everything the log gives the ranks: purchases, reincarnations, the latest list run, activations. */
export interface AaLogInput {
  spends: readonly AASpendLike[]
  races?: readonly (string | null)[]
  list?: AaListRun | null
  activations?: readonly AaActivation[]
}

/** One character's picks, by row key. */
export type AaPicks = Readonly<Record<string, number>>

/** Every character's picks, by character name. */
export type AaPicksByCharacter = Readonly<Record<string, AaPicks>>

/** Where the picks are kept (renderer localStorage). */
export const AA_PICKS_KEY = 'eq.aa.ranks'

/** The race of a Special race row (the wiki's `Class Reincarnation: <race>`, the game's `Race Reincarnation`), else null. */
export function aaRaceOf(row: AaTableRow): string | null {
  const m = row.section === 'special' ? /^(Class|Race) Reincarnation:\s*(.+)$/.exec(row.name) : null
  return m !== null && (m[1] === 'Race' || classAbbrForDisplayName(m[2]) === undefined) ? m[2] : null
}

/** The name a row is shown and stored under. */
export function aaKey(row: AaTableRow): string {
  const race = aaRaceOf(row)
  return race === null ? row.name : `Race Reincarnation: ${race}`
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, Math.floor(n)))

type Held = Pick<AaRanked, 'rank' | 'source' | 'unknown' | 'listed' | 'usedRank'>

/** Below the list: what the player's own lines show, else the pick, else the purchase lines. */
function heldBelowList(pick: number | undefined, logRank: number | null, ev: AaEvidence, max: number): Held {
  const lower: Held | null = pick !== undefined ? { rank: clamp(pick, max), source: 'pick' } : logRank !== null && logRank > 0 ? { rank: logRank, source: 'log' } : null
  // A pick or purchase above what the lines show still counts; below it, the lines win.
  if (ev.activated !== undefined) return { ...(lower !== null && lower.rank >= ev.activated ? lower : { rank: ev.activated, source: 'activated' }), usedRank: ev.activated }
  if (lower !== null) return lower
  return ev.printed === true ? { rank: 0, source: 'none', unknown: true } : { rank: 0, source: 'none' }
}

/** The list's rank, raised by a purchase logged after it (the list can be stale); null when it says nothing. */
function heldByList(ev: AaEvidence): Held | null {
  if (ev.list === undefined) return null
  const after = ev.after ?? 0
  return after > ev.list ? { rank: after, source: 'log', listed: true } : { rank: ev.list, source: 'list', listed: true }
}

/** THE LOG WINS on the top rank: the wiki's count, or a purchase's or a cast's numeral above it. */
const topRank = (row: AaRow, logRank: number | null, ev: AaEvidence): number => Math.max(row.ranks, logRank ?? 0, ev.activated ?? 0)

export interface RankAaOptions {
  /** A log AA the wiki's page does not list. */
  unlisted?: boolean
  ev?: AaEvidence
}

/** One row's rank for a character, from its log AA (null when the log names none) and the other evidence. */
export function rankAa(row: AaRow, log: LogAa | null, picks: AaPicks, opts: RankAaOptions = {}): AaRanked {
  const unlisted = opts.unlisted === true
  const key = log !== null && (log.near === true || unlisted) ? log.name : aaKey(row)
  const logRank = log?.rank ?? null
  const ev = opts.ev ?? {}
  const max = topRank(row, logRank, ev)
  const base = { row, key, max, logRank, wikiName: unlisted || key === row.name ? null : row.name, unlisted }
  // A removed AA takes no pick: only what the log shows (THE LOG WINS) is held.
  const pick = row.removed === undefined ? picks[key] : undefined
  return { ...base, ...(heldByList(ev) ?? heldBelowList(pick, logRank, ev, max)) }
}

/** A General row for a log AA the wiki's page does not list. */
function unlistedRow(aa: LogAa): AaTableRow {
  return { section: 'general', name: aa.name, ranks: aa.rank, cost: '', text: '' }
}

/** Each row's list rank, purchases after the run, and activation, by folded row name. */
function evidenceOf(input: AaLogInput, table: readonly AaRow[]): (row: AaTableRow) => AaEvidence {
  const run = input.list ?? null
  const read = run === null ? null : aaListRead(run, table, aaKey)
  const later = run === null ? null : aaLogMatch(aaLogAas(input.spends.filter((x) => aaBeatsList(run, x.ts))), table, aaKey).byRow
  const acted = aaActivatedRows(input.activations ?? [], table, aaKey)
  return (row) => {
    const f = aaFold(row.name)
    const list = read?.ranks.get(f)
    const used = acted.get(f)
    return {
      ...(list === undefined ? {} : { list }),
      // A Special row is never sold for points and every reincarnation writes its own line: no line is rank 0.
      ...(read?.printed.has(f) === true && row.section !== 'special' ? { printed: true } : {}),
      ...(later?.get(f) === undefined ? {} : { after: later.get(f)?.rank }),
      ...(used === undefined ? {} : { activated: used })
    }
  }
}

/**
 * Every row of the table, ranked, in the table's order, then a General row per log AA no row is.
 * `races`: one entry per reincarnation (shared/aaLogMatch.ts `aaLogAas`).
 */
export function rankAas(
  spends: readonly AASpendLike[],
  picks: AaPicks,
  races: readonly (string | null)[] = [],
  table: readonly AaRow[] = AA_ROWS
): AaRanked[] {
  return rankAasFrom({ spends, races }, picks, table)
}

/** `rankAas` with every kind of evidence the log holds (the list run, activations). */
export function rankAasFrom(input: AaLogInput, picks: AaPicks, table: readonly AaRow[] = AA_ROWS): AaRanked[] {
  const { byRow, unplaced } = aaLogMatch(aaLogAas(input.spends, input.races ?? []), table, aaKey)
  const ev = evidenceOf(input, table)
  return [
    ...table.map((row) => rankAa(row, byRow.get(aaFold(row.name)) ?? null, picks, { ev: ev(row) })),
    ...unplaced.map((aa) => rankAa(unlistedRow(aa), aa, picks, { unlisted: true }))
  ]
}

/** The rank held in the row stored under `key`; 0 when no row has it. */
export function aaRankOf(ranked: readonly AaRanked[], key: string): number {
  return ranked.find((r) => r.key === key)?.rank ?? 0
}

/** Log names no table row answers to: what the tab cannot place. */
export function aaUnplaced(spends: readonly AASpendLike[], table: readonly AaTableRow[] = AA_ROWS): string[] {
  return aaLogMatch(aaLogAas(spends), table, aaKey)
    .unplaced.map((aa) => aa.name)
    .sort((a, b) => a.localeCompare(b))
}

/** The cost of each rank, as the Cost cell states it; null for a rank it does not state. */
export function aaRankCosts(row: AaTableRow): (number | null)[] {
  const all = /^(\d+)(?: for all ranks)?$/i.exec(row.cost.trim())
  if (all !== null) return Array.from({ length: row.ranks }, () => Number(all[1]))
  const parts = row.cost.split('/').map((p) => p.trim())
  return Array.from({ length: row.ranks }, (_, i) => (/^\d+$/.test(parts[i] ?? '') ? Number(parts[i]) : null))
}

export interface AaPoints {
  points: number
  /** Rows whose held ranks include one the Cost cell does not state. */
  unknown: number
}

/** Points spent on the held ranks of these rows; an AA listed twice (two classes) counts once. */
export function aaPointsSpent(ranked: readonly AaRanked[]): AaPoints {
  const out = { points: 0, unknown: 0 }
  const seen = new Set<string>()
  for (const r of ranked) {
    // A removed AA's points were refunded (aaOfficial.ts).
    if (seen.has(r.key) || r.row.section === 'special' || r.rank === 0 || r.row.removed !== undefined) continue
    seen.add(r.key)
    const priced = aaRankCosts(r.row)
    // A rank past the wiki's count (the log's) has no price.
    const costs = Array.from({ length: r.rank }, (_, i) => priced[i] ?? null)
    if (costs.some((c) => c === null)) out.unknown++
    out.points += costs.reduce<number>((s, c) => s + (c ?? 0), 0)
  }
  return out
}

/** The rows of one section, in the table's order. */
export function aaSectionRows(ranked: readonly AaRanked[], section: AaSection): AaRanked[] {
  return ranked.filter((r) => r.row.section === section)
}

export interface AaClassGroup {
  cls: string
  abbr: ClassAbbr | null
  mine: boolean
  rows: AaRanked[]
}

/** The Class tables: the character's own classes first, then (with `all`) the rest, each in the wiki's order. */
export function aaClassGroups(ranked: readonly AaRanked[], mine: readonly ClassAbbr[], all: boolean): AaClassGroup[] {
  const groups = new Map<string, AaClassGroup>()
  for (const r of aaSectionRows(ranked, 'class')) {
    const cls = r.row.class ?? ''
    let g = groups.get(cls)
    if (g === undefined) {
      const abbr = classAbbrForDisplayName(cls) ?? null
      g = { cls, abbr, mine: abbr !== null && mine.includes(abbr), rows: [] }
      groups.set(cls, g)
    }
    g.rows.push(r)
  }
  const list = [...groups.values()]
  return [...list.filter((g) => g.mine), ...(all ? list.filter((g) => !g.mine) : [])]
}

/** The rows of the class tables shown, for their points line. */
export function aaGroupRows(groups: readonly AaClassGroup[]): AaRanked[] {
  return groups.flatMap((g) => g.rows)
}

/** Stored picks, kept only where they are a name to a whole number of ranks. */
export function sanitizeAaPicks(raw: unknown): AaPicksByCharacter {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, AaPicks> = {}
  for (const [who, picks] of Object.entries(raw as Record<string, unknown>)) {
    if (picks === null || typeof picks !== 'object' || Array.isArray(picks)) continue
    const kept = Object.entries(picks as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === 'number' && Number.isInteger(e[1]) && e[1] >= 0
    )
    if (kept.length > 0) out[who] = Object.fromEntries(kept)
  }
  return out
}

/** The picks with one character's pick set, or cleared back to the log with `null`. */
export function withAaPick(all: AaPicksByCharacter, who: string, key: string, rank: number | null): AaPicksByCharacter {
  const others = Object.entries(all[who] ?? {}).filter(([k]) => k !== key)
  const mine = Object.fromEntries(rank === null ? others : [...others, [key, rank]])
  const rest = Object.entries(all).filter(([w]) => w !== who)
  return Object.fromEntries(Object.keys(mine).length === 0 ? rest : [...rest, [who, mine]])
}

/** Whether the order of proof reads a pick of `n` on this row: never under the list, never below a use line. */
export function aaPickHeard(r: AaRanked, n: number): boolean {
  return r.listed !== true && n >= (r.usedRank ?? 0)
}
