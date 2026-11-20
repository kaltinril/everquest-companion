// build.ts — one pull's raw bytes into the data file and the grids the rules run over. Pure: no
// file, no network. Everything a tab or table holds is checked as text here (rules.ts), whether or
// not the parser uses it.

import type { GuideLadder, RecipeList, TradeskillGuidesFile } from '../../../src/shared/guideData'
import type { Tradeskill } from '../../../src/shared/tradeskills'
import { csvGrid, trimGrid } from './csv'
import { parseRecipeTable, takeCredit, type Credit } from './kornerstore'
import { readOds, type OdsBook, type OdsCellRef } from './ods'
import { cellAddress, cellFault, contentRefusals, quoteCell, refusalOf, type Refusal } from './rules'
import { parseLadder, readOverview, readWelcome, stepCount } from './sheetGuide'
import { foldTradeskill } from './tabs'

/** The leveling guide: a published Google Sheet, one CSV per tab. */
export const SHEET_PUB = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTNj3GiLZ4nXBfLkGEB2iGkJy_WV4Mfkth5nwyg3pSfjJEiEreIsspJhIcSZAIS5hbSDwZbawzk4jEz'
export const SHEET_PAGE_URL = `${SHEET_PUB}/pubhtml`
export const sheetCsvUrl = (gid: string): string => `${SHEET_PUB}/pub?gid=${gid}&single=true&output=csv`
const SHEET_TITLE = 'EQ Legends Tradeskill Guide'

/** The recipe book: an .ods file on Google Drive. */
export const ODS_FILE_ID = '1VcUmqXTclXafiMxQvCr2G5HvtgRc7ew5'
export const ODS_DOWNLOAD_URL = `https://drive.google.com/uc?export=download&id=${ODS_FILE_ID}`
export const ODS_PAGE_URL = `https://drive.google.com/file/d/${ODS_FILE_ID}/view`
const ODS_TITLE = "EQL Myztikal's Kerran Kornerstore"
const ODS_AUTHOR = 'Myztikal'

const ABOUT =
  'Two community tradeskill guides as data. Written by scripts/community/guides-pull.mts at release time; never edited by hand. Each guide is its author\'s work: show the title, the author and the link wherever its data is shown.'

export interface RawTab {
  name: string
  gid: string
  bytes: Uint8Array
}

/** What one pull fetched. A tab or file that could not be fetched is absent and has a refusal. */
export interface RawPull {
  /** The sheet page's own title. */
  title?: string
  tabs: RawTab[]
  ods?: Uint8Array
  refusals: Refusal[]
}

/** What the tabs and tables add up to while they are read; `Parsed` is this plus the file. */
interface Tally {
  /** Every tab and table as text, keyed `sheet/<tab>` or `recipes/<table>`, in source order. */
  grids: Map<string, string[][]>
  refusals: Refusal[]
  /** Ladder steps (alternates included) and recipes: the totals the loss rule watches. */
  steps: number
  recipes: number
  /** Tabs and tables that are no tradeskill and feed nothing but the credit. */
  unused: string[]
}

export interface Parsed extends Tally {
  file: TradeskillGuidesFile
}

export const sheetKey = (tab: string): string => `sheet/${tab}`
export const recipesKey = (table: string): string => `recipes/${table}`

interface SheetParts {
  welcome: ReturnType<typeof readWelcome>
  overview: ReturnType<typeof readOverview>
  tradeskills: Partial<Record<Tradeskill, GuideLadder>>
}

function nameRefusal(where: string, name: string): Refusal[] {
  const fault = cellFault(name)
  return fault === undefined ? [] : [{ kind: 'content', message: `${where}: its name is ${fault}: ${quoteCell(name)}` }]
}

function sheetTab(p: Tally, parts: SheetParts, tab: RawTab): void {
  const where = `sheet tab "${tab.name}"`
  let grid: string[][]
  try {
    grid = csvGrid(tab.bytes, where)
  } catch (e) {
    const r = refusalOf(e)
    if (r === undefined) throw e
    p.refusals.push(r)
    return
  }
  p.grids.set(sheetKey(tab.name), grid)
  p.refusals.push(...contentRefusals(where, grid))
  const skill = foldTradeskill(tab.name)
  if (skill === undefined) {
    const lower = tab.name.toLowerCase()
    if (lower === 'welcome') parts.welcome = readWelcome(grid)
    else if (lower === 'overview') parts.overview = readOverview(grid)
    else p.unused.push(sheetKey(tab.name))
    return
  }
  if (parts.tradeskills[skill] !== undefined) {
    p.refusals.push({ kind: 'layout', message: `${where}: a second tab for ${skill}` })
    return
  }
  const { ladder, refusals } = parseLadder(grid, where)
  parts.tradeskills[skill] = ladder
  p.refusals.push(...refusals)
  p.steps += stepCount(ladder)
}

