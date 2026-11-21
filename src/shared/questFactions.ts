// questFactions.ts — an item's quests and the factions those quests move, and back: the crafted
// turn-ins that raise a faction. Pure joins over the two committed catalogs, passed in (quests.json,
// items.json); nothing is read from disk here.
//
// - The faction changes are the quest page's own receipt lines (`QuestEntry.factions`,
//   scripts/sources/questPage.ts `parseFactionHits`): direction always, an amount only where the
//   page states one.
// - ONE LIST PER QUEST PAGE. A page that hosts several turn-ins (Muffin Quests: one per city;
//   Armor of Ro Quests) states one list for all of them, each faction as its first line gives it.
//   An item found through such a page may move only some of that list.
// - An item is tied to a quest two ways: the quest page names it outside its Reward section
//   (`requiredItems`, tie `questPage`), or the item's own page lists the quest (`questUses`, tie
//   `itemPage`; matched by page title, a `#section` dropped). An item the quest hands out
//   (`rewards`) is not a turn-in.
// - Out-of-era quests: pass `inEraQuests(quests)` (questEra.ts) to leave them out. Every row
//   carries the quest's `eraTag` either way.

import { renameItemName } from './itemRenames'
import { itemBaseName } from './itemStats'
import { factionNameKey } from './outputs/factions'
import type { ItemCraftRecipe, ItemQuestUse, QuestEntry, QuestFactionHit } from './types'

/** What the join reads of an items.json record. */
export interface FactionItemRecord {
  page?: string
  name?: string
  otherNames?: string[]
  questUses?: Pick<ItemQuestUse, 'quest' | 'page'>[]
  playerCrafted?: boolean
  craftedBy?: Pick<ItemCraftRecipe, 'tradeskill' | 'trivial'>[]
}

/** How an item is tied to a quest: the quest page names it, or the item's page lists the quest. */
export type QuestTie = 'questPage' | 'itemPage'

/** One quest that takes an item, with what its page says a turn-in does to factions. */
export interface ItemFactionQuest {
  /** the quest's display name (its wiki page title) */
  quest: string
  page: string
  giver?: string
  startZone?: string
  minLevel?: number
  eraTag?: string
  ties: QuestTie[]
  /** the page's whole list, in page order; empty when the page states no faction change */
  factions: QuestFactionHit[]
}

/** A tradeskill that makes an item, with the trivial its page states. */
export interface TurnInTradeskill {
  tradeskill: string
  trivial?: number
}

/** One crafted item whose turn-in raises a faction. */
export interface CraftedTurnIn {
  /** the item's wiki page title */
  item: string
  /** every tradeskill its page gives a recipe under (`Non-Tradeskill` for a quest container) */
  tradeskills: TurnInTradeskill[]
  quest: ItemFactionQuest
  /** the asked faction's own line on that quest page */
  hit: QuestFactionHit
}

/** A faction some crafted turn-in raises. */
export interface RaisedFaction {
  /** as the game names it where the page says (`label`), else the wiki title or the page's text */
  name: string
  key: string
  /** crafted items with a turn-in that raises it */
  items: number
  /** quest pages among those turn-ins */
  quests: number
}

export interface QuestFactionIndex {
  /** The quests that take `item` (any item, crafted or not), by page title. */
  questsTaking: (item: string) => ItemFactionQuest[]
  /** The crafted turn-ins that raise `faction`: biggest stated amount first, unstated after. */
  craftedTurnInsRaising: (faction: string) => CraftedTurnIn[]
  /** Every faction a crafted turn-in raises, by name. */
  raisedByCrafting: () => RaisedFaction[]
}

/**
 * The join key for a faction name from any side: the dump's spelling, a wiki title (`King Tormax
 * (Faction)`), a piped label, or the log's run-together `LegionofCabilis`. `factionNameKey`'s
 * aliases apply; a leading `The`, the wiki's `(Faction)` suffix, spaces and punctuation do not count.
 */
export function questFactionKey(name: string): string {
  const bare = name.replace(/\s*\(faction\)\s*$/i, '')
  return factionNameKey(bare)
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * The faction a hit names, as the game names it. A title the wiki disambiguates (`King Tormax
 * (Faction)`, `Clurg (NPC)`) goes by its link's label; any other title stands as it is, since a
 * label elsewhere is often the log's run-together spelling (`[[Emerald Warriors|EmeraldWarriors]]`).
 */
export function factionHitName(hit: QuestFactionHit): string {
  if (hit.label !== undefined && /\([^)]*\)\s*$/.test(hit.name)) return hit.label
  return hit.name.replace(/\s*\(faction\)\s*$/i, '')
}

/** How well a hit's spelling names its faction: a link's title before a page's plain text. */
function spellingRank(hit: QuestFactionHit): number {
  return hit.plain === true ? 1 : 0
}

