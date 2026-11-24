// dropObs/state.ts — what the drop-database submission keeps on this machine, in one userData file
// (`wiki-observations.json`): the switch, the Bot password's user name and its encrypted password,
// the IDs the wiki took, the events it refused or found in conflict (kept for review with their
// codes), the batch in flight, and the retry schedule. Electron-free: the encryption is the
// caller's (safeStorage), this file only holds its output as base64.
//
// Written atomically (temp file, then rename), so a crash mid-write leaves the last good file. A file
// that cannot be read or parsed starts the default state: nothing is sent until the player turns the
// switch on again, and a resend of what was delivered is a duplicate on the wiki's side.

import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import type { ObservationBatch } from './events'

export interface KeptEvent {
  /** The wiki's code: `conflict`, a rejection code, or the batch's error code. */
  code: string
  observedAt: string
  npc: string
  item: string
}

export interface ObsState {
  version: 1
  enabled: boolean
  username: string
  /** safeStorage ciphertext, base64; '' when no password is saved. */
  passwordEnc: string
  /** IDs the wiki accepted or already held. Never sent again. */
  delivered: string[]
  /** Refused or conflicting events, by ID, kept for review. Never sent again by this slice. */
  kept: Record<string, KeptEvent>
  /** The batch sent without a definite answer yet: retried exactly as it is, never rebuilt. */
  inFlight: ObservationBatch | null
  nextAttemptAt: number
  failures: number
  lastError: string | null
  lastSuccessAt: number
  /** Sending stopped until the player fixes it or presses Test sign-in. */
  stopped: { code: string; message: string } | null
}

export function defaultState(): ObsState {
  return {
    version: 1,
    enabled: false,
    username: '',
    passwordEnc: '',
    delivered: [],
    kept: {},
    inFlight: null,
    nextAttemptAt: 0,
    failures: 0,
    lastError: null,
    lastSuccessAt: 0,
    stopped: null
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** A parsed file as a state, every field checked; anything off falls back to its default. */
export function asState(raw: unknown): ObsState {
  const d = defaultState()
  if (!isObj(raw) || raw.version !== 1) return d
  const num = (v: unknown, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : dflt)
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  const batch = isObj(raw.inFlight) && typeof raw.inFlight.batchId === 'string' && Array.isArray(raw.inFlight.events) ? (raw.inFlight as unknown as ObservationBatch) : null
  const stopped = isObj(raw.stopped) && typeof raw.stopped.code === 'string' ? { code: raw.stopped.code, message: s(raw.stopped.message) } : null
  return {
    version: 1,
    enabled: raw.enabled === true,
    username: s(raw.username),
    passwordEnc: s(raw.passwordEnc),
    delivered: Array.isArray(raw.delivered) ? raw.delivered.filter((x): x is string => typeof x === 'string') : [],
    kept: isObj(raw.kept) ? (raw.kept as Record<string, KeptEvent>) : {},
    inFlight: batch,
    nextAttemptAt: num(raw.nextAttemptAt, 0),
    failures: num(raw.failures, 0),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
    lastSuccessAt: num(raw.lastSuccessAt, 0),
    stopped
  }
}

export function loadState(file: string): ObsState {
  try {
    return asState(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return defaultState()
  }
}

/** Temp file beside it, then rename: a torn write never sits under the real name. */
export function saveState(file: string, state: ObsState): void {
  const tmp = `${file}.${String(process.pid)}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(state), 'utf8')
    renameSync(tmp, file)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      // nothing to clean up
    }
    throw err
  }
}
