// shared/tradeskillRouteFaction.ts - the Faction goal of a workbench's route (owner, 2026-11-20:
// "faction based (you're doing it because of the factions you can get from specific turn ins)").
//
// One tradeskill, the player's level, a picked faction: the recipes of that tradeskill whose made
// item a quest takes, where the quest's wiki page states a raise of that faction. The join is
// questFactions.ts (an item's quests and each page's faction lines); this file narrows it to one
// tradeskill's recipes, orders the turn-ins and writes every word the screen draws.
//
//   the list    every faction a turn-in of the tradeskill raises, with how many recipes feed it
//               and, when a faction dump is loaded, the player's standing in the Factions tab's
//               own words.
//   the order   recipes whose trivial is at or under the level first, then the biggest raise the
//               wiki states (a raise with no stated number after every stated one), then the
//               lowest known cost per combine, then the ladder's order.
//   a row       one recipe and one quest page: the trivial against the level, the quest, its giver
//               and zones, EVERY faction change the page states (a loss as plainly as a raise),
//               and the step facts every route states (cost, materials on hand, own record).
//
// WHAT TIES AN ITEM TO A QUEST is the join's: the quest page names the item outside its Reward
// section, or the item's own page lists the quest. A quest page also names items nobody hands in
// (Muffin Quests names Clump of Dough, a material of the muffin), so a row tied by the quest page
// alone says so (`TurnIn.tie`), and so does a row tied by the item's page alone.
//
// WHAT IS NOT KNOWN, AND SAID ON SCREEN (`caveats`):
// - ONE LIST PER QUEST PAGE (questFactions.ts). A page that hosts several turn-ins states one
//   list for all of them, so a row's changes may belong to another turn-in on its page. Nothing is
//   filtered out for that. A row is MARKED (`TurnIn.shared`) when the data gives a sign of it: the
//   item's own page files the turn-in under another quest name on that page, the page's title
//   names several quests, or the page lists more than `LONG_LIST` changes.
// - An amount is shown only where the wiki states one.
// - Nothing is forecast: the data holds no faction thresholds, no number of items a turn-in
//   takes and no measured combine rate, so no "turn-ins to reach X" exists here.
//
// The era setting: the caller builds the join over `inEraQuests(quests)` when it is on, and the
// recipes are the book index's, which already leaves out what the setting hides.

import { questOutOfEra } from './questEra'
import { factionHitName, questFactionKey, type FactionItemRecord, type ItemFactionQuest, type QuestFactionIndex } from './questFactions'
import { NO_TRIVIAL_TEXT, recipeOrder, skillRecipes, type BookIndex, type BookRecipe } from './tradeskillBook'
import { combinesHeld } from './tradeskillHeld'
import { recipeStep, type RouteFacts, type RouteStep } from './tradeskillRouteStep'
import { TRADESKILLS, type Tradeskill } from './tradeskills'
import type { QuestFactionHit } from './types'

/** A quest page that lists more changes than this is marked: most pages list this many or fewer. */
export const LONG_LIST = 5

/** A page title that names several quests: "Muffin Quests", "Crusader's Tests". */
const SEVERAL_TITLE = /\b(?:quests|tests)\b/i

/** The player's standing with one faction, as the Factions tab words it. */
export interface StandingWords {
  /** The faction as the dump spells it: what the Factions tab's search finds. */
  name: string
  /** The rung the tab draws: "amiably". */
  label: string
  /** The live number the tab draws. */
  value: number
}

/** What the Faction goal is built from: the route's own facts, the join and the standings. */
export interface FactionFacts extends RouteFacts {
  /** `buildQuestFactionIndex` over the quests the era setting keeps and `bookFactionItems`. */
  turnIns: QuestFactionIndex
  /** The standings by `questFactionKey`; null when no faction dump is loaded. */
  standings: ReadonlyMap<string, StandingWords> | null
}

export interface FactionAsk {
  tradeskill: Tradeskill
  /** Null: the log never showed the skill, so no recipe counts as trivial. */
  level: number | null
  /** The picked faction's key; null or one the list does not hold picks the list's default. */
  faction: string | null
  /** "Only use materials I have": only recipes the held materials cover a combine of. */
  heldOnly?: boolean
  /** The Current era setting, for the words alone: the join and the recipes already follow it. */
  eraOnly?: boolean
}

/** One faction the tradeskill's turn-ins raise. */
export interface FactionChoice {
  key: string
  name: string
  /** Recipes of the tradeskill whose made item is a turn-in that raises it. */
  recipes: number
  /** Quest pages among those turn-ins. */
  quests: number
  /** Null: no dump is loaded, or the dump does not list the faction. */
  standing: StandingWords | null
}

