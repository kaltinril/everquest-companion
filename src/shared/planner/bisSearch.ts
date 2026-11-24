// planner/bisSearch.ts — THE EXACT CHOICE BEHIND THE BEST IN SLOT SHEET (plans/2026-11-24-bis-sheet.md,
// "The sheet"). `bisSheet.ts` builds the candidates and reads the answer; this file only chooses.
//
// WHAT MAKES IT MORE THAN "THE TOP ROW OF EVERY CELL": three couplings between cells. (1) An item
// flagged Lore is placed at most once across the whole sheet, ANY cells included (Malkil,
// 2026-11-24: *"respect Lore Equipped when determining if multiple of a single item can be
// equipped"*), and in owned-only mode an item fills at most as many cells as copies owned. (2) A
// two-hander in PRIMARY closes SECONDARY. (3) Worn haste does not stack, so the loadout is paid for
// its single best haste once, not once per item.
//
// HOW, AND WHY NOT BRANCH AND BOUND: (1) alone is an ASSIGNMENT problem — cells on one side, item
// copies on the other, each cell takes one copy or stays empty — and the Hungarian method solves it
// exactly in polynomial time. Branch and bound was tried first and ran out a 400k-node budget on the
// corpus: the ANY cells' best rows are every other cell's lore picks, so every shallow bound counted
// them twice and pruned nothing. (2) and (3) are taken by ENUMERATION around the assignment: with or
// without a two-hander, and which placed item supplies the loadout's haste (or none). Forcing that
// item and ignoring every other positive haste gives a value at or below the true one for every
// loadout, equal to it when the forced item is the loadout's best haste, so the maximum over the
// enumeration is exact.
//
// PURE, no imports.

export interface SearchCandidate {
  /** the item's identity for the copy limit */
  key: string
  /** the item's points in this cell, haste left out */
  base: number
  /** the item's stated haste percent (negative = a penalty), 0 when it states none */
  haste: number
  /** how many cells this item may fill in the whole sheet */
  copies: number
  /** a two-hander: placed in PRIMARY, it closes SECONDARY */
  twoHand: boolean
}

export interface SearchCell {
  /** candidates best-first, already cut to the search width */
  candidates: readonly SearchCandidate[]
  isPrimary: boolean
  isSecondary: boolean
}

export interface SearchResult {
  /** per cell, the index into its candidates, or -1 for empty */
  choice: number[]
  total: number
}

/** Points one haste percent is worth on the board (lane weight / unit); 0 when HASTE is Off. */
export interface HasteRate {
  perPercent: number
}

/** A candidate with its index in the cell's own list, so a variant can filter without losing it. */
interface Option {
  index: number
  cand: SearchCandidate
}

/** The haste item forced into one cell, or none. */
interface Forced {
  cell: number
  option: Option
}

/** A cell's points for a candidate in the assignment: base plus its stated haste PENALTY. */
function weightOf(c: SearchCandidate, rate: HasteRate): number {
  return c.base + Math.min(0, c.haste) * rate.perPercent
}

// ---- the Hungarian method (minimum cost, rows <= columns), split for the depth ceiling -----------

interface Hungarian {
  cost: number[][]
  u: Float64Array
  v: Float64Array
  p: Int32Array
  way: Int32Array
}

/** One row's working arrays while it is being placed. */
interface Pass {
  minv: Float64Array
  used: Uint8Array
}

/** One relaxation pass over the free columns; returns the column with the smallest slack. */
function relax(h: Hungarian, pass: Pass, i0: number, j0: number): number {
  const { minv, used } = pass
  let delta = Number.POSITIVE_INFINITY
  let j1 = 0
  for (let j = 1; j < minv.length; j++) {
    if (used[j] === 1) continue
    const cur = h.cost[i0 - 1][j - 1] - h.u[i0] - h.v[j]
    if (cur < minv[j]) {
      minv[j] = cur
      h.way[j] = j0
    }
    if (minv[j] < delta) {
      delta = minv[j]
      j1 = j
    }
  }
  for (let j = 0; j < minv.length; j++) {
    if (used[j] === 1) {
      h.u[h.p[j]] += delta
      h.v[j] -= delta
    } else minv[j] -= delta
  }
  return j1
}

function augmentRow(h: Hungarian, i: number): void {
  const m = h.v.length - 1
  h.p[0] = i
  let j0 = 0
  const pass: Pass = { minv: new Float64Array(m + 1).fill(Number.POSITIVE_INFINITY), used: new Uint8Array(m + 1) }
  do {
    pass.used[j0] = 1
    j0 = relax(h, pass, h.p[j0], j0)
  } while (h.p[j0] !== 0)
  do {
    const j1 = h.way[j0]
    h.p[j0] = h.p[j1]
    j0 = j1
  } while (j0 !== 0)
}

