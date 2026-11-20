// tabs.ts — which tabs a published Google Sheet has, read from its `pubhtml` page, and how a tab
// or table name maps to a tradeskill and to a file name. The page is Google's script around the
// author's tab names: only the `items.push({name: "...", ... gid: "..."})` entries are read, as
// text, and nothing on the page is run.

import { tradeskillOf, type Tradeskill } from '../../../src/shared/tradeskills'
import { PullRefusal } from './rules'

export interface SheetTab {
  name: string
  gid: string
}

/** More tabs than this is not the guide we know (11 on 2026-11-20). */
export const MAX_TABS = 40

const ENTRY = /items\.push\(\{\s*name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d{1,20})"/g
const SIMPLE_ESCAPE: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' }

/** A JavaScript string literal's body as text, by hand: `\x3d`, `'`, `\/`, `\"`. */
function unescapeJs(body: string): string {
  return body.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|([\s\S]))/g, (_, x?: string, u?: string, ch?: string) => {
    const hex = x ?? u
    if (hex !== undefined) return String.fromCharCode(Number.parseInt(hex, 16))
    return SIMPLE_ESCAPE[ch ?? ''] ?? ch ?? ''
  })
}

/** The tabs of a published sheet, in the order the page lists them. */
export function parseTabList(html: string, what = 'the tab list page'): SheetTab[] {
  const tabs: SheetTab[] = []
  for (const m of html.matchAll(ENTRY)) tabs.push({ name: unescapeJs(m[1]).trim(), gid: m[2] })
  if (tabs.length === 0) throw new PullRefusal('response', `${what}: no tab entry found (not the published sheet's page, or its layout changed)`)
  if (tabs.length > MAX_TABS) throw new PullRefusal('response', `${what}: ${String(tabs.length)} tabs listed, over the limit of ${String(MAX_TABS)}`)
  const names = new Set(tabs.map((t) => t.name))
  if (names.size !== tabs.length) throw new PullRefusal('layout', `${what}: two tabs share one name`)
  return tabs
}

/** The page's own title, without Google's suffix. */
export function pageTitle(html: string): string | undefined {
  const m = /<title>([^<]{1,200})<\/title>/i.exec(html)
  if (m === null) return undefined
  const title = m[1].replace(/\s+-\s+Google (?:Drive|Sheets|Docs)\s*$/i, '').trim()
  return title === '' ? undefined : title
}

/** The tradeskill a tab or table is for: `Jewelcrafting`, `Jewel_Crafting`, `Jewelry Making`. */
export function foldTradeskill(name: string): Tradeskill | undefined {
  const s = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return tradeskillOf(s) ?? tradeskillOf(s.replace(/ /g, ''))
}

/** A file name for a tab: letters, digits, `_` and `-` only, so a tab name never names a path. */
export function slugOf(name: string): string {
  const slug = name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return slug === '' ? 'tab' : slug
}
