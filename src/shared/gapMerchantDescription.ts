// shared/gapMerchantDescription.ts — a new merchant page's `description` (owner, 2026-10-23: "why
// don't the vendors have descriptions, we can make a lot of assumptions based on: 1. screenshot (race,
// merchant type potentially from text) 2. items sold could tell us the type of merchant so description
// 3. any text they say when hailed"). Fixed rules only, nothing guessed by a model.
//
// What the wiki writes, measured on the 1,378 cached `{{MerchantPage}}` pages (2026-10-23): 725 state
// a description (617 more say `Description needed.`). A trade is written `<trade> merchant`: 146 of
// the 725 open that way (`Smithing merchant.`, `Poison supplies merchant.`) against 16 `Sells ...`;
// the nameplate's own words are kept with it (`Teria is a Baking Supplies merchant ...`), so a
// subtitle `(Tailoring Supplies)` is `Tailoring supplies merchant.`. 12 quote the hail and its answer,
// 9 of them as `:You say, 'Hail Lybar'` then a blank line then `Lybar says, '...'`, the player's name
// as `____` (`Good day. ____!`).
//
// In order: the nameplate's subtitle from a pasted picture (`nameplate`, kept by the picture pane), else
// the trade most of its items are used in (`itemsTrade`), then its hail answer (engine gaps_stock.rs,
// `greeting`). Race is left out: no fixed rule reads it from a picture. Only a NEW page gets one, as
// items_sold: an existing page's description is never replaced.

import { foldZoneTally, type GapRow } from './gaps'
import { roleOf } from './gapRoles'
import { zoneBaseName } from './zones'
import { gapJob } from './gapJob'
import { itemsSoldOf } from './gapItemsSold'
import { mobKey } from './mobKey'

/** What the description reads beside the row; each part optional, so a page copies without it. */
export interface MerchantExtras {
  /** A name the mob catalog has: its page exists, so it gets no description. */
  isMob?: (name: string) => boolean
  /** Each sold item's tradeskills by its recipes (main's gapItemTrades.ts), under the lower-cased name. */
  itemTrades?: Readonly<Record<string, readonly string[]>>
  /** The player's own characters: a name in a hail answer is written `____`, as the wiki writes it. */
  ownNames?: readonly string[]
  /** The subtitle under the mob's name on a pasted picture's nameplate (`Tailoring Supplies`). */
  nameplate?: (name: string) => string | undefined
  /** The wiki's name for a zone the log names (`PageExtras.zoneName`): a guildmaster's sentence says where. */
  zoneName?: (zone: string) => string
  /** What the wiki's page for a name already states (`catalogStates`): an Update row asks for none of it. */
  pageStates?: PageStates
}

/** Which of the fields a row's "needs" asks for the wiki's page already states. */
export interface PageStated {
  level: boolean
  location: boolean
  image: boolean
}
export type PageStates = (name: string) => PageStated | undefined

/** A catalog page as mobs.json holds it, the fields the "needs" list reads. */
interface StatingPage {
  name: string
  page: string
  otherNames?: readonly string[]
  level?: string
  loc?: readonly unknown[]
  image?: string
  noImage?: true
}

/**
 * What the catalog's pages for each name state; a field counts only when every page of the name
 * states it (owner, 2026-10-23: an Update row for The Great Zultor said "needs: level (/con)" though
 * its page states `level = 50`). A picture counts only when it was uploaded (`noImage`, gapImages.ts).
 */
export function catalogStates(catalog: readonly StatingPage[]): PageStates {
  const byName = new Map<string, StatingPage[]>()
  for (const m of catalog) for (const n of new Set([m.name, m.page, ...(m.otherNames ?? [])].map(mobKey))) byName.set(n, [...(byName.get(n) ?? []), m])
  return (name) => {
    const pages = byName.get(mobKey(name))
    if (pages === undefined) return undefined
    const all = (stated: (m: StatingPage) => boolean): boolean => pages.every(stated)
    return { level: all((m) => (m.level ?? '').trim() !== ''), location: all((m) => (m.loc ?? []).length > 0), image: all((m) => (m.image ?? '') !== '' && m.noImage !== true) }
  }
}

