// shared/gapRecipe.ts - a crafted item's recipe, told to the app by the player (owner, 2026-11-21:
// "some sort of a way the user can search for and chose items to tell the app what are needed for
// the receipe and the containter ... the app can format the complete wiki code for me").
//
// The log proves an item was combined and, on a skill-up, by which tradeskill. It never names the
// materials, the container or the trivial, so those are the player's to state. Nothing here guesses
// one: a blank trivial is the wiki's own `(Trivial: ??)`, a blank quantity writes no count, and a
// community guide's material reaches the page only after the player adds it.
//
// THE WIKI'S FORMAT, measured on the 2,472 cached pages with a recipe (2026-11-21):
//   * [[Tailoring]] (Trivial: 66)
//   ** '''Yield: Woven Mandrake''' x1
//   ** In [[Large Sewing Kit]]:
//   :: {{SmIcon|583}} 2 x [[Mandrake Root]] - Bought
// A material with no known icon is `::  2 x [[X]] - Bought` (89 lines), one with no count
// `:: {{SmIcon|N}} [[X]] - Bought` (104), one with no source ends at its link (37), a choice of
// containers is `** In [[A]] or [[B]]:` (58), and an unknown trivial is `??` (166).
//
// The recipe rides on the row's hand edit (shared/gapEdits.ts), so it is kept the way an edit is.

import type { GapRow } from './gaps'
import { tradeskillOf } from './tradeskills'

export interface GapRecipeMaterial {
  name: string
  /** How many one combine takes; absent until the player or a guide states it. */
  qty?: number
  /** The material's `lucy_img_ID`, from the item data. */
  iconId?: number
  /** Where it comes from, in the wiki's words: `Bought`, `Crafted`, `Returned on Failure`. */
  sources?: string[]
}

export interface GapRecipe {
  /** As the wiki spells it; absent reads the tradeskill the log saw. */
  tradeskill?: string
  container?: string
  trivial?: number
  /** How many one combine makes; absent writes the usual 1. */
  yieldQty?: number
  materials: GapRecipeMaterial[]
  notes?: string
}

/** An Items row for a page that exists and states no materials (`GapRow.recipeUpdate`). */
export interface RecipeUpdate extends PageRecipeFacts {
  page: string
}

/** What a page with no materials does state of its recipe. Copy replaces the field, so these stay. */
export interface PageRecipeFacts {
  trivial?: number
  container?: string
  yieldQty?: number
}

/** A page the player combined the item of, which states how to make it with no materials. */
export interface RecipelessPage extends PageRecipeFacts {
  name: string
  page: string
  /** The tradeskill the page itself names, when it names one. */
  tradeskill?: string
}

/** What the recipe form offers, from the wiki data and the community guides (main/gapRecipes.ts). */
export interface GapRecipeHelp {
  /** The tradeskills, each as the wiki spells it. */
  trades: string[]
  /** A tradeskill's containers on the wiki, most used first, by the spelling in `trades`. */
  containers: Record<string, string[]>
  /** The materials a community guide names for this item. Offers only: never written until added. */
  guide: GapRecipeMaterial[]
}

/** The need a crafted item with no recipe shows until the player has stated one (shared/gapReady.ts). */
export const RECIPE_NEED = 'recipe (pick its materials and container below)'

/** The need on a page that exists when the recipe's tradeskill is the one thing missing: no log skill-up, no page, no pick. */
export const RECIPE_TRADE_NEED = 'recipe tradeskill (pick it below first)'

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined)

function readMaterial(raw: unknown): GapRecipeMaterial | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  const name = text(m.name)
  if (name === undefined) return null
  const qty = count(m.qty)
  const iconId = count(m.iconId)
  const sources = Array.isArray(m.sources) ? m.sources.map(text).filter((s): s is string => s !== undefined) : []
  return { name, ...(qty === undefined ? {} : { qty }), ...(iconId === undefined ? {} : { iconId }), ...(sources.length === 0 ? {} : { sources }) }
}

/**
 * A stored recipe as the rows may read it; undefined when it states nothing. A tradeskill alone
 * states nothing: the form opens with the log's, and an untouched form is no recipe.
 */
