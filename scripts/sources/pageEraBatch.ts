/** Batch helpers for scripts/scrape-page-era.ts, kept apart so they can be tested offline. */
import { pageEraKey } from '../../src/main/pageEraDb'

export interface RevPage {
  title: string
  missing?: boolean
  revisions?: { slots?: { main?: { content?: string } } }[]
}

/** A `prop=revisions` batch as cached. */
export interface RevBatch {
  pages: RevPage[]
}

/** Each requested title's wikitext, matched by key: the API answers 'a minnow' as 'A minnow'. */
export function wikitextByRequested(slice: readonly string[], batch: RevBatch): Map<string, string> {
  const byKey = new Map<string, string>()
  for (const p of batch.pages) {
    const wt = p.revisions?.[0]?.slots?.main?.content
    if (wt != null) byKey.set(pageEraKey(p.title), wt)
  }
  const out = new Map<string, string>()
  for (const t of slice) {
    const wt = byKey.get(pageEraKey(t))
    if (wt !== undefined) out.set(t, wt)
  }
  return out
}
