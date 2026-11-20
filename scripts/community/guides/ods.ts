// ods.ts — the tables of an OpenDocument spreadsheet, read with node:zlib and a small tokenizer, so
// the guide pull needs no zip or XML package. The file is another player's document: every size
// and offset in it is checked before it is used, and nothing in it is run.

import { inflateRawSync } from 'node:zlib'
import { PullRefusal } from './rules'

export const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet'
/** content.xml may inflate to this much and no more (303 KB on 2026-11-20). */
export const MAX_CONTENT_XML_BYTES = 8 * 1024 * 1024
/** A repeat count on an empty trailing cell or row is 16,384 or a million: only this many are kept. */
const MAX_COL_REPEAT = 64
const MAX_ROW_REPEAT = 256
const MAX_ROWS_PER_TABLE = 5000

export interface OdsTable {
  name: string
  /** Cell text, row by row; trailing empty cells and rows are dropped. */
  rows: string[][]
}

export interface OdsCellRef {
  table: string
  row: number
  col: number
}

export interface OdsBook {
  tables: OdsTable[]
  /** Cells carrying a `table:formula`, and cells whose text is a hyperlink. */
  formulas: OdsCellRef[]
  links: OdsCellRef[]
}

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  localOffset: number
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

/** The zip's central directory. Refuses anything that is not a plain, single-disk zip. */
function centralDirectory(buf: Buffer, what: string): ZipEntry[] {
  if (buf.length < 22 || buf.readUInt32LE(0) !== LOC_SIG) throw new PullRefusal('response', `${what}: not a zip file`)
  let eocd = buf.length - 22
  const floor = Math.max(0, buf.length - 22 - 0xffff)
  while (eocd >= floor && buf.readUInt32LE(eocd) !== EOCD_SIG) eocd--
  if (eocd < floor) throw new PullRefusal('response', `${what}: not a zip file (no end record)`)
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new PullRefusal('response', `${what}: broken zip directory`)
    const nameLen = buf.readUInt16LE(p + 28)
    entries.push({
      name: buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      localOffset: buf.readUInt32LE(p + 42)
    })
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return entries
}

function entryBytes(buf: Buffer, e: ZipEntry, what: string): Buffer {
  const h = e.localOffset
  if (h + 30 > buf.length || buf.readUInt32LE(h) !== LOC_SIG) throw new PullRefusal('response', `${what}: broken zip entry ${e.name}`)
  const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28)
  const end = start + e.compressedSize
  if (end > buf.length) throw new PullRefusal('response', `${what}: zip entry ${e.name} runs past the file`)
  const data = buf.subarray(start, end)
  if (e.method === 0) return data
  if (e.method !== 8) throw new PullRefusal('response', `${what}: zip entry ${e.name} uses compression method ${String(e.method)}`)
  try {
    return inflateRawSync(data, { maxOutputLength: MAX_CONTENT_XML_BYTES })
  } catch {
    throw new PullRefusal('response', `${what}: zip entry ${e.name} does not inflate, or is over ${String(MAX_CONTENT_XML_BYTES)} bytes`)
  }
}

/** content.xml of an .ods file. Refuses a file that is not a zip, not a spreadsheet, or has none. */
export function odsContentXml(bytes: Uint8Array, what = 'the .ods file'): string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries = centralDirectory(buf, what)
  const mime = entries.find((e) => e.name === 'mimetype')
  if (mime === undefined || entryBytes(buf, mime, what).toString('utf8').trim() !== ODS_MIME) {
    throw new PullRefusal('response', `${what}: a zip, but not an OpenDocument spreadsheet`)
  }
  const content = entries.find((e) => e.name === 'content.xml')
  if (content === undefined) throw new PullRefusal('response', `${what}: no content.xml inside`)
  return entryBytes(buf, content, what).toString('utf8')
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(Number.parseInt(e.slice(2), 16))
    if (e.startsWith('#')) return String.fromCodePoint(Number.parseInt(e.slice(1), 10))
    return ENTITY[e.toLowerCase()] ?? m
  })
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)
  return m === null ? undefined : decodeEntities(m[1])
}

const repeat = (attrs: string, name: string, cap: number): number => {
  const n = Number.parseInt(attr(attrs, name) ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, cap) : 1
}

function trimRow(row: string[]): string[] {
  let end = row.length
  while (end > 0 && row[end - 1] === '') end--
  return row.slice(0, end)
}

