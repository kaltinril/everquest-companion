// shared/tradeskillAa.ts — the AAs that bear on tradeskills and on foraging (owner, 2026-11-20:
// "I think there are AA's that pertain to crafting, we should somehow show stuff related to that").
//
// The rows are the wiki's General AAs table (tradeskillAaTable.generated.ts, parsed from the
// cached page with no request). This file decides which rows bear on what, reads the per-rank
// figures a row's text states, joins the purchases the player's log shows, and holds every word
// the Tradeskills section draws about them.
//
// WHICH ROWS, read off the row itself, so a row the wiki adds later is picked up by the next parse:
//   - `<Tradeskill> Mastery` by NAME bears on that tradeskill. The wiki's spellings ("Jewel
//     Craft", "Jewelcraft") fold to the app's names.
//   - a text that names Forage bears on foraging.
//   - any other text that says "tradeskill" bears on every tradeskill (Crafting Mastery, and Full
//     Potential's "+50 Tradeskill slots"). Where the text lists tradeskills in brackets after the
//     word, the list is kept: Crafting Mastery names seven, and a workbench outside them says so.
//
// WHAT IS NOT CLAIMED:
//   - A figure is read only from one exact shape (`by A/B/C%`, `raise A/B/C additional`), one
//     value per rank. It is shown as the wiki's figure for a rank. It is never combined with
//     anything: no success or skill-up rate is measured for this game, so no forecast is made.
//   - A purchase is what the log shows. A log can start after a purchase, and a respec leaves no
//     line, so the words are "your log shows", never "you have" or "you do not have".
//   - Past 200 is counted from the levels the log last stated, tradeskill by tradeskill. Whether a
//     given one may pass 200 is the wiki's sentence, quoted, not worked out here.

import type { AASpendLike } from './aa'
import { aaLedger } from './aaLedger'
import type { SkillRow } from './skills'
import { GENERAL_AAS, TRADESKILL_AA_RULES, type WikiAaRow } from './tradeskillAaTable.generated'
import { tradeskillLevel } from './tradeskillBook'
import { TRADESKILLS, tradeskillOf, type Tradeskill } from './tradeskills'
import { wikiPageUrl } from './wiki'

/** What an AA bears on. */
export type AaReach =
  | { kind: 'tradeskill'; tradeskill: Tradeskill }
  /** Every tradeskill; `named` holds the ones its text lists in brackets, empty when it lists none. */
  | { kind: 'all'; named: readonly Tradeskill[] }
  | { kind: 'forage' }

/** One General AA that bears on a tradeskill or on foraging. */
export interface CraftAa {
  name: string
  ranks: number
  /** The Cost cell as the wiki writes it. */
  cost: string
  /** Points for each rank, when the cell is one number per rank; null for any other wording. */
  costs: readonly number[] | null
  /** The description as the wiki writes it. */
  text: string
  reach: AaReach
  /** `by 10/25/50%`: the percent the text states for each rank; null without that exact shape. */
  percents: readonly number[] | null
  /** `raise 1/2/3 additional`: the tradeskills the text states for each rank; null without that shape. */
  extra: readonly number[] | null
}

/** The wiki's AA spellings that `tradeskillOf` does not know. */
const AA_SPELLING = new Map<string, Tradeskill>([
  ['jewel craft', 'Jewelcrafting'],
  ['jewelcraft', 'Jewelcrafting']
])

/** The tradeskill a word of the AA table means, or undefined. */
export function aaTradeskill(raw: string): Tradeskill | undefined {
  return tradeskillOf(raw) ?? AA_SPELLING.get(raw.trim().toLowerCase())
}

/** `2/4/6` as numbers, when there is exactly one per rank. */
function perRank(list: string | undefined, ranks: number): number[] | null {
  if (list === undefined) return null
  const values = list.split('/').map(Number)
  return values.length === ranks ? values : null
}

/** The one place a text matches `shape` (whose first group is the `A/B/C` list), read per rank. */
function figures(row: WikiAaRow, shape: RegExp): number[] | null {
  const found = [...row.text.matchAll(shape)]
  return found.length === 1 ? perRank(found[0][1], row.ranks) : null
}

