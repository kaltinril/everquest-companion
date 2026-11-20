// alertCooldown.ts - an alert's cooldown as the app reads it. Pure, so tests/ can run the rules.

import type { AlertDef } from './alertTypes'

/** The cooldown an alert has when its def names none. The engine's default is the same number. */
export const DEFAULT_COOLDOWN_MS = 2000

/**
 * A cooldown as whole milliseconds, or undefined for "none given" (the default applies).
 *
 * The engine holds a cooldown as a whole number and rounds the same way
 * (fold/src/modules/alerts_rules.rs `cooldown_ms_of`), so one stored number is one cooldown for a
 * log-triggered alert and for an app-signal one.
 */
export function normalizeCooldownMs(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  return Math.max(0, Math.round(raw))
}

/** What the editor's "Cooldown (ms)" box holds for the text typed into it: the number stored. */
export function cooldownFromInput(text: string): number {
  return normalizeCooldownMs(Number(text)) ?? 0
}

/**
 * A def about to be saved, with its cooldown made whole. Not a number at all: the key is dropped,
 * which reads as the default, and the rest of the def still saves.
 */
export function sanitizeCooldownMs(def: AlertDef): AlertDef {
  if (def.cooldownMs === undefined) return def
  const ms = normalizeCooldownMs(def.cooldownMs)
  if (ms === def.cooldownMs) return def
  const clean = { ...def }
  if (ms === undefined) delete clean.cooldownMs
  else clean.cooldownMs = ms
  return clean
}

/**
 * May an alert that last fired at `last` fire again at `now`? The gate `fireAppSignal` runs for
 * an app-signal alert. A cooldown of 0 never blocks, so two firings in one moment both pass.
 */
export function cooldownOver(def: Pick<AlertDef, 'cooldownMs'>, last: number | undefined, now: number): boolean {
  if (last === undefined) return true
  return !(now - last < (def.cooldownMs ?? DEFAULT_COOLDOWN_MS))
}