export function readRecipe(raw: unknown): GapRecipe | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const materials = Array.isArray(r.materials) ? r.materials.map(readMaterial).filter((m): m is GapRecipeMaterial => m !== null) : []
  const stated = {
    container: text(r.container),
    trivial: count(r.trivial),
    yieldQty: count(r.yieldQty),
    notes: text(r.notes)
  }
  const fields = Object.entries(stated).filter(([, v]) => v !== undefined)
  if (materials.length === 0 && fields.length === 0) return undefined
  const tradeskill = text(r.tradeskill)
  return { ...(tradeskill === undefined ? {} : { tradeskill }), ...Object.fromEntries(fields), materials }
}

/** The facts a page's recipe entry states, each only when it states it. */
export function pageRecipeFacts(r: PageRecipeFacts | undefined): PageRecipeFacts {
  return {
    ...(r?.trivial === undefined ? {} : { trivial: r.trivial }),
    ...(r?.container === undefined ? {} : { container: r.container }),
    ...(r?.yieldQty === undefined ? {} : { yieldQty: r.yieldQty })
  }
}

/**
 * The recipe to write: what the player stated over what the page already states. Copy on a page that
 * exists replaces its whole field, and must never lose a trivial the page has (155 such pages,
 * 2026-11-21; the rule of 2026-10-23: Copy on an existing page never drops what is there).
 */
function fullRecipe(row: GapRow): GapRecipe | undefined {
  const kept = row.edit?.recipe
  const facts = pageRecipeFacts(row.recipeUpdate)
  if (Object.keys(facts).length === 0) return kept
  return { ...facts, ...kept, materials: kept?.materials ?? [] }
}

/** The tradeskill a recipe is written under: the player's pick, else the first the log saw. */
export function recipeTrade(row: GapRow): string | undefined {
  return row.edit?.recipe?.tradeskill ?? row.details.tradeskills?.entries[0]?.name
}

/** The log shows the item being combined: made, failed, or a skill-up in a combine's second. */
function combined(row: GapRow): boolean {
  return row.kinds.includes('crafted') || row.kinds.includes('failed-combine') || (row.details.tradeskills?.entries.length ?? 0) > 0
}

/**
 * Whether the row is a crafted item the wiki holds no recipe for: a new page, or a page that states
 * none (`recipeUpdate`). A redirect, and a row for one other field of a page, are not.
 */
export function needsRecipe(row: GapRow): boolean {
  if (row.domain !== 'item' || row.suggest !== undefined || row.viaRedirect !== undefined) return false
  if (row.forageUpdate !== undefined || row.iconUpdate !== undefined) return false
  return row.recipeUpdate !== undefined || combined(row)
}

/** The player has stated the recipe: a tradeskill, a container, and materials each with a count. */
export function recipeStated(row: GapRow): boolean {
  return combineStated(row) && recipeTrade(row) !== undefined
}

/** A container, and materials each with a count: the recipe but its tradeskill. */
function combineStated(row: GapRow): boolean {
  const recipe = fullRecipe(row)
  if (recipe?.container === undefined || recipe.materials.length === 0) return false
  return recipe.materials.every((m) => m.qty !== undefined)
}

/** What the row still needs of its recipe, for `stillNeeded`. */
export function recipeNeed(row: GapRow): string[] {
  if (!needsRecipe(row) || recipeStated(row)) return []
  // On a page that exists, Copy writes no field until the tradeskill is known (`recipeAddText`).
  const tradeOnly = row.recipeUpdate !== undefined && recipeTrade(row) === undefined && combineStated(row)
  return tradeOnly ? [RECIPE_TRADE_NEED] : [RECIPE_NEED]
}

function containerLinks(container: string): string {
  return container
    .split(/\s+or\s+/i)
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .map((c) => `[[${c}]]`)
    .join(' or ')
}

function materialLine(m: GapRecipeMaterial): string {
  const icon = m.iconId === undefined ? '' : `{{SmIcon|${String(m.iconId)}}}`
  const qty = m.qty === undefined ? '' : `${String(m.qty)} x `
  const from = m.sources === undefined || m.sources.length === 0 ? '' : ` - ${m.sources.join(', ')}`
  return `:: ${icon} ${qty}[[${m.name}]]${from}`
}

/** The value of `|playercrafted`, a blank line first as the wiki writes it. */
export function playercraftedValue(item: string, recipe: GapRecipe, trade: string): string {
  const lines = [
    `* [[${trade}]] (Trivial: ${recipe.trivial === undefined ? '??' : String(recipe.trivial)})`,
    `** '''Yield: ${item}''' x${String(recipe.yieldQty ?? 1)}`,
    ...(recipe.container === undefined ? [] : [`** In ${containerLinks(recipe.container)}:`]),
    ...recipe.materials.map(materialLine)
  ]
  return `\n\n${lines.join('\n')}\n`
}

