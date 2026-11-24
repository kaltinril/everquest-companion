// dropObs/client.ts — the wiki API calls behind the drop-database submission, and nothing else:
// sign in with a Bot password (`action=login`), check the account (`meta=userinfo`), take a CSRF
// token, then `action=eozobservations` `operation=status` / `operation=submit`
// (docs/community/requirements/drop-db-submit.md; the spec is the wiki's API_Documentation,
// "Authentication" and "Private kill/loot observations: schema 1").
//
// Electron-free and network-free by itself: the caller hands in `fetch`, so the tests stub it and
// send nothing. The session's cookies live in this object's memory and nowhere else; the password
// goes in a POST body and is never logged, thrown or written.
//
// Every request names the fork (WIKI_UA), is spaced at least a second from the one before it, and is
// counted in this machine's wiki ledger under `drop observations` (wikiUsage.ts). tests/wikiTraffic
// pins this file as the one door to `action=eozobservations`.

import { WIKI_API } from '../wikiClient'
import { recordAppWikiCall, WIKI_UA } from '../wikiUsage'
import type { ObservationBatch } from './events'

export const FEATURE = 'drop observations'

export type FetchLike = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>

/** A definite answer from the wiki that refused the call (an API error code, or a failed login). */
export class WikiRefusal extends Error {
  constructor(
    readonly code: string,
    info: string
  ) {
    super(`${code}: ${info}`)
  }
}

/** No definite answer: the network failed, timed out, or the server answered 429/5xx. */
export class WikiUncertain extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterMs: number | null = null
  ) {
    super(code)
  }
}

export interface Account {
  id: number
  name: string
}

export interface ObsLimits {
  events: number
  bytes: number
  eventBytes: number
  hourlyBatches: number
}

export interface StatusReply {
  enabled: boolean
  available: boolean
  account: Account
  limits: ObsLimits
}

export interface SubmitReply {
  batchId: string
  account: Account
  accepted: string[]
  duplicates: string[]
  conflicts: string[]
  rejected: { id: string; code: string }[]
}

export interface ObsClientOptions {
  fetch: FetchLike
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** At least this long between two requests (1 s: the wiki's rule for us). */
  spacingMs?: number
  timeoutMs?: number
}

export interface ObsClient {
  /** Sign in and check the account: named, not temporary, not blocked. Throws WikiRefusal otherwise. */
  signIn(username: string, password: string): Promise<Account>
  /** The account signed in on this session, or null. */
  account(): Account | null
  status(): Promise<StatusReply>
  submit(batch: ObservationBatch): Promise<SubmitReply>
  /** Drop the session: cookies, token and account. */
  forget(): void
}

type Json = Record<string, unknown>

const obj = (v: unknown): Json => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The API error a JSON body carries (`error`, or formatversion 2's `errors[0]`), or null. */
function apiError(body: Json): { code: string; info: string } | null {
  const e = 'error' in body ? obj(body.error) : Array.isArray(body.errors) ? obj(body.errors[0]) : null
  if (e === null) return null
  return { code: str(e.code) || 'unknown', info: str(e.info) || str(e.text) || str(e['*']) }
}

function retryAfter(res: Response): number | null {
  const s = Number(res.headers.get('retry-after'))
  return Number.isFinite(s) && s > 0 ? s * 1000 : null
}

function setCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof h.getSetCookie === 'function') return h.getSetCookie()
  const one = h.get('set-cookie')
  return one === null ? [] : [one]
}

/** The cookie jar: name → value, for the one host. An expired or deleted cookie leaves it. */
function absorbCookies(jar: Map<string, string>, res: Response): void {
  for (const line of setCookies(res)) {
    const [pair, ...attrs] = line.split(';')
    const at = pair.indexOf('=')
    if (at <= 0) continue
    const name = pair.slice(0, at).trim()
    const gone = attrs.some((a) => /^\s*max-age\s*=\s*(0|-)/i.test(a) || (/^\s*expires\s*=/i.test(a) && Date.parse(a.split('=')[1]) < Date.now()))
    if (gone) jar.delete(name)
    else jar.set(name, pair.slice(at + 1).trim())
  }
}

function kindOf(params: Record<string, string>): string {
  const sub = params.operation ?? params.meta ?? (params.action === 'query' ? params.type : undefined)
  return sub ? `${params.action}/${sub}` : params.action
}

function asAccount(v: unknown): Account | null {
  const a = obj(v)
  return typeof a.id === 'number' && typeof a.name === 'string' && a.name !== '' ? { id: a.id, name: a.name } : null
}

function asLimits(v: unknown): ObsLimits {
  const l = obj(v)
  const n = (x: unknown, d: number): number => (typeof x === 'number' && x > 0 ? x : d)
  return { events: n(l.events, 100), bytes: n(l.bytes, 262_144), eventBytes: n(l.eventBytes, 4096), hourlyBatches: n(l.hourlyBatches, 120) }
}

