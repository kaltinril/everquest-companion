/**
 * Every AA table of the wiki's `Alternate Advancement` page, for the Alt. Advancement tab (owner,
 * 2026-11-25; docs/community/requirements/alt-advancement.md): General, Archetype, one Class table
 * per class, and Special. Parser only: scripts/gen-aa-table.mts reads the cache and writes
 * src/shared/aaTable.generated.ts.
 *
 * The General, Archetype and Class tables have four cells (Name, Ranks, Cost, Description), read
 * in both layouts by `aaCells`. The Special table has a cell per rank instead of a rank count and a
 * cost, then the Description and, on some rows, the hotkey shared by the class reincarnations.
 * A row that does not fit is named in `skipped`, never guessed at.
 */
import { tableRows } from './classWiki'
import { aaCells } from './generalAas'

export type AaSection = 'general' | 'archetype' | 'class' | 'special'

/** One row of one AA table. */
export interface AaTableRow {
  section: AaSection
  /** A Class row's class, as its `=== <Class> Class AAs ===` heading writes it. */
  class?: string
  name: string
  ranks: number
  /** The Cost cell as the wiki writes it; empty on a Special row, whose table has no cost. */
  cost: string
  /** A Special row's rank cells, one per rank, as written. */
  values?: string[]
  /** The Description cell, wiki markup stripped to its display text. */
  text: string
  /** A Special row's hotkey cell, when it has one. */
  hk?: string
}

export interface AaTableScan {
  rows: AaTableRow[]
  /** Rows the tables hold that could not be read, each with the reason. */
  skipped: string[]
}

/** `{ title, body }` per heading of one level, the body running to the next heading of that level or above. */
function sections(wt: string, level: 2 | 3): { title: string; body: string }[] {
  const eq = '='.repeat(level)
  const heads = [...wt.matchAll(new RegExp(`^${eq}\\s*([^=].*?)\\s*${eq}\\s*$`, 'gm'))]
  return heads.map((h, i) => {
    const from = (h.index ?? 0) + h[0].length
    const next = heads[i + 1]
    return { title: h[1], body: wt.slice(from, next === undefined ? wt.length : next.index) }
  })
}

/** Why four cells are not a Name/Ranks/Cost/Description row, or null when they are. */
function plainFault(cells: readonly string[]): string | null {
  if (cells.length !== 4) return `${String(cells.length)} cells, not 4`
  const [name, ranks, cost, text] = cells
  if (name === '') return 'no name'
  if (!/^[1-9]\d*$/.test(ranks)) return `rank count "${ranks}" is not a number`
  if (cost === '') return 'no cost'
  if (text === '') return 'no description'
  return null
}

/** A row's display name for a skip line. */
function nameOf(cells: readonly string[]): string {
  return cells[0] === '' ? '(unnamed row)' : cells[0]
}

/** The cells of every row of a table body, header rows dropped. */
function bodyRows(body: string): string[][] {
  return tableRows(body)
    .map(aaCells)
    .filter((cells) => cells.length > 0)
}

/** The rows of a four-cell table into `scan`. */
function readPlain(scan: AaTableScan, body: string, at: { section: AaSection; class?: string }): void {
  for (const cells of bodyRows(body)) {
    const fault = plainFault(cells)
    const where = at.class === undefined ? at.section : `${at.class} class`
    if (fault !== null) scan.skipped.push(`${where}: ${nameOf(cells)}: ${fault}`)
    else scan.rows.push({ ...at, name: cells[0], ranks: Number(cells[1]), cost: cells[2], text: cells[3] })
  }
}

/**
 * A Special rank cell, split where it carries a further rank: Banestrike's third cell reads
 * `7% & rankIV-10%`, ranks III and IV.
 */
function rankValues(cell: string): string[] {
  const m = /^(.*?)\s*&\s*rank\s*[IVX]+\s*-\s*(.+)$/i.exec(cell)
  return m === null ? [cell] : [m[1], m[2]]
}

/** A Special row from its cells, or the reason it is not one. */
function specialRow(raw: readonly string[]): AaTableRow | string {
  // `45 ||| This ...` (Halfling) splits into `45` and `| This ...`: the stray bar is not text.
  const cells = raw.map((c) => c.replace(/^\|\s*/, ''))
  if (cells.length !== 5 && cells.length !== 6) return `${String(cells.length)} cells, not 5 or 6`
  const [name, r1, r2, r3, text, hk] = cells
  const values = [r1, r2, ...rankValues(r3)]
  if (name === '') return 'no name'
  if (values.some((v) => v === '')) return 'an empty rank cell'
  if (text === '') return 'no description'
  return { section: 'special', name, ranks: values.length, cost: '', values, text, ...(hk ? { hk } : {}) }
}

/** Every row of the page's AA tables, in the wiki's order: General, Archetype, Class (by heading), Special. */
export function parseAllAas(wt: string): AaTableScan {
  const scan: AaTableScan = { rows: [], skipped: [] }
  const top = new Map(sections(wt, 2).map((s) => [s.title, s.body]))
  for (const [title, section] of [['General AAs', 'general'], ['Archetype AAs', 'archetype']] as const) {
    const body = top.get(title)
    if (body === undefined) scan.skipped.push(`the page has no "== ${title} ==" heading`)
    else readPlain(scan, body, { section })
  }
  const classes = sections(top.get('Class AAs') ?? '', 3)
  if (classes.length === 0) scan.skipped.push('the page has no "=== <Class> Class AAs ===" table')
  for (const { title, body } of classes) {
    const m = /^(.+?)\s+Class AAs$/.exec(title)
    if (m === null) scan.skipped.push(`class heading "${title}" names no class`)
    else readPlain(scan, body, { section: 'class', class: m[1] })
  }
  const special = top.get('Special AAs')
  if (special === undefined) scan.skipped.push('the page has no "== Special AAs ==" heading')
  for (const cells of special === undefined ? [] : bodyRows(special)) {
    const row = specialRow(cells)
    if (typeof row === 'string') scan.skipped.push(`special: ${nameOf(cells)}: ${row}`)
    else scan.rows.push(row)
  }
  return scan
}

/** The generated module's source. One row per line, so a wiki edit is a one-line diff. */
export function renderAaTable(rows: readonly AaTableRow[]): string {
  return `// GENERATED by scripts/gen-aa-table.mts from the cached wiki page - do not edit by hand.
//
// Every AA table of the wiki's Alternate Advancement page, cells as the wiki writes them. The
// ranks a character holds are shared/aaRanks.ts.

export type AaSection = 'general' | 'archetype' | 'class' | 'special'

export interface AaTableRow {
  section: AaSection
  /** A Class row's class, as its heading writes it. */
  class?: string
  name: string
  ranks: number
  /** The Cost cell as the wiki writes it: \`2/4/6\`, \`3\`, \`1 for all ranks\`; empty on a Special row. */
  cost: string
  /** A Special row's rank cells, one per rank. */
  values?: string[]
  /** The Description cell as the wiki writes it. */
  text: string
  /** A Special row's hotkey cell, when it has one. */
  hk?: string
}

// prettier-ignore
export const AA_TABLE: readonly AaTableRow[] = [
${rows.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}
]
`
}
