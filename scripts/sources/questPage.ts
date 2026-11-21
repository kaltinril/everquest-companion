/**
 * PURE quest-page wikitext parser (no network) — the parsing half of
 * `scripts/scrape-quests.ts`. Kept in its own module so it can be unit-tested against
 * verbatim wikitext excerpts (tests/questPageParse.test.mts) without hitting the wiki.
 *
 * Shape of an eqlwiki quest page (probed 2026-08-02 against the live wiki):
 *
 *   {{Classic Era}}
 *   [[File:npc_beur_tenlah.png|frame|Beur Tenlah]]
 *   {| class="questTopTable"
 *   ! ''' Start Zone: '''
 *   | [[Freeport|East Freeport]]
 *   |-
 *   ! ''' Quest Giver: '''
 *   | [[Beur Tenlah]]
 *   |-  … Minimum Level / Classes / Related Zones / Related NPCs
 *   |}
 *
 *   == Reward ==
 *   <ul><li>  {{:Used Merchants Gloves}}   ← a `{{:Name}}` transclusion IS an item box
 *   </li></ul>
 *
 *   == Walkthrough ==
 *   …'''Bring him some [[Dwarven Ale]].'''…   ← turn-in items live in the prose
 *   {{YouGainExperience}}                     ← (or {{exp}}) exp reward marker
 *
 * The Walkthrough's links are a mix of items, NPCs and zones, so the caller supplies an
 * `isItem(title)` predicate (built from the wiki's item-page title set) — that filter is
 * what turns prose links into a trustworthy required-item list.
 */

import { parsePageEraTag } from '../../src/main/itemLookupParse'
import type { QuestFactionHit } from '../../src/shared/types'

export type { QuestFactionHit }

/** The `{| class="questTopTable"` header block, verbatim label → value cells. */
export interface QuestTopTable {
  startZone?: string
  giver?: string
  minLevel?: number
  /** raw "Minimum Level" cell when it carries prose ("15 (lowest guard is 30)") */
  minLevelText?: string
  classes: string[]
  relatedZones: string[]
  relatedNpcs: string[]
}

export interface ParsedQuestPage extends QuestTopTable {
  /** wiki page title (also the quest's display name) */
  page: string
  /** the page's era banner token (`Kunark`, `FearHateRevamp`), when it states one — read by
   *  `parsePageEraTag`, the app's one non-item banner reader (see eraField) */
  eraTag?: string
  /** reward item names (transclusion boxes + item links inside the Reward section) */
  rewards: string[]
  /** item names referenced by the page body (turn-ins/collectibles), minus rewards */
  requiredItems: string[]
  /** page carries a {{YouGainExperience}} / {{exp}} marker */
  expReward: boolean
  /** the faction hits the walkthrough quotes (see parseFactionHits) */
  factions: QuestFactionHit[]
  /** the coin turn-in the page states ("2 gold"), when it states one (see parseCoinCost) */
  coin?: string
  /** true when the page is a disambiguation hub, not a quest */
  disambiguation: boolean
  /** true when the page has a questTopTable header block */
  hasTopTable: boolean
  /** true when a page without a header pulls in other pages' sections ({{#lsth:...}}) */
  sectionHub: boolean
}

const TOP_TABLE_RE = /\{\|[^\n]*questTopTable[^\n]*\n([\s\S]*?)\n\|\}/i
const NAMESPACED = /^(file|image|category|template|help|user|special|talk|media|mediawiki)\s*:/i
/** `{{:UNKNOWN}}`-style boxes an editor left where the item is not yet known. */
const PLACEHOLDER = /^(unknown|none|n\/?a|tbd)$/i

