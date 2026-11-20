// The engine's `crafting` module state (fork #6): what the log says of the player's tradeskill
// combines. Aggregates only: one row per item combined, the runs of combines (spans), what
// merchants were paid and paid back, and the depot stock the game last stated. Fishing and forage
// outcomes ride in the same snapshot.
//
// What the log does not say, and so what this file leaves to its caller:
// - A combine's line never names its tradeskill. An item has one only once a raise printed in a
//   combine's second (215 of the owner's 736 combines); the rest comes from the recipe data,
//   handed in as a lookup.
// - A sale line states no quantity, and a purchase of a crafted ingredient never happens: a cost
//   is stated only when every ingredient was bought at least once.
// - A cast's line and its outcome's are counted apart: an interrupted cast prints no outcome, so a
//   fishing rate is taken over the outcomes, never over the casts.

import { rateMeasurable } from './rateBasis'
import { tradeskillOf, type Tradeskill } from './tradeskills'

export const CRAFTING_MODULE = 'crafting'

/** A longer pause between two combines ends a span (the engine's `SPAN_GAP_MS`). */
export const CRAFT_SPAN_GAP_MS = 5 * 60_000
/** Spans kept one by one, newest last; older ones are summed (the engine's `SPAN_CAP`). */
export const CRAFT_SPAN_CAP = 120

/** One item the player combined, as the game names it. */
export interface CraftedItemRow {
  item: string
  made: number
  failed: number
  /** By-product lines its combines printed (`... create an alternate product: Bottle.`); absent when none. */
  byProducts?: number
  /** Combines the game's trivial notice preceded; 0 when it never printed for the item. */
  trivial: number
  /** The newest such combine. */
  trivialTs?: number
  /** Raises paired with a combine of the item. */
  raises: number
  /** The level its first and its newest raise stated. */
  firstRaise?: number
  lastRaise?: number
  /** The client's spelling ("Jewelry Making"); absent for an item no raise ever named. */
  tradeskill?: string
  firstTs: number
  lastTs: number
  /** The same counts since the newest offline gap. */
  sessionMade: number
  sessionFailed: number
  sessionRaises: number
}

/** One tradeskill's level as its log stated it; the first line is kept for the archive join. */
export interface CraftLevelRow {
  skill: string
  value: number
  firstValue: number
  firstTs: number
  /** The item that first line's raise was credited to. */
  firstItem?: string
  /** No offline gap has followed the first line. */
  firstInSession?: boolean
}

/** A run of combines with no pause over five minutes. */
export interface CraftSpan {
  start: number
  /** The last combine's time: a span of one combine has no length. */
  end: number
  combines: number
  made: number
  failed: number
  /** Raises paired with a combine of the span, by tradeskill in the client's spelling. */
  raises: Record<string, number>
}

/** What the folded spans holding a raise of one tradeskill add up to. */
export interface CraftSkillSpans {
  spans: number
  ms: number
  combines: number
  raises: number
}

/** The spans older than the newest CRAFT_SPAN_CAP, summed. */
export interface OlderCraftSpans {
  spans: number
  ms: number
  combines: number
  made: number
  failed: number
  bySkill: Record<string, CraftSkillSpans>
}

/** One item bought from a merchant. Coin is in copper. */
export interface BoughtRow {
  item: string
  qty: number
  copper: number
  /** The newest purchase line: its quantity and what the whole of it cost. */
  lastQty: number
  lastCopper: number
  merchant: string
  /** The zone the player was in, when the log had stated one. */
  zone?: string
  ts: number
}

/** One item sold to a merchant. The sale line states no quantity, so sales are counted in lines. */
export interface SoldRow {
  item: string
  lines: number
  copper: number
  /** What the newest line paid. */
  lastCopper: number
  merchant: string
  ts: number
}

/** An item's depot stock as its newest `Consumed ... (leaving N)` line stated it. */
export interface DepotRow {
  item: string
  left: number
  ts: number
}

/** Fishing lines, counted one by one. */
export interface FishingCounts {
  /** `You cast your line.` */
  casts: number
  /** Catches, the ones the game did not name (`You caught something...`) included. */
  caught: number
  /** `You didn't catch anything.`: the casts counted in the three below are among these. */
  nothing: number
  lostBait: number
  spilled: number
  poleBroke: number
}

/** Forage lines, counted one by one. A refused attempt (too soon, in combat) prints neither. */
export interface ForageCounts {
  found: number
  failed: number
}

/** One item caught or scrounged, as the game names it (a forage's leading article dropped). */
export interface GatheredRow {
  item: string
  count: number
  lastTs: number
}

/** The whole log's counts, the same since the newest offline gap, and a row per item named. */
export interface FishingSnap extends FishingCounts {
  session: FishingCounts
  items: GatheredRow[]
}

export interface ForageSnap extends ForageCounts {
  session: ForageCounts
  items: GatheredRow[]
}

