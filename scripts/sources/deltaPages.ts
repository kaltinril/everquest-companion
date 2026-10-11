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
  logtype?: string
  logaction?: string
  logparams?: { target_title?: string }
}

/**
 * Edits and creations name a page to re-read. So does every log row (move source and target,
 * delete, restore, merge, import): the page's current state, read back, is the log applied.
 */
export function foldRcRow(rc: RcRow, seen: Set<string>, logs: PageLogEvent[]): void {
  seen.add(rc.title)
  if (rc.type !== 'log') return
  const target = rc.logparams?.target_title
  if (target) seen.add(target)
  if (rc.logtype !== 'move' && rc.logtype !== 'delete') return
  logs.push({ logtype: rc.logtype, logaction: rc.logaction ?? '', title: rc.title, target })
}

export interface RevPage {
  title: string
  missing?: boolean
  invalid?: boolean
  revisions?: { slots?: { main?: { content?: string } } }[]
}

/** Read pages: wikitext, or null for a page that no longer exists. */
export type PageTexts = Map<string, string | null>

/**
 * One revisions response into `out`. A page that exists but came back without content (a hidden
 * revision) cannot be applied: it goes to `unapplied`, and the run does not stamp past it.
 */
export function readRevPages(pages: RevPage[], out: PageTexts, unapplied: string[]): void {
  for (const p of pages) {
    const wt = p.revisions?.[0]?.slots?.main?.content
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