/** The "needs" an Update row keeps: only what its existing page does not state (`level (/con)` and so on). */
export function withoutStated(row: GapRow, extras: MerchantExtras, needs: readonly string[]): string[] {
  const stated = gapJob(row, { isMob: extras.isMob }) === 'update' ? extras.pageStates?.(row.name) : undefined
  if (stated === undefined) return [...needs]
  return needs.filter((n) => !((n.startsWith('level') && stated.level) || (n.startsWith('location') && stated.location) || (n.startsWith('image') && stated.image)))
}

/** A description, and where its first sentence came from. */
export interface MerchantDescription {
  text: string
  /** The trade sentence: its source, and the words the details say it in. */
  sentence?: { text: string; from: string }
  /** The hail answer as quoted, the player's name masked. */
  greeting?: string
}

/** The wiki's tradeskill names (recipe groups and `Skill X` pages) → the trade a description names. */
const TRADES: Readonly<Record<string, string>> = {
  blacksmithing: 'Smithing',
  smithing: 'Smithing',
  jewelcrafting: 'Jewelcraft',
  'jewelry making': 'Jewelcraft',
  alchemy: 'Alchemy',
  baking: 'Baking',
  brewing: 'Brewing',
  tailoring: 'Tailoring',
  pottery: 'Pottery',
  'poison making': 'Poison',
  'make poison': 'Poison',
  tinkering: 'Tinkering',
  fletching: 'Fletching',
  fishing: 'Fishing',
  research: 'Spell research',
  'spell research': 'Spell research',
  'skill research': 'Spell research'
}

/**
 * An item the corpus has no recipes for, by its name (items.json, 2026-10-23): a name ending in
 * `Pattern` is a tailoring pattern (16 of the 19 tagged ones), in `Mold` a smithing mold (131 of 132);
 * a sewing kit or `How to Sew` book is tailoring's own.
 */
const NAME_TRADES: readonly [RegExp, string][] = [
  [/\bPattern$/i, 'Tailoring'],
  [/\bMold$/i, 'Smithing'],
  [/\bSewing\b|^How to Sew\b/i, 'Tailoring']
]

/** At least this many sold items name a trade, and they are at least this share of all it sold... */
const MIN_TRADED = 3
const TRADED_SHARE = 0.5
/** ...and one trade is on at least this share of them, ahead of every other. */
const MAJORITY = 0.6

/** An item's trades: its recipes', else its name's. */
function tradesOf(item: string, itemTrades: Readonly<Record<string, readonly string[]>>): Set<string> {
  const data = (itemTrades[item.toLowerCase()] ?? []).map((t) => TRADES[t.toLowerCase()]).filter((t): t is string => t !== undefined)
  if (data.length > 0) return new Set(data)
  return new Set(NAME_TRADES.filter(([re]) => re.test(item.trim())).map(([, t]) => t))
}

/** The trade most of the items are used in, with its count and the items that named one; none without a clear majority. */
export function itemsTrade(items: readonly string[], itemTrades: Readonly<Record<string, readonly string[]>>): { trade: string; count: number; traded: number } | undefined {
  const traded = items.map((i) => tradesOf(i, itemTrades)).filter((t) => t.size > 0)
  if (traded.length < MIN_TRADED || traded.length < items.length * TRADED_SHARE) return undefined
  const count = new Map<string, number>()
  for (const t of traded) for (const trade of t) count.set(trade, (count.get(trade) ?? 0) + 1)
  const [top, next] = [...count].sort((a, b) => b[1] - a[1])
  if (top === undefined || top[1] < traded.length * MAJORITY || next?.[1] === top[1]) return undefined
  return { trade: top[0], count: top[1], traded: traded.length }
}

/** The nameplate's words, the brackets and runs of space gone. */
const subtitleWords = (subtitle: string): string => subtitle.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * `Shadow Knight Guildmaster` → `Shadow Knight GM`, the role the client's target line would state
 * (gapRoles.ts writes it as `GM [[Shadow Knight]]`); undefined for any other subtitle. Owner,
 * 2026-11-10: Bok Master Thragnog's nameplate, read off his picture, and his page had no class.
 */