export interface CraftingSnap {
  items: CraftedItemRow[]
  levels: CraftLevelRow[]
  spans: CraftSpan[]
  olderSpans?: OlderCraftSpans
  bought: BoughtRow[]
  sold: SoldRow[]
  depot: DepotRow[]
  /** Absent when the log has no fishing line, and from an engine or an archive older than 2026-11-20. */
  fishing?: FishingSnap
  /** Absent when the log has no forage line, and from an engine or an archive older than 2026-11-20. */
  forage?: ForageSnap
}

/** An item's tradeskill from the recipe data, in any spelling; undefined when it has no recipe. */
export type RecipeTradeskill = (item: string) => string | undefined

/** The log's own word when a raise named it, else the recipe data's; one spelling either way. */
export function itemTradeskill(row: CraftedItemRow, recipe?: RecipeTradeskill): Tradeskill | undefined {
  return tradeskillOf(row.tradeskill) ?? tradeskillOf(recipe?.(row.item))
}

const perOr = (n: number, d: number): number | null => (d > 0 ? n / d : null)

export interface TradeskillTotals {
  /** Null gathers the items neither a raise nor the recipe data placed. */
  tradeskill: Tradeskill | null
  items: number
  combines: number
  made: number
  failed: number
  /** `made / combines`, 0 to 1. */
  successRate: number | null
  raises: number
  /** Null when no combine of the tradeskill raised it. */
  combinesPerRaise: number | null
}

/** One row per tradeskill, most combines first; the unplaced items last. */
export function tradeskillTotals(items: readonly CraftedItemRow[], recipe?: RecipeTradeskill): TradeskillTotals[] {
  const by = new Map<Tradeskill | null, TradeskillTotals>()
  for (const row of items) {
    const tradeskill = itemTradeskill(row, recipe) ?? null
    const t = by.get(tradeskill) ?? { tradeskill, items: 0, combines: 0, made: 0, failed: 0, successRate: null, raises: 0, combinesPerRaise: null }
    t.items += 1
    t.made += row.made
    t.failed += row.failed
    t.raises += row.raises
    by.set(tradeskill, t)
  }
  const rows = [...by.values()].map((t) => {
    const combines = t.made + t.failed
    return { ...t, combines, successRate: perOr(t.made, combines), combinesPerRaise: perOr(combines, t.raises) }
  })
  const placed = (t: TradeskillTotals): number => (t.tradeskill === null ? 1 : 0)
  return rows.sort((a, b) => placed(a) - placed(b) || b.combines - a.combines || (a.tradeskill ?? '').localeCompare(b.tradeskill ?? ''))
}

export interface CraftingPace {
  /** Spans counted, and their summed length: time spent combining. */
  spans: number
  ms: number
  combines: number
  raises: number
  /** Null until the spans add up to enough time to state a rate (`rateMeasurable`). */
  combinesPerHour: number | null
  raisesPerHour: number | null
}

/** Raises of `tradeskill` (any spelling) in a by-skill record keyed in the client's. */
function raisesOf(by: Readonly<Record<string, number>>, tradeskill: Tradeskill | undefined): number {
  let n = 0
  for (const [skill, raises] of Object.entries(by)) {
    if (tradeskill === undefined || tradeskillOf(skill) === tradeskill) n += raises
  }
  return n
}

/** The folded spans' share: all of them, or the ones that held a raise of `tradeskill`. */
function olderParts(older: OlderCraftSpans | undefined, tradeskill: Tradeskill | undefined): CraftSkillSpans[] {
  if (older === undefined) return []
  const skills = Object.entries(older.bySkill)
  if (tradeskill !== undefined) return skills.filter(([skill]) => tradeskillOf(skill) === tradeskill).map(([, of]) => of)
  const raises = skills.reduce((n, [, of]) => n + of.raises, 0)
  return [{ spans: older.spans, ms: older.ms, combines: older.combines, raises }]
}

/**
 * Pace per crafting hour: combines and raises over the spans' summed length, so an evening's
 * banking and selling between runs is not in the hour.
 *
 * With a `tradeskill`, only the spans holding a raise of it count, and only its raises: the log
 * names a combine's tradeskill no other way, so a run of trivial combines belongs to none.
 */
export function craftingPace(snap: Pick<CraftingSnap, 'spans' | 'olderSpans'>, tradeskill?: Tradeskill): CraftingPace {
  const pace: CraftingPace = { spans: 0, ms: 0, combines: 0, raises: 0, combinesPerHour: null, raisesPerHour: null }
  for (const span of snap.spans) {
    const raises = raisesOf(span.raises, tradeskill)
    if (tradeskill !== undefined && raises === 0) continue
    pace.spans += 1
    pace.ms += span.end - span.start
    pace.combines += span.combines
    pace.raises += raises
  }
  for (const of of olderParts(snap.olderSpans, tradeskill)) {
    pace.spans += of.spans
    pace.ms += of.ms
    pace.combines += of.combines
    pace.raises += of.raises
  }
  if (rateMeasurable(pace.ms)) {
    pace.combinesPerHour = (pace.combines * 3_600_000) / pace.ms
    pace.raisesPerHour = (pace.raises * 3_600_000) / pace.ms
  }
  return pace
}

