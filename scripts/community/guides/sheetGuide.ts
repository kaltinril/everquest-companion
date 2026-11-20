// sheetGuide.ts — the leveling guide's tabs (rows of cells) into the shape in
// src/shared/guideData.ts. Pure. A cell the parser cannot place is kept as written (`asides`,
// `unparsed`, `text`), never guessed at.
//
// A tradeskill tab, as its author lays it out:
//   Notes:              then free text in column A
//   Leveling:           then steps: column A a range (`1 - 18`), column B the item
//                       under a step, its ingredients: column A empty, the name one column further
//                       right per level of sub-combine (Jewelcrafting writes them in column B)
//   Alternate options:  the same pattern again
// A remark sits up to NOTE_REACH columns right of the name it belongs to. Anything further right
// is a side table (imbued gems by deity, where to buy) and is kept as an aside.

import type { GuideAside, GuideLadder, GuideMaterial, GuideOverviewSection, GuideStep } from '../../../src/shared/guideData'
import { columnLetter, type Refusal } from './rules'

/** How far right of a name its remark may sit (measured 2026-11-20: remarks at most 3, side tables at least 4). */
const NOTE_REACH = 3
const ITEM_COL = 1

export interface ReadName {
  name: string
  qty?: number
  returned?: boolean
  note?: string
  /** The cell as written, when `name` is not the whole of it. */
  text?: string
}

const DASH = new RegExp(`\\s[${String.fromCharCode(0x2013, 0x2014)}]\\s`)
const TRAILING_PAREN = /^(.*\S)\s*\(([^()]*)\)\s*$/
const QTY = /^(.*\S)\s+x\s?(\d{1,4})$/i
const RETURNED_PAREN = /\s*\(returned\)\s*/i
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** The part after a dash: a source or a how-to. Says whether it marks the item as given back. */
function readTail(tail: string): { note: string; returned: boolean } {
  const returned = RETURNED_PAREN.test(tail) || /returns on combine/i.test(tail)
  return { note: squash(tail.replace(RETURNED_PAREN, ' ')), returned }
}

/** Parenthesised remarks off the end of a name, outermost last. `(returned ...)` marks a tool. */
function stripParens(text: string): { rest: string; notes: string[]; returned: boolean } {
  let rest = text
  const notes: string[] = []
  let returned = false
  for (let m = TRAILING_PAREN.exec(rest); m !== null; m = TRAILING_PAREN.exec(rest)) {
    rest = m[1]
    const inner = squash(m[2])
    if (/^returned\b/i.test(inner)) returned = true
    const remark = inner.replace(/^returned\b[\s.,:;-]*/i, '')
    if (remark !== '') notes.unshift(remark)
  }
  return { rest, notes, returned }
}

/**
 * A name cell: `small piece of ore x2`, `smithy hammer (returned)`, `Metal bits  (save for later)`,
 * `Steel Arrowheads [dash] Crafted (Blacksmithing, Trivial 188, Forge, Yields 2)`.
 */
export function readName(cell: string): ReadName {
  const raw = squash(cell)
  const dash = DASH.exec(raw)
  const head = dash === null ? raw : raw.slice(0, dash.index)
  const tail = dash === null ? undefined : readTail(raw.slice(dash.index + dash[0].length))
  const parens = stripParens(head)
  const qty = QTY.exec(parens.rest)
  const name = squash((qty === null ? parens.rest : qty[1]).replace(/\*+$/, ''))
  if (name === '') return { name: raw }
  const notes = [...parens.notes, ...(tail === undefined || tail.note === '' ? [] : [tail.note])]
  const out: ReadName = { name }
  if (qty !== null) out.qty = Number.parseInt(qty[2], 10)
  if (parens.returned || tail?.returned === true) out.returned = true
  if (notes.length > 0) out.note = notes.join('; ')
  if (plainSpelling(out) !== raw) out.text = raw
  return out
}