/** One faction change a quest page states. */
export interface FactionChange {
  key: string
  name: string
  up: boolean
  /** "+5", "-1"; "raised" or "lowered" when the wiki states no number. */
  text: string
  /** The faction the route is for. */
  picked: boolean
  /** What the Factions tab's search finds it by: the dump's spelling when the dump lists it. */
  openAs: string
}

/** The quest side of a row. */
export interface TurnIn {
  /** The quest page's title: the name of the wiki link. */
  quest: string
  page: string
  /** The quest names the item's own page files this turn-in under, when not the page's title. */
  filedAs: string[]
  giver?: string
  /** The page's start zones, one spelling each ("Kelethin, West Freeport" is two). */
  zones: string[]
  minLevel?: number
  /** "Velious quest: not open in the current era."; '' for a quest the era holds. */
  eraNote: string
  /** The picked faction's own line. */
  raise: FactionChange
  /** Every change the page states: raises, then losses, each half in page order. */
  changes: FactionChange[]
  /** The two halves of `changes`, for a screen that draws them apart. */
  raises: FactionChange[]
  losses: FactionChange[]
  /** Why the page's list may hold another turn-in's changes; '' when the data gives no sign. */
  shared: string
  /** Which of the two pages ties the item to the quest, when only one does; '' when both do. */
  tie: string
}

/** A row of the Faction goal: a route step (the shopping list reads it) and its turn-in. */
export interface FactionStep extends RouteStep {
  turnIn: TurnIn
  /** The recipe's trivial is at or under the level. */
  easy: boolean
  /** Combines the held materials cover, for the "can make N" mark; 0 when none or not known. */
  canMake: number
}

export interface FactionRoute {
  tradeskill: Tradeskill
  heldOnly: boolean
  /** Every faction a turn-in of the tradeskill raises, by name. */
  choices: FactionChoice[]
  picked: FactionChoice | null
  steps: FactionStep[]
  /** The row the shopping list is for: the first. */
  next: FactionStep | null
  /** What the order ranks on. */
  basis: string
  /** What the rows do not know, each a sentence of its own. */
  caveats: string[]
  /** Why there is no row; '' when there is one. */
  empty: string
}

// ---- the join's items, from the recipe book -----------------------------------------------------

/** The wiki page a recipe's item sits on. */
function pageOf(recipe: BookRecipe): string {
  return recipe.page ?? recipe.item
}

/** A page title's key: a `#section` dropped, `_` and case folded. */
function titleKey(title: string): string {
  return title.split('#')[0].replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * The item records `buildQuestFactionIndex` reads, from the recipe book the renderer already
 * holds: one per made item's page, with the quests its page lists (`BookRecipe.quests`, each on
 * the page `questPages` names for it). Every recipe counts, era-hidden ones too: which recipes a
 * route lists is the index's own business.
 */
export function bookFactionItems(index: BookIndex): Record<string, FactionItemRecord> {
  const out = new Map<string, FactionItemRecord>()
  for (const recipe of index.byId.values()) {
    const page = pageOf(recipe)
    let record = out.get(page.toLowerCase())
    if (record === undefined) {
      const questUses = (recipe.quests ?? []).map((quest) => ({ quest, page: recipe.questPages?.[quest] ?? quest }))
      record = { page, name: recipe.item, playerCrafted: true, craftedBy: [], questUses }
      out.set(page.toLowerCase(), record)
    }
    record.craftedBy?.push({ tradeskill: recipe.tradeskill ?? recipe.skillWord, trivial: recipe.trivial })
  }
  return Object.fromEntries(out)
}

// ---- which turn-ins raise what ------------------------------------------------------------------

/** One recipe, one quest page that takes its item, and one faction that page raises. */
interface Feed {
  recipe: BookRecipe
  quest: ItemFactionQuest
  hit: QuestFactionHit
}

function fileFeeds(out: Map<string, Feed[]>, recipe: BookRecipe, quest: ItemFactionQuest): void {
  for (const hit of quest.factions) {
    if (!hit.up) continue
    const key = questFactionKey(factionHitName(hit))
    const list = out.get(key) ?? []
    // Two spellings of one faction on a page are one raise of it: the first line stands.
    if (!list.some((feed) => feed.recipe === recipe && feed.quest.page === quest.page)) list.push({ recipe, quest, hit })
    out.set(key, list)
  }
}

