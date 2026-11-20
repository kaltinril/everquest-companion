// rowDiff.ts — what changed in one tab between the last good pull and this one, row by row, and
// whether it changed too much to take without the owner reading it. Pure.
//
// A data row is a row with text in it. Rows are matched in order (longest common subsequence);
// between two matched rows, removed and added rows pair up as "changed" and the surplus is
// "removed" or "added".

import { columnLetter, MAX_ROW_CHANGE, MAX_ROW_LOSS, printable, type Refusal } from './rules'

export type Row = readonly string[]

export interface RowDiff {
  before: number
  after: number
  removed: Row[]
  added: Row[]
  changed: [Row, Row][]
}

/** The rows of a tab that hold text. */
export const dataRows = (grid: readonly Row[]): Row[] => grid.filter((row) => row.some((c) => c !== ''))

/** Above this many cells the order-aware match is skipped and every unmatched row counts as changed. */
const MAX_LCS_CELLS = 4_000_000

type Op = '=' | '-' | '+'

/** Longest-common-subsequence walk of two key lists. */
function lcsOps(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length
  const m = b.length
  if (n * m > MAX_LCS_CELLS) return [...a.map((): Op => '-'), ...b.map((): Op => '+')]
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push('=')
      i++
      j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      ops.push('-')
      i++
    } else {
      ops.push('+')
      j++
    }
  }
  while (i++ < n) ops.push('-')
  while (j++ < m) ops.push('+')
  return ops
}

export function diffRows(beforeGrid: readonly Row[], afterGrid: readonly Row[]): RowDiff {
  const a = dataRows(beforeGrid)
  const b = dataRows(afterGrid)
  const d: RowDiff = { before: a.length, after: b.length, removed: [], added: [], changed: [] }
  let gone: Row[] = []
  let came: Row[] = []
  const flush = (): void => {
    const pairs = Math.min(gone.length, came.length)
    for (let k = 0; k < pairs; k++) d.changed.push([gone[k], came[k]])
    d.removed.push(...gone.slice(pairs))
    d.added.push(...came.slice(pairs))
    gone = []
    came = []
  }
  let i = 0
  let j = 0
  for (const op of lcsOps(a.map((r) => JSON.stringify(r)), b.map((r) => JSON.stringify(r)))) {
    if (op === '-') gone.push(a[i++])
    else if (op === '+') came.push(b[j++])
    else {
      flush()
      i++
      j++
    }
  }
  flush()
  return d
}

export const isUnchanged = (d: RowDiff): boolean => d.removed.length + d.added.length + d.changed.length === 0

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`

/** The "changed too much" rules for one tab. `--accept` lifts them. */
export function changeRefusals(where: string, d: RowDiff): Refusal[] {
  if (d.before === 0) return []
  const out: Refusal[] = []
  const lost = d.removed.length
  if (lost / d.before > MAX_ROW_LOSS) {
    out.push({ kind: 'change', message: `${where}: lost ${String(lost)} of ${String(d.before)} data rows (${percent(lost / d.before)}), over the ${percent(MAX_ROW_LOSS)} limit` })
  }
  const touched = d.changed.length + d.removed.length + d.added.length
  if (touched / d.before > MAX_ROW_CHANGE) {
    out.push({ kind: 'change', message: `${where}: ${String(touched)} rows added, removed or rewritten against ${String(d.before)} (${percent(touched / d.before)}), over the ${percent(MAX_ROW_CHANGE)} limit` })
  }
  return out
}

/** A row for a person to read: each cell with its column letter. */
export function describeRow(row: Row): string {
  const cells: string[] = []
  row.forEach((cell, c) => {
    if (cell !== '') cells.push(`${columnLetter(c + 1)}: ${printable(cell)}`)
  })
  return cells.join(' · ')
}

/** The tab's change, one line per row, under a one-line count. Empty when nothing changed. */
export function formatDiff(where: string, d: RowDiff): string[] {
  if (isUnchanged(d)) return []
  const lines = [`${where}: ${String(d.added.length)} added, ${String(d.removed.length)} removed, ${String(d.changed.length)} changed (${String(d.before)} rows before, ${String(d.after)} now)`]
  for (const row of d.removed) lines.push(`  - ${describeRow(row)}`)
  for (const row of d.added) lines.push(`  + ${describeRow(row)}`)
  for (const [was, now] of d.changed) lines.push(`  ~ ${describeRow(was)}`, `    => ${describeRow(now)}`)
  return lines
}
