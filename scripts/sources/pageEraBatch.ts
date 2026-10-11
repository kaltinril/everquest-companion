/** Batch helpers for scripts/scrape-page-era.ts, kept apart so they can be tested offline. */
import { pageEraKey } from '../../src/main/pageEraDb'
import { eraBadge, namesEra } from '../../src/shared/planner/era'

export interface RevPage {
  title: string
  missing?: boolean
  revisions?: { slots?: { main?: { content?: string } } }[]
}

export interface TitleMap {
  from: string
  to: string
}

/** A `query` batch as cached: the pages plus the title rewrites the API applied (`redirects=1`). */
export interface RevBatch<P = RevPage> {
  pages: P[]
  normalized?: TitleMap[]
  redirects?: TitleMap[]
}

const contentOf = (p: RevPage): string | undefined => p.revisions?.[0]?.slots?.main?.content

/** The key of the page the API answered a requested title with, through normalization then redirect. */
export function answeredKey(title: string, batch: Omit<RevBatch<unknown>, 'pages'>): string {
  let key = pageEraKey(title)
  for (const hops of [batch.normalized, batch.redirects]) {
    const hop = hops?.find((m) => pageEraKey(m.from) === key)
    if (hop !== undefined) key = pageEraKey(hop.to)
  }
  return key
}

/** Each requested title's wikitext, matched by key: the API answers 'a minnow' as 'A minnow'. */
export function wikitextByRequested(slice: readonly string[], batch: RevBatch): Map<string, string> {
  const byKey = new Map<string, string>()
  for (const p of batch.pages) {
    const wt = contentOf(p)
    if (wt != null) byKey.set(pageEraKey(p.title), wt)
  }
  const out = new Map<string, string>()
  for (const t of slice) {
    const wt = byKey.get(answeredKey(t, batch))
    if (wt !== undefined) out.set(t, wt)
  }
  return out
}

export interface CatPage {
  title: string
  missing?: boolean
  categories?: { title: string }[]
}

/** Each requested title's out-of-era verdict from its (redirect-resolved) page's era categories. */
export function categoryVerdicts(slice: readonly string[], batch: RevBatch<CatPage>): Map<string, boolean> {
  const byKey = new Map<string, boolean>()
  for (const p of batch.pages) {
    const tokens = (p.categories ?? []).flatMap((c) => {
      const m = /^Category:\s*(.+?)[ _]+Era$/i.exec(c.title)
      return m === null ? [] : [m[1].replace(/[_\s]+/g, ' ').trim()]
    })
    byKey.set(pageEraKey(p.title), tokens.some((t) => namesEra(t) && eraBadge(t) === 'out'))
  }
  const out = new Map<string, boolean>()
  for (const t of slice) {
    const v = byKey.get(answeredKey(t, batch))
    if (v !== undefined) out.set(pageEraKey(t), v)
  }
  return out
}

/**
 * A cached revisions batch, or null to refetch. A bare page array predates `redirects=1`; it is
 * still exact when every page is content or missing and none is a #REDIRECT stub.
 */
export function asRevBatch<P = RevPage>(cached: unknown): RevBatch<P> | null {
  if (cached === null || typeof cached !== 'object') return null
  if (!Array.isArray(cached)) return Array.isArray((cached as RevBatch).pages) ? (cached as RevBatch<P>) : null
  const pages = cached as P[]
  const exact = (cached as RevPage[]).every((p) => {
    const wt = contentOf(p)
    return wt === undefined ? p.missing === true : !/^\s*#redirect/i.test(wt)
  })
  return exact ? { pages } : null
}
