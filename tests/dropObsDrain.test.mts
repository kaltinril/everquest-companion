// The drop-database client and drain (src/main/dropObs/client.ts, drain.ts) against a scripted fake
// wiki: sign-in, status, the receipt's bookkeeping, a stale token, backoff, and the batch in flight
// resent exactly. `fetch` is a stub; nothing here reaches a network.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createObsClient, type FetchLike } from '../src/main/dropObs/client'
import { drainOnce, newStatusCache, type DrainDeps } from '../src/main/dropObs/drain'
import { obsEvents, type ObsEvent } from '../src/main/dropObs/events'
import { defaultState, loadState, saveState, type ObsState } from '../src/main/dropObs/state'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetWikiUsage, wikiUsageSummary, WIKI_UA } from '../src/main/wikiUsage'

const T0 = Date.parse('2026-11-23T12:00:00.000Z')
let t = T0
const now = (): number => t

interface Seen {
  method: string
  url: string
  params: Record<string, string>
  headers: Record<string, string>
}
type Answer = { status?: number; body?: unknown; cookie?: string } | 'network'
type Handler = (p: Record<string, string>, n: number) => Answer | undefined

let seen: Seen[] = []
let handler: Handler = () => undefined

const ACCOUNT = { id: 42, name: 'Kaltinril' }

/** The wiki's happy answers; a test's handler answers first and falls through to these. */
function happy(p: Record<string, string>): Answer {
  if (p.meta === 'tokens' && p.type === 'login') return { body: { query: { tokens: { logintoken: 'LT+\\' } } }, cookie: 'eqlwiki_session=abc; path=/; HttpOnly' }
  if (p.action === 'login') return { body: { login: { result: 'Success', lgusername: 'Kaltinril' } }, cookie: 'eqlwikiUserID=42; path=/' }
  if (p.meta === 'userinfo') return { body: { query: { userinfo: { id: 42, name: 'Kaltinril', rights: ['eoz-submit-observations'] } } } }
  if (p.meta === 'tokens' && p.type === 'csrf') return { body: { query: { tokens: { csrftoken: 'CSRF+\\' } } } }
  if (p.operation === 'status') return { body: { eozobservations: { schemaVersion: 1, enabled: true, available: true, account: ACCOUNT, limits: { events: 100, bytes: 262144, eventBytes: 4096, hourlyBatches: 120 } } } }
  if (p.operation === 'submit') {
    const batch = JSON.parse(p.batch) as { batchId: string; events: { id: string }[] }
    return { body: { eozobservations: { schemaVersion: 1, batchId: batch.batchId, account: ACCOUNT, accepted: batch.events.map((e) => e.id), duplicates: [], conflicts: [], rejected: [], receivedAt: '2026-11-23T12:00:01Z' } } }
  }
  return { status: 400, body: { error: { code: 'unexpected', info: JSON.stringify(p) } } }
}

const fakeFetch: FetchLike = (url, init) => {
  const params = Object.fromEntries(new URLSearchParams(init.method === 'GET' ? url.split('?')[1] : init.body))
  seen.push({ method: init.method, url, params, headers: init.headers })
  const n = seen.filter((s) => s.params.action === params.action && s.params.operation === params.operation && s.params.type === params.type).length
  const a = handler(params, n) ?? happy(params)
  if (a === 'network') return Promise.reject(new Error('socket hang up'))
  const headers = new Headers({ 'content-type': 'application/json' })
  if (a.cookie !== undefined) headers.append('set-cookie', a.cookie)
  return Promise.resolve(new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers }))
}

const submits = (): Seen[] => seen.filter((s) => s.params.operation === 'submit')

const rows = (n: number, from = 0): { ts: number; item: string; source: string; zone: string }[] =>
  Array.from({ length: n }, (_, i) => ({ ts: T0 - (from + i + 1) * 60_000, item: `Item ${String(from + i)}`, source: 'a rat', zone: 'Befallen' }))

