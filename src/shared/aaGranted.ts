// aaGranted.ts — the ranks the game grants without a purchase (owner, 2026-11-25: "free AA's should be
// marked as obtained as long as the level or requirement has been reached"). The log writes no
// purchase line for a cost-0 rank, so shared/aaRanks.ts alone would show it at 0. Pure.
//
// A RANK IS GRANTED when it costs 0 (and every rank below it does), the row is the character's
// (General: everyone; Archetype: `archetypeFit` 'mine'; Class: one of the classes; Special: never,
// those come from reincarnating and achievements), and its requirements are met: the level the row
// text states (`Level 6`, or one per rank `Level 12/30/50`; none stated is level 1) and any other AA
// (`First Aid at Level 3`, `Requires Critical Affliction rank 1/2/3`) at that AA's own rank. A
// requirement this cannot read grants nothing: a rank is never guessed held. No level known, none.
//
// THE ORDER: the player's pick, then the log or the grant, whichever is higher (a free rank is held
// whatever the log says), then 0.

import type { AaTableRow } from './aaTable.generated'
import { aaFold } from './aaLogMatch'
import { aaRankCosts, type AaRanked } from './aaRanks'
import { archetypeFit } from './aaArchetypeClasses'
import type { ClassAbbr } from './classCombo'
import { classAbbrForDisplayName } from './spellLevels'

/** What decides a grant: the level the log last stated (null when unknown) and the classes. */
export interface AaCharacter {
  level: number | null
  classes: readonly ClassAbbr[]
}

/** A row's requirements, by rank: a list of one holds for every rank. */
export interface AaRequirements {
  levels: number[]
  aas: { name: string; ranks: number[] }[]
}

const LIST = String.raw`(\d+(?:\s*\/\s*\d+)*)`
const LEVEL = new RegExp(String.raw`^level\s+${LIST}$`, 'i')
const OTHER_AA = new RegExp(String.raw`^(.+?)\s+(?:at\s+)?(?:level|rank)\s+${LIST}$`, 'i')
const REQUIRES = new RegExp(String.raw`\bRequires\s+([^.]+?)\s+rank\s+${LIST}`, 'gi')

const nums = (list: string): number[] => list.split('/').map((n) => Number(n.trim()))

/** The requirements the row text states; null when part of them cannot be read. */
export function aaRequirements(row: AaTableRow): AaRequirements | null {
  const out: AaRequirements = { levels: [1], aas: [] }
  for (const m of row.text.matchAll(REQUIRES)) out.aas.push({ name: m[1], ranks: nums(m[2]) })
  const at = row.text.search(/Requirements:(?!.*Requirements:)/is)
  if (at < 0) return out
  const after = row.text.slice(at + 'Requirements:'.length).trim()
  const stop = after.indexOf('.')
  // A later sentence naming a requirement ("Rank 2 requires level 59") is one this cannot place.
  if (stop >= 0 && /requir/i.test(after.slice(stop))) return null
  for (const clause of (stop < 0 ? after : after.slice(0, stop)).split(',').map((c) => c.trim())) {
    const level = LEVEL.exec(clause)
    const aa = level === null ? OTHER_AA.exec(clause) : null
    if (level !== null) out.levels = nums(level[1])
    else if (aa !== null) out.aas.push({ name: aa[1], ranks: nums(aa[2]) })
    else return null
  }
  return out
}

/** The value a rank (1-based) needs from a per-rank list; null when the list does not fit the row. */
function perRank(list: readonly number[], rank: number, ranks: number): number | null {
  if (list.length === 1) return list[0]
  return list.length === ranks ? list[rank - 1] : null
}

/** Whether the row is one the character's classes have. */
function aaIsMine(row: AaTableRow, classes: readonly ClassAbbr[]): boolean {
  if (row.section === 'general') return true
  if (row.section === 'archetype') return archetypeFit(row.name, classes) === 'mine'
  if (row.section !== 'class') return false
  const abbr = classAbbrForDisplayName(row.class ?? '')
  return abbr !== undefined && classes.includes(abbr)
}

type RankOf = (name: string) => number

/** Whether one rank's requirements are met, at this level and with these other AAs' ranks. */
function rankMet(req: AaRequirements & { ranks: number }, rank: number, level: number, rankOf: RankOf): boolean {
  const need = perRank(req.levels, rank, req.ranks)
  if (need === null || level < need) return false
  return req.aas.every((aa) => {
    const at = perRank(aa.ranks, rank, req.ranks)
    return at !== null && rankOf(aa.name) >= at
  })
}

/** The rank the game grants in this row: the free ranks from 1 whose requirements are met. */
export function aaGrantedRank(row: AaTableRow & { removed?: unknown }, who: AaCharacter, rankOf: RankOf): number {
  if (who.level === null || row.removed !== undefined || !aaIsMine(row, who.classes)) return 0
  const read = aaRequirements(row)
  if (read === null) return 0
  const req = { ...read, ranks: row.ranks }
  const costs = aaRankCosts(row)
  let rank = 0
  while (rank < row.ranks && costs[rank] === 0 && rankMet(req, rank + 1, who.level, rankOf)) rank++
  return rank
}

/** The ranks with each grant applied: pick, then the higher of log and grant, then 0. */
export function withGranted(ranked: readonly AaRanked[], who: AaCharacter): AaRanked[] {
  if (who.level === null) return [...ranked]
  const byName = new Map<string, AaRanked[]>()
  for (const r of ranked) for (const n of new Set([aaFold(r.row.name), aaFold(r.key)])) byName.set(n, [...(byName.get(n) ?? []), r])
  const granted = new Map<AaRanked, number>()
  const busy = new Set<AaRanked>()
  const grantOf = (r: AaRanked): number => {
    const known = granted.get(r)
    if (known !== undefined) return known
    // A requirement that leads back to this row grants nothing.
    if (busy.has(r)) return 0
    busy.add(r)
    const g = r.source === 'pick' ? 0 : aaGrantedRank(r.row, who, rankOf)
    busy.delete(r)
    granted.set(r, g)
    return g
  }
  const held = (r: AaRanked): number => (r.source === 'pick' ? r.rank : Math.max(r.rank, grantOf(r)))
  function rankOf(name: string): number {
    return Math.max(0, ...(byName.get(aaFold(name)) ?? []).map(held))
  }
  return ranked.map((r) => {
    const g = grantOf(r)
    return r.source !== 'pick' && g > r.rank ? { ...r, rank: g, source: 'granted' as const } : r
  })
}