function costsOf(row: WikiAaRow): number[] | null {
  return /^\d+(?:\/\d+)*$/.test(row.cost) ? perRank(row.cost, row.ranks) : null
}

/** The tradeskills a text lists in brackets after the word: `tradeskill (Baking, ..., or Tailoring)`. */
function namedIn(text: string): Tradeskill[] {
  const list = /\btradeskills?\s*\(([^)]*)\)/i.exec(text)?.[1]
  if (list === undefined) return []
  const out: Tradeskill[] = []
  for (const word of list.split(/,|\bor\b|\band\b/)) {
    const tradeskill = aaTradeskill(word)
    if (tradeskill !== undefined && !out.includes(tradeskill)) out.push(tradeskill)
  }
  return out
}

/** What a row of the table bears on, or null when it bears on no tradeskill and not on foraging. */
export function aaReach(row: Pick<WikiAaRow, 'name' | 'text'>): AaReach | null {
  const mastery = /^(.+?)\s+Mastery$/i.exec(row.name.trim())?.[1]
  const tradeskill = mastery === undefined ? undefined : aaTradeskill(mastery)
  if (tradeskill !== undefined) return { kind: 'tradeskill', tradeskill }
  if (/\bforag(?:e|ing)\b/i.test(row.text)) return { kind: 'forage' }
  if (/\btradeskills?\b/i.test(row.text)) return { kind: 'all', named: namedIn(row.text) }
  return null
}

/** Every row that bears on a tradeskill or on foraging, in the wiki's order. */
export function craftAas(table: readonly WikiAaRow[] = GENERAL_AAS): CraftAa[] {
  const out: CraftAa[] = []
  for (const row of table) {
    const reach = aaReach(row)
    if (reach === null) continue
    out.push({
      name: row.name,
      ranks: row.ranks,
      cost: row.cost,
      costs: costsOf(row),
      text: row.text,
      reach,
      percents: figures(row, /\bby (\d+(?:\/\d+)*)%/g),
      extra: figures(row, /\braise (\d+(?:\/\d+)*) additional\b/g)
    })
  }
  return out
}

/** The AAs a workbench lists: the tradeskill's own mastery first, then the ones for every tradeskill. */
export function tradeskillAas(tradeskill: Tradeskill, table: readonly WikiAaRow[] = GENERAL_AAS): CraftAa[] {
  const all = craftAas(table)
  const own = all.filter((aa) => aa.reach.kind === 'tradeskill' && aa.reach.tradeskill === tradeskill)
  return [...own, ...all.filter((aa) => aa.reach.kind === 'all')]
}

/** The AAs that bear on foraging. */
export function forageAas(table: readonly WikiAaRow[] = GENERAL_AAS): CraftAa[] {
  return craftAas(table).filter((aa) => aa.reach.kind === 'forage')
}

/** What the log's purchase lines say of one AA. */
export interface AaBought {
  /** The highest rank a purchase line names. */
  top: number
  /** Ranks under it that no line of this log names (bought before the log began, most likely). */
  unlogged: readonly number[]
  /** Every logged rank cost nothing: the game granted it. */
  granted: boolean
}

const nameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase()

/** The log's AA purchases by ability name. The ladder per ability is `aaLedger`'s. */
export type AaPurchases = ReadonlyMap<string, AaBought>

export function aaPurchases(spends: readonly AASpendLike[]): AaPurchases {
  const out = new Map<string, AaBought>()
  for (const row of aaLedger(spends)) {
    out.set(nameKey(row.name), { top: row.topRank, unlogged: row.unlogged, granted: row.paidRanks === 0 })
  }
  return out
}

/** The purchase of an AA by the wiki's name, or null when the log shows none. */
export function boughtOf(purchases: AaPurchases, name: string): AaBought | null {
  return purchases.get(nameKey(name)) ?? null
}

