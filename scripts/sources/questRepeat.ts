/**
 * Does a quest page say the quest repeats, and which step repeats? PURE (no network), a sibling of
 * questPage.ts, called by scrape-quests.ts `buildCatalog` so a full run and a delta both carry it.
 *
 * THREE SIGNALS, measured on the cached pages (2026-11-21):
 *  - `[[Category: Repeatable Turn-in Quests]]`, with or without the space (19 pages).
 *  - A `!Repeatable:` header row whose value is Yes (2 pages).
 *  - A sentence that says the quest or step repeats AND names faction (The Painting: "This step can
 *    be repeated to easily raise Craftkeepers and Erudin city factions"). A page that merely uses
 *    the word is not marked: "repeat the phrase", "repeat the entire coin part", "cannot repeat".
 * A disambiguation hub with no quest header (Bone Chips Quests) is a list of quests, not one.
 *
 * THE STEP YOU REPEAT is read only for the sentence signal, from the page's own text, in the shape
 * the wiki's walkthroughs use, reading up from the sentence:
 *
 *   Upon handing Palatos four drinks:            <- the hand-in: count, or coin, and the item
 *   : Palatos Kynarn says 'Ahh.. I..  Need..'    <- the NPC
 *   <div class="facblock"> ... </div>            <- what this one hand-in moves
 *   {{YouGainExperience}}
 *   (This step can be repeated to easily ...)
 *
 * A sentence with no block right above it may still sit on a page with exactly one block (Guard
 * Shilster's Stout says it in the Description), and that block is the step. Anything that does not
 * read cleanly gives no step: the page keeps the plain marker. There is no per-page override.
 */
import type { QuestEntry, QuestFactionHit, QuestRepeatStep } from '../../src/shared/types'
import { linkTargets, parseFactionHits, stripMarkup, titleKey, transclusionTargets, type ParsedQuestPage } from './questPage'

