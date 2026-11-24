// dropObs/service.ts — the drop-database submission, wired to Electron: the saved state in userData,
// the password through safeStorage, the loot the engine serves, and a background drain that runs
// only while the player's switch is on (docs/community/requirements/drop-db-submit.md).
//
// OFF BY DEFAULT. Nothing here touches the network until the player saves a Bot password and either
// presses Test sign-in or turns the switch on. The drain wakes every 30 s and does nothing while the
// switch is off, sending is stopped, or a backoff is waiting (drain.ts).
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
import type { DropObsReply, DropObsStatus } from '../../shared/dropObs'
import { createObsClient, WikiRefusal, WikiUncertain } from './client'
import { BATCH_SPACING_MS, drainOnce, newStatusCache, readyEvents, type DrainDeps } from './drain'
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
async function currentEvents(): Promise<ObsEvent[] | null> {
  const ch = getActiveCharacter()
  if (ch === null) return null
  const snap = await serveModuleSnapshot(LOOT_MODULE)
  if (snap === null || !Array.isArray(snap.state)) return null
  const rows = (snap.state as unknown[]).filter(isRow)
  return obsEvents(rows, { server: ch.server, character: ch.name, players: await playerNames(), now: Date.now() })
}

const clientVersion = (): string => `everquest-companion/${app.getVersion()}`

async function tick(): Promise<void> {
  const s = st()
  if (running || !s.enabled || s.stopped !== null || Date.now() < s.nextAttemptAt) return
  running = true
  try {
    const events = s.inFlight === null ? await currentEvents() : []
    const deps: DrainDeps = { state: s, save, client, events: () => events, credentials, clientVersion: clientVersion(), now: Date.now, cache }
    const before = { delivered: s.delivered.length, kept: Object.keys(s.kept).length }
    const outcome = await drainOnce(deps)
    if (outcome === 'sent' || outcome === 'kept') {
      logInfo(`[drop observations] batch booked: ${String(s.delivered.length - before.delivered)} delivered, ${String(Object.keys(s.kept).length - before.kept)} kept for review`)
    } else if (outcome === 'retry' || outcome === 'stopped') {
      logInfo(`[drop observations] ${outcome}: ${s.lastError ?? '?'}`)
    }
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
  const events = await currentEvents()
  return {
    enabled: s.enabled,
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
    lastSuccessAt: s.lastSuccessAt
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
  s.username = name
  if (password !== '') s.passwordEnc = (await safeStorage.encryptStringAsync(password)).toString('base64')
  s.stopped = null
  client.forget()
  cache.status = null
  save()
  return reply(true, 'Saved.')
}

export async function setDropObsEnabled(enabled: boolean): Promise<DropObsReply> {
  const s = st()
  s.enabled = enabled
  save()
  if (enabled) setTimeout(() => void tick(), 1000)
  return reply(true, enabled ? 'On. Your loot is sent in the background.' : 'Off. Nothing is sent.')
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
    save()
    const ok = status.enabled && status.available
    return await reply(ok, `Signed in as ${account.name}. Drop database: ${status.enabled ? 'enabled' : 'disabled'}, ${status.available ? 'available' : 'not available'}.`)
  } catch (e) {
    client.forget()
    const code = e instanceof WikiRefusal || e instanceof WikiUncertain ? e.message : 'eqc-error'
    return reply(false, `Sign-in test failed: ${code}`)
  }
}
