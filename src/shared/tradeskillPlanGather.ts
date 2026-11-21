// shared/tradeskillPlanGather.ts — "What to gather" for N of a planned item: the tree's leaf
// materials rolled up through every made material, against what the player holds, and what the
// rest costs at the player's own prices.
//
// - A leaf's need is its quantity times the combines of the recipe it sits in, summed over the
//   tree. A tool the combine gives back is needed once, however many are made.
// - A made material the player already holds is used before any is made: only the shortfall is
//   made, so only the shortfall's materials are gathered. A combine that yields several leaves
//   the spare ones for the next branch that wants them.
// - Counts are for combines that SUCCEED. A failed combine uses up its materials, and nobody has
//   measured how often one fails, so nothing is added for failures; the screen says so.
// - A price is the newest purchase line's, per unit (`tradeskillMoney.lastPaid`). The total is
//   stated only when every line still to get has one; otherwise the lines without are named.

import type { OwnershipIndex } from './planner/ownership'
import { heldCount, type BookRecipe } from './tradeskillBook'
import { haveNow, type CraftBook } from './tradeskillHistory'
import { lastPaid, ppText } from './tradeskillMoney'
import type { PlanNode, PlanRecipe } from './tradeskillPlan'

/** How many of a material the player holds; null when nothing has said (no dump, no depot line, no wiki item). */
export type PlanHave = (node: Pick<PlanNode, 'key' | 'name' | 'linked'>) => number | null

/** The inventory dump as the section holds it. */
export interface PlanHolding {
  index: OwnershipIndex | null
  /** When the player wrote the dump, epoch ms. */
  dumpedAt: number | null
}

/**
 * The count the recipe panel's Have cell shows (`tradeskillHistory.haveNow`): the dump's, or the
 * log's depot count when that line is newer. A guide's spelling that names no wiki item has none.
 */
export function planHave(held: PlanHolding, craft: CraftBook): PlanHave {
  return (node) => {
    if (!node.linked) return null
    const dump = held.index === null ? null : { count: heldCount(held.index, node.name), at: held.dumpedAt }
    return haveNow(dump, craft.depot.get(node.key))?.count ?? null
  }
}

/** Copper for one of a material at the player's newest purchase, by item key; null when the log shows none. */
export type PlanPrice = (key: string) => number | null

export function planPrice(craft: CraftBook): PlanPrice {
  return (key) => lastPaid(craft, key)?.unit ?? null
}

export const MAX_PLAN_COUNT = 999

/** A typed count as a whole number from 1 to `MAX_PLAN_COUNT`; anything else is 1. */
export function clampCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_PLAN_COUNT, Math.max(1, Math.floor(n)))
}

/** One leaf material, summed over the tree. */
export interface GatherLine {
  /** The first node of the material in the tree: its name, its link and where it comes from. */
  node: PlanNode
  need: number
  /** Null: nothing has said how many are held. */
  have: number | null
  toGet: number
  /** Copper for one at the newest purchase; null when the log shows none. */
  unit: number | null
  /** `unit` times `toGet`; null with no price. */
  copper: number | null
}

/** One made material: how many the plan uses, and how many of those still have to be made. */
export interface MakeLine {
  node: PlanNode
  recipe: BookRecipe
  need: number
  have: number | null
  toMake: number
}

export interface Gather {
  /** How many of the planned item this is for. */
  count: number
  leaves: GatherLine[]
  made: MakeLine[]
  /** Copper for everything still to get; null unless every such line has a price. */
  total: number | null
  /** Names of the lines still to get that have no price. */
  unpriced: string[]
}

export interface GatherAsk {
  count: number
  have: PlanHave
  price: PlanPrice
}

interface Tally {
  have: PlanHave
  /** What is still unspoken for of each held or spare material, by key. */
  pool: Map<string, number>
  leaves: Map<string, { node: PlanNode; need: number }>
  made: Map<string, MakeLine>
}

function poolOf(t: Tally, node: PlanNode): number {
  const had = t.pool.get(node.key)
  if (had !== undefined) return had
  const held = t.have(node) ?? 0
  t.pool.set(node.key, held)
  return held
}

/** How many of a material `combines` of its recipe take: a returned tool is needed once. */
function wanted(node: PlanNode, combines: number): number {
  return node.returned ? 1 : node.qty * combines
}

function noteLeaf(t: Tally, node: PlanNode, qty: number): void {
  const had = t.leaves.get(node.key)
  if (had === undefined) t.leaves.set(node.key, { node, need: qty })
  // A tool two recipes both give back is still one tool.
  else had.need = node.returned ? Math.max(had.need, qty) : had.need + qty
}

