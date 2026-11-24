// dropObs/service.ts — the drop-database submission, wired to Electron: the saved state in userData,
// the password through safeStorage, the loot the engine serves, and a drain that runs only as the
// player chose (docs/community/requirements/drop-db-submit.md).
//
// OFF BY DEFAULT. Nothing here touches the network until the player saves a Bot password and either
// presses Save and sign in or picks a way to send. Three modes (shared/dropObs.ts): Off; Send in the
// background, where the drain sends whatever is ready as the player plays; and Only when I press
// Send, where the drain sends only during a run the player started with Send now, and that run ends
// when nothing is left (or sending stops). A run lives in memory: closing the app ends it, and a
// batch it left in flight goes again at the next press. The drain wakes every 30 s and does nothing
// while it is off, between runs in manual mode, stopped, or waiting out a backoff (drain.ts).
//
// WHERE THE LOOT COMES FROM: `serveModuleSnapshot('loot')`, the same full read every loot window
// gets (the live log's rows, plus archived history when Keep log history is on). The character and
// server are the attached log's (`eqlog_<Character>_<server>.txt`, session.ts). The player names a
// corpse is never sent for: every character in the Logs folder and the group roster's members.

import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { logInfo, logWarn } from '../errorLog'
import { serveModuleSnapshot } from '../dataServer/serveShim'
import { getActiveCharacter } from '../session'
import { listCharacters } from '../log/config'
import { LOOT_MODULE } from '../../shared/lootFrame'
import { KEPT_SHOWN, type DropObsKeptItem, type DropObsMode, type DropObsReply, type DropObsStatus } from '../../shared/dropObs'
import { createObsClient, WikiRefusal, WikiUncertain } from './client'
import { BATCH_SPACING_MS, drainOnce, newStatusCache, readyEvents, type DrainDeps, type DrainOutcome } from './drain'
import { obsEvents, type ObsEvent, type LootRowIn } from './events'
import { loadState, saveState, type ObsState } from './state'

/** Sessions that stopped on an assertion start fresh at the next launch: a lapsed session, not a fault. */
const LAUNCH_CLEARS = new Set(['assertuserfailed', 'assertnameduserfailed'])

const client = createObsClient({ fetch: (url, init) => globalThis.fetch(url, init) })
const cache = newStatusCache()
let file: string | null = null
let state: ObsState | null = null
let timer: ReturnType<typeof setInterval> | null = null
let running = false
/** Manual mode: a Send press is working through what was waiting. */
let pushing = false

function st(): ObsState {
  if (state === null) {
    file = join(app.getPath('userData'), 'wiki-observations.json')
    state = loadState(file)
    if (state.stopped !== null && LAUNCH_CLEARS.has(state.stopped.code)) state.stopped = null
  }
  return state
}

function save(): void {
  if (file === null || state === null) return
  try {
    saveState(file, state)
  } catch (err) {
    logWarn('[drop observations] could not save wiki-observations.json:', err instanceof Error ? err.message : String(err))
  }
}

async function credentials(): Promise<{ username: string; password: string } | null> {
  const s = st()
  if (s.username === '' || s.passwordEnc === '' || !(await safeStorage.isAsyncEncryptionAvailable())) return null
  try {
    const out = await safeStorage.decryptStringAsync(Buffer.from(s.passwordEnc, 'base64'))
    // The OS rotated its key: store the password under the new one.
    if (out.shouldReEncrypt) {
      s.passwordEnc = (await safeStorage.encryptStringAsync(out.result)).toString('base64')
      save()
    }
    return { username: s.username, password: out.result }
  } catch {
    return null
  }
}

const isRow = (r: unknown): r is LootRowIn =>
  r !== null && typeof r === 'object' && typeof (r as LootRowIn).ts === 'number' && typeof (r as LootRowIn).item === 'string'

/** The player's own characters and the group's members, lower-cased: never an NPC. */
async function playerNames(): Promise<Set<string>> {
  const names = new Set(listCharacters().map((c) => c.name.toLowerCase()))
  const roster = await serveModuleSnapshot('roster')
  const members = (roster?.state as { members?: unknown } | undefined)?.members
  if (Array.isArray(members)) {
    for (const m of members) {
      const name = (m as { name?: unknown }).name
      if (typeof name === 'string') names.add(name.toLowerCase())
    }
  }
  return names
}

/** Every sendable event in the loot the engine serves, newest first; null when there is none to read. */
async function readEvents(): Promise<ObsEvent[] | null> {
  const ch = getActiveCharacter()
  if (ch === null) return null
  const snap = await serveModuleSnapshot(LOOT_MODULE)
  if (snap === null || !Array.isArray(snap.state)) return null
  const rows = (snap.state as unknown[]).filter(isRow)
  return obsEvents(rows, { server: ch.server, character: ch.name, players: await playerNames(), now: Date.now() })
}

