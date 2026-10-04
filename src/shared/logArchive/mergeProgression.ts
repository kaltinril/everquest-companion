// shared/logArchive/mergeProgression.ts — the `progression` module across an archive and the live
// log (step 4.5).
//
// The columns join older first, then the engine's own caps are applied (`progression.rs`), so a
// merged series is never longer than a live one could be. Three things are more than a join:
//
//   * `killZone` indexes `zoneName`, so the live side's indexes move up by the archive's zone count.
//   * The archive's last zone band is still open (it ends at 0). The fold closes an open band at the
//     next zone line, so it is closed at the live log's first zone start.
//   * A live kill before the live log's first zone line has no zone (-1, and '' in the named ring).
//     Read as one log, the fold puts it in the zone the archive ended in, so the merge does the same.
//     Only when the live side has dropped nothing: then -1 can mean nothing else.
//   * A cap that trims here moves `dropped` and `windowStart` as the fold's own trim does, so the
//     charts' existing "this range reaches history that was dropped" wording covers it.
//
// The level and AA columns are uncapped, as in the fold. The named recent-kills ring keeps its last
// `RECENT_KILL_CAP` by count.

import type { ProgressionSnap } from '../types'

/** `progression.rs` TRIM_BATCH: a full column may run this far past its cap before it is trimmed. */
const TRIM_BATCH = 1024
/** `progression.rs` RECENT_KILL_CAP. */
const RECENT_KILL_CAP = 50

type Column = Exclude<keyof ProgressionSnap, 'recentKills' | 'lastTs' | 'windowStart' | 'dropped'>

interface Group {
  /** Index-aligned columns; the first holds the timestamps `windowStart` is read from. */
  cols: readonly Column[]
  /** `progression.rs` cap, or null for an uncapped column. */
  cap: number | null
}

const GROUPS: readonly Group[] = [
  { cols: ['expTs', 'expPct', 'expFlag'], cap: 40_000 },
  { cols: ['killTs', 'killZone', 'killCredit'], cap: 40_000 },
  { cols: ['witnessTs'], cap: 20_000 },
  { cols: ['lootTs'], cap: 20_000 },
  { cols: ['zoneStart', 'zoneEnd', 'zoneName'], cap: 4_000 },
  { cols: ['offlineStart', 'offlineEnd', 'offlineCamped'], cap: 4_000 },
  { cols: ['levelTs', 'levelValue'], cap: null },
  { cols: ['aaGainTs', 'aaGainAmount'], cap: null }
]

type Columns = Record<Column, (number | string)[]>

function isProgressionSnap(x: unknown): x is ProgressionSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (!Array.isArray(s.recentKills)) return false
  if (![s.lastTs, s.windowStart, s.dropped].every((n) => typeof n === 'number')) return false
  return GROUPS.every((g) => {
    const lens = g.cols.map((c) => (Array.isArray(s[c]) ? (s[c] as unknown[]).length : -1))
    return lens[0] >= 0 && lens.every((n) => n === lens[0])
  })
}

/** Every column joined, older first, with the live side's zone indexes moved past the archive's. */
function joined(older: ProgressionSnap, newer: ProgressionSnap, carried: number): Columns {
  const out = {} as Columns
  for (const g of GROUPS) for (const c of g.cols) out[c] = [...older[c], ...newer[c]]
  const shift = older.zoneStart.length
  out.killZone = [...older.killZone, ...newer.killZone.map((z) => (z >= 0 ? z + shift : carried))]
  const last = older.zoneEnd.length - 1
  if (last >= 0 && older.zoneEnd[last] === 0 && newer.zoneStart.length > 0) out.zoneEnd[last] = newer.zoneStart[0]
  return out
}

/** The fold's trim over joined columns: how many entries went, and the window it leaves. */
function trim(cols: Columns): { dropped: number; window: number } {
  let dropped = 0
  let window = 0
  for (const g of GROUPS) {
    const len = cols[g.cols[0]].length
    if (g.cap === null || len < g.cap + TRIM_BATCH) continue
    const n = len - g.cap
    for (const c of g.cols) cols[c].splice(0, n)
    // `killZone` indexes `zoneName`: a zone that ages out becomes -1 (unknown), never a wrong zone.
    if (g.cols[0] === 'zoneStart') cols.killZone = cols.killZone.map((z) => Math.max(Number(z) - n, -1))
    dropped += n
    window = Math.max(window, Number(cols[g.cols[0]][0]))
  }
  return { dropped, window }
}

/** `older` then `newer`, or null when either is not a progression snapshot. */
export function mergeProgression(older: unknown, newer: unknown): ProgressionSnap | null {
  if (!isProgressionSnap(older) || !isProgressionSnap(newer)) return null
  // The zone the archive ended in, for live kills before the live log's first zone line.
  const carried = newer.windowStart === 0 ? older.zoneStart.length - 1 : -1
  const carriedName = carried >= 0 ? older.zoneName[carried] : ''
  const cols = joined(older, newer, carried)
  const cut = trim(cols)
  const live = newer.recentKills.map((k) => (k.zone === '' ? { ...k, zone: carriedName } : { ...k }))
  return {
    ...(cols as unknown as Omit<ProgressionSnap, 'recentKills' | 'lastTs' | 'windowStart' | 'dropped'>),
    recentKills: [...older.recentKills.map((k) => ({ ...k })), ...live].slice(-RECENT_KILL_CAP),
    lastTs: Math.max(older.lastTs, newer.lastTs),
    windowStart: Math.max(older.windowStart, newer.windowStart, cut.window),
    dropped: older.dropped + newer.dropped + cut.dropped
  }
}