/** Column per row minimising the total cost. `cost` is rows x columns with rows <= columns. */
export function assignMinCost(cost: number[][]): number[] {
  const n = cost.length
  const m = n === 0 ? 0 : cost[0].length
  const h: Hungarian = { cost, u: new Float64Array(n + 1), v: new Float64Array(m + 1), p: new Int32Array(m + 1), way: new Int32Array(m + 1) }
  for (let i = 1; i <= n; i++) augmentRow(h, i)
  const out = new Array<number>(n).fill(-1)
  for (let j = 1; j <= m; j++) if (h.p[j] !== 0) out[h.p[j] - 1] = j - 1
  return out
}

// ---- one assignment over the cells ---------------------------------------------------------------

/** Far above any real cost: a cell that cannot take a column. */
const FORBIDDEN = 1e9

/** The copy columns: one per copy an item may still use, never more than the cells it appears in. */
function copyColumns(cells: readonly (readonly Option[])[], left: ReadonlyMap<string, number>): string[] {
  const appearances = new Map<string, number>()
  for (const list of cells) for (const o of list) appearances.set(o.cand.key, (appearances.get(o.cand.key) ?? 0) + 1)
  const columns: string[] = []
  for (const [key, n] of appearances) {
    const copies = Math.min(n, left.get(key) ?? 0)
    for (let k = 0; k < copies; k++) columns.push(key)
  }
  return columns
}

/** Best assignment of `cells` (each a candidate list) to item copies; per cell the chosen option or null. */
function assign(cells: readonly (readonly Option[])[], left: ReadonlyMap<string, number>, rate: HasteRate): { picks: (Option | null)[]; value: number } {
  const columns = copyColumns(cells, left)
  const width = columns.length + cells.length
  const cost = cells.map((list, i) => {
    const row = new Array<number>(width).fill(FORBIDDEN)
    row[columns.length + i] = 0
    const byKey = new Map(list.map((o) => [o.cand.key, o]))
    columns.forEach((key, j) => {
      const o = byKey.get(key)
      if (o !== undefined) row[j] = -weightOf(o.cand, rate)
    })
    return row
  })
  const cols = assignMinCost(cost)
  let value = 0
  const picks = cells.map((list, i) => {
    const j = cols[i]
    if (j < 0 || j >= columns.length) return null
    const o = list.find((x) => x.cand.key === columns[j]) ?? null
    if (o !== null) value += weightOf(o.cand, rate)
    return o
  })
  return { picks, value }
}

// ---- the enumeration -----------------------------------------------------------------------------

/** The cells' lists for one two-hander variant: PRIMARY without two-handers, or only them and SECONDARY shut. */
function variant(cells: readonly SearchCell[], twoHand: boolean): Option[][] {
  return cells.map((cell) => {
    const all = cell.candidates.map((cand, index) => ({ index, cand }))
    if (cell.isPrimary) return all.filter((o) => o.cand.twoHand === twoHand)
    return twoHand && cell.isSecondary ? [] : all
  })
}

function hasteChoices(lists: readonly (readonly Option[])[], rate: HasteRate): (Forced | null)[] {
  const out: (Forced | null)[] = [null]
  if (rate.perPercent <= 0) return out
  lists.forEach((list, cell) => {
    for (const option of list) if (option.cand.haste > 0) out.push({ cell, option })
  })
  return out
}

function solve(lists: readonly (readonly Option[])[], forced: Forced | null, rate: HasteRate): SearchResult {
  const left = new Map<string, number>()
  for (const list of lists) for (const o of list) left.set(o.cand.key, o.cand.copies)
  let total = 0
  if (forced !== null) {
    const c = forced.option.cand
    left.set(c.key, (left.get(c.key) ?? 0) - 1)
    total += weightOf(c, rate) + c.haste * rate.perPercent
  }
  const open = lists.map((list, i) => (forced !== null && i === forced.cell ? [] : list))
  const { picks, value } = assign(open, left, rate)
  const choice = picks.map((p, i) => (forced !== null && i === forced.cell ? forced.option.index : (p?.index ?? -1)))
  return { choice, total: total + value }
}

/** The best loadout over the cells: exact, see the file header. */
export function searchLoadout(cells: readonly SearchCell[], rate: HasteRate): SearchResult {
  let best: SearchResult = { choice: cells.map(() => -1), total: 0 }
  for (const twoHand of [false, true]) {
    const lists = variant(cells, twoHand)
    if (twoHand && !cells.some((c, i) => c.isPrimary && lists[i].length > 0)) continue
    for (const forced of hasteChoices(lists, rate)) {
      const result = solve(lists, forced, rate)
      if (result.total > best.total + 1e-9) best = result
    }
  }
  return best
}
