// Death recap grouping: one death's window (`DeathRecap`, from the engine's `deathrecap.rs`) as
// what the Combat tab shows - who hit you and with what, the killing blow, and the heals you got.
// Names group case-insensitively: the log prints `A tree snake bites YOU` and
// `a tree snake hit you ... by Weak Poison` for the same mob.

import type { DeathRecap, DeathRecapHit } from './combat'

export interface RecapAbilityRow {
  ability: string
  total: number
  hits: number
  max: number
}

export interface RecapSourceRow {
  source: string
  total: number
  hits: number
  /** Ranked by damage, most first. */
  abilities: RecapAbilityRow[]
}

export interface RecapHealRow {
  source: string
  spell: string | null
  total: number
  count: number
}

export interface DeathRecapSummary {
  ts: number
  killer: string | null
  windowSec: number
  /** Damage you took in the window. */
  taken: number
  /** Healing you got in the window. */
  healed: number
  /** Ranked by damage, most first. */
  sources: RecapSourceRow[]
  heals: RecapHealRow[]
  /** The last hit before the death line, or null when nothing hit you in the window. */
  killingBlow: DeathRecapHit | null
}

const key = (s: string): string => s.toLowerCase()

function groupSources(hits: readonly DeathRecapHit[]): RecapSourceRow[] {
  const bySource = new Map<string, { row: RecapSourceRow; abilities: Map<string, RecapAbilityRow> }>()
  for (const h of hits) {
    let g = bySource.get(key(h.source))
    if (!g) {
      g = { row: { source: h.source, total: 0, hits: 0, abilities: [] }, abilities: new Map() }
      bySource.set(key(h.source), g)
    }
    g.row.total += h.amount
    g.row.hits += 1
    let a = g.abilities.get(key(h.ability))
    if (!a) {
      a = { ability: h.ability, total: 0, hits: 0, max: 0 }
      g.abilities.set(key(h.ability), a)
    }
    a.total += h.amount
    a.hits += 1
    a.max = Math.max(a.max, h.amount)
  }
  const rows = [...bySource.values()].map(({ row, abilities }) => ({
    ...row,
    abilities: [...abilities.values()].sort((x, y) => y.total - x.total)
  }))
  return rows.sort((x, y) => y.total - x.total)
}

function groupHeals(d: DeathRecap): RecapHealRow[] {
  const rows = new Map<string, RecapHealRow>()
  for (const h of d.heals) {
    const k = `${key(h.source)}|${key(h.spell ?? '')}`
    const row = rows.get(k) ?? { source: h.source, spell: h.spell ?? null, total: 0, count: 0 }
    row.total += h.amount
    row.count += 1
    rows.set(k, row)
  }
  return [...rows.values()].sort((x, y) => y.total - x.total)
}

export function summarizeDeath(d: DeathRecap): DeathRecapSummary {
  const sources = groupSources(d.hits)
  const heals = groupHeals(d)
  return {
    ts: d.ts,
    killer: d.killer ?? null,
    windowSec: Math.round(d.windowMs / 1000),
    taken: sources.reduce((n, s) => n + s.total, 0),
    healed: heals.reduce((n, h) => n + h.total, 0),
    sources,
    heals,
    killingBlow: d.hits.length > 0 ? d.hits[d.hits.length - 1] : null
  }
}

/** Every death in a segment, newest first (the one you just had leads). */
export function summarizeDeaths(deaths: readonly DeathRecap[] | undefined): DeathRecapSummary[] {
  return (deaths ?? []).map(summarizeDeath).sort((a, b) => b.ts - a.ts)
}