/** The card asks for its status every few seconds while it is open; the loot is read once per window. */
const EVENTS_TTL_MS = 10_000
let eventsMemo: { at: number; events: ObsEvent[] | null } | null = null

async function currentEvents(maxAgeMs = 0): Promise<ObsEvent[] | null> {
  if (eventsMemo !== null && Date.now() - eventsMemo.at < maxAgeMs) return eventsMemo.events
  const events = await readEvents()
  eventsMemo = { at: Date.now(), events }
  return events
}

/** The newest refused reports, newest first, for the card's list. */
function keptItems(s: ObsState): DropObsKeptItem[] {
  return Object.values(s.kept)
    .map((k) => ({ item: k.item, npc: k.npc, observedAt: k.observedAt, code: k.code }))
    .sort((a, b) => (a.observedAt < b.observedAt ? 1 : a.observedAt > b.observedAt ? -1 : 0))
    .slice(0, KEPT_SHOWN)
}

const clientVersion = (): string => `everquest-companion/${app.getVersion()}`

/** One step's outcome booked: the signed-in name a batch proved, and a line in the app's log. */
function noteOutcome(s: ObsState, outcome: DrainOutcome, before: { delivered: number; kept: number }): void {
  if (outcome === 'retry' || outcome === 'stopped') {
    logInfo(`[drop observations] ${outcome}: ${s.lastError ?? '?'}`)
    return
  }
  if (outcome !== 'sent' && outcome !== 'kept') return
  // A batch the wiki answered proves the sign-in: the card shows who it is.
  const who = client.account()?.name
  if (who !== undefined && who !== s.signedInAs) {
    s.signedInAs = who
    save()
  }
  logInfo(`[drop observations] batch booked: ${String(s.delivered.length - before.delivered)} delivered, ${String(Object.keys(s.kept).length - before.kept)} kept for review`)
}

/** Outcomes that end a manual run: nothing left, a stop only the player can clear, nothing to read. */
const RUN_ENDS = new Set<DrainOutcome>(['idle', 'stopped', 'no-data', 'off'])

const modeOf = (s: ObsState): DropObsMode => (!s.enabled ? 'off' : s.manual ? 'manual' : 'background')

async function tick(): Promise<void> {
  const s = st()
  if (running || !s.enabled || (s.manual && !pushing) || s.stopped !== null || Date.now() < s.nextAttemptAt) return
  running = true
  try {
    const events = s.inFlight === null ? await currentEvents() : []
    const deps: DrainDeps = { state: s, save, client, events: () => events, credentials, clientVersion: clientVersion(), now: Date.now, cache }
    const before = { delivered: s.delivered.length, kept: Object.keys(s.kept).length }
    const outcome = await drainOnce(deps)
    noteOutcome(s, outcome, before)
    if (RUN_ENDS.has(outcome)) pushing = false
  } finally {
    running = false
  }
}

/** Start the background drain. Called once at startup; it sends nothing while the switch is off. */
export function startDropObsDrain(): void {
  if (timer !== null) return
  timer = setInterval(() => void tick(), BATCH_SPACING_MS)
  timer.unref?.()
}

export async function dropObsStatus(): Promise<DropObsStatus> {
  const s = st()
  const events = await currentEvents(EVENTS_TTL_MS)
  return {
    mode: modeOf(s),
    sendingNow: s.enabled && s.manual && pushing,
    username: s.username,
    hasPassword: s.passwordEnc !== '',
    encryptionAvailable: await safeStorage.isAsyncEncryptionAvailable(),
    ready: events === null ? null : readyEvents(s, events).length,
    inFlight: s.inFlight?.events.length ?? 0,
    delivered: s.delivered.length,
    kept: Object.keys(s.kept).length,
    lastError: s.lastError,
    stopped: s.stopped?.message ?? null,
    nextAttemptAt: s.nextAttemptAt > Date.now() ? s.nextAttemptAt : 0,
    lastSuccessAt: s.lastSuccessAt,
    signedInAs: s.signedInAs,
    keptItems: keptItems(s)
  }
}

/** A failed sign-in, in words the player can act on. */
function signInFailure(code: string): string {
  switch (code) {
    case 'eqc-login-failed':
    case 'eoz-login':
      return 'The wiki did not accept that user name and password. Copy both again from the Bot passwords page (the user name has an @ in it).'
    case 'eoz-email':
      return 'Your wiki account needs a confirmed email address first (wiki Preferences → Email).'
    case 'eoz-blocked':
      return 'This wiki account is blocked.'
    case 'permissiondenied':
      return 'This Bot password is missing the grant. On the Bot passwords page, tick "Submit attributed gameplay observations" and save.'
    case 'eoz-disabled':
      return 'The wiki is not taking loot reports right now. Try again later.'
    default:
      return code.startsWith('eqc-network') || code.startsWith('eqc-http') ? 'Could not reach the wiki. Check your internet connection and try again.' : `Sign-in failed (${code}).`
  }
}