/** Faction key to the turn-ins of a list of recipes that raise it. */
function feedsOf(turnIns: QuestFactionIndex, recipes: readonly BookRecipe[]): Map<string, Feed[]> {
  const out = new Map<string, Feed[]>()
  for (const recipe of recipes) {
    for (const quest of turnIns.questsTaking(pageOf(recipe))) fileFeeds(out, recipe, quest)
  }
  return out
}

export interface TradeskillFactions {
  tradeskill: Tradeskill
  /** Factions a turn-in of the tradeskill raises. */
  factions: number
}

/** How many factions each tradeskill's turn-ins raise: most first, the ones with none left out. */
export function factionCounts(facts: Pick<FactionFacts, 'index' | 'turnIns'>): TradeskillFactions[] {
  return TRADESKILLS.map((tradeskill) => ({ tradeskill, factions: feedsOf(facts.turnIns, skillRecipes(facts.index, tradeskill)).size }))
    .filter((row) => row.factions > 0)
    .sort((a, b) => b.factions - a.factions || a.tradeskill.localeCompare(b.tradeskill))
}

// ---- the list of factions -----------------------------------------------------------------------

function choicesOf(facts: FactionFacts, feeds: ReadonlyMap<string, Feed[]>): FactionChoice[] {
  // The join names a faction by its wiki link where any page links it, before a page's plain text.
  const names = new Map(facts.turnIns.raisedByCrafting().map((faction) => [faction.key, faction.name]))
  const choices = [...feeds].map(([key, list]): FactionChoice => {
    const first = list.at(0)
    return {
      key,
      name: names.get(key) ?? (first === undefined ? key : factionHitName(first.hit)),
      recipes: new Set(list.map((feed) => feed.recipe.id)).size,
      quests: new Set(list.map((feed) => feed.quest.page)).size,
      standing: facts.standings?.get(key) ?? null
    }
  })
  return choices.sort((a, b) => a.name.localeCompare(b.name))
}

/** The asked faction while the list holds it; else the one most recipes feed, the first by name among equals. */
function pickChoice(choices: readonly FactionChoice[], asked: string | null): FactionChoice | null {
  const found = choices.find((choice) => choice.key === asked)
  if (found !== undefined) return found
  let best: FactionChoice | null = null
  for (const choice of choices) {
    if (best === null || choice.recipes > best.recipes) best = choice
  }
  return best
}

// ---- a row --------------------------------------------------------------------------------------

/** "+5", "-1"; the direction in a word when the wiki states no number. */
function changeText(hit: QuestFactionHit): string {
  if (hit.amount === undefined) return hit.up ? 'raised' : 'lowered'
  return hit.amount > 0 ? `+${String(hit.amount)}` : String(hit.amount)
}

function changeOf(facts: FactionFacts, hit: QuestFactionHit, pickedKey: string): FactionChange {
  const name = factionHitName(hit)
  const key = questFactionKey(name)
  return { key, name, up: hit.up, text: changeText(hit), picked: key === pickedKey, openAs: facts.standings?.get(key)?.name ?? name }
}

/** The quest names a recipe's page files a turn-in under on one quest page, the page's own title left out. */
function filedAs(recipe: BookRecipe, quest: ItemFactionQuest): string[] {
  const page = titleKey(quest.page)
  const names = (recipe.quests ?? []).filter((name) => titleKey(recipe.questPages?.[name] ?? name) === page)
  return names.filter((name) => titleKey(name) !== page)
}

/** The signs that a page's one list covers several turn-ins, as a sentence; '' when there is none. */
function sharedText(quest: ItemFactionQuest, filed: readonly string[]): string {
  const signs: string[] = []
  if (filed.length > 0) signs.push(`the item's own page files this turn-in as ${filed.map((name) => `"${name}"`).join(', ')}`)
  if (SEVERAL_TITLE.test(quest.page)) signs.push('its title names several quests')
  if (quest.factions.length > LONG_LIST) signs.push(`it lists ${String(quest.factions.length)} faction changes`)
  if (signs.length === 0) return ''
  return `Shared page: ${signs.join('; ')}. Some of the changes on this row may belong to another turn-in on it.`
}

/** The one page that ties the item to the quest, in words; '' when both pages do. */
function tieText(quest: ItemFactionQuest): string {
  if (quest.ties.length !== 1) return ''
  return quest.ties[0] === 'questPage' ? TIE_QUEST_PAGE : TIE_ITEM_PAGE
}

function eraNote(quest: ItemFactionQuest): string {
  if (quest.eraTag === undefined || !questOutOfEra(quest)) return ''
  return `${quest.eraTag} quest: not open in the current era.`
}

