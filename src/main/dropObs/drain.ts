// dropObs/drain.ts — one step of the background drain: sign in when needed, check the wiki's status,
// send ONE batch (the one in flight, exactly as it was, or the next newest-first batch), and book the
// receipt. Electron-free; the client, the events and the save are handed in, so the tests drive it
// with a stubbed fetch and an in-memory state.
//
// PACING (the requirements file): one batch per step, and the caller steps at most every 30 s (the
// wiki allows 120 batches an hour). After a rate-limit, capacity or network failure the next attempt
// waits 1, 2, 4 ... minutes, capped at an hour (or the server's Retry-After, when longer). A refusal
// that only the player can fix (not signed in, no confirmed email, blocked, no permission, the wiki's
// storage turned off) stops sending and says why, until the player presses Test sign-in.
//
// THE RECEIPT (the spec): every ID sent appears exactly once across accepted, duplicates, conflicts
// and rejected, for the same batch and account; otherwise nothing is booked and the batch is retried
// as it was. Only accepted and duplicates count as delivered; conflicts and rejections are kept with
// their codes. A batch refused whole (`eoz-invalid-batch`, `eoz-batch-conflict`) is kept whole.

import { nextBatch, type ObsEvent, type ObservationBatch } from './events'
import { WikiRefusal, WikiUncertain, type Account, type ObsClient, type StatusReply, type SubmitReply } from './client'
import type { KeptEvent, ObsState } from './state'

/** At most one batch this often. */
export const BATCH_SPACING_MS = 30_000
const BACKOFF_BASE_MS = 60_000
const BACKOFF_CAP_MS = 60 * 60_000
/** A status answer is trusted this long before it is asked again. */
const STATUS_TTL_MS = 15 * 60_000

/** Refusals that stop sending until the player fixes them. */
const STOP_CODES: Record<string, string> = {
  'eoz-login': 'The wiki did not sign you in. Check the Bot password and press Test sign-in.',
  'eoz-email': 'Your wiki account needs a confirmed email address before it can send loot.',
  'eoz-blocked': 'Your wiki account is blocked.',
  permissiondenied: 'This Bot password is not allowed to send observations. Give it the observation-submission grant.',
  'eoz-disabled': "The wiki has its drop database turned off for now. Press Test sign-in to check again.",
  'eqc-login-failed': 'Sign-in failed. Check the Bot password user name and password.',
  'eqc-no-password': 'No Bot password is saved.',
  // The spec: an assertion failure stops the pending operation; the player signs in again.
  assertuserfailed: 'The wiki signed this session out. Press Test sign-in.',
  assertnameduserfailed: 'The wiki session belongs to another account. Press Test sign-in.'
}

/** Codes that refuse the whole batch: its events are kept for review, not retried. */
const BATCH_REFUSALS = new Set(['eoz-invalid-batch', 'eoz-batch-conflict'])

export interface DrainDeps {
  state: ObsState
  save: () => void
  client: ObsClient
  /** Every sendable event, newest first; null when the loot cannot be read right now. */
  events: () => ObsEvent[] | null
  /** The saved Bot password, decrypted; null when none. */
  credentials: () => Promise<{ username: string; password: string } | null>
  clientVersion: string
  now: () => number
  /** The last status answer and when it came; owned by the caller, kept across steps. */
  cache: StatusCache
}

export interface StatusCache {
  at: number
  status: StatusReply | null
}

export const newStatusCache = (): StatusCache => ({ at: -Infinity, status: null })

export type DrainOutcome = 'off' | 'stopped' | 'waiting' | 'no-data' | 'idle' | 'sent' | 'kept' | 'retry'

/** The IDs already booked one way or the other. */
export function bookedIds(state: ObsState): Set<string> {
  return new Set([...state.delivered, ...Object.keys(state.kept)])
}

/** The events not yet booked. */
export function readyEvents(state: ObsState, events: readonly ObsEvent[]): ObsEvent[] {
  const booked = bookedIds(state)
  const inFlight = new Set(state.inFlight?.events.map((e) => e.id) ?? [])
  return events.filter((e) => !booked.has(e.id) && !inFlight.has(e.id))
}

export function backoffMs(failures: number, retryAfterMs: number | null): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1))
  return Math.min(BACKOFF_CAP_MS, Math.max(exp, retryAfterMs ?? 0))
}

