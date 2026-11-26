// aaBoard.ts — the Alt. Advancement tab's rows for a class combination: which AAs the combo can use,
// their top rank for it, what they do and cost, and the lists each sub-tab shows (owner, 2026-11-25:
// "someone may want to look at other class combinations"; "what if i want to look at aa's i can't
// use, just to see what they are??"). Pure.
//
// USABLE: General and Special always; an Archetype AA by `archetypeFit`; a Class AA by its class. The
// game gives only the combo in force its Archetype and Class AAs (MEASURED.md, "Alternate
// advancement"), so a log rank on a row these classes lack was bought under another loadout: kept
// (THE LOG WINS for what was bought), flagged `elsewhere`, and like every row the combo cannot use
// left out of every total and recommendation. Only with no classes known does a held rank count.

import { AA_GROUPS, type AaGroup } from './aaEffectTable'
import { aaEffect, type AaEffect } from './aaEffects'
import { aaCostSum, aaRowCost, type AaCostSum, type AaRowCost } from './aaCost'
import { ARCHETYPE_BY_CLASS, IN_EVERY_RUN, archetypeFit, type ArchetypeFit } from './aaArchetypeClasses'
import { aaRequirements } from './aaGranted'
import type { AaRanked } from './aaRanks'
import type { AaSection } from './aaTable.generated'
import type { ClassAbbr } from './classCombo'
import { classAbbrForDisplayName, classDisplayName } from './spellLevels'

export type AaFit = ArchetypeFit

export interface AaBoardRow {
  r: AaRanked
  fit: AaFit
  usable: boolean
  /** The top rank for this combo (never below a held rank). */
  max: number
  effect: AaEffect
  cost: AaRowCost | null
  /** Usable, bought with points, not removed, below its top rank, and not `unknown`. */
  buyable: boolean
  /** The character's own combo lacks the row, but the log bought ranks in it: another loadout's. */
  elsewhere: boolean
}

export interface AaCombo {
  classes: readonly ClassAbbr[]
  /** The classes are the character's own (detected), not a planned combo. */
  own: boolean
}

/** Top ranks a class decides (the rows' own text, Daybreak's notes): [classes, top] pairs, then the rest's top. */
const CLASS_TOPS: Readonly<Record<string, { by: readonly [readonly ClassAbbr[], number][]; rest: number }>> = {
  'Steadfast Will': { by: [[['WAR', 'PAL', 'SHD'], 8], [['RNG', 'MNK'], 7]], rest: 6 },
  Rampage: { by: [[['WAR', 'BER'], 2]], rest: 1 }
}

/** Whether these classes can use the row. */
export function aaFit(r: AaRanked, combo: AaCombo): AaFit {
  const { section } = r.row
  if (section === 'general' || section === 'special') return 'mine'
  // No classes known: nothing tells another loadout's rank from this one's, so the log's counts.
  if (combo.classes.length === 0) return combo.own && r.rank > 0 ? 'mine' : 'mayApply'
  if (section === 'archetype') return archetypeFit(r.row.name, combo.classes)
  const abbr = classAbbrForDisplayName(r.row.class ?? '')
  return abbr !== undefined && combo.classes.includes(abbr) ? 'mine' : 'other'
}

/** The row's top rank for these classes: a class-decided top where the row has one, never below the held rank. */
export function aaComboMax(r: AaRanked, classes: readonly ClassAbbr[]): number {
  const tops = CLASS_TOPS[r.row.name]
  if (tops === undefined || classes.length === 0) return r.max
  const top = Math.max(tops.rest, ...tops.by.filter(([who]) => who.some((c) => classes.includes(c))).map(([, n]) => n))
  return Math.max(r.rank, Math.min(r.max, top))
}

/** Every ranked row, read for this combo. */
export function aaBoard(ranked: readonly AaRanked[], combo: AaCombo): AaBoardRow[] {
  return ranked.map((r) => {
    const fit = aaFit(r, combo)
    const usable = fit === 'mine'
    const max = aaComboMax(r, combo.classes)
    const cost = aaRowCost(r.row, r.rank, max)
    // A rank the log cannot settle (aaRanks.ts `unknown`) is never sold to the player.
    const buyable = usable && cost !== null && r.rank < max && r.unknown !== true
    const elsewhere = combo.own && fit === 'other' && (r.logRank ?? 0) > 0
    return { r, fit, usable, max, effect: aaEffect(r.row), cost, buyable, elsewhere }
  })
}

