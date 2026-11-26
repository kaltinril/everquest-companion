// gear/bisText.ts — WHAT THE BEST IN SLOT TAB SAYS: every word and number on it, pure, so the tests read
// them without a window (plans/2026-11-24-bis-sheet.md "Version 2 design"; mockup v2 is the reference).

import type { GearRow } from '../../../../shared/planner/gear'
import { chipGroup, chipLabel, isRatioChip, isSplitResist, activeChips, RANKED_TIERS, type TierChip, type TierSetup } from '../../../../shared/planner/tierChips'
import type { Conversions, ItemBudget, TierModel, TierTerm } from '../../../../shared/planner/tierWeights'
import { planSlotLabel, type PlanSlotId } from '../../../../shared/planner/types'
import type { GearOwnershipMap } from './gearOwnership'

/** The reference image's lane colours (sampled, plan "The images"); Off is the app's grey. */
export const LANE_COLOUR: Readonly<Record<string, string>> = {
  S: '#ff7f7f',
  A: '#ffbf7f',
  B: '#ffdf7f',
  C: '#ffff7f',
  D: '#bfff7f',
  F: '#7fff7f',
  Off: '#5a5f6b'
}

/** The lane's dark ink and its tray, from the same image. */
export const LANE_INK = '#1b1c17'
export const LANE_TRAY = '#1a1b16'

/** A chip's value as the board writes it: ratios to two places, haste as a percent, resists as an average. */
export function chipValueText(chip: TierChip, v: number): string {
  if (isRatioChip(chip)) return v.toFixed(2)
  if (chip === 'HASTE') return `${String(Math.round(v))}%`
  if (chip === 'RESISTS') return `${v > 0 ? '+' : ''}${v.toFixed(1)} avg`
  const n = Math.round(v)
  return n > 0 ? `+${String(n)}` : String(n)
}

/** The short name, without the "(with STA)" a chip label carries. */
export function shortLabel(chip: TierChip): string {
  return chipLabel(chip).replace(/ \(.*\)$/, '')
}

/** One reason in a cell: `HP +69 (STA 7)`, `Mana +338 (WIS 15, INT 15)`, `DEX +9`. */
export function termText(row: Pick<GearRow, 'stats'>, term: Pick<TierTerm, 'chip' | 'value'>): string {
  const base = `${shortLabel(term.chip)} ${chipValueText(term.chip, term.value)}`
  const { STA, WIS, INT } = row.stats
  if (term.chip === 'HP' && STA !== undefined && STA !== 0) return `${base} (STA ${String(STA)})`
  if (term.chip === 'MANA') {
    const parts = [WIS === undefined ? '' : `WIS ${String(WIS)}`, INT === undefined ? '' : `INT ${String(INT)}`].filter((p) => p !== '')
    if (parts.length > 0) return `${base} (${parts.join(', ')})`
  }
  return base
}

/** What a chip's menu explains: how the game turns it into something, for the classes picked. */
export function chipHint(chip: TierChip, conv: Conversions, level: number): string | undefined {
  if (chip === 'HP') return `Includes STA: 1 STA is ${conv.hpPerSta.toFixed(1)} HP for your classes at level ${String(level)}.`
  if (chip === 'MANA') {
    const p = [conv.manaPerWis > 0 ? `WIS ${conv.manaPerWis.toFixed(1)}` : '', conv.manaPerInt > 0 ? `INT ${conv.manaPerInt.toFixed(1)}` : ''].filter((s) => s !== '')
    return p.length > 0
      ? `Includes ${p.join(' and ')} mana a point (the stat between 100 and 200). INT and WIS do nothing else for damage.`
      : 'No picked class gets mana from INT or WIS.'
  }
  if (chip === 'STR') return 'Melee hit and damage. Does nothing for a bow in Legends.'
  if (chip === 'DEX') return 'Bow damage (archery uses DEX in place of STR), proc rate, ranger archery crits.'
  if (chip === 'AGI') return 'Avoidance up to 200; below 75 it costs AC.'
  if (chip === 'RESISTS') return 'The average of fire, cold, magic, disease and poison. About 6 points is 1% resist.'
  if (chip === 'HASTE') return 'Haste does not stack: only your highest worn haste counts. A slot is credited only for haste above what your other slots already give.'
  if (isRatioChip(chip)) return 'Never counted in an Any slot.'
  return undefined
}

