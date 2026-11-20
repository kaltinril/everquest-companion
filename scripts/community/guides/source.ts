// source.ts — where a pull's bytes come from: Google (the real pull, at release time, on the
// developer's machine) or a folder of files (tests, and the first copy). Every response has a size
// and a time limit and must be the type that was asked for; a request carries no cookie, no
// account and nothing that names this project or its owner.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ODS_DOWNLOAD_URL, SHEET_PAGE_URL, sheetCsvUrl, type RawPull } from './build'
import { decodeUtf8 } from './csv'
import { PullRefusal, refusalOf } from './rules'
import { pageTitle, parseTabList, slugOf, type SheetTab } from './tabs'

/** Size limits per response. On 2026-11-20: page 68 KB, largest tab 2.6 KB, the .ods 27 KB. */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024
export const MAX_TAB_BYTES = 256 * 1024
export const MAX_ODS_BYTES = 4 * 1024 * 1024
/** One response, headers to last byte. */
export const TIMEOUT_MS = 30_000
/** Between one response and the next request. */
export const PAUSE_MS = 1000
const MAX_REDIRECTS = 5
const USER_AGENT = 'guides-pull/1.0'
/** Google's own hosts: where the two sources live and where they redirect a download. */
const ALLOWED_HOST = /^(?:docs\.google\.com|drive\.google\.com|drive\.usercontent\.google\.com|[a-z0-9-]+\.googleusercontent\.com)$/

export interface GuideSource {
  page: () => Promise<Uint8Array>
  tab: (tab: SheetTab) => Promise<Uint8Array>
  ods: () => Promise<Uint8Array>
}

export function checkSize(bytes: Uint8Array, max: number, what: string): Uint8Array {
  if (bytes.byteLength === 0) throw new PullRefusal('response', `${what}: the response is empty`)
  if (bytes.byteLength > max) throw new PullRefusal('response', `${what}: ${String(bytes.byteLength)} bytes, over the limit of ${String(max)}`)
  return bytes
}

// ---- the network ------------------------------------------------------------------------------------

interface Wanted {
  what: string
  maxBytes: number
  /** The Content-Type the answer must (or, `not`, must not) carry. */
  type?: string
  notType?: string
}

async function followRedirects(url: string, what: string, signal: AbortSignal): Promise<Response> {
  let next = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(next)
    if (u.protocol !== 'https:' || !ALLOWED_HOST.test(u.hostname)) throw new PullRefusal('response', `${what}: redirected to a host that is not Google's (${u.hostname})`)
    const res = await fetch(u, { redirect: 'manual', signal, credentials: 'omit', headers: { 'User-Agent': USER_AGENT, Accept: '*/*' } })
    const location = res.headers.get('location')
    if (res.status < 300 || res.status >= 400 || location === null) return res
    await res.body?.cancel()
    next = new URL(location, u).href
  }
  throw new PullRefusal('response', `${what}: more than ${String(MAX_REDIRECTS)} redirects`)
}

async function readCapped(res: Response, w: Wanted): Promise<Uint8Array> {
  const declared = Number.parseInt(res.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declared) && declared > w.maxBytes) throw new PullRefusal('response', `${w.what}: ${String(declared)} bytes announced, over the limit of ${String(w.maxBytes)}`)
  const reader = res.body?.getReader()
  if (reader === undefined) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    total += part.value.byteLength
    if (total > w.maxBytes) {
      await reader.cancel()
      throw new PullRefusal('response', `${w.what}: over the limit of ${String(w.maxBytes)} bytes`)
    }
    chunks.push(part.value)
  }
  return Buffer.concat(chunks)
}

async function get(url: string, w: Wanted): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  try {
    const res = await followRedirects(url, w.what, signal)
    if (res.status !== 200) throw new PullRefusal('response', `${w.what}: HTTP ${String(res.status)}`)
    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    if (w.type !== undefined && !type.includes(w.type)) throw new PullRefusal('response', `${w.what}: expected ${w.type}, the server sent "${type}"`)
    if (w.notType !== undefined && type.includes(w.notType)) throw new PullRefusal('response', `${w.what}: the server sent "${type}" (a sign-in or error page?)`)
    return checkSize(await readCapped(res, w), w.maxBytes, w.what)
  } catch (e) {
    if (e instanceof PullRefusal) throw e
    const why = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    throw new PullRefusal('response', `${w.what}: the request failed or ran past ${String(TIMEOUT_MS / 1000)} s (${why})`)
  }
}

/** The two sources on Google, one request at a time with a pause between. */
export function networkSource(sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): GuideSource {
  let sent = 0
  const paced = async (url: string, w: Wanted): Promise<Uint8Array> => {
    if (sent++ > 0) await sleep(PAUSE_MS)
    return get(url, w)
  }
  return {
    page: () => paced(SHEET_PAGE_URL, { what: 'the tab list page', maxBytes: MAX_PAGE_BYTES, type: 'text/html' }),
    tab: (tab) => paced(sheetCsvUrl(tab.gid), { what: `sheet tab "${tab.name}"`, maxBytes: MAX_TAB_BYTES, type: 'text/csv' }),
    ods: () => paced(ODS_DOWNLOAD_URL, { what: 'the recipe book (.ods)', maxBytes: MAX_ODS_BYTES, notType: 'text/html' })
  }
}

// ---- a folder ---------------------------------------------------------------------------------------

export const PAGE_FILE = 'pubhtml.html'
export const ODS_FILE = 'kornerstore.ods'
export const tabFile = (tab: SheetTab): string => `sheet/${slugOf(tab.name)}.csv`

/** `pubhtml.html`, `sheet/<Tab>.csv` and `kornerstore.ods` in a folder, read as if fetched. */
export function folderSource(dir: string): GuideSource {
  const read = (rel: string, what: string): Promise<Uint8Array> => {
    const path = join(dir, rel)
    if (!existsSync(path)) return Promise.reject(new PullRefusal('response', `${what}: no file ${rel} in ${dir}`))
    return Promise.resolve(new Uint8Array(readFileSync(path)))
  }
  return {
    page: () => read(PAGE_FILE, 'the tab list page'),
    tab: (tab) => read(tabFile(tab), `sheet tab "${tab.name}"`),
    ods: () => read(ODS_FILE, 'the recipe book (.ods)')
  }
}

// ---- one pull ---------------------------------------------------------------------------------------

/** Everything the source has, each piece inside its limits. A piece that fails is a refusal, not a throw. */
export async function collect(source: GuideSource): Promise<RawPull> {
  const raw: RawPull = { tabs: [], refusals: [] }
  const attempt = async <T>(f: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await f()
    } catch (e) {
      const r = refusalOf(e)
      if (r === undefined) throw e
      raw.refusals.push(r)
      return undefined
    }
  }
  const tabs = await attempt(async () => {
    const html = decodeUtf8(checkSize(await source.page(), MAX_PAGE_BYTES, 'the tab list page'), 'the tab list page')
    raw.title = pageTitle(html)
    return parseTabList(html)
  })
  for (const tab of tabs ?? []) {
    const bytes = await attempt(async () => checkSize(await source.tab(tab), MAX_TAB_BYTES, `sheet tab "${tab.name}"`))
    if (bytes !== undefined) raw.tabs.push({ ...tab, bytes })
  }
  raw.ods = await attempt(async () => checkSize(await source.ods(), MAX_ODS_BYTES, 'the recipe book (.ods)'))
  return raw
}