/** An item name's key: the rename overlay, no ` +N`, case and `_` folded (as questItemIndex.ts). */
function itemKey(name: string): string {
  return itemBaseName(renameItemName(name.replace(/_/g, ' ')))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** A quest page title's key, a `#section` dropped. */
function pageKey(title: string): string {
  return title.split('#')[0].replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

type Items = Readonly<Record<string, FactionItemRecord>>

/** Every spelling an item answers to (its key, page, name, other names) -> its items.json key. */
function itemIds(items: Items): Map<string, string> {
  const ids = new Map<string, string>()
  for (const [id, rec] of Object.entries(items)) {
    for (const n of [id, rec.page, rec.name, ...(rec.otherNames ?? [])]) {
      if (n !== undefined && !ids.has(itemKey(n))) ids.set(itemKey(n), id)
    }
  }
  return ids
}

interface Taking {
  quest: QuestEntry
  ties: Set<QuestTie>
}

/** item id -> quest page -> how it is tied. */
type Takings = Map<string, Map<string, Taking>>

function tie(takings: Takings, item: string, quest: QuestEntry, how: QuestTie): void {
  let byPage = takings.get(item)
  if (byPage === undefined) {
    byPage = new Map()
    takings.set(item, byPage)
  }
  const taking = byPage.get(quest.page) ?? { quest, ties: new Set<QuestTie>() }
  taking.ties.add(how)
  byPage.set(quest.page, taking)
}

/** The ties the items' own pages state: each `questUses` page the catalog holds, rewards left out. */
function tieItemPages(takings: Takings, items: Items, quests: readonly QuestEntry[], idOf: (n: string) => string): void {
  const byPage = new Map(quests.map((q) => [pageKey(q.page), q]))
  const rewardIds = new Map(quests.map((q) => [q.page, new Set((q.rewards ?? []).map((r) => idOf(r.name)))]))
  for (const [id, rec] of Object.entries(items)) {
    for (const use of rec.questUses ?? []) {
      const quest = byPage.get(pageKey(use.page ?? use.quest))
      if (quest !== undefined && rewardIds.get(quest.page)?.has(id) !== true) tie(takings, id, quest, 'itemPage')
    }
  }
}

function toItemQuest(t: Taking): ItemFactionQuest {
  const q = t.quest
  return {
    quest: q.name,
    page: q.page,
    ...(q.giver === undefined ? {} : { giver: q.giver }),
    ...(q.startZone === undefined ? {} : { startZone: q.startZone }),
    ...(q.minLevel === undefined ? {} : { minLevel: q.minLevel }),
    ...(q.eraTag === undefined ? {} : { eraTag: q.eraTag }),
    ties: (['questPage', 'itemPage'] as const).filter((how) => t.ties.has(how)),
    factions: q.factions ?? []
  }
}

/** The tradeskills an item's page gives a recipe under, each once, with its first stated trivial. */
function tradeskillsOf(rec: FactionItemRecord): TurnInTradeskill[] {
  const out = new Map<string, TurnInTradeskill>()
  for (const r of rec.craftedBy ?? []) {
    if (r.tradeskill === undefined) continue
    const prev = out.get(r.tradeskill)
    if (prev === undefined) out.set(r.tradeskill, { tradeskill: r.tradeskill, ...(r.trivial === undefined ? {} : { trivial: r.trivial }) })
    else if (prev.trivial === undefined && r.trivial !== undefined) prev.trivial = r.trivial
  }
  return [...out.values()]
}

/** Biggest stated raise first, unstated after, then item and quest names. */
function byRaise(a: CraftedTurnIn, b: CraftedTurnIn): number {
  return (b.hit.amount ?? 0) - (a.hit.amount ?? 0) || a.item.localeCompare(b.item) || a.quest.page.localeCompare(b.quest.page)
}

interface Raised {
  name: string
  /** `spellingRank` of the hit `name` came from */
  rank: number
  turnIns: CraftedTurnIn[]
}

/** File one crafted item's turn-in under every faction that quest page raises. */
function fileRaises(raised: Map<string, Raised>, turnIn: Omit<CraftedTurnIn, 'hit'>): void {
  for (const hit of turnIn.quest.factions) {
    if (!hit.up) continue
    const name = factionHitName(hit)
    const rank = spellingRank(hit)
    const entry = raised.get(questFactionKey(name)) ?? { name, rank, turnIns: [] }
    if (rank < entry.rank) Object.assign(entry, { name, rank })
    entry.turnIns.push({ ...turnIn, hit })
    raised.set(questFactionKey(name), entry)
  }
}

/** faction key -> the crafted turn-ins that raise it, over every crafted item with a quest. */
function raisedIndex(takings: Takings, items: Items): Map<string, Raised> {
  const raised = new Map<string, Raised>()
  for (const [id, byPage] of takings) {
    const rec = items[id] as FactionItemRecord | undefined
    if (rec?.playerCrafted !== true) continue
    const tradeskills = tradeskillsOf(rec)
    for (const taking of byPage.values()) fileRaises(raised, { item: rec.page ?? id, tradeskills, quest: toItemQuest(taking) })
  }
  for (const entry of raised.values()) entry.turnIns.sort(byRaise)
  return raised
}

/**
 * The index over `quests` (the catalog's entries) and `items` (items.json's `items` map). Built
 * once by the caller: a walk of both catalogs, a few milliseconds.
 */
export function buildQuestFactionIndex(quests: readonly QuestEntry[], items: Items): QuestFactionIndex {
  const ids = itemIds(items)
  const idOf = (name: string): string => ids.get(itemKey(name)) ?? itemKey(name)
  const takings: Takings = new Map()
  for (const q of quests) for (const name of q.requiredItems ?? []) tie(takings, idOf(name), q, 'questPage')
  tieItemPages(takings, items, quests, idOf)
  const raised = raisedIndex(takings, items)
  return {
    questsTaking: (item) =>
      [...(takings.get(idOf(item))?.values() ?? [])].map(toItemQuest).sort((a, b) => a.page.localeCompare(b.page)),
    craftedTurnInsRaising: (faction) => raised.get(questFactionKey(faction))?.turnIns ?? [],
    raisedByCrafting: () =>
      [...raised]
        .map(([key, r]) => ({
          name: r.name,
          key,
          items: new Set(r.turnIns.map((t) => t.item)).size,
          quests: new Set(r.turnIns.map((t) => t.quest.page)).size
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
  }
}