/** "A good endgame item carries +6; that much counts as 1 x the lane." */
export function unitText(chip: TierChip, unit: number): string {
  if (isSplitResist(chip)) return `Each resist counts a fifth of Resists: ${chipValueText(chip, Number(unit.toPrecision(3)))} counts as 1 x the lane.`
  return `A good endgame item carries ${chipValueText(chip, Number(unit.toPrecision(3)))}; that much counts as 1 x the lane.`
}

export type Tone = 'good' | 'warn' | 'plain'

/**
 * THE BUDGET IS OUR OWN ESTIMATE AND RANKS NOTHING (owner, 2026-11-24: *"Don't use this weird
 * calculation you invented, you can show it but don't use it"*). No public formula exists
 * (agent/MEASURED.md); it is the item's stats in units against the median item of its slot and
 * drop level, shown in the hover only, and the words say so.
 */
export function budgetText(b: ItemBudget | undefined): { text: string; tone: Tone } | undefined {
  if (b === undefined) return undefined
  const pct = Math.round(b.ratio * 100)
  const tone: Tone = pct >= 130 ? 'good' : pct < 80 ? 'warn' : 'plain'
  return { text: `Stat budget estimate: ${String(pct)}% of a typical ${b.band} ${b.slot.toLowerCase()} (our own estimate; it does not change the ranking)`, tone }
}

/** Why an item's haste counted less than it states: only the highest worn haste counts. Undefined when it all counted. */
export function hasteNote(stated: number | undefined, counted: number, otherHaste: number): string | undefined {
  if (stated === undefined || stated <= 0 || counted >= stated) return undefined
  const head = `Haste ${String(Math.round(stated))}%`
  if (otherHaste <= 0) return `${head}: ${String(Math.round(counted))}% counts (the haste cap)`
  return counted > 0
    ? `${head}: only ${String(Math.round(counted))}% counts, another slot gives ${String(Math.round(otherHaste))}% (haste does not stack)`
    : `${head}: does not count, another slot gives ${String(Math.round(otherHaste))}% (haste does not stack)`
}

/** One line of the hover's compare: a stat, the best item's value, the worn item's, and who is ahead. */
export interface CompareRow {
  chip: TierChip
  label: string
  best: string
  worn: string
  /** which side holds more of it */
  ahead: 'best' | 'worn' | 'same'
}

/**
 * The stats on the board (not Unassigned) that either item states, best lane first. Haste reads the
 * percent each would COUNT in this loadout; ratios are left to `ratioShown`, the caller's
 * does-it-swing-here verdict.
 */
export function compareRows(
  best: Partial<Record<TierChip, number>>,
  worn: Partial<Record<TierChip, number>>,
  setup: TierSetup,
  ratioShown: (chip: TierChip) => boolean
): CompareRow[] {
  const chips = activeChips(setup.split).filter(
    (c) => setup.board[c] !== 'Off' && (best[c] !== undefined || worn[c] !== undefined) && (!isRatioChip(c) || ratioShown(c))
  )
  const rank = (c: TierChip): number => RANKED_TIERS.indexOf(setup.board[c] as never)
  chips.sort((a, b) => rank(a) - rank(b))
  return chips.map((chip) => {
    const b = best[chip] ?? 0
    const w = worn[chip] ?? 0
    const eps = isRatioChip(chip) ? 0.005 : 0.05
    return {
      chip,
      label: shortLabel(chip),
      best: best[chip] === undefined ? '-' : chipValueText(chip, b),
      worn: worn[chip] === undefined ? '-' : chipValueText(chip, w),
      ahead: Math.abs(b - w) < eps ? 'same' : b > w ? 'best' : 'worn'
    }
  })
}

export function cellLabel(cell: PlanSlotId): string {
  return planSlotLabel(cell)
}