/** Copper for one of the item at the newest price paid, or null when that line bought none. */
export function unitCopper(row: BoughtRow): number | null {
  return perOr(row.lastCopper, row.lastQty)
}

/** One ingredient of a recipe (`ItemCraftIngredient` fits). */
export interface CraftIngredient {
  name: string
  /** How many a combine consumes; 1 when the recipe does not say. */
  qty?: number
}

export interface CombineCost {
  /** Copper one combine's materials cost at the newest prices paid; null when any is unpriced. */
  perCombine: number | null
  /** Ingredients the log never saw bought. */
  unpriced: string[]
  /** What a merchant last paid for one sale line of the item. */
  salePrice: number | null
  /** `perCombine` over every combine, made or failed: a failed combine's materials are gone. */
  spent: number | null
  /** `salePrice` for everything made, as if all of it were sold. */
  earned: number | null
  /** `spent - earned`: above zero is money lost. Null unless both are known. */
  net: number | null
}

const nameKey = (s: string): string => s.trim().toLowerCase()

/**
 * What an item's combines cost against what its makes would bring back, from the player's own
 * purchase and sale prices. `yieldQty` is how many one made combine gives.
 */
export function combineCost(
  snap: Pick<CraftingSnap, 'bought' | 'sold'>,
  row: Pick<CraftedItemRow, 'item' | 'made' | 'failed'>,
  ingredients: readonly CraftIngredient[],
  yieldQty = 1
): CombineCost {
  const bought = new Map(snap.bought.map((b) => [nameKey(b.item), b]))
  const unpriced: string[] = []
  let materials = 0
  for (const ing of ingredients) {
    const held = bought.get(nameKey(ing.name))
    const unit = held === undefined ? null : unitCopper(held)
    if (unit === null) unpriced.push(ing.name)
    else materials += unit * (ing.qty ?? 1)
  }
  const perCombine = ingredients.length > 0 && unpriced.length === 0 ? materials : null
  const sale = snap.sold.find((s) => nameKey(s.item) === nameKey(row.item))
  const salePrice = sale === undefined ? null : sale.lastCopper
  const spent = perCombine === null ? null : perCombine * (row.made + row.failed)
  const earned = salePrice === null ? null : salePrice * row.made * yieldQty
  const net = spent === null || earned === null ? null : spent - earned
  return { perCombine, unpriced, salePrice, spent, earned, net }
}

export interface FishingRate {
  /** Casts whose outcome the log printed: a catch, or `You didn't catch anything.` */
  outcomes: number
  /** `caught / outcomes`, 0 to 1; null before any outcome. */
  successRate: number | null
  /**
   * Casts no outcome line followed (zoned, interrupted). Never counted as misses. A floor: an
   * outcome whose cast line the log did not print (seen 4 times in 203 casts) hides one.
   */
  noOutcome: number
}

/**
 * How often a cast that ended caught something. The rate is over the outcomes the log printed,
 * so a cast that printed none is in neither side of it. Lost bait, spilled beer and a broken pole
 * each print beside a `You didn't catch anything.` and add nothing to the count of outcomes.
 */
export function fishingRate(counts: Pick<FishingCounts, 'casts' | 'caught' | 'nothing'> | undefined): FishingRate {
  const caught = counts?.caught ?? 0
  const outcomes = caught + (counts?.nothing ?? 0)
  return { outcomes, successRate: perOr(caught, outcomes), noOutcome: Math.max(0, (counts?.casts ?? 0) - outcomes) }
}

export interface ForageRate {
  /** Forages the game answered: found or failed. */
  attempts: number
  /** `found / attempts`, 0 to 1; null before any. */
  successRate: number | null
}

export function forageRate(counts: ForageCounts | undefined): ForageRate {
  const found = counts?.found ?? 0
  const attempts = found + (counts?.failed ?? 0)
  return { attempts, successRate: perOr(found, attempts) }
}

/** Catches the game did not name (`You caught something...`): the catches no item row holds. */
export function unnamedCatches(fishing: Pick<FishingSnap, 'caught' | 'items'> | undefined): number {
  if (fishing === undefined) return 0
  return Math.max(0, fishing.caught - fishing.items.reduce((n, r) => n + r.count, 0))
}

export interface GatheredShare extends GatheredRow {
  /** This item's part of the whole, 0 to 1. */
  share: number
}

/**
 * The items most gathered first (then by name), each with its share. The whole is the rows' own
 * sum, so the shares add up to 1; hand in `of` (fishing's `caught`) to count the catches the game
 * did not name in it too. An `of` under the rows' sum is not believed.
 */
export function gatheredShares(rows: readonly GatheredRow[], of?: number): GatheredShare[] {
  const sum = rows.reduce((n, r) => n + r.count, 0)
  const whole = Math.max(sum, of ?? 0)
  return rows
    .map((r) => ({ ...r, share: perOr(r.count, whole) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.item.localeCompare(b.item))
}
