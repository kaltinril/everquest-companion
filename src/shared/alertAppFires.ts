// alertAppFires.ts - the recent fires of app-signal alerts (Bazaar match, respawn ending, raid
// target, Sky quest).
//
// Only the renderer can detect these signals, and the engine, which keeps the history of every
// log-driven alert, has no command to take one. Main holds them here for the length of the launch,
// as the engine holds its own, and the Alerts tab reads the two together.

import type { AlertFireRecord } from './alertTypes'

/** The engine's ring length (`HISTORY_CAP`, engine alerts_rules.rs). */
export const APP_FIRE_CAP = 20

/** Longer than any mob, boss or item line; the renderer's text is not trusted to be short. */
const MAX_TEXT = 300

export type FireHistory = Record<string, AlertFireRecord[]>

/** One alert's rows, by own key only: an id can be spelled like `constructor`. */
const ownFires = (history: FireHistory, id: string): AlertFireRecord[] => new Map(Object.entries(history)).get(id) ?? []

export interface AppFireLog {
  /** Take one report from the renderer. False when it names no known alert. */
  record: (payload: unknown) => boolean
  history: () => FireHistory
}

/** `known` is whether an alert with that id exists; `now` the wall clock. */
export function createAppFireLog(known: (alertId: string) => boolean, now: () => number = Date.now): AppFireLog {
  const rings = new Map<string, AlertFireRecord[]>()
  return {
    record(payload) {
      if (typeof payload !== 'object' || payload === null) return false
      const { alertId, context } = payload as { alertId?: unknown; context?: unknown }
      if (typeof alertId !== 'string' || !known(alertId)) return false
      const matchedText = typeof context === 'string' ? context.slice(0, MAX_TEXT) : ''
      rings.set(alertId, [...(rings.get(alertId) ?? []), { ts: now(), matchedText }].slice(-APP_FIRE_CAP))
      return true
    },
    history: () => Object.fromEntries(rings)
  }
}

/** The engine's history with the app fires in it, each alert's rows in time order, newest last. */
export function withAppFires(engine: FireHistory, app: FireHistory): FireHistory {
  const ids = Object.keys(app)
  if (ids.length === 0) return engine
  const merged = ids.map((id) => {
    const rows = [...ownFires(engine, id), ...ownFires(app, id)].sort((a, b) => a.ts - b.ts)
    return [id, rows.slice(-APP_FIRE_CAP)] as const
  })
  return { ...engine, ...Object.fromEntries(merged) }
}