/** [[Page|Label]] → Label, [[Page]] → Page, then drop templates/html/quotes. */
export function stripMarkup(v: string): string {
  return v
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every `[[Target]]` / `[[Target|Label]]` TARGET in `text` (namespaced links skipped). */
export function linkTargets(text: string): string[] {
  const out: string[] = []
  const re = /\[\[\s*([^\]|#<>{}]+?)\s*(?:\|[^\]]*)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const t = m[1].replace(/_/g, ' ').trim()
    if (!t || NAMESPACED.test(t)) continue
    out.push(t)
  }
  return out
}

/** Every `{{:Page}}` main-namespace transclusion target — on quest pages these are item boxes. */
export function transclusionTargets(text: string): string[] {
  const out: string[] = []
  const re = /\{\{:\s*([^}|\n]+?)\s*(?:\|[^}]*)?\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const t = m[1].replace(/_/g, ' ').trim()
    if (t && !NAMESPACED.test(t) && !PLACEHOLDER.test(t)) out.push(t)
  }
  return out
}

/** Positional params of every `{{Gear Set|A|B|...}}` (a quest's armor-set reward list). */
export function gearSetItems(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\{\{\s*gear set\s*\|([^{}]*)\}\}/gi)) {
    for (const p of m[1].split('|')) if (p.trim() && !p.includes('=')) out.push(p.trim())
  }
  return out
}

/** A page name's lookup key: case-folded, `_` read as a space (as MediaWiki does). */
export function titleKey(name: string): string {
  return name.toLowerCase().replace(/[\s_]+/g, ' ').trim()
}

/** Case-insensitive de-dupe that keeps first-seen order and spelling. */
export function dedupe(names: Iterable<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const k = titleKey(n)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(n.replace(/\s+/g, ' ').trim())
  }
  return out
}