function turnInOf(facts: FactionFacts, feed: Feed, pickedKey: string): TurnIn {
  const { quest, recipe, hit } = feed
  const changes = quest.factions.map((h) => changeOf(facts, h, pickedKey))
  const raises = changes.filter((change) => change.up)
  const losses = changes.filter((change) => !change.up)
  return {
    quest: quest.quest,
    page: quest.page,
    filedAs: filedAs(recipe, quest),
    ...(quest.giver === undefined ? {} : { giver: quest.giver }),
    zones: (quest.startZone ?? '').split(',').map((zone) => zone.trim()).filter((zone) => zone !== ''),
    ...(quest.minLevel === undefined ? {} : { minLevel: quest.minLevel }),
    eraNote: eraNote(quest),
    raise: changeOf(facts, hit, pickedKey),
    changes: [...raises, ...losses],
    raises,
    losses,
    shared: sharedText(quest, filedAs(recipe, quest)),
    tie: tieText(quest)
  }
}

/** A recipe's trivial against the level, as the row's first words. */
export function trivialText(recipe: Pick<BookRecipe, 'trivial'>, level: number | null): string {
  if (recipe.trivial === undefined) return NO_TRIVIAL_TEXT
  const trivial = `trivial ${String(recipe.trivial)}`
  if (level === null) return trivial
  return recipe.trivial <= level ? `${trivial}, at or under your level (${String(level)})` : `${trivial}, above your level (${String(level)})`
}

function isEasy(recipe: BookRecipe, level: number | null): boolean {
  return level !== null && recipe.trivial !== undefined && recipe.trivial <= level
}

function stepOf(facts: FactionFacts, feed: Feed, ask: FactionAsk, pickedKey: string): FactionStep {
  const { recipe, quest } = feed
  const place = { id: `${recipe.id}|${quest.page}`, range: trivialText(recipe, ask.level), to: recipe.trivial ?? null, why: '' }
  const step = recipeStep(facts, recipe, place)
  const canMake = step.hand?.ready ?? 0
  // The "can make N" mark says a plain count; the sentence stays for a count of 0 and for bars a spell would enchant.
  const handText = canMake > 0 && step.hand?.enchanted === null ? '' : step.handText
  return { ...step, handText, canMake, turnIn: turnInOf(facts, feed, pickedKey), easy: isEasy(recipe, ask.level) }
}

/** A stated raise before an unstated one, the bigger first. */
function byRaise(a: Feed, b: Feed): number {
  if (a.hit.amount === undefined || b.hit.amount === undefined) return Number(a.hit.amount === undefined) - Number(b.hit.amount === undefined)
  return b.hit.amount - a.hit.amount
}

/** Trivial at or under the level, the stated raise, the known cost, then the ladder's order. */
function rowOrder(a: FactionStep, b: FactionStep, feeds: ReadonlyMap<FactionStep, Feed>): number {
  const fa = feeds.get(a)
  const fb = feeds.get(b)
  if (fa === undefined || fb === undefined) return 0
  return (
    Number(b.easy) - Number(a.easy) ||
    byRaise(fa, fb) ||
    (a.cost ?? Infinity) - (b.cost ?? Infinity) ||
    recipeOrder(fa.recipe, fb.recipe) ||
    fa.quest.page.localeCompare(fb.quest.page)
  )
}

function stepsOf(facts: FactionFacts, list: readonly Feed[], ask: FactionAsk, pickedKey: string): FactionStep[] {
  const feeds = new Map<FactionStep, Feed>()
  for (const feed of list) {
    if (ask.heldOnly === true && combinesHeld(facts, feed.recipe) === 0) continue
    feeds.set(stepOf(facts, feed, ask, pickedKey), feed)
  }
  return [...feeds.keys()].sort((a, b) => rowOrder(a, b, feeds))
}

// ---- the words on screen ------------------------------------------------------------------------

export const SHARED_PAGE_NOTE =
  'A wiki quest page states one list of faction changes for the whole page. A page that hosts several turn-ins can list changes that belong to another of them, so each row shows its page\'s whole list, and a row marked "shared page" is one where the data gives a sign of that.'

export const TIE_QUEST_PAGE = "Named on the quest page only: the item's own page does not list this quest."

export const TIE_ITEM_PAGE = "Listed on the item's own page only: the quest page does not name the item."

export const TIE_NOTE =
  "A row is here because the quest page names the item or the item's own page lists the quest. A quest page also names items nobody hands in, such as a material of the turn-in, so a row tied by one page alone says which."

