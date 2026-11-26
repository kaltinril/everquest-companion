// aaSpecial.ts — the Special sub-tab of the Alt. Advancement tab (owner, 2026-11-25: Special "goes on
// and on"): the stat cap as a sum, the next reincarnation planned, the lines started, and the rest
// folded away. Pure.
//
// THE CAP is shared/reincarnationCap.ts's: 510 hard; once reincarnated, 510 + 10 a reincarnation
// before Rulers of Kunark (11 from it) + 5 a Human rank + 3 a Half Elf rank, soft. The next
// reincarnation adds its raise and, into Human or Half Elf below rank 3, that rank's points; class
// lines at rank 2 reach 3 and unlock their hotkey (the hotkey cell's name).

import type { AaBoardRow, AaListGroup } from './aaBoard'
import { aaEffectValue } from './aaEffects'
import { aaRankOf, type AaRanked } from './aaRanks'
import type { ClassAbbr } from './classCombo'
import { BASE_STAT_CAP, HALF_ELF_AA, HUMAN_AA, RULERS_OF_KUNARK, reincarnationRaise, reincarnationStatCap } from './reincarnationCap'
import { classDisplayName } from './spellLevels'

export interface AaCapTerm {
  n: number
  label: string
}

export interface AaCapView {
  terms: AaCapTerm[]
  total: number
  soft: boolean
}

const HUMAN_PER_RANK = 5
const HALF_ELF_PER_RANK = 3
const LINE_TOP = 3

/** The cap as the sum the tab prints: hard cap, each reincarnation (oldest first), the Half Elf and Human ranks. */
export function aaCapView(ranked: readonly AaRanked[], reincarnationTimes: readonly number[]): AaCapView {
  const human = aaRankOf(ranked, HUMAN_AA)
  const halfElf = aaRankOf(ranked, HALF_ELF_AA)
  const cap = reincarnationStatCap({ reincarnationTimes, humanRanks: human, halfElfRanks: halfElf })
  const terms: AaCapTerm[] = [{ n: BASE_STAT_CAP, label: 'hard cap' }]
  if (cap.reincarnations > 0) {
    const times = [...reincarnationTimes].sort((a, b) => a - b)
    times.forEach((ts, i) => terms.push({ n: reincarnationRaise(ts), label: `reincarnation ${String(i + 1)}` }))
    if (halfElf > 0) terms.push({ n: HALF_ELF_PER_RANK * halfElf, label: `Half Elf ${String(halfElf)}` })
    if (human > 0) terms.push({ n: HUMAN_PER_RANK * human, label: `Human ${String(human)}` })
  }
  return { terms, total: cap.value, soft: cap.over > 0 }
}

export interface AaRebirthPlan {
  /** From Rulers of Kunark (2026-12-08): a reincarnation raises the cap 11, before it 10. */
  kunark: boolean
  /** The race line the reincarnation goes into ("Half Elf"). */
  race: string
}

export interface AaNextRebirth {
  raise: number
  /** The race line's rank now. */
  raceRank: number
  /** What its next rank gives; null at rank 3 or with no number. */
  raceGives: string | null
  /** Cap points the race rank adds (Human 5, Half Elf 3, else 0). */
  raceAdd: number
  /** The cap after it. */
  total: number
  /** Hotkeys the combo's class lines unlock at rank 3 ("Thrash"). */
  unlocks: string[]
}

/** Cap points a rank of this race line adds. */
const capPerRank = (race: string): number => (race === 'Human' ? HUMAN_PER_RANK : race === 'Half Elf' ? HALF_ELF_PER_RANK : 0)

const raceKey = (race: string): string => `Race Reincarnation: ${race}`

