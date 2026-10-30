// deltaExtra.ts — pages the change feed cannot name: wiki pages our scrape never listed and nobody has
// edited since (owner, 2026-10-29: Cracked Darkwood Shield). `--titles-from-compare[=<report>]` takes
// eoz-compare's `toRead`, `--extra=<A|B>` names titles by hand; each is read by title with the feed's
// own title reads (50 a request) and folded like a page edited now.

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { FeedChanges, PageTexts } from './deltaPages'

export interface ExtraOptions {
  /** titles named by hand */
  extra: string[]
  /** an eoz-compare report to take `toRead` from; '' for the newest in the checkout's eoz cache */
  fromCompare: string | null
}

/** The newest eoz-compare report in `dir`. */
export function newestReport(dir: string): string {
  const reports = existsSync(dir) ? readdirSync(dir).filter((n) => /^report-.*\.json$/.test(n)) : []
  if (reports.length === 0) throw new Error(`no eoz-compare report in ${dir}: run npx tsx scripts/eoz-compare.mts first`)
  const mtime = (n: string): number => statSync(join(dir, n)).mtimeMs
  return join(dir, reports.sort((a, b) => mtime(b) - mtime(a))[0])
}

interface ReportShape {
  toRead?: { items?: string[]; linked?: string[]; mobs?: string[] }
  items?: { missingUnlisted?: string[] }
  mobs?: { missingUnlisted?: string[] }
}

/** The report's never-listed pages; a report from before `toRead` gives its never-listed pack titles. */
export function compareTitles(path: string): string[] {
  const r = JSON.parse(readFileSync(path, 'utf8')) as ReportShape
  if (r.toRead) return [...(r.toRead.items ?? []), ...(r.toRead.linked ?? []), ...(r.toRead.mobs ?? [])]
  return [...(r.items?.missingUnlisted ?? []), ...(r.mobs?.missingUnlisted ?? [])]
}

/** The run's extra titles, once each, less the pages items.json or mobs.json already hold (a stale report). */
export function extraTitles(opts: ExtraOptions, root: string, held: (title: string) => boolean): string[] {
  const report = opts.fromCompare === null ? null : opts.fromCompare || newestReport(join(root, 'scripts/sources/cache/eoz'))
  const named = [...opts.extra, ...(report ? compareTitles(report) : [])].map((t) => t.trim()).filter(Boolean)
  const titles = [...new Set(named)].filter((t) => !held(t))
  if (report) console.log(`Never-listed pages from ${report}`)
  if (named.length > 0) console.log(`  ${titles.length} extra titles to read (${named.length - titles.length} already held): ${titles.join(' | ')}`)
  return titles
}

/**
 * Into the feed as titles changed `at` (now), so every window wants them and they are read and folded
 * like an edit. A title the feed already names is left as the feed has it.
 */
export function addExtra(feed: FeedChanges, titles: string[], at: string): void {
  const edited = new Set(feed.pageTitle.values())
  for (const t of titles) {
    if (feed.titles.has(t) || edited.has(t)) continue
    feed.titles.add(t)
    feed.named.add(t)
    feed.titleTime.set(t, at)
  }
}

/** What became of each extra title; a page with no item or mob box is fixed on the wiki, not folded. */
export function extraReport(titles: string[], pages: PageTexts, folded: ReadonlySet<string>): string[] {
  if (titles.length === 0) return []
  const lines = ['Extra titles (never listed by our scrape):']
  for (const t of titles) {
    const wt = pages.get(t)
    let what = 'no item or mob template: kept as a page, not folded (fix it on the wiki if it is one)'
    if (wt === undefined) what = 'not read (no readable content)'
    else if (wt === null) what = 'no such page'
    else if (folded.has(t)) what = 'folded'
    else if (/^\s*#REDIRECT/i.test(wt)) what = 'a redirect, landing on no mob'
    lines.push(`  ${t}: ${what}`)
  }
  return lines
}
