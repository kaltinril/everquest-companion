/**
 * The General AAs table of the wiki's `Alternate Advancement` page, row by row, for the
 * Tradeskills section (owner, 2026-11-20: "there are AA's that pertain to crafting, we should
 * somehow show stuff related to that"), and the sentence of the `Tradeskills` page that links to
 * that page (the 200 rule). Parsers only: scripts/gen-tradeskill-aas.mts reads the caches and
 * writes src/shared/tradeskillAaTable.generated.ts.
 *
 * WHY NOT classes.json. `parseAaTable` (classWiki.ts) keeps each AA's table, classes, levels and
 * cast for the level-up panel, and no ranks, cost or description. It also reads only rows written
 * on one line (`| Name || 3 || 2/4/6 || text`): the three rows the wiki writes one cell per line
 * (Full Potential, Widened Perception, Point Blank Fire on the 2026-11-20 cache) are not in
 * classes.json. This parser reads both layouts and keeps the four cells as the wiki writes them.
 *
 * NOTHING IS PICKED HERE. Every row of the table is kept; which of them bear on a tradeskill is
 * src/shared/tradeskillAa.ts, tested against the committed table. A row that does not have the
 * four cells, or whose rank count is no number, is named in `skipped`, never guessed at.
 */
import { plain, tableRows } from './classWiki'

/** One row of the General AAs table. */
export interface GeneralAaRow {
  name: string
  ranks: number
  /** The Cost cell as the wiki writes it: `2/4/6`, `3`, `1 for all ranks`. */
  cost: string
  /** The Description cell, wiki markup stripped to its display text. */
  text: string
}

export interface GeneralAaScan {
  rows: GeneralAaRow[]
  /** Rows the table holds that could not be read, each with the reason. */
  skipped: string[]
}

/** An en or em dash (U+2013, U+2014) with the spaces around it. */
const LONG_DASH = new RegExp(`\\s*[${String.fromCharCode(0x2013, 0x2014)}]\\s*`, 'g')

/**
 * A cell as the app may print it: wiki markup stripped to its display text (`plain`), and an em or
 * en dash written as a spaced hyphen. The dash is the app's copy rule, not a reading of the text:
 * tests/copyNoEmDash.test.mts scans every string under src/shared, the generated table included.
 */
export function cellText(cell: string): string {
  return plain(cell).replace(LONG_DASH, ' - ')
}

/**
 * A row chunk's cells. The wiki writes a row on one line with `||` between cells, or one cell per
 * `|` line; a line that opens with neither continues the cell above it.
 */
export function aaCells(chunk: string): string[] {
  const cells: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('|}')) break
    if (line.startsWith('!') || line.startsWith('|+')) continue
    if (line.startsWith('|')) cells.push(...line.slice(1).split('||'))
    else if (line.trim() !== '' && cells.length > 0) cells[cells.length - 1] += ` ${line}`
  }
  return cells.map(cellText)
}

/** The text between the `== General AAs ==` heading and the next heading of its level. */
function generalSection(wt: string): string | null {
  const start = /^==\s*General AAs\s*==\s*$/m.exec(wt)
  if (start === null) return null
  const rest = wt.slice(start.index + start[0].length)
  const end = /^==[^=]/m.exec(rest)
  return end === null ? rest : rest.slice(0, end.index)
}

/** Why a row's cells are not a General AA row, or null when they are. */
function rowFault(cells: readonly string[]): string | null {
  if (cells.length !== 4) return `${String(cells.length)} cells, not 4`
  const [name, ranks, cost, text] = cells
  if (name === '') return 'no name'
  if (!/^[1-9]\d*$/.test(ranks)) return `rank count "${ranks}" is not a number`
  if (cost === '') return 'no cost'
  if (text === '') return 'no description'
  return null
}

/** Every row of the General AAs table, in the wiki's order. */
export function parseGeneralAas(wt: string): GeneralAaScan {
  const scan: GeneralAaScan = { rows: [], skipped: [] }
  const section = generalSection(wt)
  if (section === null) {
    scan.skipped.push('the page has no "== General AAs ==" heading')
    return scan
  }
  for (const chunk of tableRows(section)) {
    const cells = aaCells(chunk)
    if (cells.length === 0) continue
    const fault = rowFault(cells)
    if (fault !== null) scan.skipped.push(`${cells[0] === '' ? '(unnamed row)' : cells[0]}: ${fault}`)
    else scan.rows.push({ name: cells[0], ranks: Number(cells[1]), cost: cells[2], text: cells[3] })
  }
  return scan
}

/**
 * The lines of the `Tradeskills` page that link to the Alternate Advancement page, as plain text:
 * today one, the rule that past 200 in one tradeskill the others stop at 200 until Crafting
 * Mastery. Empty when the page links to it nowhere.
 */
export function tradeskillAaRules(tradeskillsWt: string): string[] {
  return tradeskillsWt
    .split('\n')
    .filter((line) => /\[\[\s*Alternate Advancement\b/.test(line))
    .map(cellText)
}

/** The generated module's source. One row per line, so a wiki edit is a one-line diff. */
export function renderTradeskillAaTable(rows: readonly GeneralAaRow[], rules: readonly string[]): string {
  return `// GENERATED by scripts/gen-tradeskill-aas.mts from the cached wiki pages - do not edit by hand.
//
// The General AAs table of the wiki's Alternate Advancement page (name, ranks, the Cost cell and
// the Description cell as the wiki writes them), and the lines of the wiki's Tradeskills page
// that link to it. Which rows bear on a tradeskill is shared/tradeskillAa.ts.

export interface WikiAaRow {
  name: string
  ranks: number
  /** The Cost cell as the wiki writes it: \`2/4/6\`, \`3\`, \`1 for all ranks\`. */
  cost: string
  /** The Description cell as the wiki writes it. */
  text: string
}

// prettier-ignore
export const GENERAL_AAS: readonly WikiAaRow[] = [
${rows.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}
]

/** The lines of the Tradeskills page that link to the Alternate Advancement page; empty when it has none. */
// prettier-ignore
export const TRADESKILL_AA_RULES: readonly string[] = [
${rules.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}
]
`
}