/** Where it comes from, in one line: the first zone and mob, with the mob's level; else how it is made. */
export function sourceText(row: Pick<GearRow, 'dropZones' | 'dropMobs' | 'dropLevels' | 'playerCrafted'>): string {
  const zone = row.dropZones?.find((z) => z !== '')
  const i = zone === undefined ? -1 : (row.dropZones ?? []).indexOf(zone)
  const mob = i >= 0 ? row.dropMobs?.[i] : undefined
  const level = i >= 0 ? row.dropLevels?.[i] : undefined
  if (zone !== undefined) return `${zone}${mob ? ` · ${mob}` : ''}${level ? ` (lvl ${level})` : ''}`
  return row.playerCrafted ? 'Player crafted' : 'Source not stated'
}

/** Copies this character owns, by item key: every wearable copy the dump names. */
export function ownedCopies(map: GearOwnershipMap | null): Map<string, number> {
  const out = new Map<string, number>()
  if (map === null) return out
  for (const [key, o] of map) {
    const n = o.facts.reduce((sum, f) => sum + f.count, 0)
    if (n > 0) out.set(key, n)
  }
  return out
}

/** A loadout's value per chip: summed, haste the best single one (down to the item haste cap), ratios left out. */
export function loadoutTotals(rows: readonly Pick<GearRow, 'stats'>[], model: TierModel, split: boolean, hasteCap?: number): Partial<Record<TierChip, number>> {
  const totals: Partial<Record<TierChip, number>> = {}
  const chips = activeChips(split).filter((c) => !isRatioChip(c))
  for (const row of rows) {
    const values = model.valuesOf(row)
    for (const chip of chips) {
      const v = values[chip]
      if (v === undefined) continue
      totals[chip] = chip === 'HASTE' ? Math.max(totals.HASTE ?? v, v) : (totals[chip] ?? 0) + v
    }
  }
  if (totals.HASTE !== undefined && hasteCap !== undefined && totals.HASTE > hasteCap) totals.HASTE = hasteCap
  return totals
}

export interface TotalsRow {
  chip: TierChip
  label: string
  tier: string
  best: string
  worn: string
  cap: string
  capped: boolean
  /** the target (the board's cap) as a number, for the Target column's input */
  capValue?: number
  /** the worn total has reached the target */
  wornReached: boolean
}

function totalText(chip: TierChip, v: number | undefined): string {
  if (v === undefined) return '-'
  if (chip === 'HASTE') return `${String(Math.round(v))}%`
  return chip === 'RESISTS' ? v.toFixed(1) : String(Math.round(v))
}

/** The totals table: the stats on the board that the loadout or the worn gear states, best lane first. */
export function totalsRows(best: Partial<Record<TierChip, number>>, worn: Partial<Record<TierChip, number>>, setup: TierSetup): TotalsRow[] {
  const chips = activeChips(setup.split).filter(
    (c) => !isRatioChip(c) && setup.board[c] !== 'Off' && (best[c] !== undefined || worn[c] !== undefined || setup.caps[c] !== undefined)
  )
  const rank = (c: TierChip): number => RANKED_TIERS.indexOf(setup.board[c] as never)
  chips.sort((a, b) => rank(a) - rank(b))
  return chips.map((chip) => {
    const cap = setup.caps[chip]
    const capped = cap !== undefined && (best[chip] ?? 0) >= cap
    return {
      chip,
      label: chipLabel(chip),
      tier: setup.board[chip],
      best: totalText(chip, best[chip]),
      worn: totalText(chip, worn[chip]),
      cap: cap === undefined ? '' : `${String(cap)}${capped ? ' capped' : ''}`,
      capped,
      ...(cap === undefined ? {} : { capValue: cap }),
      wornReached: cap !== undefined && (worn[chip] ?? 0) >= cap
    }
  })
}

/** Chip colour family on the board, from its group. */
export function chipFamily(chip: TierChip): 'weapon' | 'resist' | 'pool' | 'plain' {
  const g = chipGroup(chip)
  return g === 'weapons' ? 'weapon' : g === 'resists' ? 'resist' : g === 'pools' ? 'pool' : 'plain'
}