/** The cell a plain name, count and remark would be written as; any other cell keeps its `text`. */
function plainSpelling(n: ReadName): string {
  const count = n.qty === undefined ? '' : ` x${String(n.qty)}`
  const remark = n.note ?? (n.returned === true ? 'returned' : undefined)
  return `${n.name}${count}${remark === undefined ? '' : ` (${remark})`}`
}

const RANGE = /^(\d{1,4})\s*-\s*(.+)$/

/** `1 - 18` or `189 - see side`: where a step starts and, when it is a number, where it ends. */
export function readRange(cell: string): { from: number; to?: number; range?: string } | undefined {
  const m = RANGE.exec(cell)
  if (m === null) return undefined
  const from = Number.parseInt(m[1], 10)
  return /^\d{1,4}$/.test(m[2]) ? { from, to: Number.parseInt(m[2], 10) } : { from, range: cell }
}

type Mode = 'notes' | 'steps' | 'alternates'

interface Walk {
  ladder: GuideLadder & { asides: GuideAside[]; unparsed: string[] }
  refusals: Refusal[]
  where: string
  mode: Mode
  sawLeveling: boolean
  step: GuideStep | null
  /** The open chain of ingredients, outermost first, each with the column its name sits in. */
  chain: { col: number; material: GuideMaterial }[]
  lastCol: number
}

/** Cells from column `from` on, as runs of neighbours: one aside per run. */
function asidesFrom(w: Walk, row: readonly string[], from: number): void {
  let run: GuideAside | null = null
  for (let c = from; c < row.length; c++) {
    if (row[c] === '') run = null
    else if (run === null) {
      run = { col: columnLetter(c + 1), cells: [row[c]] }
      w.ladder.asides.push(run)
    } else run.cells.push(row[c])
  }
}

/** Remarks beside a name in column `col`; what lies further right is an aside. */
function remarksBeside(w: Walk, row: readonly string[], col: number): string[] {
  const reach = col + NOTE_REACH
  asidesFrom(w, row, reach + 1)
  return row.slice(col + 1, reach + 1).filter((c) => c !== '')
}

const joinNotes = (own: string | undefined, beside: string[]): string | undefined => {
  const all = [...(own === undefined ? [] : [own]), ...beside]
  return all.length === 0 ? undefined : all.join('; ')
}

const MARKERS: [RegExp, Mode][] = [
  [/^notes:?$/i, 'notes'],
  [/^leveling:?$/i, 'steps'],
  [/^alternate options?:?$/i, 'alternates']
]

function marker(w: Walk, row: readonly string[]): boolean {
  const hit = MARKERS.find(([re]) => re.test(row[0] ?? ''))
  if (hit === undefined) return false
  w.mode = hit[1]
  if (hit[1] === 'steps') w.sawLeveling = true
  w.step = null
  asidesFrom(w, row, 1)
  return true
}

function openStep(w: Walk, row: readonly string[], r: number): void {
  const range = readRange(row[0])
  if (range === undefined) {
    w.ladder.unparsed.push(row.filter((c) => c !== '').join(' | '))
    w.step = null
    return
  }
  const itemCell = row[ITEM_COL] ?? ''
  if (itemCell === '') {
    w.refusals.push({ kind: 'layout', message: `${w.where} row ${String(r + 1)}: the step "${row[0]}" names no item in column B` })
    w.step = null
    return
  }
  const item = readName(itemCell)
  const note = joinNotes(item.note, remarksBeside(w, row, ITEM_COL))
  const step: GuideStep = {
    ...range,
    item: item.name,
    ...(note === undefined ? {} : { note }),
    ...(item.text === undefined ? {} : { text: item.text }),
    materials: []
  }
  ;(w.mode === 'alternates' ? w.ladder.alternates : w.ladder.steps).push(step)
  w.step = step
  w.chain = []
  w.lastCol = ITEM_COL
}

