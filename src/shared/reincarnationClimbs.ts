// reincarnationClimbs.ts — how long each re-level back to 50 took in actual play (owner, 2026-11-22;
// docs/community/requirements/reincarnation-leveling.md). Pure: the Leveling tab's two snapshots in,
// one row per reincarnation out, newest first.
//
// WHAT THE LOG SAYS. One reincarnation prints a race line and three class lines in the same second,
// as AA purchases at cost 0. They reach the renderer in `LevelingSnap.aaSpends`, which is uncapped
// and joined across archived logs (`logArchive/mergeLeveling.ts`), so no engine field was needed.
//
// WHAT COUNTS AS ONE. A comment in `progressionStatsTypes.ts` says a respec re-logs purchase lines.
// The owner's log has no such repeat (240 purchase lines, 2026-11-22), so the rule is a guard, in two
// halves. A group of lines is a reincarnation only when:
//   1. a class line states a rank above the highest that class has shown (a re-log restates one), and
//   2. the dings after it, up to the next reincarnation, show the level reset. This half is what
//      catches a re-log whose earlier line is gone from the record. With no ding yet there is nothing
//      against it, and a reincarnation made a minute ago must show.
//
// WHERE A CLIMB ENDS: the first level-50 ding after it. Not a rising run: a loadout swap can drop the
// level mid-climb (the owner's first climb dings 44, 42, 43, 45, 44, 45).
//
// THE TIME IS `rangeStats`, over [reincarnation, reached 50], so "active" is the one definition the
// rest of the tab uses. A range the snapshot cannot fully answer gets no numbers at all: an idle gap
// measured across trimmed columns would print a wrong time as if it were complete.

import type { AASpendEvent, LevelEvent } from './types'
import type { ProgressionSnap } from './progressionTypes'
import { LEVEL_CAP } from './planner/planHorizon'
import { rangeStats, wallMs } from './progressionStats'
import { TAIL_MS } from './timeslice'

/** Lines this close together are one event: the game stamps them in one second, which a line can straddle. */
const GROUP_MS = 2_000

/**
 * The highest ding that still proves a reset. A climb dings 2, 3, 4; the slack keeps a climb whose
 * first dings were lost, and a ding from a swap to an older loadout (31, say) proves nothing.
 */
export const RESET_DING_MAX = 5

const LINE = /^(Race|Class) Reincarnation: (.+?)(?: (\d+))?$/

export type ClimbStatus = 'reached' | 'climbing' | 'unfinished'

export interface ClimbPlay {
  activeMs: number
  /** Online time: the span minus logged-out stretches (`wallMs`). */
  elapsedMs: number
  kills: number
}

export interface ReincarnationClimb {
  ts: number
  race: string | null
  /** As the log listed them. */
  classes: string[]
  /** The highest class rank the lines stated; null when they stated none (a first reincarnation). */
  rank: number | null
  /** `unfinished`: another reincarnation followed with no level-50 ding in the record. */
  status: ClimbStatus
  reachedTs: number | null
  /** The level the climb last dinged; 1 before its first ding. */
  level: number
  /** Null when the record cannot state it: see `partial`, or an `unfinished` climb. */
  play: ClimbPlay | null
  /** The progression history does not fully cover this climb, so no time is claimed for it. */
  partial: boolean
}

export interface ReincarnationInput {
  levels: readonly LevelEvent[]
  spends: readonly AASpendEvent[]
  snap: ProgressionSnap
}

interface Line {
  ts: number
  kind: 'Race' | 'Class'
  name: string
  rank: number | null
}

interface Group {
  ts: number
  lines: Line[]
}

function readLine(s: AASpendEvent): Line | null {
  const m = LINE.exec(s.ability)
  if (!m) return null
  const stated = s.rank ?? (m[3] ? Number(m[3]) : null)
  return { ts: s.ts, kind: m[1] as Line['kind'], name: m[2], rank: stated }
}

function groupLines(spends: readonly AASpendEvent[]): Group[] {
  const lines = spends.flatMap((s) => readLine(s) ?? []).sort((a, b) => a.ts - b.ts)
  const groups: Group[] = []
  for (const line of lines) {
    const last = groups[groups.length - 1]
    if (last && line.ts - last.ts <= GROUP_MS) last.lines.push(line)
    else groups.push({ ts: line.ts, lines: [line] })
  }
  return groups
}