export const AMOUNT_NOTE = 'An amount is shown only where the wiki states one. The data does not say how many of the item a turn-in takes: the quest page does.'

export const NO_FORECAST_NOTE =
  'Nothing is forecast: the data holds no faction thresholds and nobody has measured how often a combine fails, so no number of turn-ins or combines is shown.'

export const LEVEL_UNSEEN_NOTE = 'Your log has not shown this skill go up, so no recipe counts as trivial for you.'

export const SHARED_CHIP_LABEL = 'shared page'

/** The mark of the row the shopping list beside the rows is for. */
export const SHOPPING_ROW_LABEL = 'shopping list'

/** On every other row: puts the shopping list on that row's recipe. */
export const SHOP_FOR_ROW_LABEL = 'Shop for this'

export const SHOP_FOR_ROW_TIP = 'Show the shopping list for this recipe.'

/** Beside the picked faction: its door to the Factions tab. */
export const FACTION_LINK_TEXT = 'Open on the Factions tab'

/** The hover of a quest's name. */
export const QUEST_LINK_TIP = 'Open this quest on the wiki.'

/** "3 recipes". */
function recipesText(count: number): string {
  return count === 1 ? '1 recipe' : `${String(count)} recipes`
}

/** A standing as the Factions tab words it: "amiably, 320". */
export function standingText(standing: StandingWords): string {
  return `${standing.label}, ${String(standing.value)}`
}

/** What a faction's entry says after its name: how many recipes feed it, and the standing when a dump is loaded. */
export function choiceFacts(choice: FactionChoice, dumpLoaded: boolean): string {
  const recipes = recipesText(choice.recipes)
  if (!dumpLoaded) return recipes
  return `${recipes} · ${choice.standing === null ? 'not in your faction dump' : `your standing: ${standingText(choice.standing)}`}`
}

/** "Faydarks Champions +5": one change of a row, as plain text. */
export function changeLabel(change: FactionChange): string {
  return `${change.name} ${change.text}`
}

/** "Baking has 42, Tailoring 30."; '' when no tradeskill has any. */
function othersText(facts: FactionFacts): string {
  const counts = factionCounts(facts)
  if (counts.length === 0) return ''
  const parts = counts.map((row, i) => (i === 0 ? `${row.tradeskill} has ${String(row.factions)}` : `${row.tradeskill} ${String(row.factions)}`))
  return ` ${parts.join(', ')}.`
}

function noFactionText(facts: FactionFacts, ask: FactionAsk): string {
  const era = ask.eraOnly === true ? ' in the current era' : ''
  return `No ${ask.tradeskill} recipe makes an item that a quest takes for a faction raise${era}, on the wiki's quest pages.${othersText(facts)}`
}

function basisText(ask: FactionAsk, picked: FactionChoice): string {
  const held = ask.heldOnly === true ? 'Only recipes you hold every material for. ' : ''
  return `${held}${ask.tradeskill} items a quest takes where the quest's wiki page states a raise of ${picked.name}. Order: recipes whose trivial is at or under your level first, then the biggest raise the wiki states, then the lowest cost per combine at the prices you last paid.`
}

function emptyText(facts: FactionFacts, ask: FactionAsk, picked: FactionChoice | null, rows: number): string {
  if (picked === null) return noFactionText(facts, ask)
  if (rows > 0) return ''
  return `You do not hold every material for any ${ask.tradeskill} recipe whose item is a turn-in that raises ${picked.name}.`
}

/** The Faction goal for one tradeskill: the factions its turn-ins raise, and the picked one's turn-ins as rows. */
export function buildFactionRoute(facts: FactionFacts, ask: FactionAsk): FactionRoute {
  const feeds = feedsOf(facts.turnIns, skillRecipes(facts.index, ask.tradeskill))
  const choices = choicesOf(facts, feeds)
  const picked = pickChoice(choices, ask.faction)
  const steps = picked === null ? [] : stepsOf(facts, feeds.get(picked.key) ?? [], ask, picked.key)
  return {
    tradeskill: ask.tradeskill,
    heldOnly: ask.heldOnly === true,
    choices,
    picked,
    steps,
    next: steps.at(0) ?? null,
    basis: picked === null ? '' : basisText(ask, picked),
    caveats: picked === null ? [] : [...(ask.level === null ? [LEVEL_UNSEEN_NOTE] : []), SHARED_PAGE_NOTE, TIE_NOTE, AMOUNT_NOTE, NO_FORECAST_NOTE],
    empty: emptyText(facts, ask, picked, steps.length)
  }
}