function odsBook(p: Tally, bytes: Uint8Array | undefined): OdsBook | undefined {
  if (bytes === undefined) return undefined
  try {
    return readOds(bytes, 'the recipe book (.ods)')
  } catch (e) {
    const r = refusalOf(e)
    if (r === undefined) throw e
    p.refusals.push(r)
    return undefined
  }
}

const cellRefusals = (cells: readonly OdsCellRef[], fault: string): Refusal[] =>
  cells.map((c) => ({ kind: 'content', message: `recipe table "${c.table}" ${cellAddress(c.row, c.col)}: ${fault}` }))

interface BookParts {
  credit?: Credit
  tradeskills: Partial<Record<Tradeskill, RecipeList>>
}

function recipeTable(p: Tally, parts: BookParts, table: { name: string; rows: string[][] }): void {
  const where = `recipe table "${table.name}"`
  const grid = trimGrid(table.rows)
  p.grids.set(recipesKey(table.name), grid)
  p.refusals.push(...contentRefusals(where, grid))
  const { rows, credit } = takeCredit(grid)
  parts.credit ??= credit
  const skill = foldTradeskill(table.name)
  if (skill === undefined) {
    p.unused.push(recipesKey(table.name))
    return
  }
  if (parts.tradeskills[skill] !== undefined) {
    p.refusals.push({ kind: 'layout', message: `${where}: a second table for ${skill}` })
    return
  }
  const { list, refusals } = parseRecipeTable(rows, where, skill)
  parts.tradeskills[skill] = list
  p.refusals.push(...refusals)
  p.recipes += list.recipes.length
}

function sheetTitle(p: Tally, title: string | undefined): string {
  if (title === undefined) return SHEET_TITLE
  const fault = cellFault(title)
  if (fault === undefined) return title
  p.refusals.push({ kind: 'content', message: `the sheet's page title is ${fault}: ${quoteCell(title)}` })
  return SHEET_TITLE
}

/** Raw bytes to the data file, the grids, and every response, content and layout refusal. */
export function parsePull(raw: RawPull, pulledAt: string): Parsed {
  const p: Tally = { grids: new Map(), refusals: [...raw.refusals], steps: 0, recipes: 0, unused: [] }
  const sheet: SheetParts = { welcome: {}, overview: [], tradeskills: {} }
  for (const tab of raw.tabs) {
    p.refusals.push(...nameRefusal(`sheet tab ${quoteCell(tab.name)}`, tab.name))
    sheetTab(p, sheet, tab)
  }
  const book: BookParts = { tradeskills: {} }
  const ods = odsBook(p, raw.ods)
  if (ods !== undefined) {
    p.refusals.push(...cellRefusals(ods.formulas, 'a spreadsheet formula'), ...cellRefusals(ods.links, 'a hyperlink'))
    for (const table of ods.tables) {
      p.refusals.push(...nameRefusal(`recipe table ${quoteCell(table.name)}`, table.name))
      recipeTable(p, book, table)
    }
  }
  const { author, server, version, lastUpdate } = sheet.welcome
  if (author === undefined && raw.tabs.length > 0) {
    p.refusals.push({ kind: 'layout', message: 'sheet tab "Welcome": no "Name:" row with the author in column B, so the guide cannot be credited' })
  }
  const file: TradeskillGuidesFile = {
    about: ABOUT,
    leveling: {
      id: 'eql-tradeskill-guide',
      title: sheetTitle(p, raw.title),
      author: author ?? '',
      ...(server === undefined ? {} : { server }),
      ...(version === undefined ? {} : { version }),
      ...(lastUpdate === undefined ? {} : { lastUpdate }),
      sourceUrl: SHEET_PAGE_URL,
      pulledAt,
      overview: sheet.overview,
      tradeskills: sheet.tradeskills
    },
    recipes: {
      id: 'kerran-kornerstore',
      title: ODS_TITLE,
      author: book.credit?.author ?? ODS_AUTHOR,
      ...(book.credit === undefined ? {} : { server: book.credit.server, credit: book.credit.credit }),
      sourceUrl: ODS_PAGE_URL,
      pulledAt,
      tradeskills: book.tradeskills
    }
  }
  return { ...p, file }
}
