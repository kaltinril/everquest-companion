// reincarnationCap.ts — the base stat cap after reincarnations, for the Best in slot sheet (owner,
// 2026-11-25; docs/community/requirements/alt-advancement.md). Pure.
//
// No reincarnation: the cap is hard. Each reincarnation turns it soft and raises it by one fifth of
// the levels reincarnated away: 10 for 50 levels, 11 for 55 from Rulers of Kunark (2026-12-08). The
// Race Reincarnation: Human and Half Elf AAs raise it by 5 and 3 a rank, as their descriptions say.
// Past a soft cap a point counts a fifth (docs/community/agent/MEASURED.md, "Caps").

import { aaRankOf, type AaRanked } from './aaRanks'
import { ATTRIBUTE_HARD_CAP, KUNARK_LAUNCH, type StatCap as CapRule } from './planner/statCaps'

export const BASE_STAT_CAP = ATTRIBUTE_HARD_CAP

/** What a point above a soft cap is worth. */
export const SOFT_CAP_OVER = 0.2

/** Rulers of Kunark: the level cap goes to 55, local midnight. */
export const RULERS_OF_KUNARK = KUNARK_LAUNCH.getTime()

export const HUMAN_AA = 'Race Reincarnation: Human'
export const HALF_ELF_AA = 'Race Reincarnation: Half Elf'

/** Cap points per Human and Half Elf rank. */
const HUMAN_PER_RANK = 5
const HALF_ELF_PER_RANK = 3

export interface StatCap extends CapRule {
  reincarnations: number
}

export interface StatCapInput {
  reincarnationTimes: readonly number[]
  humanRanks: number
  halfElfRanks: number
  hardCap?: number
}

/** One reincarnation's raise: one fifth of the levels it took away. */
export function reincarnationRaise(ts: number): number {
  return ts >= RULERS_OF_KUNARK ? 11 : 10
}

export function reincarnationStatCap({ reincarnationTimes, humanRanks, halfElfRanks, hardCap = BASE_STAT_CAP }: StatCapInput): StatCap {
  const reincarnations = reincarnationTimes.length
  if (reincarnations === 0) return { value: hardCap, over: 0, reincarnations }
  const raised = reincarnationTimes.reduce((s, ts) => s + reincarnationRaise(ts), 0)
  const value = hardCap + raised + HUMAN_PER_RANK * humanRanks + HALF_ELF_PER_RANK * halfElfRanks
  return { value, over: SOFT_CAP_OVER, reincarnations }
}

/** The cap from ranked AAs (shared/aaRanks.ts) and the reincarnation times. */
export function statCapOf(ranked: readonly AaRanked[], reincarnationTimes: readonly number[], hardCap?: number): StatCap {
  return reincarnationStatCap({
    reincarnationTimes,
    humanRanks: aaRankOf(ranked, HUMAN_AA),
    halfElfRanks: aaRankOf(ranked, HALF_ELF_AA),
    ...(hardCap === undefined ? {} : { hardCap })
  })
}

/** The Best in slot sheet's one line on where its attribute cap came from. */
export function statCapCaption(cap: StatCap): string {
  if (cap.over === 0) return `${String(cap.value)} by default (the hard cap on eqlwiki's Statistics page)`
  const times = cap.reincarnations === 1 ? '1 reincarnation' : `${String(cap.reincarnations)} reincarnations`
  return `${String(cap.value)} by default, a soft cap from your ${times} and reincarnation AAs (Alt. Advancement tab); past it a point counts a fifth`
}