/** The Crafting Mastery rank the log shows bought; 0 when it shows none (or is not read yet). */
export function craftingMasteryRank(spends: readonly AASpendLike[] | null | undefined): number {
  return spends ? (boughtOf(aaPurchases(spends), 'Crafting Mastery')?.top ?? 0) : 0
}

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`

/** `2, 4 and 6`. */
function wordList(parts: readonly (string | number)[]): string {
  const words = parts.map(String)
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** "3 ranks costing 2, 4 and 6 points", "6 ranks costing 3 points each", "1 rank costing 3 points". */
export function aaCostText(aa: Pick<CraftAa, 'ranks' | 'cost' | 'costs'>): string {
  const ranks = plural(aa.ranks, 'rank', 'ranks')
  const { costs } = aa
  if (costs === null) return `${ranks}, cost on the wiki: ${aa.cost}`
  if (costs.length === 1) return `${ranks} costing ${plural(costs[0], 'point', 'points')}`
  if (costs.every((c) => c === costs[0])) return `${ranks} costing ${plural(costs[0], 'point', 'points')} each`
  return `${ranks} costing ${wordList(costs)} points`
}

export const AA_NO_PURCHASE_TEXT = 'Your log shows no purchase.'

/** Why "no purchase" is not "you do not have it". */
export const AA_NO_PURCHASE_TIP =
  'No purchase line for this AA is in your log. A log that began after the purchase does not show it, so this is not a statement that you lack it.'

/** The full sentence: what the log shows bought. '' while the purchases are not read yet. */
export function aaBoughtText(aa: Pick<CraftAa, 'ranks'>, bought: AaBought | null | undefined): string {
  if (bought === undefined) return ''
  if (bought === null) return AA_NO_PURCHASE_TEXT
  const verb = bought.granted ? 'granted' : 'bought'
  if (bought.top > aa.ranks) return `Your log shows rank ${String(bought.top)} ${verb}. The wiki lists ${plural(aa.ranks, 'rank', 'ranks')}.`
  return `Your log shows rank ${String(bought.top)} of ${String(aa.ranks)} ${verb}.`
}

/** The same in a few words, for the one-line list: "rank 3 of 3 in your log". */
export function aaBoughtShort(aa: Pick<CraftAa, 'ranks'>, bought: AaBought | null | undefined): string {
  if (bought === undefined) return ''
  if (bought === null) return 'no purchase in your log'
  return bought.top > aa.ranks ? `rank ${String(bought.top)} in your log` : `rank ${String(bought.top)} of ${String(aa.ranks)} in your log`
}

/**
 * The wiki's own figure for the rank the log shows: "At rank 3 the wiki states 50%." It is the
 * wiki's sentence with the rank picked out, nothing more. '' without a purchase or a figure.
 */
export function aaAtRankText(aa: Pick<CraftAa, 'ranks' | 'percents' | 'extra'>, bought: AaBought | null | undefined): string {
  if (bought === undefined || bought === null || bought.top < 1 || bought.top > aa.ranks) return ''
  const at = `At rank ${String(bought.top)} the wiki states`
  if (aa.percents !== null) return `${at} ${String(aa.percents[bought.top - 1])}%.`
  if (aa.extra !== null) return `${at} ${plural(aa.extra[bought.top - 1], 'additional tradeskill', 'additional tradeskills')}.`
  return ''
}

/** The level the wiki's rule turns on: "Once you pass 200 in any one skill ...". */
export const TRADESKILL_CAP = 200

export interface PastCap {
  tradeskill: Tradeskill
  level: number
}

/** The tradeskills whose last stated level is past 200, highest first. */
export function pastCap(skills: readonly SkillRow[]): PastCap[] {
  const out: PastCap[] = []
  for (const tradeskill of TRADESKILLS) {
    const level = tradeskillLevel(skills, tradeskill)
    if (level !== null && level > TRADESKILL_CAP) out.push({ tradeskill, level })
  }
  return out.sort((a, b) => b.level - a.level || a.tradeskill.localeCompare(b.tradeskill))
}

/** "Your log shows 1 tradeskill past 200: Jewelcrafting 205." */
export function pastCapText(past: readonly PastCap[]): string {
  const cap = String(TRADESKILL_CAP)
  if (past.length === 0) return `Your log shows no tradeskill past ${cap}.`
  const names = past.map((p) => `${p.tradeskill} ${String(p.level)}`).join(', ')
  return `Your log shows ${plural(past.length, 'tradeskill', 'tradeskills')} past ${cap}: ${names}.`
}

/** The lines of the wiki's Tradeskills page that name the AA (the 200 rule names Crafting Mastery). */
export function aaRuleLines(aa: Pick<CraftAa, 'name'>, rules: readonly string[] = TRADESKILL_AA_RULES): string[] {
  return rules.filter((line) => line.toLowerCase().includes(aa.name.toLowerCase()))
}

/**
 * Where an AA for every tradeskill lists some by name and the open one is not among them, the
 * line that says so. '' otherwise: the list is in the wiki's text just above.
 */
export function aaNamedText(aa: Pick<CraftAa, 'reach'>, tradeskill: Tradeskill): string {
  if (aa.reach.kind !== 'all' || aa.reach.named.length === 0 || aa.reach.named.includes(tradeskill)) return ''
  return `The wiki's text names ${wordList(aa.reach.named)}. It does not name ${tradeskill}.`
}

