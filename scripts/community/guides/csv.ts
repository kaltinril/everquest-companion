// csv.ts — a published sheet tab, from bytes to rows of cells. The bytes are another player's
// document: they are decoded strictly and refused when they are not the CSV that was asked for.

import { PullRefusal } from './rules'

const BOM = 0xfeff

/** Strict UTF-8. Bytes that are not text are a wrong response, not something to repair. */
export function decodeUtf8(bytes: Uint8Array, what: string): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    return text.charCodeAt(0) === BOM ? text.slice(1) : text
  } catch {
    throw new PullRefusal('response', `${what}: not UTF-8 text`)
  }
}

/** A sign-in page, an error page or a "file not found" page, where data was expected. */
export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 2048).trimStart().toLowerCase()
  return head.startsWith('<') || head.includes('<!doctype') || head.includes('<html') || head.includes('<body')
}

interface CsvState {
  rows: string[][]
  row: string[]
  cell: string
  quoted: boolean
}

function endCell(s: CsvState): void {
  s.row.push(s.cell)
  s.cell = ''
}

function endRow(s: CsvState): void {
  endCell(s)
  s.rows.push(s.row)
  s.row = []
}

/** Inside quotes: a doubled quote is one quote, a single one closes. Returns the chars consumed. */
function quotedChar(s: CsvState, ch: string, next: string): number {
  if (ch !== '"') {
    s.cell += ch
    return 1
  }
  if (next === '"') {
    s.cell += '"'
    return 2
  }
  s.quoted = false
  return 1
}

function plainChar(s: CsvState, ch: string, next: string): number {
  if (ch === '"' && s.cell === '') s.quoted = true
  else if (ch === ',') endCell(s)
  else if (ch === '\n') endRow(s)
  else if (ch === '\r') {
    endRow(s)
    return next === '\n' ? 2 : 1
  } else s.cell += ch
  return 1
}

/** RFC 4180 as Google writes it: quoted cells, doubled quotes, CRLF or LF, no trailing newline. */
export function parseCsv(text: string): string[][] {
  const s: CsvState = { rows: [], row: [], cell: '', quoted: false }
  let i = 0
  while (i < text.length) {
    const next = text[i + 1] ?? ''
    i += s.quoted ? quotedChar(s, text[i], next) : plainChar(s, text[i], next)
  }
  if (s.cell !== '' || s.row.length > 0) endRow(s)
  return s.rows
}

/** Rows with every cell trimmed and trailing empty cells dropped; blank rows stay, as `[]`. */
export function trimGrid(rows: readonly (readonly string[])[]): string[][] {
  return rows.map((row) => {
    const cells = row.map((c) => c.trim())
    let end = cells.length
    while (end > 0 && cells[end - 1] === '') end--
    return cells.slice(0, end)
  })
}

/** A tab's CSV as a trimmed grid. Refuses HTML, and a tab with no cell in it. */
export function csvGrid(bytes: Uint8Array, what: string): string[][] {
  if (bytes.byteLength === 0) throw new PullRefusal('response', `${what}: the response is empty`)
  const text = decodeUtf8(bytes, what)
  if (looksLikeHtml(text)) throw new PullRefusal('response', `${what}: an HTML page came back, not CSV`)
  const grid = trimGrid(parseCsv(text))
  while (grid.length > 0 && grid[grid.length - 1].length === 0) grid.pop()
  if (grid.length === 0) throw new PullRefusal('response', `${what}: the tab has no cell with text in it`)
  return grid
}