/** The receipt checked against the batch and account: null when it may be booked, else why not. */
export function receiptProblem(reply: SubmitReply, batch: ObservationBatch, account: Account): string | null {
  if (reply.batchId !== batch.batchId) return 'eqc-receipt-batch'
  if (reply.account.name !== account.name) return 'eqc-receipt-account'
  const sent = new Set(batch.events.map((e) => e.id))
  const seen = new Set<string>()
  for (const id of [...reply.accepted, ...reply.duplicates, ...reply.conflicts, ...reply.rejected.map((r) => r.id)]) {
    if (!sent.has(id) || seen.has(id)) return 'eqc-receipt-ids'
    seen.add(id)
  }
  return seen.size === sent.size ? null : 'eqc-receipt-incomplete'
}

const keptOf = (e: ObsEvent, code: string): KeptEvent => ({ code, observedAt: e.observedAt, npc: e.npc, item: e.item })

/** Book a checked receipt: delivered, kept, and the batch no longer in flight. */
export function bookReceipt(state: ObsState, batch: ObservationBatch, reply: SubmitReply): void {
  const byId = new Map(batch.events.map((e) => [e.id, e]))
  state.delivered.push(...reply.accepted, ...reply.duplicates)
  const issues: [string, string][] = [...reply.conflicts.map((id): [string, string] => [id, 'conflict']), ...reply.rejected.map((r): [string, string] => [r.id, r.code])]
  for (const [id, code] of issues) {
    const e = byId.get(id)
    if (e !== undefined) state.kept[id] = keptOf(e, code)
  }
  state.inFlight = null
}

async function signedInStatus(d: DrainDeps): Promise<StatusReply> {
  if (d.client.account() === null) {
    const creds = await d.credentials()
    if (creds === null) throw new WikiRefusal('eqc-no-password', 'no Bot password saved')
    await d.client.signIn(creds.username, creds.password)
    d.cache.status = null
  }
  if (d.cache.status !== null && d.now() - d.cache.at < STATUS_TTL_MS) return d.cache.status
  const st = await d.client.status()
  if (!st.enabled) throw new WikiRefusal('eoz-disabled', 'observation storage is turned off')
  if (!st.available) throw new WikiUncertain('eoz-schema-unavailable')
  d.cache.status = st
  d.cache.at = d.now()
  return st
}

/** A failed attempt booked: a stop, a batch kept whole, or a retry later. */
function fail(d: DrainDeps, e: unknown): DrainOutcome {
  const s = d.state
  const code = e instanceof WikiRefusal || e instanceof WikiUncertain ? e.code : 'eqc-error'
  s.lastError = code
  d.cache.status = null
  if (code in STOP_CODES) {
    s.stopped = { code, message: STOP_CODES[code] }
    d.client.forget()
    d.save()
    return 'stopped'
  }
  if (BATCH_REFUSALS.has(code) && s.inFlight !== null) {
    for (const ev of s.inFlight.events) s.kept[ev.id] = keptOf(ev, code)
    s.inFlight = null
    s.nextAttemptAt = d.now() + BATCH_SPACING_MS
    d.save()
    return 'kept'
  }
  // badtoken that survived its one refresh: a fresh session next time.
  if (code === 'badtoken') d.client.forget()
  s.failures++
  s.nextAttemptAt = d.now() + backoffMs(s.failures, e instanceof WikiUncertain ? e.retryAfterMs : null)
  d.save()
  return 'retry'
}

/** One drain step. Never throws. */
export async function drainOnce(d: DrainDeps): Promise<DrainOutcome> {
  const s = d.state
  if (!s.enabled) return 'off'
  if (s.stopped !== null) return 'stopped'
  if (d.now() < s.nextAttemptAt) return 'waiting'
  let ready: ObsEvent[] = []
  if (s.inFlight === null) {
    const all = d.events()
    if (all === null) return 'no-data'
    ready = readyEvents(s, all)
    if (ready.length === 0) return 'idle'
  }
  try {
    const st = await signedInStatus(d)
    if (s.inFlight === null) {
      const batch = nextBatch(ready, d.clientVersion, st.limits)
      if (batch === null) return 'idle'
      // Saved BEFORE it is sent: an answer lost to a crash or a timeout resends this exact batch.
      s.inFlight = batch
      d.save()
    }
    const batch = s.inFlight
    const reply = await d.client.submit(batch)
    const problem = receiptProblem(reply, batch, d.client.account() ?? st.account)
    if (problem !== null) throw new WikiUncertain(problem)
    bookReceipt(s, batch, reply)
    s.failures = 0
    s.lastError = null
    s.lastSuccessAt = d.now()
    s.nextAttemptAt = d.now() + BATCH_SPACING_MS
    d.save()
    return 'sent'
  } catch (e) {
    return fail(d, e)
  }
}