/** What the log has said so far. A null side has not been read yet: nothing is said of it. */
export interface AaFacts {
  /** The `leveling` module's AA purchases. */
  spends: readonly AASpendLike[] | null
  /** The `skills` module's rows. */
  skills: readonly SkillRow[] | null
}

/** The 200 rule beside an AA that lifts it: the wiki's rule, the player's levels, the wiki's list. */
export interface AaCapLines {
  rules: string[]
  /** '' until the skills are read. */
  past: string
  /** '' unless the AA lists tradeskills and the open one is not among them. */
  named: string
}

/** One AA as a panel draws it. */
export interface AaLine {
  aa: CraftAa
  costText: string
  /** '' until the purchases are read. */
  boughtText: string
  boughtShort: string
  /** True when the log shows a purchase. */
  bought: boolean
  atRankText: string
  /** Only on an AA whose text states additional tradeskills per rank, and only on a workbench. */
  cap: AaCapLines | null
}

function capLines(aa: CraftAa, facts: AaFacts, tradeskill: Tradeskill | undefined): AaCapLines | null {
  if (aa.extra === null || tradeskill === undefined) return null
  return {
    rules: aaRuleLines(aa),
    past: facts.skills === null ? '' : pastCapText(pastCap(facts.skills)),
    named: aaNamedText(aa, tradeskill)
  }
}

function lineOf(aa: CraftAa, purchases: AaPurchases | null, facts: AaFacts, tradeskill?: Tradeskill): AaLine {
  const bought = purchases === null ? undefined : boughtOf(purchases, aa.name)
  return {
    aa,
    costText: aaCostText(aa),
    boughtText: aaBoughtText(aa, bought),
    boughtShort: aaBoughtShort(aa, bought),
    bought: bought !== undefined && bought !== null,
    atRankText: aaAtRankText(aa, bought),
    cap: capLines(aa, facts, tradeskill)
  }
}

/** A workbench's AA lines. Empty when no AA bears on the tradeskill: the panel then draws nothing. */
export function tradeskillAaLines(tradeskill: Tradeskill, facts: AaFacts, table: readonly WikiAaRow[] = GENERAL_AAS): AaLine[] {
  const purchases = facts.spends === null ? null : aaPurchases(facts.spends)
  return tradeskillAas(tradeskill, table).map((aa) => lineOf(aa, purchases, facts, tradeskill))
}

/** The Foraging tile's AA lines. */
export function forageAaLines(facts: AaFacts, table: readonly WikiAaRow[] = GENERAL_AAS): AaLine[] {
  const purchases = facts.spends === null ? null : aaPurchases(facts.spends)
  return forageAas(table).map((aa) => lineOf(aa, purchases, facts))
}

export const AA_PANEL_HEADING = 'AAs for this tradeskill'
/** The words before a line quoted from the wiki's Tradeskills page. */
export const AA_RULE_LABEL = "The wiki's Tradeskills page says:"
export const AA_SHOW_TEXT = 'Show what they do'
export const AA_HIDE_TEXT = 'Hide what they do'
export const AA_SOURCE_TEXT = "The descriptions are the wiki's own words. Ranks bought are read from the purchase lines in your log."

/** The wiki page the table is on, and the words of the link to it. */
export const AA_WIKI_PAGE = 'Alternate Advancement'
export const AA_WIKI_URL = wikiPageUrl(AA_WIKI_PAGE)
export const AA_WIKI_LABEL = `Open ${AA_WIKI_PAGE} on the wiki`