function addMaterial(w: Walk, row: readonly string[], col: number): void {
  if (w.step === null) return
  const read = readName(row[col])
  const material: GuideMaterial = { name: read.name }
  if (read.qty !== undefined) material.qty = read.qty
  if (read.returned === true) material.returned = true
  const note = joinNotes(read.note, remarksBeside(w, row, col))
  if (note !== undefined) material.note = note
  if (read.text !== undefined) material.text = read.text
  while (w.chain.length > 0 && w.chain[w.chain.length - 1].col >= col) w.chain.pop()
  const parent = w.chain.length === 0 ? undefined : w.chain[w.chain.length - 1].material
  if (parent === undefined) w.step.materials.push(material)
  else (parent.materials ??= []).push(material)
  w.chain.push({ col, material })
  w.lastCol = col
}

function ladderRow(w: Walk, row: readonly string[], r: number): void {
  if (row.length === 0) {
    w.step = null
    return
  }
  if (row[0] !== '') {
    openStep(w, row, r)
    return
  }
  const col = row.findIndex((c) => c !== '')
  // An ingredient sits at most one column deeper than the name above it.
  if (w.step !== null && col <= w.lastCol + 1) addMaterial(w, row, col)
  else asidesFrom(w, row, col)
}

/** One tradeskill tab. `where` names it in a refusal. */
export function parseLadder(grid: readonly (readonly string[])[], where: string): { ladder: GuideLadder; refusals: Refusal[] } {
  const w: Walk = {
    ladder: { notes: [], steps: [], alternates: [], asides: [], unparsed: [] },
    refusals: [],
    where,
    mode: 'notes',
    sawLeveling: false,
    step: null,
    chain: [],
    lastCol: ITEM_COL
  }
  grid.forEach((row, r) => {
    if (marker(w, row)) return
    if (w.mode !== 'notes') {
      ladderRow(w, row, r)
      return
    }
    if ((row[0] ?? '') !== '') w.ladder.notes.push(row[0])
    asidesFrom(w, row, 1)
  })
  if (!w.sawLeveling) w.refusals.push({ kind: 'layout', message: `${where}: no "Leveling:" row in column A, so no step can be read` })
  const { asides, unparsed, ...rest } = w.ladder
  const ladder: GuideLadder = { ...rest }
  if (asides.length > 0) ladder.asides = asides
  if (unparsed.length > 0) ladder.unparsed = unparsed
  return { ladder, refusals: w.refusals }
}

/** How many steps a ladder holds, alternates included. */
export const stepCount = (l: GuideLadder): number => l.steps.length + l.alternates.length

/** The Welcome tab's `Label:` rows the credit is read from. */
export function readWelcome(grid: readonly (readonly string[])[]): { author?: string; server?: string; version?: string; lastUpdate?: string } {
  const field = (label: string): string | undefined => {
    const row = grid.find((r) => (r[0] ?? '').toLowerCase() === label && (r[1] ?? '') !== '')
    return row === undefined ? undefined : row[1]
  }
  const out: { author?: string; server?: string; version?: string; lastUpdate?: string } = {}
  const pairs: [keyof typeof out, string][] = [['author', 'name:'], ['server', 'server:'], ['version', 'version:'], ['lastUpdate', 'last update:']]
  for (const [key, label] of pairs) {
    const v = field(label)
    if (v !== undefined) out[key] = v
  }
  return out
}

/** The Overview tab: a heading is a lone column-A cell ending in a colon; every other cell is a line under it. */
export function readOverview(grid: readonly (readonly string[])[]): GuideOverviewSection[] {
  const sections: GuideOverviewSection[] = []
  for (const row of grid) {
    const cells = row.filter((c) => c !== '')
    if (cells.length === 0) continue
    if (cells.length === 1 && row[0] !== '' && row[0].endsWith(':')) {
      sections.push({ heading: row[0].slice(0, -1), lines: [] })
      continue
    }
    if (sections.length === 0) sections.push({ lines: [] })
    sections[sections.length - 1].lines.push(cells.join(' '))
  }
  return sections
}