/** Split a table cell into names: prefer link labels, else comma-separated plain text. */
function cellList(raw: string): string[] {
  const links = [...raw.matchAll(/\[\[\s*([^\]|#]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\]/g)].map((m) =>
    (m[2] || m[1]).trim()
  )
  const parts = links.length
    ? links
    : stripMarkup(raw)
        .split(/,|\band\b/)
        .map((s) => s.trim())
  return dedupe(parts.filter((s) => s && !/^none$/i.test(s) && !/^n\/?a$/i.test(s)))
}

function cellText(raw: string): string | undefined {
  const s = stripMarkup(raw)
  if (!s || /^none$/i.test(s) || /^n\/?a$/i.test(s)) return undefined
  return s
}

/**
 * Parse the `questTopTable` header block into its labelled fields. Rows are
 * `! ''' Label: '''` followed by `| value` lines (a value may span several lines).
 * Returns null when the page has no such table.
 */
/**
 * The table body's `! ''' Label: '''` / `| value` rows, as lowercased label → value. A label
 * that repeats within one row joins its values with ", "; `|-` (a new row) clears the label,
 * so a stray value line can never attach to the previous row's label.
 */
function topTableFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {}
  let label: string | null = null
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('|-')) {
      label = null
      continue
    }
    if (line.startsWith('!')) {
      const key = stripMarkup(line.replace(/^!+/, ''))
        .replace(/:\s*$/, '')
        .trim()
        .toLowerCase()
      label = key || null
      continue
    }
    if (line.startsWith('|') && label) {
      const val = line.replace(/^\|+/, '').trim()
      fields[label] = fields[label] ? `${fields[label]}, ${val}` : val
    }
  }
  return fields
}

export function parseTopTable(wikitext: string): QuestTopTable | null {
  const m = TOP_TABLE_RE.exec(wikitext)
  if (!m) return null
  const fields = topTableFields(m[1])

  /** First field whose label CONTAINS one of `wants`, in the order given; '' when none. */
  const pick = (...wants: string[]): string => {
    for (const want of wants) {
      for (const [k, v] of Object.entries(fields)) if (k.includes(want)) return v
    }
    return ''
  }
  // Not a bare 'level' fallback: that reads 'Recommended Level' as a minimum.
  const minText = cellText(pick('minimum level', 'min level'))
  const minNum = minText ? Number(/(\d+)/.exec(minText)?.[1]) : NaN

  return {
    startZone: cellText(pick('start zone', 'starts in')),
    giver: cellText(pick('quest giver', 'giver')),
    minLevel: Number.isFinite(minNum) ? minNum : undefined,
    minLevelText: minText && !/^\d+$/.test(minText) ? minText : undefined,
    classes: cellList(pick('classes')),
    relatedZones: cellList(pick('related zones')),
    relatedNpcs: cellList(pick('related npcs', 'related npc'))
  }
}

export interface WikiSection {
  heading: string
  text: string
}

/** Split wikitext into its lead and `== Heading ==` sections (any depth). */
export function splitSections(wikitext: string): { lead: string; sections: WikiSection[] } {
  const lines = wikitext.split('\n')
  const sections: WikiSection[] = []
  const lead: string[] = []
  let cur: WikiSection | null = null
  for (const line of lines) {
    // A template may follow the closing == on the same line (`== Checklist =={{CheckboxList}}`).
    const h = /^\s*={2,6}\s*(.+?)\s*={2,6}\s*((?:\{\{[^{}]*\}\}\s*)*)$/.exec(line)
    if (h) {
      cur = { heading: h[1].trim(), text: h[2] ? h[2] + '\n' : '' }
      sections.push(cur)
      continue
    }
    if (cur) cur.text += line + '\n'
    else lead.push(line)
  }
  return { lead: lead.join('\n'), sections }
}

// 'Reward', 'Possible Rewards', 'Additional Rewards'; a mixed 'Rewards and Walkthrough'
// section names its turn-ins in prose, so it reads as body.
const REWARD_HEADING = /^(?!.*\bwalkthrough\b).*\brewards?\b/i
const EXP_MARKER = /\{\{\s*(yougainexperience|exp|experience)\s*\}\}|you gain experience/i

function isSectionHub(top: QuestTopTable | null, wikitext: string): boolean {
  return top === null && /\{\{\s*#lsth\s*:/i.test(wikitext)
}

/**
 * THE FACTION RECEIPT LINES (measured against the cached corpus, 2026-09-05: 755 of 933 cached
 * quest pages carry at least one). Wiki authors paste the game's own lines in two dialects —
 * direction-only (`…with [[X]] got better`) and numeric (`…with [[X]] has been adjusted by 10`,
 * the number sometimes parenthesised and sometimes signed: `by (+7)`, `by -300`). One pattern
 * matches both so a page mixing dialects reads consistently. Also pasted (2026-10-10): `faction
 * with`, `faction standings with`, `has gotten`/`gets`, a `(+7)` or span before the verb, and the
 * capped `could not possibly get any better`.
 *
 * Re-measured 2026-11-20 on 941 cached pages: 4,068 such lines on 658 pages, 3,947 of them list
 * items. Read since then: the faction in plain text, when the line is the game's whole sentence
 * (`Your faction standing with Kerra Isle has been adjusted by 20.`, 235 lines on 51 pages; see
 * RUN_TOGETHER_RE for the ones left out); bold around the link or the verb; `the` before the
 * link. Groups: 1 `Your`, 2 link target, 3 link label, 4 plain name, 5 what stands between the
 * name and the verb, 6 better/worse, 7 the adjusted-by number, 8 capped better/worse.
 */
const FACTION_HIT_RE = new RegExp(
  String.raw`(\byour?\s+)?faction(?: standings?)? (?:with|for) ` +
    String.raw`(?:(?:the\s+)?'*\[\[\s*([^\]|]+?)\s*(?:\|([^\]]*))?\]\]|'*([A-Za-z][A-Za-z0-9 '\x60-]{1,39}?))` +
    String.raw`'*\s*(\([^)\n]*\)\s*|<span[^>]*>[^<]*<\/span>\s*)?'*` +
    String.raw`(?:(?:has\s+)?(?:got(?:ten)?|gets)\s+'*(better|worse)|(?:has been|was)\s+adjusted\s+by\s*\(?\s*([+-]?\d+)\s*\)?|could not possibly get any (better|worse))`,
  'gi'
)

/** A figure before the verb: `(+7)`, `<span class='profac'>(-30)</span>`. `(10+)` is no figure. */
const AMOUNT_BEFORE_RE = /^(?:<span[^>]*>\s*)?\(\s*([+-]?\d+)\s*\)/
/**
 * A figure after `got better` on the same line (303 lines on 59 pages, 2026-11-20): `. (+5)`,
 * ` (-1).`, `.<span class='oppfac'>(+1)</span>`, `. +1`, ` by 10.`. An unsigned figure needs its
 * brackets or `by`. Left unread: `+3?`, `(-20 or more)`, `[likely +5]`.
 */
const AMOUNT_AFTER_RE =
  /^'*[^\S\n]*[.!]?'*[^\S\n]*(?:<span[^>]*>[^\S\n]*)?(?:by[^\S\n]*\(?[^\S\n]*([+-]?\d+)[^\S\n]*\)?|\([^\S\n]*([+-]?\d+)[^\S\n]*\)|([+-]\d+))(?![\d?+])/i

/** Words running on after the verb (`got better results`): prose, not the game's sentence. */
const RUNS_ON_RE = /^[^\S\n]+(?!by\b)[a-z]/i

/**
 * A plain name in one word with a capital inside it (`LegionofCabilis`, `KerraIsle`; 119 lines on
 * 31 pages, 2026-11-20) is an older server's log spelling: this game's line spaces its names
 * (`/outputfile faction` has one such word, `DaBashers`). It is no wiki title and no game name, so
 * a reader that joins on the name cannot place it. Not read.
 */
const RUN_TOGETHER_RE = /^(?!DaBashers$)\S*[a-z][A-Z]\S*$/

/** `<nowiki>[[X]]</nowiki>` is the faction in plain text: the editor unlinked it. */
const NOWIKI_LINK_RE = /<nowiki>\s*\[\[([^\]|]*)\]\]\s*<\/nowiki>/gi

/**
 * THE COIN TURN-IN (measured 2026-09-05: 48 cached quest pages carry one). The classic guard
 * donation quests take money, not items — "Give him 2 gold" ×15 across the corpus, "hand him
 * 1000pp", "Hand him 1 platinum" — and an item-link parser is structurally blind to them, so a
 * money quest read as having NO turn-in at all. One pattern covers the measured spellings:
 * give/hand/donate, an optional pronoun, a NUMBER, a coin unit (word or the gp/pp/sp/cp short
 * forms). Word-numbers ("give him two sapphires") stay unmatched on purpose: every measured coin
 * line uses digits, and "two sapphires" is an item.
 */
const COIN_RE =
  /\b(?:give|hand|donate)\s+(?:him|her|them|it)?\s*(?:a\s+donation\s+of\s+)?(\d[\d,]*)\s*(gold|platinum|silver|copper|gp|pp|sp|cp)\b/i

const COIN_UNIT: Record<string, string> = {
  gp: 'gold',
  pp: 'platinum',
  sp: 'silver',
  cp: 'copper'
}

/** `parseCoinCost` as a spreadable field — split so `parseQuestPage` stays inside the measured
 *  complexity ceiling (the ternary is a branch wherever it sits). */
function coinField(wikitext: string): { coin?: string } {
  const coin = parseCoinCost(wikitext)
  return coin === undefined ? {} : { coin }
}

/**
 * The page's era banner (`{{Kunark Era}}` → `Kunark`) as a spreadable field. `parsePageEraTag`
 * is the non-item page reader beside the item ones in itemLookupParse.ts, so a quest page and an
 * item page that open the same banner produce the identical token, and there is no second regex
 * to drift. Absent when the page states none (or states disagreeing ones). Split out for the same
 * complexity ceiling as coinField.
 */
function eraField(wikitext: string): { eraTag?: string } {
  const eraTag = parsePageEraTag(wikitext)
  return eraTag === undefined ? {} : { eraTag }
}

/** The page's coin turn-in as words ("2 gold"), or undefined when it states none. First
 *  occurrence wins — a page hosting several turn-in variants repeats the same donation line. */
export function parseCoinCost(wikitext: string): string | undefined {
  const m = COIN_RE.exec(wikitext)
  if (m === null) return undefined
  const unit = m[2].toLowerCase()
  return `${m[1].replace(/,/g, '')} ${COIN_UNIT[unit] ?? unit}`
}

/** A faction name's key within one page: letters and digits only, so `[[King Ak'Anon]]` and `[[King AkAnon]]`,
 *  or a plain `Guardsof Qeynos` and `[[Guards of Qeynos]]`, are one faction. */
function factionKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * The figure a direction line states beside its verb, signed by the verb: `got worse. (-1)` is -1,
 * `got better (5).` is 5. A figure whose own sign contradicts the verb, or a zero, is no amount.
 */
function directionAmount(before: string | undefined, after: string, up: boolean): number | undefined {
  const m = (before === undefined ? null : AMOUNT_BEFORE_RE.exec(before)) ?? AMOUNT_AFTER_RE.exec(after)
  const text = m === null ? undefined : (m[1] ?? m[2] ?? m[3])
  if (text === undefined) return undefined
  const n = Number(text)
  const contradicts = /^[+-]/.test(text) && n > 0 !== up
  if (n === 0 || contradicts) return undefined
  return up ? Math.abs(n) : -Math.abs(n)
}

/** The name a line gives its faction: the link's target, else the plain text, quotes dropped. */
function hitName(m: RegExpExecArray): string {
  return (m[2] ?? m[4])
    .replace(/[\s_]+/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim()
}

/** A plain name counts only in the game's whole sentence (`Your faction ...`, nothing running on)
 *  and in the game's spelling. */
function plainUnread(m: RegExpExecArray, name: string, after: string): boolean {
  return m[2] === undefined && (m[1] === undefined || RUNS_ON_RE.test(after) || RUN_TOGETHER_RE.test(name))
}

/** The direction one line states, and its figure when it states one. */
function hitChange(m: RegExpExecArray, after: string): { up: boolean; amount?: number } {
  const stated = m[7] === undefined ? undefined : Number(m[7])
  const up = stated === undefined ? (m[6] ?? m[8]).toLowerCase() === 'better' : stated >= 0
  const amount = stated ?? (m[6] === undefined ? undefined : directionAmount(m[5], after, up))
  return amount === undefined ? { up } : { up, amount }
}

/** A piped link's label, when it differs from the title. */
function hitLabel(m: RegExpExecArray, name: string): { label?: string } {
  const label = (m[3] ?? '').replace(/[\s_]+/g, ' ').trim()
  return label && label !== name ? { label } : {}
}

/** One receipt line as a hit, or null when it names no faction (a namespaced link, a plain name
 *  outside the game's whole sentence or in a run-together spelling). */
function hitOf(m: RegExpExecArray, after: string): QuestFactionHit | null {
  const name = hitName(m)
  if (plainUnread(m, name, after) || !name || NAMESPACED.test(name)) return null
  return { name, ...hitLabel(m, name), ...(m[2] === undefined ? { plain: true } : {}), ...hitChange(m, after) }
}

/** Whose name stands when two lines name one faction: a linked name beats a plain one. */
function namedBy(base: QuestFactionHit, other: QuestFactionHit): QuestFactionHit {
  return base.plain === true && other.plain !== true ? other : base
}

/**
 * Two lines for one faction: the first stands, except that a line with a figure beats an earlier
 * one without (it carries more of the same fact), a linked name beats a plain one, and a label
 * the standing line lacks is taken from the other.
 */
function mergeHit(prev: QuestFactionHit, next: QuestFactionHit): QuestFactionHit {
  const fuller = prev.amount === undefined && next.amount !== undefined && next.up === prev.up
  const [base, other] = fuller ? [next, prev] : [prev, next]
  const named = namedBy(base, other)
  const label = named.label ?? (named === base ? other.label : base.label)
  return {
    name: named.name,
    ...(label === undefined || label === named.name || named.plain === true ? {} : { label }),
    ...(named.plain === true ? { plain: true } : {}),
    up: base.up,
    ...(base.amount === undefined ? {} : { amount: base.amount })
  }
}

/**
 * Every faction the page's receipt lines name, deduped per faction (first occurrence wins —
 * a page hosting several turn-in variants repeats the same receipts, and summing them would
 * claim one hand-in pays the whole page). A numeric line beats an earlier direction-only line
 * for the same faction, because it carries strictly more of the same fact. One list per page:
 * the parse has no turn-in blocks to file a hit under.
 */
export function parseFactionHits(wikitext: string): QuestFactionHit[] {
  const text = wikitext.replace(NOWIKI_LINK_RE, '$1')
  const byName = new Map<string, QuestFactionHit>()
  let m: RegExpExecArray | null
  FACTION_HIT_RE.lastIndex = 0
  while ((m = FACTION_HIT_RE.exec(text)) !== null) {
    const end = FACTION_HIT_RE.lastIndex
    const hit = hitOf(m, text.slice(end, end + 80))
    if (hit === null) continue
    const key = factionKey(hit.name)
    const prev = byName.get(key)
    byName.set(key, prev === undefined ? hit : mergeHit(prev, hit))
  }
  return [...byName.values()]
}

/**
 * Parse one quest page. `isItem(title)` decides whether a prose link names an item page
 * (built from the wiki's item-title set); without it every link would be kept, dragging
 * in NPCs and zones.
 */
export function parseQuestPage(
  page: string,
  wikitext: string,
  isItem: (title: string) => boolean = () => false
): ParsedQuestPage {
  const top = parseTopTable(wikitext)
  const withoutTable = wikitext.replace(TOP_TABLE_RE, '\n')
  const { lead, sections } = splitSections(withoutTable)

  const rewardText = sections
    .filter((s) => REWARD_HEADING.test(s.heading))
    .map((s) => s.text)
    .join('\n')
  const bodyText = [lead, ...sections.filter((s) => !REWARD_HEADING.test(s.heading)).map((s) => s.text)].join('\n')

  // Rewards: a `{{:Name}}` box is always an item; a plain link only counts when the
  // title is a known item page (Reward sections also link factions, zones and coin).
  // Gear Set is only ever a reward list, read page-wide since it can sit under a sub-heading.
  const rewards = dedupe([
    ...transclusionTargets(rewardText),
    ...linkTargets(rewardText).filter(isItem),
    ...gearSetItems(wikitext).filter(isItem)
  ])
  const rewardKeys = new Set(rewards.map(titleKey))

  // Required/turn-in items: item references anywhere OUTSIDE the Reward section. Unlike the
  // Reward section (which only ever holds item boxes), the body transcludes mob/zone boxes
  // too, so BOTH links and transclusions go through the item filter here.
  const requiredItems = dedupe([
    ...transclusionTargets(bodyText).filter(isItem),
    ...linkTargets(bodyText).filter(isItem)
  ]).filter((n) => !rewardKeys.has(titleKey(n)))

  return {
    page,
    ...eraField(wikitext),
    startZone: top?.startZone,
    giver: top?.giver,
    minLevel: top?.minLevel,
    minLevelText: top?.minLevelText,
    classes: top?.classes ?? [],
    relatedZones: top?.relatedZones ?? [],
    relatedNpcs: top?.relatedNpcs ?? [],
    rewards,
    requiredItems,
    expReward: EXP_MARKER.test(wikitext),
    factions: parseFactionHits(wikitext),
    ...coinField(wikitext),
    disambiguation: /\{\{\s*disambig/i.test(wikitext),
    hasTopTable: top !== null,
    sectionHub: isSectionHub(top, wikitext)
  }
}

/** A parse is "empty" when it yielded nothing worth committing (logged, never dropped silently). */
export function isEmptyParse(q: ParsedQuestPage): boolean {
  return (
    !q.hasTopTable &&
    q.rewards.length === 0 &&
    q.requiredItems.length === 0 &&
    !q.giver &&
    !q.startZone
  )
}