export function subtitleRole(subtitle: string): string | undefined {
  const gm = /^(.+?)\s+guild\s*master$/i.exec(subtitleWords(subtitle))
  return gm === null ? undefined : `${gm[1]} GM`
}

/**
 * `Tailoring Supplies` → `Tailoring supplies merchant.`; a bare `Merchant` says nothing; a guildmaster
 * → `Shadow knight guildmaster in Rathe Mountains.`, as the wiki's guildmaster pages say it (50 of
 * the cached pages, `<Class> guildmaster in <place>.`), or without the place when none is known.
 */
export function subtitleSentence(subtitle: string, zone?: string): string | undefined {
  const words = subtitleWords(subtitle)
  if (words === '' || /^merchant$/i.test(words)) return undefined
  const said = `${words.charAt(0).toUpperCase()}${words.slice(1).toLowerCase()}`
  if (/\bguild\s*master$/i.test(said)) return zone === undefined ? `${said}.` : `${said} in ${zone}.`
  return /\b(merchant|vendor|trader|shopkeeper)s?$/i.test(said) ? `${said}.` : `${said} merchant.`
}

/** The wiki's name for the zone the row was named in most; undefined when none was. */
function placeOf(row: GapRow, extras: MerchantExtras): string | undefined {
  const top = row.details.zones === undefined ? undefined : foldZoneTally(row.details.zones).entries[0]?.name
  if (top === undefined) return undefined
  return extras.zoneName?.(top) ?? zoneBaseName(top).replace(/^the\s+/i, '')
}

/** A hail answer with each own character's name as `____`, as the cached pages write the player. */
export function maskedGreeting(said: string, ownNames: readonly string[]): string {
  return ownNames.filter((n) => n.length >= 3).reduce((s, n) => s.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '____'), said)
}

const greetingOf = (row: object): string | undefined => {
  const g = (row as { greeting?: unknown }).greeting
  return typeof g === 'string' && g !== '' ? g : undefined
}

/** The trade sentence and its source in words: the nameplate first, else what it sold. */
function sentenceOf(row: GapRow, extras: MerchantExtras): MerchantDescription['sentence'] {
  const subtitle = extras.nameplate?.(row.name)
  const named = subtitle === undefined ? undefined : subtitleSentence(subtitle, placeOf(row, extras))
  if (named !== undefined) return { text: named, from: 'from its nameplate' }
  const sold = itemsSoldOf(row).map((s) => s.item)
  const trade = extras.itemTrades === undefined ? undefined : itemsTrade(sold, extras.itemTrades)
  if (trade === undefined) return undefined
  return { text: `${trade.trade} supplies merchant.`, from: `from what it sold: ${String(trade.count)} of ${String(sold.length)} items are ${trade.trade.toLowerCase()} supplies` }
}

/** Whose hail answer the page quotes: a merchant, a mob with a role or a nameplate, or a named NPC (no `a`/`an`/`the`). */
function hailWorthQuoting(row: GapRow, extras: MerchantExtras): boolean {
  return row.domain === 'merchant' || roleOf(row) !== undefined || extras.nameplate?.(row.name) !== undefined || !/^(a|an|the)\s/i.test(row.name)
}

/** A new merchant page's description; undefined for a page that exists or when nothing says one. */
export function merchantDescription(row: GapRow, extras: MerchantExtras): MerchantDescription | undefined {
  if (gapJob(row, { isMob: extras.isMob }) !== 'new') return undefined
  const sentence = sentenceOf(row, extras)
  const said = greetingOf(row)
  const greeting = said === undefined ? undefined : maskedGreeting(said, extras.ownNames ?? [])
  // A generic mob's bark is no description (owner, 2026-11-10: a kobold's "Grrrrr. Bark."): the hail
  // answer is quoted for a merchant, a mob with a role or a nameplate, or a named NPC.
  const quote = greeting === undefined || !hailWorthQuoting(row, extras) ? undefined : `:You say, 'Hail ${row.name}'\n\n${row.name} says, '${greeting}'`
  const text = [sentence?.text, quote].filter((t) => t !== undefined).join('\n\n')
  return text === '' ? undefined : { text, ...(sentence === undefined ? {} : { sentence }), ...(greeting === undefined ? {} : { greeting }) }
}

