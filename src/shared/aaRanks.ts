// aaRanks.ts — the rank a character holds in each AA of the wiki's tables, for the Alt. Advancement
// tab (owner, 2026-11-25; docs/community/requirements/alt-advancement.md) and the Best in slot
// sheet's soft cap. Pure: the committed table, the log's purchase lines and the player's picks in.
//
// WHERE A RANK COMES FROM, in order: the player's own pick for this character; else the highest rank
// the log's purchase lines state (`aaLedger`); else 0. The wiki's rank count caps both.
//
// NAMES. A log name is matched to a row case-insensitively and without apostrophes: the log writes
// `Warriors Endurance` where the wiki writes `Warrior's Endurance`. The Special table writes a race's
// row `Class Reincarnation: Human`; the log says `Race Reincarnation: Human`, which is the name shown.

import { AA_TABLE, type AaSection, type AaTableRow } from './aaTable.generated'
import { aaLedger } from './aaLedger'
import type { AASpendLike } from './aa'
import type { ClassAbbr } from './classCombo'
import { classAbbrForDisplayName } from './spellLevels'

export type AaRankSource = 'pick' | 'log' | 'none'

export interface AaRanked {
  row: AaTableRow
  /** The name shown and the key a pick is stored under: the log's own form for a race row. */
  key: string
  rank: number
  source: AaRankSource
  /** The log's rank, capped; null when the log names no purchase of it. */
  logRank: number | null
}

/** One character's picks, by row key. */
export type AaPicks = Readonly<Record<string, number>>

/** Every character's picks, by character name. */
export type AaPicksByCharacter = Readonly<Record<string, AaPicks>>

/** Where the picks are kept (renderer localStorage). */
export const AA_PICKS_KEY = 'eq.aa.ranks'

/** A name folded for matching: case, apostrophes and runs of spaces do not count. */
export function aaFold(name: string): string {
  return name.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim()
}

/** The race of a Special `Class Reincarnation: <race>` row, or null for any other row. */
export function aaRaceOf(row: AaTableRow): string | null {
  const m = row.section === 'special' ? /^Class Reincarnation:\s*(.+)$/.exec(row.name) : null
  return m !== null && classAbbrForDisplayName(m[1]) === undefined ? m[1] : null
}

/** The name a row is shown and stored under. */
export function aaKey(row: AaTableRow): string {
  const race = aaRaceOf(row)
  return race === null ? row.name : `Race Reincarnation: ${race}`
}

/**
 * The highest rank the log states per ability, by folded name. A race line states no rank (`Race
 * Reincarnation: Half Elf` every time), so a race's rank is also the number of reincarnations into
 * it (`races`: one entry per reincarnation, shared/reincarnationClimbs.ts).
 */
export function aaLogRanks(spends: readonly AASpendLike[], races: readonly (string | null)[] = []): Map<string, number> {
  const out = new Map(aaLedger(spends).map((r) => [aaFold(r.name), r.topRank]))
  for (const race of races) {
    if (race === null) continue
    const key = aaFold(`Race Reincarnation: ${race}`)
    const n = races.filter((r) => r === race).length
    out.set(key, Math.max(out.get(key) ?? 0, n))
  }
  return out
}

/** The log's rank for a row: a race row answers to either spelling. */
function logRankOf(row: AaTableRow, key: string, logRanks: ReadonlyMap<string, number>): number | null {
  return logRanks.get(aaFold(key)) ?? logRanks.get(aaFold(row.name)) ?? null
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, Math.floor(n)))

/** One row's rank for a character. */
export function rankAa(row: AaTableRow, logRanks: ReadonlyMap<string, number>, picks: AaPicks): AaRanked {
  const key = aaKey(row)
  const logged = logRankOf(row, key, logRanks)
  const logRank = logged === null ? null : clamp(logged, row.ranks)
  const pick = picks[key]
  if (pick !== undefined) return { row, key, rank: clamp(pick, row.ranks), source: 'pick', logRank }
  if (logRank !== null && logRank > 0) return { row, key, rank: logRank, source: 'log', logRank }
  return { row, key, rank: 0, source: 'none', logRank }
}

/** Every row of the table, ranked, in the table's order. `races`: see `aaLogRanks`. */
export function rankAas(
  spends: readonly AASpendLike[],
  picks: AaPicks,
  races: readonly (string | null)[] = [],
  table: readonly AaTableRow[] = AA_TABLE
): AaRanked[] {
  const logRanks = aaLogRanks(spends, races)
  return table.map((row) => rankAa(row, logRanks, picks))
}

/** The rank held in the row stored under `key`; 0 when no row has it. */
export function aaRankOf(ranked: readonly AaRanked[], key: string): number {
  return ranked.find((r) => r.key === key)?.rank ?? 0
}

/** Log names no table row answers to: what the tab cannot place. */
export function aaUnplaced(spends: readonly AASpendLike[], table: readonly AaTableRow[] = AA_TABLE): string[] {
  const known = new Set(table.flatMap((row) => [aaFold(row.name), aaFold(aaKey(row))]))
  return aaLedger(spends)
    .map((r) => r.name)
    .filter((name) => !known.has(aaFold(name)))
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
    if (seen.has(r.key) || r.row.section === 'special' || r.rank === 0) continue
    seen.add(r.key)
    const costs = aaRankCosts(r.row).slice(0, r.rank)
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
