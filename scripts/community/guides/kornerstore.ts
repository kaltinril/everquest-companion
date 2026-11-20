// kornerstore.ts — the recipe book's tables (rows of cells out of the .ods) into the shape in
// src/shared/guideData.ts. Pure. What the parser cannot place is kept as written (`sourceText`,
// `notes`, `unparsed`), never guessed at.
//
// A table, as its author lays it out (column A is empty):
//   B Skill level | C Crafted Item | D Material | E (empty) | F Merchant Name | G Merchant Zone | H Merchant Loc
// A recipe starts on a row with a level; the rows under it add one material each, sometimes with a
// parenthesised remark under the item name. Several items may share one level (`Filleted Bear`,
// `Filleted Lion` ...): a row with a new item name and no level starts the next one. A blank row
// ends the block. The merchant columns hold a merchant with a zone and a loc, or free text
// (`Crafted (Blacksmithing)`, `Farmed`, `Dropped(Plane of Hate)`). The author's credit line sits in
// stray cells: it is taken out of the data and kept as the credit.

import type { GuideRecipe, RecipeList, RecipeMaterial } from '../../../src/shared/guideData'
import type { Tradeskill } from '../../../src/shared/tradeskills'
import { cellAddress, type Refusal } from './rules'
import { foldTradeskill } from './tabs'

const COL = { level: 1, item: 2, material: 3, merchant: 5, zone: 6, loc: 7 } as const
const KNOWN_COLS = new Set<number>(Object.values(COL))
const CREDIT = /^created by (.+?) on (.+?)!?$/i
/** Two or three numbers: `2841, -3457`, `61,-175,-39`, and the author's slip `2888. -3400`. */
const COORDS = /^-?\d+(?:\.\d+)?(?:\s*[,.]\s*-?\d+(?:\.\d+)?){1,2}$/
const TRAILING_PAREN = /^(.*\S)\s*\(([^()]*)\)$/
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

export interface Credit {
  credit: string
  author: string
  server: string
}

export function readCredit(cell: string): Credit | undefined {
  const m = CREDIT.exec(cell)
  return m === null ? undefined : { credit: cell, author: m[1], server: m[2] }
}

/** The grid without the credit cells, and the first credit line found. */
export function takeCredit(rows: readonly (readonly string[])[]): { rows: string[][]; credit?: Credit } {
  let credit: Credit | undefined
  const out = rows.map((row) => {
    const cells = row.map((cell) => {
      const c = readCredit(cell)
      if (c === undefined) return cell
      credit ??= c
      return ''
    })
    let end = cells.length
    while (end > 0 && cells[end - 1] === '') end--
    return cells.slice(0, end)
  })
  return credit === undefined ? { rows: out } : { rows: out, credit }
}

interface Cells {
  level: string
  item: string
  material: string
  merchant: string
  zone: string
  loc: string
}

const cellsOf = (row: readonly string[]): Cells => ({
  level: row[COL.level] ?? '',
  item: row[COL.item] ?? '',
  material: row[COL.material] ?? '',
  merchant: row[COL.merchant] ?? '',
  zone: row[COL.zone] ?? '',
  loc: row[COL.loc] ?? ''
})

/** `(a)(b)` as its remarks; any other text as one remark, as written. */
function remarks(text: string): string[] {
  const groups = text.match(/\(([^()]*)\)/g)
  if (groups === null || squash(text.replace(/\([^()]*\)/g, '')) !== '') return [squash(text)]
  return groups.map((g) => squash(g.slice(1, -1))).filter((g) => g !== '')
}

const isRemark = (text: string): boolean => text.includes('(')

/** A name with its trailing parentheses read: a count, `Reusable`, or a remark. */
function readNamed(text: string): { name: string; qty?: number; returned?: boolean; notes: string[] } {
  let rest = squash(text)
  const out: { name: string; qty?: number; returned?: boolean; notes: string[] } = { name: rest, notes: [] }
  for (let m = TRAILING_PAREN.exec(rest); m !== null; m = TRAILING_PAREN.exec(rest)) {
    rest = m[1]
    const inner = squash(m[2])
    if (/^\d{1,4}$/.test(inner)) out.qty = Number.parseInt(inner, 10)
    else if (/^reusable$/i.test(inner)) out.returned = true
    else if (inner !== '') out.notes.unshift(inner)
  }
  out.name = rest
  return out
}