function setup(events: ObsEvent[]): { deps: DrainDeps; state: ObsState; saves: string[] } {
  const state = { ...defaultState(), enabled: true, username: 'Kaltinril@companion', passwordEnc: 'x' }
  const saves: string[] = []
  const client = createObsClient({ fetch: fakeFetch, now, sleep: (ms) => Promise.resolve(void (t += ms)) })
  let list = events
  const deps: DrainDeps = {
    state,
    save: () => saves.push(JSON.stringify(state)),
    client,
    events: () => list,
    credentials: () => Promise.resolve({ username: 'Kaltinril@companion', password: 's3cret-pass' }),
    clientVersion: 'everquest-companion/0.1.0-test',
    now,
    cache: newStatusCache()
  }
  Object.defineProperty(deps, 'setEvents', { value: (e: ObsEvent[]) => (list = e) })
  return { deps, state, saves }
}
const ctx = { server: 'freeport', character: 'Primitive', players: new Set<string>(), now: T0 }
const events = (n: number, from = 0): ObsEvent[] => obsEvents(rows(n, from), ctx)

beforeEach(() => {
  t = T0
  seen = []
  handler = () => undefined
  resetWikiUsage()
})

test('OFF SENDS NOTHING', async () => {
  const { deps, state } = setup(events(3))
  state.enabled = false
  assert.equal(await drainOnce(deps), 'off')
  assert.deepEqual(seen, [])
})

test('THE HAPPY PATH: login token, login, userinfo, csrf, status, submit; cookies carried; the fork named; the password only in a POST body; every request counted', async () => {
  const { deps, state } = setup(events(3))
  assert.equal(await drainOnce(deps), 'sent')
  assert.deepEqual(
    seen.map((s) => `${s.method} ${s.params.action}/${s.params.meta ?? s.params.operation ?? ''}`),
    ['GET query/tokens', 'POST login/', 'GET query/userinfo', 'GET query/tokens', 'POST eozobservations/status', 'POST eozobservations/submit']
  )
  for (const s of seen) assert.equal(s.headers['User-Agent'], WIKI_UA)
  assert.equal(seen[1].headers.Cookie, 'eqlwiki_session=abc', 'the login POST carries the session cookie')
  assert.match(seen[2].headers.Cookie, /eqlwikiUserID=42/)
  assert.equal(seen[1].params.lgtoken, 'LT+\\')
  for (const s of seen.filter((x) => x.method === 'GET')) assert.ok(!s.url.includes('s3cret'), 'no password in a URL')
  const submit = submits()[0].params
  assert.equal(submit.token, 'CSRF+\\')
  assert.equal(submit.assert, 'user')
  assert.equal(submit.assertuser, 'Kaltinril')
  assert.equal(submit.format, 'json')
  assert.equal(submit.formatversion, '2')
  assert.equal(state.delivered.length, 3)
  assert.equal(state.inFlight, null)
  assert.equal(state.nextAttemptAt, t + 30_000 - (t - state.lastSuccessAt))
  assert.match(wikiUsageSummary() ?? '', /drop observations 6/)
  assert.ok(!(wikiUsageSummary() ?? '').includes('s3cret'))
  // Requests are spaced a second apart.
  assert.ok(t - T0 >= 5000)
  assert.equal(await drainOnce(deps), 'waiting', 'one batch per 30 s')
  t = state.nextAttemptAt
  assert.equal(await drainOnce(deps), 'idle', 'nothing left: no request')
  assert.equal(seen.length, 6)
})

test('A FAILED LOGIN STOPS SENDING, with the reason, and sends no observation', async () => {
  handler = (p) => (p.action === 'login' ? { body: { login: { result: 'Failed', reason: 'Incorrect username or password entered.' } } } : undefined)
  const { deps, state } = setup(events(3))
  assert.equal(await drainOnce(deps), 'stopped')
  assert.equal(state.stopped?.code, 'eqc-login-failed')
  assert.equal(submits().length, 0)
  assert.equal(await drainOnce(deps), 'stopped', 'stays stopped: no more sign-in attempts')
  assert.equal(seen.length, 2)
})

