// alertCooldown.ts - an alert's cooldown as the app reads it. Pure, so tests/ can run the rules.

import type { AlertDef } from './alertTypes'

/** The cooldown an alert has when its def names none. The engine's default is the same number. */
export const DEFAULT_COOLDOWN_MS = 2000

/**
 * May an alert that last fired at `last` fire again at `now`? The gate `fireAppSignal` runs for
 * an app-signal alert. A cooldown of 0 never blocks, so two firings in one moment both pass.
 */
export function cooldownOver(def: Pick<AlertDef, 'cooldownMs'>, last: number | undefined, now: number): boolean {
  if (last === undefined) return true
  return !(now - last < (def.cooldownMs ?? DEFAULT_COOLDOWN_MS))
}
