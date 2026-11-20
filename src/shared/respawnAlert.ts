// shared/respawnAlert.ts - the alert a set number of seconds before a tracked mob respawns
// (fork #7): its one setting, the seeded alert's phrases, and which clocks cross their lead
// moment between two looks. Pure; tests/respawnAlert.test.mts.

import { respawnReading, type RespawnSnap } from './respawn'
import { respawnTierView, respawnZoneTitle, type RespawnPlace, type RespawnTierEntry } from './respawnTiers'

export interface RespawnAlertSetting {
  on: boolean
  /** Seconds before the estimated respawn. */
  leadSec: number
}

export const RESPAWN_ALERT_MIN_SEC = 5
export const RESPAWN_ALERT_MAX_SEC = 300
export const DEFAULT_RESPAWN_ALERT: RespawnAlertSetting = { on: false, leadSec: 20 }

/** A lead the setting may hold: a whole number of seconds inside the bounds. */
export function respawnAlertLeadOk(sec: number): boolean {
  return Number.isInteger(sec) && sec >= RESPAWN_ALERT_MIN_SEC && sec <= RESPAWN_ALERT_MAX_SEC
}

/** Any number as a lead the setting may hold: rounded, then held to the bounds. */
function heldLead(sec: number): number {
  return Math.min(RESPAWN_ALERT_MAX_SEC, Math.max(RESPAWN_ALERT_MIN_SEC, Math.round(sec)))
}

export function normalizeRespawnAlert(raw: unknown): RespawnAlertSetting {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_RESPAWN_ALERT
  const { on, leadSec } = raw as { on?: unknown; leadSec?: unknown }
  const lead = typeof leadSec === 'number' && Number.isFinite(leadSec) ? leadSec : DEFAULT_RESPAWN_ALERT.leadSec
  return { on: on === true, leadSec: heldLead(lead) }
}

/**
 * The lead to store for what was typed in the seconds field, read once the typing is finished:
 * 600 is 300 and 3 is 5. Null when nothing usable was typed, so the stored lead stays.
 */
export function respawnAlertLeadFromDraft(text: string): number | null {
  const typed = text.trim()
  if (typed === '') return null
  const sec = Number(typed)
  return Number.isFinite(sec) ? heldLead(sec) : null
}

// The seeded alert's phrases. A capture is cut at 48 characters, so the sentence is two tokens,
// never one; an empty token is spoken as written, so every token always carries text.
export const RESPAWN_ALERT_SPEECH = '{mob} {when}'
export const RESPAWN_ALERT_BANNER = '{mob} in {seconds}s - {place}'

export interface RespawnAlertDue {
  /** One per clock (`row.id@baseTs`): the caller fires each key once. */
  key: string
  /** The matched text the alert history records. */
  context: string
  /** The `respawnSoon` tokens (alertCaptures.ts APP_SIGNAL_CAPTURES). */
  captures: Record<string, string>
}

/** `open +3` aloud. */
function spokenPlace(place: RespawnPlace): string {
  return `${place.kind === 'inst' ? 'instance' : place.kind} plus ${String(place.tier)}`
}

function dueOf(display: string, entry: RespawnTierEntry, leadSec: number, zone: string): RespawnAlertDue {
  const seconds = String(leadSec)
  const when = `in ${seconds} seconds`
  return {
    key: `${entry.row.id}@${String(entry.row.baseTs)}`,
    context: `${display} - ${entry.place.tag}`,
    captures: {
      mob: display,
      seconds,
      place: entry.place.tag,
      zone,
      when: entry.here ? when : `${when}, ${spokenPlace(entry.place)}`
    }
  }
}

/**
 * The clocks the Respawn overlay lists for the zone you stand in whose lead moment fell in
 * (prevMs, nowMs]. A first look (`prevMs` null) is a baseline. Never a row seen up, one with no
 * estimate, one already due (a long gap), or a respawn no longer than the lead.
 */
export function respawnAlertsDue(
  snap: Pick<RespawnSnap, 'rows' | 'zone' | 'prefs'>,
  leadSec: number,
  prevMs: number | null,
  nowMs: number
): RespawnAlertDue[] {
  if (prevMs === null) return []
  const leadMs = leadSec * 1000
  const zone = respawnZoneTitle(snap.zone)
  const out: RespawnAlertDue[] = []
  for (const group of respawnTierView(snap, nowMs, 'here').groups) {
    for (const entry of group.entries) {
      const { baseTs, estimateMs } = entry.row
      if (estimateMs === undefined || estimateMs <= leadMs) continue
      const at = baseTs + estimateMs - leadMs
      if (at <= prevMs || at > nowMs) continue
      const reading = respawnReading(entry.row, nowMs)
      if (!reading.seen && !reading.due) out.push(dueOf(group.display, entry, leadSec, zone))
    }
  }
  return out
}

/**
 * The watcher's memory between ticks: `step` returns the clocks to alert on now, each once. The
 * first step is a baseline. A step with no snapshot (the log is being read) still moves the clock
 * on, so nothing bursts when the snapshot arrives. A clock already returned is never returned
 * again, though a longer estimate or a lowered lead puts its lead moment in a later window. A new
 * stepper (the setting switched off and on) starts over.
 */
export function respawnAlertStepper(): {
  step: (snap: Pick<RespawnSnap, 'rows' | 'zone' | 'prefs'> | null, leadSec: number, nowMs: number) => RespawnAlertDue[]
} {
  let prevMs: number | null = null
  const fired = new Set<string>()
  return {
    step(snap, leadSec, nowMs) {
      const due = snap === null ? [] : respawnAlertsDue(snap, leadSec, prevMs, nowMs)
      prevMs = nowMs
      const fresh = due.filter((d) => !fired.has(d.key))
      for (const d of fresh) fired.add(d.key)
      return fresh
    }
  }
}