test('THE STATUS SAYS DISABLED: sending stops; not available: retried later', async () => {
  handler = (p) => (p.operation === 'status' ? { body: { eozobservations: { schemaVersion: 1, enabled: false, available: false, account: ACCOUNT, limits: {} } } } : undefined)
  const a = setup(events(2))
  assert.equal(await drainOnce(a.deps), 'stopped')
  assert.equal(a.state.stopped?.code, 'eoz-disabled')
  assert.equal(submits().length, 0)
  handler = (p) => (p.operation === 'status' ? { body: { eozobservations: { schemaVersion: 1, enabled: true, available: false, account: ACCOUNT, limits: {} } } } : undefined)
  const b = setup(events(2))
  assert.equal(await drainOnce(b.deps), 'retry')
  assert.equal(b.state.stopped, null)
  assert.equal(b.state.lastError, 'eoz-schema-unavailable')
})

test('THE RECEIPT BOOKED: accepted and duplicates delivered, conflicts and rejections kept with their codes', async () => {
  const ev = events(4)
  handler = (p) => {
    if (p.operation !== 'submit') return undefined
    const b = JSON.parse(p.batch) as { batchId: string }
    return { body: { eozobservations: { schemaVersion: 1, batchId: b.batchId, account: ACCOUNT, accepted: [ev[0].id], duplicates: [ev[1].id], conflicts: [ev[2].id], rejected: [{ id: ev[3].id, code: 'eoz-invalid-zone' }] } } }
  }
  const { deps, state } = setup(ev)
  assert.equal(await drainOnce(deps), 'sent')
  assert.deepEqual(state.delivered, [ev[0].id, ev[1].id])
  assert.equal(state.kept[ev[2].id].code, 'conflict')
  assert.equal(state.kept[ev[3].id].code, 'eoz-invalid-zone')
  assert.equal(state.kept[ev[3].id].item, ev[3].item)
  assert.equal(state.inFlight, null)
  t = state.nextAttemptAt
  assert.equal(await drainOnce(deps), 'idle', 'kept events are not resent')
})

test('A RECEIPT THAT DOES NOT ACCOUNT FOR EVERY ID IS NOT BOOKED: the batch stays in flight', async () => {
  const ev = events(3)
  handler = (p) => {
    if (p.operation !== 'submit') return undefined
    const b = JSON.parse(p.batch) as { batchId: string }
    return { body: { eozobservations: { schemaVersion: 1, batchId: b.batchId, account: ACCOUNT, accepted: [ev[0].id], duplicates: [], conflicts: [], rejected: [] } } }
  }
  const { deps, state } = setup(ev)
  assert.equal(await drainOnce(deps), 'retry')
  assert.deepEqual(state.delivered, [])
  assert.equal(state.inFlight?.events.length, 3)
  assert.equal(state.lastError, 'eqc-receipt-incomplete')
})

test('A STALE TOKEN IS REFRESHED ONCE and the submit goes through', async () => {
  handler = (p, n) => (p.operation === 'submit' && n === 1 ? { body: { error: { code: 'badtoken', info: 'Invalid CSRF token.' } } } : undefined)
  const { deps, state } = setup(events(2))
  assert.equal(await drainOnce(deps), 'sent')
  assert.equal(seen.filter((s) => s.params.type === 'csrf').length, 2)
  assert.equal(submits().length, 2)
  assert.equal(submits()[0].params.batch, submits()[1].params.batch)
  assert.equal(state.delivered.length, 2)
})