async function reply(ok: boolean, message: string): Promise<DropObsReply> {
  return { ok, message, status: await dropObsStatus() }
}

/** Save the Bot password. An empty password keeps the one saved before. */
export async function saveDropObsAccount(username: string, password: string): Promise<DropObsReply> {
  const s = st()
  const name = username.trim()
  if (name === '') return reply(false, 'Enter the Bot password user name (it looks like Name@Label).')
  if (password !== '' && !(await safeStorage.isAsyncEncryptionAvailable())) return reply(false, 'This computer cannot encrypt a saved password, so it was not saved.')
  if (password === '' && s.passwordEnc === '') return reply(false, 'Enter the Bot password.')
  // A changed sign-in has not worked yet: the card asks again before it shows a name.
  if (name !== s.username || password !== '') s.signedInAs = ''
  s.username = name
  if (password !== '') s.passwordEnc = (await safeStorage.encryptStringAsync(password)).toString('base64')
  s.stopped = null
  client.forget()
  cache.status = null
  save()
  return reply(true, 'Saved.')
}

/** A sign-in that has never worked, or one that stopped, is tried before anything is sent, so the
 *  player learns at once rather than from a stop thirty seconds later. Null when it is fine. */
async function signInFirst(s: ObsState): Promise<DropObsReply | null> {
  if (s.signedInAs !== '' && s.stopped === null) return null
  const test = await testDropObs()
  return test.ok ? null : test
}

const MODE_SAID: Record<DropObsMode, string> = {
  off: 'Off. Nothing is sent.',
  background: 'Sending in the background. Your loot goes to the wiki as you play, newest first.',
  manual: 'Nothing is sent until you press Send now.'
}

/** The player's choice. Background signs in first and stays as it was if that fails. */
export async function setDropObsMode(mode: DropObsMode): Promise<DropObsReply> {
  const s = st()
  if (mode === 'background') {
    const failed = await signInFirst(s)
    if (failed !== null) return failed
  }
  s.enabled = mode !== 'off'
  s.manual = mode === 'manual'
  pushing = false
  save()
  if (mode === 'background') setTimeout(() => void tick(), 1000)
  return reply(true, MODE_SAID[mode])
}

/** Manual mode's button: send everything waiting, one batch every 30 s, then stop. */
export async function sendDropObsNow(): Promise<DropObsReply> {
  const s = st()
  if (!s.enabled || !s.manual) return reply(false, 'Choose "Only when I press Send" first.')
  const failed = await signInFirst(s)
  if (failed !== null) return failed
  pushing = true
  setTimeout(() => void tick(), 500)
  return reply(true, 'Sending. It carries on while the app is open, then stops.')
}

/** Remove the saved sign-in and turn sending off. What the wiki already took stays booked, so
 *  signing in again never sends it twice. */
export async function forgetDropObsAccount(): Promise<DropObsReply> {
  const s = st()
  s.enabled = false
  s.manual = false
  pushing = false
  s.username = ''
  s.passwordEnc = ''
  s.signedInAs = ''
  s.stopped = null
  s.lastError = null
  s.failures = 0
  s.nextAttemptAt = 0
  client.forget()
  cache.status = null
  save()
  return reply(true, 'Sign-in removed. Nothing is sent.')
}

/** Sign in and ask the wiki's status: the account name and whether the drop database takes reports. */
export async function testDropObs(): Promise<DropObsReply> {
  const creds = await credentials()
  if (creds === null) return reply(false, 'Save the Bot password first.')
  const s = st()
  try {
    client.forget()
    const account = await client.signIn(creds.username, creds.password)
    const status = await client.status()
    cache.status = status.enabled && status.available ? status : null
    cache.at = Date.now()
    s.stopped = null
    s.failures = 0
    s.nextAttemptAt = 0
    s.lastError = null
    s.signedInAs = account.name
    save()
    const ok = status.enabled && status.available
    if (ok) return await reply(true, `Signed in as ${account.name}. The wiki is taking loot reports.`)
    return await reply(false, `Signed in as ${account.name}, but the wiki is not taking loot reports right now. Try again later.`)
  } catch (e) {
    client.forget()
    const code = e instanceof WikiRefusal || e instanceof WikiUncertain ? e.code : 'eqc-error'
    return reply(false, signInFailure(code))
  }
}