/** A merchant at a loc: the merchant, the zone and the loc, with a remark after the name set apart. */
function locatedSource(c: Cells, notes: string[]): Partial<RecipeMaterial> {
  // `Ulka (Go to buy when you farm bears ...)`: the merchant, and a remark about the trip.
  const aside = TRAILING_PAREN.exec(c.merchant)
  if (aside !== null) notes.push(squash(aside[2]))
  const merchant = aside === null ? c.merchant : aside[1]
  return { ...(merchant === '' ? {} : { merchant }), ...(c.zone === '' ? {} : { zone: c.zone }), loc: c.loc }
}

/** No loc: the merchant cell is kept as written, and so is whatever sits in the zone and loc cells. */
function looseSource(c: Cells, notes: string[]): Partial<RecipeMaterial> {
  if (c.loc !== '') notes.push(c.loc)
  return { ...(c.zone === '' ? {} : { zone: c.zone }), ...(c.merchant === '' ? {} : { sourceText: c.merchant }) }
}

function readMaterial(c: Cells): RecipeMaterial {
  const named = readNamed(c.material)
  const notes = [...named.notes]
  const source = COORDS.test(c.loc) ? locatedSource(c, notes) : looseSource(c, notes)
  return {
    name: named.name,
    ...(named.qty === undefined ? {} : { qty: named.qty }),
    ...(named.returned === true ? { returned: true } : {}),
    ...source,
    ...(notes.length === 0 ? {} : { notes })
  }
}

/** `244`, `Blacksmithing (42)`, `(31) Tailoring`, `34 (Feir'Dal Fletching Kit)`: the number, and what is left. */
function readLevel(level: string): { trivial?: number; rest: string } {
  const m = /\d{1,4}/.exec(level)
  if (m === null) return { rest: squash(level) }
  const rest = squash(level.replace(m[0], '').replace(/\(\s*\)/g, ''))
  const inner = /^\((.*)\)$/.exec(rest)
  return { trivial: Number.parseInt(m[0], 10), rest: inner === null ? rest : squash(inner[1]) }
}

interface Walk {
  list: RecipeList & { unparsed: string[] }
  own: Tradeskill | undefined
  recipe: GuideRecipe | null
  lastMaterial: RecipeMaterial | null
  section: string | undefined
  afterBlank: boolean
  sectionOpen: boolean
}

function startRecipe(w: Walk, c: Cells, inherit: GuideRecipe | null): void {
  const level = readLevel(c.level)
  const named = readNamed(c.item)
  // On a made item, `(Reusable)` and a count are remarks about it, not about a combine.
  if (named.returned === true) named.notes.push('Reusable')
  if (named.qty !== undefined) named.notes.push(String(named.qty))
  const recipe: GuideRecipe = { item: named.name, notes: named.notes, materials: [] }
  const trivial = level.trivial ?? inherit?.trivial
  const other = level.rest === '' ? inherit?.tradeskill : foldTradeskill(level.rest)
  if (level.rest !== '' && other === undefined) recipe.notes.push(...remarks(level.rest))
  // Key order as the file writes it: trivial, tradeskill, section, item, notes, materials.
  w.recipe = {
    ...(trivial === undefined ? {} : { trivial }),
    ...(other === undefined || other === w.own ? {} : { tradeskill: other }),
    ...(w.section === undefined ? {} : { section: w.section }),
    ...recipe
  }
  w.list.recipes.push(w.recipe)
  w.lastMaterial = null
}

function materialRow(w: Walk, c: Cells, text: string): void {
  if (/\d/.test(c.level) && c.item !== '') startRecipe(w, c, null)
  else if (c.item !== '' && (w.recipe === null || !isRemark(c.item))) startRecipe(w, c, w.recipe)
  else if (w.recipe === null) {
    w.list.unparsed.push(text)
    return
  } else {
    if (c.item !== '') w.recipe.notes.push(...remarks(c.item))
    if (c.level !== '') w.recipe.notes.push(...remarks(c.level))
  }
  w.lastMaterial = readMaterial(c)
  w.recipe?.materials.push(w.lastMaterial)
}