const CATEGORY_RE = /\[\[\s*Category\s*:\s*Repeatable[ _]Turn-in[ _]Quests\s*\]\]/i
const FIELD_RE = /^!\s*'*\s*Repeatable\s*:?\s*'*\s*\n\|\s*'*yes\b/im
const REPEATS_RE = /\b(?:can be repeated|repeatable)\b/i
const NEGATED_RE = /\b(?:not|cannot|can't|never|no longer|non)\b/i
const FACTION_WORD_RE = /\bfactions?\b/i

const FILLER_RE = /^(?:\{\{[^{}]*\}\}\s*)*$/
const BLOCK_OPEN_RE = /<div[^>]*facblock/i
const BLOCK_CLOSE_RE = /<\/div>/i
const SPEAKER_RE = /^:*\s*([A-Z][^:'.!?]{1,48}?) says\b/
const HAND_IN_RE = /\b(?:hand|handing|give|giving|turn in|turning in)\b/i
const SECTION_RE = /^\s*={2,6}/
const COIN_RE = /(\d[\d,]*)\s*(gold|platinum|silver|copper|gp|pp|sp|cp)\b/i
const COUNT_RE = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b/i

const COIN_UNIT: Record<string, string> = { gp: 'gold', pp: 'platinum', sp: 'silver', cp: 'copper' }
const COUNT_WORDS = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

interface Block {
  start: number
  end: number
}

/** The line holding a sentence that says this quest repeats for faction, or -1. */
export function repeatSentenceLine(lines: readonly string[]): number {
  return lines.findIndex((line) =>
    stripMarkup(line)
      .split(/(?<=[.!?])\s+/)
      .some((s) => REPEATS_RE.test(s) && FACTION_WORD_RE.test(s) && !NEGATED_RE.test(s))
  )
}

/** The index of the nearest non-filler line above `at`, or -1. */
function lineAbove(lines: readonly string[], at: number): number {
  let i = at - 1
  while (i >= 0 && FILLER_RE.test(lines[i].trim())) i--
  return i
}

/** The facblock ending right above `at`, or null. */
function blockRightAbove(lines: readonly string[], at: number): Block | null {
  const end = lineAbove(lines, at)
  if (end < 0 || !BLOCK_CLOSE_RE.test(lines[end])) return null
  let start = end
  while (start >= 0 && !BLOCK_OPEN_RE.test(lines[start])) start--
  return start < 0 ? null : { start, end }
}

/** The page's one facblock, when it has exactly one. */
function onlyBlock(lines: readonly string[]): Block | null {
  const opens = lines.flatMap((l, i) => (BLOCK_OPEN_RE.test(l) ? [i] : []))
  if (opens.length !== 1) return null
  const end = lines.findIndex((l, i) => i >= opens[0] && BLOCK_CLOSE_RE.test(l))
  return end < 0 ? null : { start: opens[0], end }
}

/** How many the hand-in line says, when it says more than one. */
function countIn(handIn: string): number | undefined {
  const m = COUNT_RE.exec(handIn)
  if (m === null) return undefined
  const word = COUNT_WORDS.indexOf(m[1].toLowerCase())
  const n = word >= 0 ? word + 2 : Number(m[1])
  return n > 1 ? n : undefined
}

function coinIn(handIn: string): string | undefined {
  const m = COIN_RE.exec(handIn)
  if (m === null) return undefined
  const unit = m[2].toLowerCase()
  return `${m[1].replace(/,/g, '')} ${COIN_UNIT[unit] ?? unit}`
}

/** The distinct item pages one line links or transcludes. */
function itemsIn(line: string, isItem: (t: string) => boolean): string[] {
  return [...linkTargets(line), ...transclusionTargets(line)].filter(isItem)
}

/**
 * The item handed in: the one the hand-in line links, else ("four drinks") the one item the lines
 * above it link, back to the section's start. Two different items there is no answer.
 */
function handedItem(lines: readonly string[], at: number, isItem: (t: string) => boolean): string | null {
  const own = itemsIn(lines[at], isItem)
  const found = own.length > 0 ? own : scanUp(lines, at, isItem)
  const distinct = new Map(found.map((n) => [titleKey(n), n]))
  return distinct.size === 1 ? [...distinct.values()][0] : null
}

function scanUp(lines: readonly string[], at: number, isItem: (t: string) => boolean): string[] {
  const out: string[] = []
  for (let i = at - 1; i >= 0 && !SECTION_RE.test(lines[i]); i--) out.push(...itemsIn(lines[i], isItem))
  return out
}

/**
 * Where the step's NPC stands. The quest's giver stands in its start zone; another NPC's zone must
 * be said on a line naming them, from the page's own zone list. Unread stays unread: the page's
 * start zone beside a different NPC would send the player to the wrong city.
 */
function stepZone(lines: readonly string[], at: number, giver: string, page: ParsedQuestPage): string | undefined {
  if (page.giver !== undefined && titleKey(page.giver) === titleKey(giver)) return page.startZone
  const zones = [page.startZone, ...page.relatedZones].filter((z): z is string => z !== undefined)
  for (let i = at - 1; i >= 0 && !SECTION_RE.test(lines[i]); i--) {
    const text = stripMarkup(lines[i])
    if (!text.includes(giver) && !text.includes(giver.split(' ')[0])) continue
    const zone = zones.find((z) => text.includes(z))
    if (zone !== undefined) return zone
  }
  return undefined
}

/** The hand-in line names the NPC who answers it, by any word of their name. */
function namesSpeaker(handIn: string, speaker: string): boolean {
  const text = handIn.toLowerCase()
  return speaker
    .toLowerCase()
    .split(/\s+/)
    .some((w) => w.length >= 4 && text.includes(w))
}

/** What the player hands over: coin, or one item with its count. Null when it cannot be read. */
function stepCost(
  lines: readonly string[],
  at: number,
  isItem: (t: string) => boolean
): Pick<QuestRepeatStep, 'items' | 'count' | 'coin'> | null {
  const coin = coinIn(lines[at])
  if (coin !== undefined) return { items: [], coin }
  const item = handedItem(lines, at, isItem)
  if (item === null) return null
  const count = countIn(stripMarkup(lines[at]).replace(item, ''))
  return { items: [item], ...(count === undefined ? {} : { count }) }
}

/** The step the repeat sentence on `at` describes, or null when any part of it does not read. */
export function readRepeatStep(
  lines: readonly string[],
  at: number,
  page: ParsedQuestPage,
  isItem: (t: string) => boolean
): QuestRepeatStep | null {
  const block = blockRightAbove(lines, at) ?? onlyBlock(lines)
  if (block === null) return null
  const factions: QuestFactionHit[] = parseFactionHits(lines.slice(block.start, block.end + 1).join('\n'))
  const speakerAt = lineAbove(lines, block.start)
  const speaker = speakerAt < 0 ? null : SPEAKER_RE.exec(stripMarkup(lines[speakerAt]))
  if (factions.length === 0 || speaker === null) return null
  const handInAt = lineAbove(lines, speakerAt)
  if (handInAt < 0 || !HAND_IN_RE.test(lines[handInAt]) || !namesSpeaker(lines[handInAt], speaker[1])) return null
  const cost = stepCost(lines, handInAt, isItem)
  if (cost === null) return null
  const zone = stepZone(lines, handInAt, speaker[1], page)
  return { giver: speaker[1], ...(zone === undefined ? {} : { zone }), ...cost, factions }
}

/** The catalog fields for one parsed page: nothing unless the page says it repeats. */
export function repeatFields(
  page: ParsedQuestPage,
  wikitext: string,
  isItem: (t: string) => boolean
): Pick<QuestEntry, 'repeatable' | 'repeatStep'> {
  if (page.disambiguation && !page.hasTopTable) return {}
  const text = wikitext.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const at = repeatSentenceLine(lines)
  if (at < 0) return CATEGORY_RE.test(text) || FIELD_RE.test(text) ? { repeatable: true } : {}
  const repeatStep = readRepeatStep(lines, at, page, isItem)
  return repeatStep === null ? { repeatable: true } : { repeatable: true, repeatStep }
}