/** A new page's `|playercrafted` from the row's recipe; undefined when it has none to write. */
export function recipeField(row: GapRow): string | undefined {
  const recipe = fullRecipe(row)
  const trade = recipeTrade(row)
  return recipe === undefined || trade === undefined ? undefined : playercraftedValue(row.edit?.name ?? row.name, recipe, trade)
}

/** The recipe's note into a page's `|notes`, before the stats when the page has none yet. */
export function withRecipeNotes(fields: [string, string][], notes: string | undefined): void {
  if (notes === undefined) return
  const held = fields.find(([k]) => k === 'notes')
  if (held !== undefined) {
    held[1] = `${held[1]}<br>\n${notes}`
    return
  }
  const at = fields.findIndex(([k]) => k === 'statsblock')
  fields.splice(at < 0 ? fields.length : at, 0, ['notes', notes])
}

/**
 * Copy for a page that exists: where the recipe goes, then the field whole, ready to paste. With no
 * tradeskill known it writes no field: a blank one pasted over the page would erase what it states.
 */
export function recipeAddText(row: GapRow): string {
  const page = row.recipeUpdate?.page ?? row.name
  const trade = recipeTrade(row)
  const notes = row.edit?.recipe?.notes
  const notesText = notes === undefined ? '' : `\nAdd to | notes =\n\n${notes}\n`
  if (trade === undefined) return `On ${page}, pick the recipe's tradeskill first: Copy writes | playercrafted once it is known.\n${notesText}`
  const field = recipeField(row) ?? `\n\n* [[${trade}]]\n`
  return `On ${page}, replace | playercrafted = with:\n\n|playercrafted = ${field}${notesText}`
}

/** The chip's words for a page that exists and states no materials. */
export const recipeWhy = (item: string): string => `The page for ${item} does not state its recipe's materials.`

// ---- the form's edits, pure so the renderer filters no shared rows -------------------------------

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The recipe with a material added; a material it already lists is left as it is. */
export function addMaterial(recipe: GapRecipe, m: GapRecipeMaterial): GapRecipe {
  if (m.name.trim() === '' || recipe.materials.some((x) => sameName(x.name, m.name))) return recipe
  return { ...recipe, materials: [...recipe.materials, { ...m, name: m.name.trim() }] }
}

export function removeMaterial(recipe: GapRecipe, name: string): GapRecipe {
  return { ...recipe, materials: recipe.materials.filter((m) => !sameName(m.name, name)) }
}

/** The recipe with one material changed; a field given as undefined is cleared. */
export function changeMaterial(recipe: GapRecipe, name: string, patch: Partial<GapRecipeMaterial>): GapRecipe {
  return { ...recipe, materials: recipe.materials.map((m) => (sameName(m.name, name) ? { ...m, ...patch } : m)) }
}

/** The guide's materials the recipe does not list yet. */
export function guideOffers(recipe: GapRecipe, guide: readonly GapRecipeMaterial[]): GapRecipeMaterial[] {
  return guide.filter((g) => !recipe.materials.some((m) => sameName(m.name, g.name)))
}

/** A typed count: a whole number above zero, else undefined. */
export function typedCount(raw: string): number | undefined {
  return /^\d+$/.test(raw.trim()) ? count(Number(raw.trim())) : undefined
}

/** A typed source list, comma separated. */
export const typedSources = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')

/** One tradeskill in the spelling `help.trades` has it, whatever spelling it comes in. */
export function tradeOption(help: GapRecipeHelp, trade: string | undefined): string | undefined {
  if (trade === undefined) return undefined
  const folded = tradeskillOf(trade)
  return help.trades.find((t) => t === trade || (folded !== undefined && tradeskillOf(t) === folded)) ?? trade
}

/** The containers to offer for a tradeskill, most used on the wiki first. */
export function containerOptions(help: GapRecipeHelp, trade: string | undefined): readonly string[] {
  const option = tradeOption(help, trade)
  return option === undefined ? [] : (help.containers[option] ?? [])
}

/** What the form opens on: the kept recipe, else the tradeskill the log or the page names. */
export function recipeDraft(row: GapRow): GapRecipe {
  const trade = recipeTrade(row)
  const known = fullRecipe(row)
  if (row.edit?.recipe !== undefined && known !== undefined) return known
  return { ...(trade === undefined ? {} : { tradeskill: trade }), ...known, materials: [] }
}