/** The submit receipt, or null when it is not one (the caller then treats the answer as uncertain). */
export function asSubmitReply(body: Json): SubmitReply | null {
  const r = obj(body.eozobservations)
  const account = asAccount(r.account)
  const lists = [r.accepted, r.duplicates, r.conflicts, r.rejected]
  if (account === null || typeof r.batchId !== 'string' || !lists.every(Array.isArray)) return null
  const ids = (v: unknown): string[] => (v as unknown[]).filter((x): x is string => typeof x === 'string')
  const rejected = (r.rejected as unknown[]).map((x) => ({ id: str(obj(x).id), code: str(obj(x).code) || 'rejected' }))
  return { batchId: r.batchId, account, accepted: ids(r.accepted), duplicates: ids(r.duplicates), conflicts: ids(r.conflicts), rejected }
}

export function createObsClient(opts: ObsClientOptions): ObsClient {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  const spacing = opts.spacingMs ?? 1000
  const timeoutMs = opts.timeoutMs ?? 30_000
  const jar = new Map<string, string>()
  let lastAt = -Infinity
  let csrf: string | null = null
  let who: Account | null = null

  async function send(method: 'GET' | 'POST', params: Record<string, string>): Promise<Json> {
    const wait = lastAt + spacing - now()
    if (wait > 0) await sleep(wait)
    lastAt = now()
    const query = new URLSearchParams({ ...params, format: 'json', formatversion: '2' }).toString()
    const url = method === 'GET' ? `${WIKI_API}?${query}` : WIKI_API
    const headers: Record<string, string> = { 'User-Agent': WIKI_UA }
    if (jar.size > 0) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const t0 = now()
    const note = (status: number | null, bytes: number): void =>
      recordAppWikiCall({ feature: FEATURE, kind: kindOf(params), url: WIKI_API, status, bytes, ms: now() - t0 })
    let res: Response
    let text: string
    try {
      res = await opts.fetch(url, { method, headers, body: method === 'POST' ? query : undefined, signal: AbortSignal.timeout(timeoutMs) })
      text = await res.text()
    } catch {
      note(null, 0)
      throw new WikiUncertain('eqc-network')
    }
    note(res.status, Buffer.byteLength(text, 'utf8'))
    absorbCookies(jar, res)
    if (res.status === 429 || res.status >= 500) throw new WikiUncertain(`eqc-http-${String(res.status)}`, retryAfter(res))
    let body: Json
    try {
      body = obj(JSON.parse(text))
    } catch {
      throw new WikiUncertain(`eqc-not-json-${String(res.status)}`)
    }
    const err = apiError(body)
    if (err !== null) throw new WikiRefusal(err.code, err.info)
    return body
  }

  async function token(type: 'login' | 'csrf'): Promise<string> {
    const body = await send('GET', { action: 'query', meta: 'tokens', type })
    const t = str(obj(obj(body.query).tokens)[`${type}token`])
    if (t === '') throw new WikiRefusal('eqc-no-token', `the wiki gave no ${type} token`)
    return t
  }

  /** A CSRF-protected POST as the signed-in account; a stale token is refreshed once. */
  async function write(params: Record<string, string>): Promise<Json> {
    if (who === null) throw new WikiRefusal('eoz-login', 'not signed in')
    for (let attempt = 0; ; attempt++) {
      csrf ??= await token('csrf')
      try {
        return await send('POST', { ...params, token: csrf, assert: 'user', assertuser: who.name })
      } catch (e) {
        if (!(e instanceof WikiRefusal) || e.code !== 'badtoken' || attempt > 0) throw e
        csrf = null
      }
    }
  }

  async function signIn(username: string, password: string): Promise<Account> {
    jar.clear()
    csrf = null
    who = null
    const lgtoken = await token('login')
    const body = await send('POST', { action: 'login', lgname: username, lgpassword: password, lgtoken })
    const login = obj(body.login)
    if (login.result !== 'Success') {
      const reason = obj(login.reason)
      throw new WikiRefusal('eqc-login-failed', str(login.reason) || str(reason.text) || str(reason.code) || str(login.result) || 'sign-in failed')
    }
    const info = obj(obj((await send('GET', { action: 'query', meta: 'userinfo', uiprop: 'rights|blockinfo' })).query).userinfo)
    const account = asAccount(info)
    if (account === null || account.id === 0 || 'anon' in info || info.temp === true) throw new WikiRefusal('eoz-login', 'the wiki did not sign this account in')
    if ('blockid' in info) throw new WikiRefusal('eoz-blocked', 'this wiki account is blocked')
    who = account
    return account
  }

  async function status(): Promise<StatusReply> {
    const r = obj((await write({ action: 'eozobservations', operation: 'status' })).eozobservations)
    const account = asAccount(r.account) ?? who
    if (account === null) throw new WikiUncertain('eqc-bad-status')
    return { enabled: r.enabled === true, available: r.available === true, account, limits: asLimits(r.limits) }
  }

  async function submit(batch: ObservationBatch): Promise<SubmitReply> {
    const body = await write({ action: 'eozobservations', operation: 'submit', batch: JSON.stringify(batch) })
    const reply = asSubmitReply(body)
    if (reply === null) throw new WikiUncertain('eqc-bad-receipt')
    return reply
  }

  return {
    signIn,
    account: () => who,
    status,
    submit,
    forget: () => {
      jar.clear()
      csrf = null
      who = null
    }
  }
}