test('RATE LIMIT BACKS OFF 1, 2, 4 minutes and keeps the batch; a batch refused whole is kept whole', async () => {
  handler = (p) => (p.operation === 'submit' ? { body: { error: { code: 'eoz-rate-limit', info: 'slow down' } } } : undefined)
  const { deps, state } = setup(events(2))
  assert.equal(await drainOnce(deps), 'retry')
  assert.equal(state.failures, 1)
  assert.equal(state.nextAttemptAt - t, 60_000)
  const first = state.inFlight?.batchId
  t = state.nextAttemptAt
  assert.equal(await drainOnce(deps), 'retry')
  assert.equal(state.nextAttemptAt - t, 120_000)
  t = state.nextAttemptAt
  assert.equal(await drainOnce(deps), 'retry')
  assert.equal(state.nextAttemptAt - t, 240_000)
  assert.equal(state.inFlight?.batchId, first)
  assert.equal(state.stopped, null)
  handler = (p) => (p.operation === 'submit' ? { body: { error: { code: 'eoz-invalid-batch', info: 'bad' } } } : undefined)
  t = state.nextAttemptAt
  assert.equal(await drainOnce(deps), 'kept')
  assert.equal(state.inFlight, null)
  assert.equal(Object.values(state.kept).filter((k) => k.code === 'eoz-invalid-batch').length, 2)
})

test('AN UNCERTAIN ANSWER RESENDS THE EXACT BATCH: saved before it was sent, the same ID and payload, even when new loot arrived', async () => {
  handler = (p, n) => (p.operation === 'submit' && n === 1 ? 'network' : undefined)
  const { deps, state, saves } = setup(events(3))
  assert.equal(await drainOnce(deps), 'retry')
  assert.equal(state.lastError, 'eqc-network')
  const saved = JSON.parse(saves[0]) as ObsState
  assert.equal(saved.inFlight?.batchId, state.inFlight?.batchId, 'the batch was on disk before the POST')
  ;(deps as unknown as { setEvents: (e: ObsEvent[]) => void }).setEvents([...events(2, 10), ...events(3)])
  t = state.nextAttemptAt
  assert.equal(await drainOnce(deps), 'sent')
  const [a, b] = submits()
  assert.equal(a.params.batch, b.params.batch, 'byte for byte the same batch')
  assert.equal(state.delivered.length, 3)
  assert.equal(state.inFlight, null)
  t = state.nextAttemptAt
  assert.equal(await drainOnce(deps), 'sent', 'the new loot goes in the next batch')
  assert.equal(state.delivered.length, 5)
})

test('NOT SIGNED IN ON THE WIKI SIDE (assertion failed) stops this session', async () => {
  handler = (p) => (p.operation === 'submit' ? { body: { error: { code: 'assertuserfailed', info: 'You are no longer logged in' } } } : undefined)
  const { deps, state } = setup(events(1))
  assert.equal(await drainOnce(deps), 'stopped')
  assert.equal(state.stopped?.code, 'assertuserfailed')
  assert.equal(deps.client.account(), null, 'the session is dropped')
})

test('THE STATE FILE round-trips, leaves no temp file, and a torn or foreign file starts the default (switch off)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-dropobs-'))
  try {
    const file = join(dir, 'wiki-observations.json')
    assert.deepEqual(loadState(file), defaultState(), 'no file: the default')
    const s: ObsState = { ...defaultState(), enabled: true, username: 'A@b', signedInAs: 'A', manual: true, delivered: ['eqc-1234567890'], inFlight: { schemaVersion: 1, batchId: 'eqcb-1234567890', clientVersion: 'v', events: [] } }
    saveState(file, s)
    assert.deepEqual(loadState(file), s)
    assert.deepEqual(readdirSync(dir), ['wiki-observations.json'])
    writeFileSync(file, '{"version":1,"enabled":tr')
    assert.equal(loadState(file).enabled, false)
    writeFileSync(file, '{"version":2,"enabled":true}')
    assert.equal(loadState(file).enabled, false)
    // A file written before the signed-in name existed: no name, so the card asks for a sign-in.
    writeFileSync(file, '{"version":1,"enabled":true,"username":"A@b"}')
    assert.equal(loadState(file).signedInAs, '')
    assert.equal(loadState(file).enabled, true)
    assert.equal(loadState(file).manual, false, 'a switch that was on stays the background trickle it was')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