/**
 * The facts a merchant page is built from, with what the row adds: a new page's description, or, for
 * a page the wiki has (an Update row), what that page states (wikiPage.ts `merchantPage`).
 */
export function withDescription<F extends object>(f: F, row: GapRow, extras: MerchantExtras): F & { description?: string; stated?: PageStated } {
  if (gapJob(row, { isMob: extras.isMob }) === 'update') return { ...f, stated: extras.pageStates?.(row.name) ?? { level: false, location: false, image: false } }
  const d = merchantDescription(row, extras)
  // A guildmaster's nameplate names its class when no target line did (gapRoles.ts `roleClass`).
  const subtitle = extras.nameplate?.(row.name)
  const gm = subtitle === undefined || roleOf(row) !== undefined ? undefined : subtitleRole(subtitle)
  return { ...f, ...(d === undefined ? {} : { description: d.text }), ...(gm === undefined ? {} : { role: gm }) }
}

/** The add text's opening words, by which an edit finds it (withEditedFields). */
const ADD_HEAD = 'Add to the existing page'

/** The fields an existing page may lack, in the merchant layout's order; a block field under its key. */
const ADD_FIELDS: readonly (readonly [string, keyof PageStated | undefined])[] = [['class', undefined], ['level', 'level'], ['location', 'location'], ['items_sold', undefined]]

/**
 * What to add to a page the wiki has (owner, 2026-10-23: "why is this description missing when i
 * update from the app"): the app holds no page text, so a whole page pasted over the existing one would
 * drop what people wrote there (Konro Strongfoot's description, its quest). Only the merchant fields the
 * log fills, each where the catalog says the page is blank (`class` and `items_sold` the catalog never
 * reads), under a line saying how to use them. Never a description: that is the page's own.
 */
export function addToPage(name: string, values: Readonly<Record<string, string>>, stated: PageStated): string {
  const lines = ADD_FIELDS.filter(([key, by]) => (values[key] ?? '') !== '' && (by === undefined || !stated[by])).map(([key]) =>
    key === 'items_sold' ? `| items_sold = \n\n${values[key] ?? ''}` : `| ${key.padEnd(17)} = ${values[key] ?? ''}`
  )
  return `${ADD_HEAD} (${name}): switch its template to MerchantPage, then fill these fields where it leaves them blank.\n\n${lines.join('\n')}\n`
}

/**
 * Copy's add text with a line for every hand-edited field it lacks, above `items_sold` (requirement
 * 2026-10-23: a correction is used by Copy, whatever the catalog says the page states). Any other text
 * is returned as it is: a whole page already has every field's line.
 */
export function withEditedFields(text: string, fields: Readonly<Record<string, string>>): string {
  if (!text.startsWith(ADD_HEAD)) return text
  const has = (key: string): boolean => new RegExp(`^\\|\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'm').test(text)
  const lines = Object.entries(fields).filter(([key]) => !has(key)).map(([key, value]) => `| ${key.padEnd(17)} = ${value}\n`)
  if (lines.length === 0) return text
  const at = text.search(/^\| items_sold =/m)
  if (at >= 0) return `${text.slice(0, at)}${lines.join('')}${text.slice(at)}`
  const body = text.replace(/\n+$/, '')
  return `${body}${/^\|/m.test(body) ? '\n' : '\n\n'}${lines.join('')}`
}

/** A merchant page, or for a page the wiki has (`stated`), only what to add to it. */
export function pageOrAdd(f: { name: string; stated?: PageStated }, values: Readonly<Record<string, string>>, build: (v: Readonly<Record<string, string>>) => string): string {
  return f.stated === undefined ? build(values) : addToPage(f.name, values, f.stated)
}

/** The details' lines: the description's sentence and where it came from, and the hail answer it quotes. */
export function descriptionLines(row: GapRow, extras: MerchantExtras): string[] {
  const d = merchantDescription(row, extras)
  if (d === undefined) return []
  return [
    ...(d.sentence === undefined ? [] : [`Description: ${d.sentence.text} (${d.sentence.from})`]),
    ...(d.greeting === undefined ? [] : [`Hail answer, quoted in the description: '${d.greeting}'`])
  ]
}
