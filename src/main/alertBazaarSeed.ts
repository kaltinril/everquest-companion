// alertBazaarSeed.ts — the Bazaar watchlist's alert, an ordinary seeded alert on the
// 'bazaarWatch' app signal, so its sound, voice, banner, cooldown and history are the Alerts
// tab's like every other alert's (asked by the owner, 2026-10-08).
//
// SEEDED ONCE. Added to an existing list the first time, and the store's `alertBazaarSeed` stamp
// (store.ts) means a user who deletes it keeps it deleted. A file of its own for alertSeeds.ts's reason: store.ts is at its factoring ceiling.

import { DEFAULT_ALERT_PACK_ID, DEFAULT_ALERT_SOUNDS } from './data/defaultPacks'
import { seedAlertsWith } from './alertSeeds'
import type { CachedStore } from './storeCache'
import type { StoreShape } from './storeShape'
import type { AlertDef } from '../shared/types'

export const BAZAAR_WATCH_ALERT_ID = 'bazaar-watch'

const BAZAAR_WATCH_ALERT: AlertDef = {
  id: BAZAAR_WATCH_ALERT_ID,
  name: 'Bazaar watchlist match',
  enabled: true,
  trigger: { type: 'app', signal: 'bazaarWatch' },
  sound: { packId: DEFAULT_ALERT_PACK_ID, soundId: DEFAULT_ALERT_SOUNDS.buffWearsOff },
  // "Fleeting Quiver +4 for sale" aloud; "Leric WTS Fleeting Quiver +4 18k - at or under your
  // 20k" on the banner.
  audio: 'speech',
  speech: { mode: 'custom', phrase: '{item} {what}' },
  bannerText: '{offer} - {why}',
  // Two offers in one trade-chat line must both be heard; the engine lists each offer once a day.
  cooldownMs: 0,
  note: 'Seeded default - fires when a trade-chat offer matches your Bazaar watchlist (the WTS and WTB boxes on each watch).'
}

/**
 * The list with the Bazaar alert added, when the list has none. `seed` is the sound-ref step, a
 * parameter for alertRespawnSeed.ts's reason: tests/alertBazaarSeed.test.mts runs without Electron.
 */
export function withBazaarAlert(alerts: AlertDef[], storedPrefs: unknown, seed: typeof seedAlertsWith = seedAlertsWith): AlertDef[] {
  if (alerts.some((a) => a.id === BAZAAR_WATCH_ALERT_ID)) return alerts
  return [...alerts, ...seed([BAZAAR_WATCH_ALERT], storedPrefs)]
}

const lacksCooldown = (a: AlertDef): boolean => a.id === BAZAAR_WATCH_ALERT_ID && a.cooldownMs === undefined

/**
 * The list with the Bazaar alert's cooldown set to 0 where it has none: the alert as first seeded,
 * which fell to the 2 s default. A save from the alert editor always writes a cooldown
 * (alertForm.ts defFromForm), so a number the player chose is never written over.
 */
export function withBazaarCooldown(alerts: AlertDef[]): AlertDef[] {
  if (!alerts.some(lacksCooldown)) return alerts
  return alerts.map((a) => (lacksCooldown(a) ? { ...a, cooldownMs: 0 } : a))
}

/**
 * The stored list with the Bazaar alert added the first time only. Takes the store as an argument
 * for alertSeeds.ts's import-cycle reason.
 */
export function seedBazaarAlertOnce(
  alerts: AlertDef[],
  store: Pick<CachedStore<StoreShape>, 'get' | 'set'>,
  seed: typeof seedAlertsWith = seedAlertsWith
): AlertDef[] {
  const stamped = store.get('alertBazaarSeed') === true
  const next = withBazaarCooldown(stamped ? alerts : withBazaarAlert(alerts, store.get('soundPacks'), seed))
  if (next !== alerts) store.set('alerts', next)
  if (!stamped) store.set('alertBazaarSeed', true)
  return next
}
