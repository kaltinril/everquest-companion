// aaLogMatch.ts — which wiki AA row each AA the log names is (owner, 2026-11-25: trust the log over
// the wiki; the game renames and adds AAs before the wiki's volunteers catch up). Pure.
//
// A log name matches a row whose folded name (or a race row's log form) is the same. Else it takes
// the one row, not matched already, within NEAR_EDITS edits of it (`Unbound Strikethrough` is the
// wiki's `Unbounded Strikethrough`, before aaOfficial.ts renamed that row); a tie is no match. A name
// with neither is `unplaced`.

import type { AaTableRow } from './aaTable.generated'
import { aaLedger } from './aaLedger'
import type { AASpendLike } from './aa'

/** The most edits apart a log name and a wiki name may be and still be one AA. */
export const NEAR_EDITS = 2

/** One AA as the log states it. */
export interface LogAa {
  /** The log's own spelling, rank suffix stripped. */
  name: string
  rank: number
  /** True when it matched a row by a near name, not the same one. */
  near?: boolean
}

export interface AaLogMatch {
  /** By the row's folded wiki name. */
  byRow: Map<string, LogAa>
  unplaced: LogAa[]
}

/** A name folded for matching: case, apostrophes and runs of spaces do not count. */
export function aaFold(name: string): string {
  return name.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim()
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * The AAs the log names, by folded name. A race line states no rank (`Race Reincarnation: Half Elf`
 * every time), so a race's rank is also the number of reincarnations into it (`races`: one entry
 * per reincarnation, shared/reincarnationClimbs.ts).
 */
export function aaLogAas(spends: readonly AASpendLike[], races: readonly (string | null)[] = []): Map<string, LogAa> {
  const out = new Map(aaLedger(spends).map((r) => [aaFold(r.name), { name: r.name, rank: r.topRank }]))
  for (const race of races) {
    if (race === null) continue
    const name = `Race Reincarnation: ${race}`
    const n = races.filter((r) => r === race).length
    const had = out.get(aaFold(name))
    out.set(aaFold(name), { name: had?.name ?? name, rank: Math.max(had?.rank ?? 0, n) })
  }
  return out
}

/** The one open row nearest `name`, or null when none is near enough or two tie. */
function nearest(name: string, open: ReadonlyMap<string, string>): string | null {
  let best: string | null = null
  let bestD = NEAR_EDITS + 1
  let tie = false
  for (const [rowFold, keyFold] of open) {
    const d = editDistance(name, keyFold)
    if (d < bestD) [best, bestD, tie] = [rowFold, d, false]
    else if (d === bestD) tie = true
  }
  return tie ? null : best
}

/** Each row's log AA, and the log AAs no row is. `keyOf` gives a row's log form (a race row's). */
export function aaLogMatch(log: ReadonlyMap<string, LogAa>, table: readonly AaTableRow[], keyOf: (row: AaTableRow) => string): AaLogMatch {
  const byRow = new Map<string, LogAa>()
  const claimed = new Set<string>()
  const open = new Map<string, string>()
  for (const row of table) {
    const rowFold = aaFold(row.name)
    const keyFold = aaFold(keyOf(row))
    const f = [keyFold, rowFold].find((x) => log.has(x))
    const hit = f === undefined ? undefined : log.get(f)
    if (f !== undefined && hit !== undefined && !byRow.has(rowFold)) {
      byRow.set(rowFold, hit)
      claimed.add(f)
    } else if (!byRow.has(rowFold)) open.set(rowFold, keyFold)
  }
  const unplaced: LogAa[] = []
  for (const [f, aa] of log) {
    if (claimed.has(f)) continue
    const row = nearest(f, open)
    if (row === null) unplaced.push(aa)
    else {
      byRow.set(row, { ...aa, near: true })
      open.delete(row)
    }
  }
  return { byRow, unplaced }
}
