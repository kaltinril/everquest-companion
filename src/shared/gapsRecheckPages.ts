// shared/gapsRecheckPages.ts — another character's saved rows that are about a page the wiki HAS,
// checked again against today's catalogs (bug hunt, 2026-11-19).
//
// THREE KINDS OF ROW NAME SOMETHING THE DATA KNOWS BY DESIGN: a quest giver whose page lacks a
// quest it gives (`questGaps`), a name known only through a redirect (`viaRedirect`), and a mob
// whose only pages are other zones' (`zoneTitled`). "Does the catalog know this name" is yes for
// every one of them, so that test (gapsRecheck.ts `KnownNow`, the tab's `otherInputs`) must not
// close them: it dropped them all for every other character, with nothing said.
//
// WHAT SUCH A ROW STATES IS READ OFF THE WIKI DATA, NOT THE LOG, and a saved row is as old as its
// save. Copy on a quest-giver row hands over the bullets the page lacks; a bullet the page gained
// since would be a false one. So each row is served only as far as TODAY's catalog still says it:
//   * quest giver: the saved quests the catalog still has that NPC give and its page still does
//     not link (the engine's own rule, gap_index.rs `mob_quest_gaps_of`); none left closes the row.
//   * redirect: today's data still reaches the name only through a redirect to the same page.
//   * zone-titled: the page the row asks for (`zoneTitledPage`) is still absent. A plain page added
//     since is not seen here; that waits for the character's next attach, like a spell row.
// What cannot be confirmed is left out until that character is attached again: the engine then
// files it afresh from today's data.

import { zoneTitledPage, type GapRow } from './gaps'
import { mobKey } from './mobKey'

/** One page of today's committed data, the fields these checks read (a mob or an item record). */
export interface PageNow {
  page: string
  /** The in-game name, when the record states one apart from its title. */
  name?: string
  /** The wiki redirects that land on the page. */
  otherNames?: readonly string[]
  /** A mob page's `|related_quests` links. */
  relatedQuests?: readonly string[]
}

/** Today's committed catalogs, as a saved row about a known page asks them. */
export interface PagesNow {
  /** The record answering to a name, a page title or a redirect; null when the data has none. */
  page: (domain: 'item' | 'mob', name: string) => PageNow | null
  /** The quest pages the quest catalog says the NPC under this mob key gives (`questsByGiver`). */
  givenBy: (giverKey: string) => readonly string[]
}

interface PageRow {
  domain?: unknown
  name?: unknown
  questGaps?: unknown
  viaRedirect?: unknown
  zoneTitled?: unknown
}

/** A row about a name the data knows by design: the name test says nothing about it. */
export function aboutKnownPage(r: PageRow): boolean {
  return r.viaRedirect !== undefined || isQuestRow(r) || (r.domain === 'mob' && r.zoneTitled === true)
}

/** A Mobs row with quest gaps, or the same row served under Merchants (gaps_roles.rs `served_under`). */
const isQuestRow = (r: PageRow): boolean => r.questGaps !== undefined && (r.domain === 'mob' || r.domain === 'merchant')

/** A quest page title as two lists compare it (gap_index.rs `quest_title_key`). */
const questTitleKey = (title: string): string =>
  title.trim().toLowerCase().replace(/`/g, "'").replace(/[?!.]+$/, '').trimEnd()

/** The family page a quest is listed through (gap_index.rs `quest_hub_key`). */
const questHubKey = (key: string): string => `${key.replace(/^the /, '').replace(/ \([^)]*\)$/, '')} quests`

/** The quest pages each giver's mob key gives, off the quest catalog's `giver` (gap_index.rs `quests_by_giver`). */
export function questsByGiver(quests: readonly { name?: string; page?: string; giver?: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const q of quests) {
    const giver = mobKey(q.giver ?? '')
    const page = q.page ?? q.name ?? ''
    if (giver === '' || page.trim() === '') continue
    const given = out.get(giver) ?? []
    if (!given.some((p) => questTitleKey(p) === questTitleKey(page))) given.push(page)
    out.set(giver, given)
  }
  return out
}

/** The saved quests the page still lacks: its NPC still gives them and `|related_quests` still links none of them. */
function stillLacking(p: PageNow, saved: readonly string[], givenBy: PagesNow['givenBy']): string[] {
  const keys = [p.name ?? '', p.page, ...(p.otherNames ?? [])].map(mobKey).filter((k) => k !== '')
  const given = new Set(keys.flatMap((k) => givenBy(k)).map(questTitleKey))
  const listed = new Set((p.relatedQuests ?? []).map(questTitleKey))
  return saved.filter((q) => {
    const key = questTitleKey(q)
    return given.has(key) && !listed.has(key) && !listed.has(questHubKey(key))
  })
}

/** A quest-giver row with the quests its page still lacks, or null when none is left or the page is not found. */
function questRowNow<T extends PageRow>(r: T, name: string, pages: PagesNow): T | null {
  const gaps = r.questGaps as { page?: unknown; quests?: unknown } | null
  if (gaps === null || typeof gaps !== 'object' || typeof gaps.page !== 'string' || !Array.isArray(gaps.quests)) return null
  const saved = gaps.quests.filter((q): q is string => typeof q === 'string')
  const p = [pages.page('mob', gaps.page), pages.page('mob', name)].find((x) => x?.page === gaps.page)
  const quests = p == null ? [] : stillLacking(p, saved, pages.givenBy)
  if (quests.length === 0) return null
  return quests.length === gaps.quests.length ? r : { ...r, questGaps: { page: gaps.page, quests } }
}

/** Whether today's data still reaches the name only through a redirect to the page the row names. */
function stillRedirected(domain: 'item' | 'mob', name: string, to: unknown, pages: PagesNow): boolean {
  const p = pages.page(domain, name)
  if (p === null || p.page !== to) return false
  return mobKey(name) !== mobKey(p.page) && mobKey(name) !== mobKey(p.name ?? '')
}

/** Whether the wiki now has the page a zone-titled row asks for. A row with no zone names no such page. */
function zonePageExists(r: PageRow, name: string, pages: PagesNow): boolean {
  let title: string
  try {
    title = zoneTitledPage(r as GapRow)
  } catch {
    return false
  }
  return mobKey(title) !== mobKey(name) && pages.page('mob', title) !== null
}

/**
 * A saved row about a known page (`aboutKnownPage`) as today's catalogs still state it: the row,
 * a quest-giver row with fewer quests, or null when today's data no longer says it.
 */
export function knownPageRowNow<T extends PageRow>(r: T, pages: PagesNow): T | null {
  if (typeof r.name !== 'string') return r
  if (isQuestRow(r)) return questRowNow(r, r.name, pages)
  if (r.domain !== 'item' && r.domain !== 'mob') return r
  if (r.viaRedirect !== undefined) return stillRedirected(r.domain, r.name, r.viaRedirect, pages) ? r : null
  return zonePageExists(r, r.name, pages) ? null : r
}
