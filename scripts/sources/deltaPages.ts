// deltaPages.ts — scrape-delta.mts's pure halves: the change feed's rows, the revisions response,
// and the mob fold. No network, no files.

import { isMobPage, parseMobPage } from './mobPage'

/** A move or delete in ns0: listed for the record; its titles are re-read like any edit. */
export interface PageLogEvent {
  logtype: string
  logaction: string
  title: string
  target?: string
}

export interface RcRow {
  type: string
  title: string
  /** 0 for a row whose page no longer exists (a deletion) */
  pageid?: number
  logtype?: string
  logaction?: string
  logparams?: { target_title?: string }
}

/** What the feed says to re-read: edited pages by id, titles named by log rows by title. */
export interface FeedChanges {
  pageids: Set<number>
  titles: Set<string>
  logs: PageLogEvent[]
  /** every row's title as the feed gave it (the dry run's census) */
  named: Set<string>
}

export const emptyFeed = (): FeedChanges => ({
  pageids: new Set(),
  titles: new Set(),
  logs: [],
  named: new Set()
})

/**
 * An edit or creation is re-read by pageid, so a page moved since comes back under its current
 * title. Every log row (move source and target, delete, restore, merge, import) names titles to
 * re-read: the page's current state, read back, is the log applied.
 */
export function foldRcRow(rc: RcRow, feed: FeedChanges): void {
  feed.named.add(rc.title)
  if (rc.type !== 'log') {
    if (rc.pageid) feed.pageids.add(rc.pageid)
    else feed.titles.add(rc.title)
    return
  }
  feed.titles.add(rc.title)
  const target = rc.logparams?.target_title
  if (target) feed.titles.add(target)
  if (rc.logtype !== 'move' && rc.logtype !== 'delete') return
  feed.logs.push({ logtype: rc.logtype, logaction: rc.logaction ?? '', title: rc.title, target })
}

export interface RevPage {
  /** absent on a pageid that no longer exists */
  title?: string
  ns?: number
  missing?: boolean
  invalid?: boolean
  revisions?: { slots?: { main?: { content?: string } } }[]
}

/** Read pages: wikitext, or null for a page that no longer exists. */
export type PageTexts = Map<string, string | null>

/**
 * One revisions response into `out`. A page that exists but came back without content (a hidden
 * revision) cannot be applied: it goes to `unapplied`, and the run does not stamp past it. A
 * deleted pageid (no title) or a page moved out of ns0 is skipped: its log row's titles say it.
 */
export function readRevPages(pages: RevPage[], out: PageTexts, unapplied: string[]): void {
  for (const p of pages) {
    const wt = p.revisions?.[0]?.slots?.main?.content
    if (p.title === undefined || (p.ns ?? 0) !== 0) continue
    if (p.missing && !p.invalid) out.set(p.title, null)
    else if (wt != null) out.set(p.title, wt)
    else unapplied.push(p.title)
  }
}

/** scrapedAt moves to now only when every change in the window was applied. */
export function nextScrapedAt(prev: string, unapplied: string[], now: string): string {
  return unapplied.length > 0 ? prev : now
}

export interface MobFold<T> {
  byPage: Map<string, T | { page: string }>
  folded: number
  /** committed mob pages that no longer read as a mob (gone, a redirect, template removed) */
  removed: string[]
}

/** Mobs: keyed by page over the committed list; a read page that is no mob now leaves it. */
export function foldMobs<T extends { page: string }>(mobs: T[], pages: PageTexts): MobFold<T> {
  const byPage = new Map<string, T | { page: string }>(mobs.map((m) => [m.page, m]))
  let folded = 0
  const removed: string[] = []
  for (const [title, wt] of pages) {
    const entry = wt != null && isMobPage(wt) ? parseMobPage(title, wt) : null
    if (entry) {
      byPage.set(title, entry)
      folded++
    } else if (byPage.delete(title)) removed.push(title)
  }
  return { byPage, folded, removed }
}