/** What the tokenizer is in the middle of. */
interface Walk {
  book: OdsBook
  table: OdsTable | null
  row: string[] | null
  rowRepeat: number
  cell: { text: string; repeat: number; paragraphs: number; formula: boolean; link: boolean } | null
  /** Depth inside an annotation (a cell comment): its text is not the cell's. */
  skip: number
}

function closeCell(w: Walk): void {
  if (w.cell === null || w.row === null || w.table === null) return
  const text = w.cell.text.trim()
  const ref = { table: w.table.name, row: w.table.rows.length + 1, col: w.row.length + 1 }
  if (w.cell.formula) w.book.formulas.push(ref)
  if (w.cell.link) w.book.links.push(ref)
  // A repeated cell with text is a real run of equal cells; an empty one is padding.
  for (let i = 0; i < w.cell.repeat; i++) w.row.push(text)
  w.cell = null
}

function closeRow(w: Walk): void {
  if (w.row === null || w.table === null) return
  const row = trimRow(w.row)
  const times = row.length === 0 ? Math.min(w.rowRepeat, MAX_ROW_REPEAT) : w.rowRepeat
  for (let i = 0; i < times && w.table.rows.length < MAX_ROWS_PER_TABLE; i++) w.table.rows.push(row)
  w.row = null
}

function closeTable(w: Walk): void {
  if (w.table === null) return
  const rows = w.table.rows
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop()
  w.book.tables.push(w.table)
  w.table = null
}

function openTag(w: Walk, name: string, attrs: string): void {
  if (name === 'office:annotation') w.skip++
  else if (name === 'table:table') w.table = { name: attr(attrs, 'table:name') ?? '', rows: [] }
  else if (name === 'table:table-row') {
    w.row = []
    w.rowRepeat = repeat(attrs, 'table:number-rows-repeated', MAX_ROW_REPEAT)
  } else if (name === 'table:table-cell' || name === 'table:covered-table-cell') {
    w.cell = {
      text: '',
      repeat: repeat(attrs, 'table:number-columns-repeated', MAX_COL_REPEAT),
      paragraphs: 0,
      formula: attr(attrs, 'table:formula') !== undefined,
      link: false
    }
  } else if (w.cell !== null && w.skip === 0) openTextTag(w.cell, name, attrs)
}

function openTextTag(cell: NonNullable<Walk['cell']>, name: string, attrs: string): void {
  if (name === 'text:p') {
    if (cell.paragraphs > 0) cell.text += '\n'
    cell.paragraphs++
  } else if (name === 'text:s') cell.text += ' '.repeat(repeat(attrs, 'text:c', 256))
  else if (name === 'text:tab') cell.text += '\t'
  else if (name === 'text:line-break') cell.text += '\n'
  else if (name === 'text:a') cell.link = true
}

function closeTag(w: Walk, name: string): void {
  if (name === 'office:annotation') w.skip = Math.max(0, w.skip - 1)
  else if (name === 'table:table-cell' || name === 'table:covered-table-cell') closeCell(w)
  else if (name === 'table:table-row') closeRow(w)
  else if (name === 'table:table') closeTable(w)
}

const TOKEN = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|([^<]+)/g

/** Every table of a content.xml, as text. Columns and rows repeated without content are capped. */
export function parseOdsContent(xml: string): OdsBook {
  const w: Walk = { book: { tables: [], formulas: [], links: [] }, table: null, row: null, rowRepeat: 1, cell: null, skip: 0 }
  for (const m of xml.matchAll(TOKEN)) {
    const [, closing, name, attrs, selfClosing, text] = m as unknown as (string | undefined)[]
    if (text !== undefined) {
      if (w.cell !== null && w.skip === 0 && w.cell.paragraphs > 0) w.cell.text += decodeEntities(text)
      continue
    }
    if (name === undefined) continue
    if (closing === '/') closeTag(w, name)
    else {
      openTag(w, name, attrs ?? '')
      if (selfClosing === '/') closeTag(w, name)
    }
  }
  const long = w.book.tables.find((t) => t.rows.length >= MAX_ROWS_PER_TABLE)
  if (long !== undefined) throw new PullRefusal('response', `table "${long.name}": ${String(MAX_ROWS_PER_TABLE)} rows or more, not the recipe book we know`)
  return w.book
}

export function readOds(bytes: Uint8Array, what = 'the .ods file'): OdsBook {
  return parseOdsContent(odsContentXml(bytes, what))
}