/** A row with no material: a recipe's first line, more about the last material, a remark, a heading. */
function bareRow(w: Walk, c: Cells, row: { text: string; wasSection: boolean }): void {
  const source = [c.merchant, c.zone, c.loc].filter((s) => s !== '')
  if (/\d/.test(c.level) && c.item !== '') startRecipe(w, c, null)
  else if (c.level === '' && c.item === '' && w.lastMaterial !== null) (w.lastMaterial.notes ??= []).push(...source)
  else if (w.recipe !== null && c.level === '' && isRemark(c.item) && source.length === 0) w.recipe.notes.push(...remarks(c.item))
  else looseRow(w, { ...row, cells: [c.level, c.item, ...source].filter((s) => s !== '') })
}

/** Text that is no recipe: a heading over the recipes that follow (alone after a blank row), or unplaced. */
function looseRow(w: Walk, row: { cells: string[]; text: string; wasSection: boolean }): void {
  w.recipe = null
  w.lastMaterial = null
  const alone = row.cells.length === 1
  if (alone && w.afterBlank) w.section = row.cells[0]
  else if (alone && row.wasSection) w.section = `${w.section ?? ''} / ${row.cells[0]}`
  else {
    w.list.unparsed.push(row.text)
    return
  }
  w.sectionOpen = true
}

const isHeader = (c: Cells): boolean => c.level.toLowerCase() === 'skill level'

function recipeRow(w: Walk, row: readonly string[], r: number): void {
  const c = cellsOf(row)
  if (row.length === 0 || isHeader(c)) {
    w.recipe = null
    w.lastMaterial = null
    w.afterBlank = true
    w.sectionOpen = false
    return
  }
  row.forEach((cell, col) => {
    if (cell !== '' && !KNOWN_COLS.has(col)) w.list.unparsed.push(`${cellAddress(r + 1, col + 1)}: ${cell}`)
  })
  const text = row.filter((cell) => cell !== '').join(' | ')
  const wasSection = w.sectionOpen
  w.sectionOpen = false
  if (c.material !== '') materialRow(w, c, text)
  else if (Object.values(c).some((s) => s !== '')) bareRow(w, c, { text, wasSection })
  w.afterBlank = false
}

function layoutRefusals(rows: readonly (readonly string[])[], where: string): Refusal[] {
  const lower = (row: readonly string[], col: number): string => (row[col] ?? '').toLowerCase()
  const recipeHead = rows.some((row) => lower(row, COL.level) === 'skill level' && lower(row, COL.item) === 'crafted item' && lower(row, COL.material) === 'material')
  const merchantHead = rows.some((row) => lower(row, COL.merchant) === 'merchant name' && lower(row, COL.zone) === 'merchant zone' && lower(row, COL.loc) === 'merchant loc')
  const out: Refusal[] = []
  if (!recipeHead) out.push({ kind: 'layout', message: `${where}: no "Skill level | Crafted Item | Material" header in columns B to D` })
  if (!merchantHead) out.push({ kind: 'layout', message: `${where}: no "Merchant Name | Merchant Zone | Merchant Loc" header in columns F to H` })
  return out
}

/** One tradeskill table, credit cells already taken out. `own` is the tradeskill the table is for. */
export function parseRecipeTable(rows: readonly (readonly string[])[], where: string, own?: Tradeskill): { list: RecipeList; refusals: Refusal[] } {
  const refusals = layoutRefusals(rows, where)
  const w: Walk = { list: { recipes: [], unparsed: [] }, own, recipe: null, lastMaterial: null, section: undefined, afterBlank: true, sectionOpen: false }
  // The first row is the table's title, with the merchant headings and sometimes a remark.
  const titleRemark = rows.length > 0 ? cellsOf(rows[0]).item : ''
  rows.slice(1).forEach((row, i) => {
    recipeRow(w, row, i + 1)
  })
  const list: RecipeList = {
    ...(titleRemark === '' ? {} : { notes: remarks(titleRemark) }),
    recipes: w.list.recipes,
    ...(w.list.unparsed.length === 0 ? {} : { unparsed: w.list.unparsed })
  }
  return { list, refusals }
}