/** Takes a made material from what is held or spare, makes the rest, and walks into its recipe for that many combines. */
function noteMade(t: Tally, node: PlanNode, made: PlanRecipe, qty: number): void {
  const pool = poolOf(t, node)
  const taken = Math.min(pool, qty)
  const short = qty - taken
  const yields = Math.max(1, made.recipe.yieldQty ?? 1)
  const combines = Math.ceil(short / yields)
  t.pool.set(node.key, pool - taken + combines * yields - short)
  const line = t.made.get(node.key)
  if (line === undefined) t.made.set(node.key, { node, recipe: made.recipe, need: qty, have: t.have(node), toMake: short })
  else {
    line.need += qty
    line.toMake += short
  }
  if (combines > 0) walk(t, made, combines)
}

function walk(t: Tally, plan: PlanRecipe, combines: number): void {
  for (const node of plan.materials) {
    const qty = wanted(node, combines)
    if (node.made === null) noteLeaf(t, node, qty)
    else noteMade(t, node, node.made, qty)
  }
}

function leafLine(t: Tally, price: PlanPrice, leaf: { node: PlanNode; need: number }): GatherLine {
  const have = t.have(leaf.node)
  // The pool, not the count held: a made material's recipe may already have taken some of these.
  const toGet = Math.max(0, leaf.need - poolOf(t, leaf.node))
  const unit = price(leaf.node.key)
  return { node: leaf.node, need: leaf.need, have, toGet, unit, copper: unit === null ? null : unit * toGet }
}

/** What `count` of the tree's item takes, in the tree's own order: the leaves to gather and the materials to make on the way. */
export function gatherFor(root: PlanRecipe, ask: GatherAsk): Gather {
  const count = clampCount(ask.count)
  const t: Tally = { have: ask.have, pool: new Map(), leaves: new Map(), made: new Map() }
  walk(t, root, Math.ceil(count / Math.max(1, root.recipe.yieldQty ?? 1)))
  const leaves = [...t.leaves.values()].map((leaf) => leafLine(t, ask.price, leaf))
  const unpriced: string[] = []
  let total = 0
  for (const line of leaves) {
    if (line.toGet === 0) continue
    if (line.copper === null) unpriced.push(line.node.name)
    else total += line.copper
  }
  return { count, leaves, made: [...t.made.values()], total: unpriced.length > 0 ? null : total, unpriced }
}

/**
 * Everything on the gather list is held: the planned count can be made from what the player
 * holds now, sub-combines included. False for an empty list, and for any line whose count nothing
 * states (its whole need is still to get).
 */
export function gatherHeld(gather: Pick<Gather, 'leaves'>): boolean {
  return gather.leaves.length > 0 && gather.leaves.every((line) => line.toGet === 0)
}

// ---- the words on screen -----------------------------------------------------------------------

/** The planner's mark on an item whose whole gather list is held. */
export const PLAN_CAN_MAKE_LABEL = 'can make now'

/** The mark's hover: what was counted, and what was not. */
export function planCanMakeTip(count: number, item: string): string {
  return `You hold everything on the gather list for ${String(count)} ${item}. A failed combine uses its materials up too.`
}

/** "What to gather for 3 Fleeting Quiver". */
export function gatherHeading(count: number, item: string): string {
  return `What to gather for ${String(count)} ${item}`
}

export const GATHER_NOTE =
  'Counts assume every combine succeeds. Failure rates have not been measured for this game, so nothing is added for failures.'

export const GATHER_EMPTY_TEXT = 'No material is listed for this recipe, so there is nothing to add up.'

const UNPRICED_NAMES = 6

/** The line under the list: the total at the player's prices, or why there is none. */
export function gatherTotalText(gather: Gather): string {
  if (gather.leaves.length === 0) return ''
  if (gather.unpriced.length > 0) {
    const more = gather.unpriced.length - UNPRICED_NAMES
    const names = gather.unpriced.slice(0, UNPRICED_NAMES).join(', ') + (more > 0 ? ` and ${String(more)} more` : '')
    return `No total: your log shows no purchase of ${names}.`
  }
  if (gather.leaves.every((line) => line.toGet === 0)) return 'You hold everything on this list.'
  return `Total for what is still to get: ${ppText(gather.total ?? 0)}, at the price your log shows you last paid for each.`
}

/** A line's price cell: "10.50 pp each"; '' with no price. */
export function unitText(line: GatherLine): string {
  return line.unit === null ? '' : `${ppText(line.unit)} each`
}

/** A line's cost cell: the price of what is still to get; '' with no price or nothing to get. */
export function lineCostText(line: GatherLine): string {
  return line.copper === null || line.toGet === 0 ? '' : ppText(line.copper)
}

/** Under a made material's count: "you hold 3, so 2 to make"; the plain count when none is held. */
export function makeText(line: MakeLine): string {
  const held = line.have ?? 0
  if (held === 0) return `${String(line.toMake)} to make`
  return line.toMake === 0 ? `you hold ${String(held)}: none to make` : `you hold ${String(held)}: ${String(line.toMake)} to make`
}

export const TO_GET_TIP = 'Need less what you hold. Blank Have means nothing has said how many you hold, so the whole need is counted.'