/** The groups in which some class reached a rank it had not shown before (rule 1). */
function advancing(groups: readonly Group[]): Group[] {
  const top = new Map<string, number>()
  return groups.filter((g) => {
    let moved = false
    for (const l of g.lines) {
      if (l.kind !== 'Class') continue
      const rank = l.rank ?? 1
      if (rank > (top.get(l.name) ?? 0)) moved = true
      top.set(l.name, Math.max(rank, top.get(l.name) ?? 0))
    }
    return moved
  })
}

/** The dings after `ts` and before `until`, cut at the first level-50 one, which they include. */
function climbDings(levels: readonly LevelEvent[], ts: number, until: number): LevelEvent[] {
  const out: LevelEvent[] = []
  for (const d of levels) {
    if (d.ts <= ts || d.ts >= until) continue
    out.push(d)
    if (d.level >= LEVEL_CAP) break
  }
  return out
}

function statusOf(reached: LevelEvent | null, until: number): ClimbStatus {
  if (reached) return 'reached'
  return until === Infinity ? 'climbing' : 'unfinished'
}

/** The play inside the climb, or `partial` when the snapshot cannot answer for all of it. */
function playOf(o: { snap: ProgressionSnap; ts: number; end: number; dings: readonly LevelEvent[] }): {
  play: ClimbPlay | null
  partial: boolean
} {
  const { snap, ts, end, dings } = o
  if (snap.lastTs < ts) return { play: null, partial: true }
  const stats = rangeStats({ snap, range: { t0: ts, t1: end + TAIL_MS } })
  // The uncapped ding column is the check that this snapshot holds the same stretch of log: a
  // segment that merged into `leveling` and not into `progression` is missing its dings here. Only
  // dings up to the snapshot's own clock count: the two modules update separately, and a ding one
  // has heard before the other is a moment's lag, not missing history.
  const held = stats.levelUps.filter((d) => d.ts > ts).length
  const due = dings.filter((d) => d.ts <= snap.lastTs).length
  if (stats.clipped || held < due) return { play: null, partial: true }
  return { play: { activeMs: stats.activeMs, elapsedMs: wallMs(stats), kills: stats.kills }, partial: false }
}

function toClimb(g: Group, dings: readonly LevelEvent[], until: number, snap: ProgressionSnap): ReincarnationClimb {
  const last = dings[dings.length - 1] ?? null
  const reached = last && last.level >= LEVEL_CAP ? last : null
  const status = statusOf(reached, until)
  const classes = g.lines.filter((l) => l.kind === 'Class')
  const ranks = classes.flatMap((l) => l.rank ?? [])
  const read =
    status === 'unfinished'
      ? { play: null, partial: false }
      : playOf({ snap, ts: g.ts, end: reached ? reached.ts : Math.max(g.ts, snap.lastTs), dings })
  return {
    ts: g.ts,
    race: g.lines.find((l) => l.kind === 'Race')?.name ?? null,
    classes: classes.map((l) => l.name),
    rank: ranks.length > 0 ? Math.max(...ranks) : null,
    status,
    reachedTs: reached ? reached.ts : null,
    level: last ? last.level : 1,
    ...read
  }
}

/**
 * One row per reincarnation, newest first; empty for a character with none.
 *
 * Walked newest to oldest so each climb is bounded by the next group that really was a
 * reincarnation: a re-log rejected by rule 2 does not cut the climb it fell inside.
 */
export function reincarnationClimbs({ levels, spends, snap }: ReincarnationInput): ReincarnationClimb[] {
  const candidates = advancing(groupLines(spends))
  if (candidates.length === 0) return []
  const dated = [...levels].sort((a, b) => a.ts - b.ts)
  const out: ReincarnationClimb[] = []
  let until = Infinity
  for (let i = candidates.length - 1; i >= 0; i--) {
    const g = candidates[i]
    const dings = climbDings(dated, g.ts, until)
    if (dings.length > 0 && !dings.some((d) => d.level <= RESET_DING_MAX)) continue
    out.push(toClimb(g, dings, until, snap))
    until = g.ts
  }
  return out
}