/** The cap and the unlocks after one more reincarnation, as planned. */
export function aaNextRebirth(board: readonly AaBoardRow[], reincarnationTimes: readonly number[], plan: AaRebirthPlan, classes: readonly ClassAbbr[]): AaNextRebirth {
  const ranked = board.map((b) => b.r)
  const line = board.find((b) => b.r.key === raceKey(plan.race))
  const raceRank = line?.r.rank ?? 0
  const up = raceRank < LINE_TOP ? 1 : 0
  const human = aaRankOf(ranked, HUMAN_AA) + (plan.race === 'Human' ? up : 0)
  const halfElf = aaRankOf(ranked, HALF_ELF_AA) + (plan.race === 'Half Elf' ? up : 0)
  const when = plan.kunark ? RULERS_OF_KUNARK : RULERS_OF_KUNARK - 1
  const total = reincarnationStatCap({ reincarnationTimes: [...reincarnationTimes, when], humanRanks: human, halfElfRanks: halfElf }).value
  const lines = classes.map((c) => board.find((b) => b.r.key === `Class Reincarnation: ${classDisplayName(c)}`))
  const unlocks = lines.flatMap((b) => (b?.r.rank === LINE_TOP - 1 && b.r.row.hk !== undefined ? [b.r.row.hk.split(':')[0].trim()] : []))
  return { raise: reincarnationRaise(when), raceRank, raceGives: line === undefined || up === 0 ? null : aaEffectValue(line.effect, raceRank + 1), raceAdd: up * capPerRank(plan.race), total, unlocks }
}

export interface AaSpecialLayout {
  /** Banestrike, then the class lines, then the race lines, with a rank held. */
  started: AaBoardRow[]
  classLines: AaBoardRow[]
  raceLines: AaBoardRow[]
  /** The lines not started, as list groups (empty ones left out). */
  rest: AaListGroup[]
  completionist: AaBoardRow | null
  /** Class lines at rank 3 now, and after the next reincarnation of these classes. */
  classDone: number
  classDoneNext: number
  /** How many class lines there are. */
  classTotal: number
  /** Every race line, for the plan's race choice. */
  races: { race: string; rank: number }[]
}

const isClassLine = (b: AaBoardRow): boolean => b.r.key.startsWith('Class Reincarnation: ')
const isRaceLine = (b: AaBoardRow): boolean => b.r.key.startsWith('Race Reincarnation: ')

/** The Special rows laid out: what is started, what is not, and the Completionist count. */
export function aaSpecialLayout(board: readonly AaBoardRow[], classes: readonly ClassAbbr[], match: (b: AaBoardRow) => boolean = () => true): AaSpecialLayout {
  const special = board.filter((b) => b.r.row.section === 'special')
  const comp = special.find((b) => b.r.key === 'Reincarnation: Completionist') ?? null
  const lines = special.filter((b) => b !== comp && match(b))
  const names = new Set(classes.map(classDisplayName))
  const classAll = special.filter(isClassLine)
  const done = classAll.filter((b) => b.r.rank >= LINE_TOP).length
  const next = classAll.filter((b) => b.r.rank === LINE_TOP - 1 && names.has(b.r.key.slice('Class Reincarnation: '.length))).length
  const classLines = lines.filter((b) => b.r.rank === 0 && isClassLine(b))
  const raceLines = lines.filter((b) => b.r.rank === 0 && isRaceLine(b))
  const rest: AaListGroup[] = [
    { title: 'Class lines', kind: 'mine' as const, rows: classLines },
    { title: 'Race lines', kind: 'mine' as const, rows: raceLines }
  ].filter((g) => g.rows.length > 0)
  return {
    started: lines.filter((b) => b.r.rank > 0),
    classLines,
    raceLines,
    rest,
    completionist: comp,
    classDone: done,
    classDoneNext: done + next,
    classTotal: classAll.length,
    races: special.filter(isRaceLine).map((b) => ({ race: b.r.key.slice('Race Reincarnation: '.length), rank: b.r.rank }))
  }
}

/** The race the plan opens on: the highest-ranked race line started below rank 3, else Human. */
export function aaDefaultRace(races: readonly { race: string; rank: number }[]): string {
  let best: { race: string; rank: number } | null = null
  for (const r of races) if (r.rank > 0 && r.rank < LINE_TOP && (best === null || r.rank > best.rank)) best = r
  return best?.race ?? 'Human'
}