const fold = (s: string): string => s.toLowerCase().replace(/['’]/g, '')

/** Whether a row matches a search: its name, the wiki's name, what it does, its class, its text. */
export function aaMatches(b: AaBoardRow, query: string): boolean {
  const q = fold(query.trim())
  if (q === '') return true
  const { r, effect } = b
  return fold([r.key, r.wikiName ?? '', effect.label, r.row.class ?? '', r.row.text, r.row.hk ?? ''].join(' ')).includes(q)
}

export type AaScope = 'usable' | 'all'

/** The level a row's first rank asks for, as the wiki's text states it; null when that text cannot be read. */
export function aaStartLevel(b: AaBoardRow): number | null {
  const req = aaRequirements(b.r.row)
  return req === null ? null : req.levels[0]
}

/**
 * Whether a row is in reach by `maxLevel` (null: no level filter). The level is the wiki's, and the wiki
 * can be wrong (owner, 2026-11-26: fix the wiki when a row is found wrong); a requirement the text does
 * not state clearly stays in, so the filter never hides a row it cannot rule out.
 */
export function aaWithinLevel(b: AaBoardRow, maxLevel: number | null): boolean {
  if (maxLevel === null) return true
  const level = aaStartLevel(b)
  return level === null || level <= maxLevel
}

/** How a list's rows are ordered inside each group: the wiki's order, or by name or level. */
export interface AaSort {
  key: 'wiki' | 'name' | 'level'
  dir: 'asc' | 'desc'
}

export const AA_WIKI_ORDER: AaSort = { key: 'wiki', dir: 'asc' }

/**
 * Each group's rows in the sort's order; the groups themselves stay where they are (a class stays a
 * class). A row whose level the wiki does not state clearly sorts after every stated one, either way;
 * ties keep the wiki's order.
 */
export function aaSortGroups(groups: readonly AaListGroup[], sort: AaSort): AaListGroup[] {
  if (sort.key === 'wiki') return [...groups]
  const sign = sort.dir === 'asc' ? 1 : -1
  const cmp = (a: AaBoardRow, b: AaBoardRow): number => {
    if (sort.key === 'name') return sign * a.r.key.localeCompare(b.r.key)
    const la = aaStartLevel(a)
    const lb = aaStartLevel(b)
    if (la === null || lb === null) return (la === null ? 1 : 0) - (lb === null ? 1 : 0)
    return sign * (la - lb)
  }
  return groups.map((g) => ({ ...g, rows: [...g.rows].sort(cmp) }))
}

/** What a list shows: the scope, the search and the level filter. */
export interface AaFilter {
  scope: AaScope
  query: string
  maxLevel?: number | null
}

const shown = (b: AaBoardRow, query: string, maxLevel: number | null | undefined): boolean => aaMatches(b, query) && aaWithinLevel(b, maxLevel ?? null)

export interface AaListGroup {
  /** Null for a list with one group. */
  title: string | null
  kind: 'mine' | 'may' | 'other'
  rows: AaBoardRow[]
}

const comboText = (classes: readonly ClassAbbr[]): string => classes.join('/')

/** What a row's "not for" note and an unusable group's title say. */
export function aaNotFor(classes: readonly ClassAbbr[]): string {
  return classes.length === 0 ? 'not for your classes' : `not for ${comboText(classes)}`
}

function classGroups(rows: readonly AaBoardRow[], classes: readonly ClassAbbr[], scope: AaScope): AaListGroup[] {
  const byClass = new Map<string, AaBoardRow[]>()
  for (const b of rows) byClass.set(b.r.row.class ?? '', [...(byClass.get(b.r.row.class ?? '') ?? []), b])
  const own = classes.map(classDisplayName).filter((c) => byClass.has(c))
  const out: AaListGroup[] = own.map((c) => ({ title: c, kind: 'mine' as const, rows: byClass.get(c) ?? [] }))
  // A usable row of a class outside the combo (held, with no classes known) shows under its class.
  for (const [cls, list] of byClass) {
    if (own.includes(cls)) continue
    const held = list.filter((b) => b.usable)
    if (held.length > 0) out.push({ title: cls, kind: 'mine', rows: held })
    const rest = list.filter((b) => !b.usable)
    if (scope === 'all' && rest.length > 0) out.push({ title: `${cls} · ${aaNotFor(classes)}`, kind: 'other', rows: rest })
  }
  return out
}

/** One sub-tab's list: the combo's rows, then (Archetype) the ones that may apply, then with `all` the rest. */
export function aaTabGroups(board: readonly AaBoardRow[], section: AaSection, classes: readonly ClassAbbr[], view: AaFilter): AaListGroup[] {
  const rows = board.filter((b) => b.r.row.section === section && shown(b, view.query, view.maxLevel))
  if (section === 'class') return classGroups(rows, classes, view.scope).filter((g) => g.rows.length > 0)
  const groups: AaListGroup[] = [
    { title: null, kind: 'mine', rows: rows.filter((b) => b.usable) },
    { title: 'May apply · measured only beside Warrior and Monk', kind: 'may', rows: rows.filter((b) => b.fit === 'mayApply') },
    { title: `${aaNotFor(classes)} · shown to read, not counted`, kind: 'other', rows: view.scope === 'all' ? rows.filter((b) => b.fit === 'other') : [] }
  ]
  return groups.filter((g) => g.rows.length > 0)
}

const SECTIONS: readonly { id: AaSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'archetype', label: 'Archetype' },
  { id: 'class', label: 'Class' },
  { id: 'special', label: 'Special' }
]

/** A search across every tab: the matching rows the scope shows, one group a section. */
export function aaSearchGroups(board: readonly AaBoardRow[], scope: AaScope, query: string, maxLevel: number | null = null): AaListGroup[] {
  const rows = board.filter((b) => (b.usable || scope === 'all') && shown(b, query, maxLevel))
  return SECTIONS.map((s) => ({ title: s.label, kind: 'mine' as const, rows: rows.filter((b) => b.r.row.section === s.id) })).filter((g) => g.rows.length > 0)
}

/** How many rows a search across every tab finds. */
export function aaSearchCount(board: readonly AaBoardRow[], scope: AaScope, query: string, maxLevel: number | null = null): number {
  return aaSearchGroups(board, scope, query, maxLevel).reduce((n, g) => n + g.rows.length, 0)
}

export interface AaTabCount {
  maxed: number
  of: number
  points: AaCostSum
  /** Rows matching the search the scope shows; null with no search. */
  matches: number | null
}

/** A sub-tab's count: maxed of usable (within the level filter; a row the log cannot settle left out), their points, and the search's matches. */
export function aaTabCount(board: readonly AaBoardRow[], section: AaSection, { scope, query, maxLevel = null }: AaFilter): AaTabCount {
  const mine = board.filter((b) => b.r.row.section === section && b.usable && b.r.unknown !== true && aaWithinLevel(b, maxLevel))
  const matches = query.trim() === '' ? null : board.filter((b) => b.r.row.section === section && (b.usable || scope === 'all') && shown(b, query, maxLevel)).length
  return { maxed: mine.filter((b) => b.r.rank >= b.max).length, of: mine.length, points: aaCostSum(mine.map((b) => b.cost)), matches }
}

export interface AaLeft {
  /** Buyable rows. */
  count: number
  /** Points to the top rank of every buyable row. */
  points: number
  unknown: boolean
}

/** Usable rows the log cannot settle (a one-rank AA `/alt list` prints the same owned or not). */
export function aaCantTell(board: readonly AaBoardRow[]): AaBoardRow[] {
  return board.filter((b) => b.usable && b.r.unknown === true && b.r.row.removed === undefined)
}

/** What the combo has left to buy. */
export function aaLeft(board: readonly AaBoardRow[]): AaLeft {
  const left = board.filter((b) => b.buyable)
  const sum = aaCostSum(left.map((b) => b.cost))
  return { count: left.length, points: sum.total - sum.spent, unknown: sum.unknown }
}

export interface AaPlanDelta {
  /** Rows another combo can use that the character's own cannot. */
  adds: number
  /** Points to max what it adds, with the ranks carried over. */
  points: number
  unknown: boolean
  /** The character's own rows that combo cannot use. */
  drops: number
}

/** What planning another combo changes against the character's own. */
export function aaPlanDelta(planned: readonly AaBoardRow[], own: readonly AaBoardRow[]): AaPlanDelta {
  const ownUsable = new Set(own.filter((b) => b.usable).map((b) => b.r))
  const added = planned.filter((b) => b.usable && !ownUsable.has(b.r) && b.cost !== null)
  const sum = aaCostSum(added.map((b) => b.cost))
  const plannedUsable = new Set(planned.filter((b) => b.usable).map((b) => b.r))
  return { adds: added.length, points: sum.total - sum.spent, unknown: sum.unknown, drops: [...ownUsable].filter((r) => !plannedUsable.has(r)).length }
}

/** The groups in "what it does" order, each with its rows; empty groups left out. */
export function aaByGroup<T>(items: readonly T[], groupOf: (t: T) => AaGroup): { group: AaGroup; label: string; items: T[] }[] {
  return AA_GROUPS.map((g) => ({ group: g.id, label: g.label, items: items.filter((t) => groupOf(t) === g.id) })).filter((g) => g.items.length > 0)
}

/** Whether two class lists hold the same classes. */
export function aaSameClasses(a: readonly ClassAbbr[], b: readonly ClassAbbr[]): boolean {
  return a.length === b.length && a.every((c) => b.includes(c))
}

/** Points the usable rows' held ranks cost, at the corrected prices. */
export function aaSpent(board: readonly AaBoardRow[]): AaCostSum {
  return aaCostSum(board.filter((b) => b.usable).map((b) => b.cost))
}

/** Which of the classes bring a row: "Every class has it.", "From your Warrior and Monk.", "A Monk AA."; null for General and Special. */
export function aaBroughtBy(r: AaRanked, classes: readonly ClassAbbr[]): string | null {
  if (r.row.section === 'class') return r.row.class === undefined ? null : `A ${r.row.class} AA.`
  if (r.row.section !== 'archetype') return null
  if (IN_EVERY_RUN.includes(r.row.name)) return 'Every class has it.'
  const who = classes.filter((c) => ARCHETYPE_BY_CLASS[c].includes(r.row.name)).map(classDisplayName)
  return who.length === 0 ? null : `From your ${who.join(' and ')}.`
}
