// alertBazaarSeed.ts — the Bazaar watchlist's alert, an ordinary seeded alert on the
// 'bazaarWatch' app signal, so its sound, voice, banner, cooldown and history are the Alerts
// tab's like every other alert's (asked by the owner, 2026-10-08).
//
// SEEDED ONCE, AND ONLY WHERE THE TAB EXISTS. The Bazaar tab is behind the UNRELEASED gate, so a
// build without it never sees this alert; a build with it adds it to an existing list the first
// time, and the store's `alertBazaarSeed` stamp (store.ts) means a user who deletes it keeps it
// deleted. A file of its own for alertSeeds.ts's reason: store.ts is at its factoring ceiling.

import { DEFAULT_ALERT_PACK_ID, DEFAULT_ALERT_SOUNDS } from './data/defaultPacks'
import { seedAlertsWith } from './alertSeeds'
import { UNRELEASED } from './unreleased'
import type Store from 'electron-store'
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
  note: 'Seeded default - fires when a trade-chat offer matches your Bazaar watchlist (the WTS and WTB boxes on each watch).'
}

/** The list with the Bazaar alert added, when this build has the Bazaar tab and the list has none. */
export function withBazaarAlert(alerts: AlertDef[], storedPrefs: unknown): AlertDef[] {
  if (!UNRELEASED || alerts.some((a) => a.id === BAZAAR_WATCH_ALERT_ID)) return alerts
  return [...alerts, ...seedAlertsWith([BAZAAR_WATCH_ALERT], storedPrefs)]
}

/**
 * The stored list with the Bazaar alert added the first time only. A build without the tab neither
 * seeds nor stamps, so the day the tab ships the seed runs then. Takes the store as an argument
 * for alertSeeds.ts's import-cycle reason.
 */
export function seedBazaarAlertOnce(alerts: AlertDef[], store: Pick<Store<StoreShape>, 'get' | 'set'>): AlertDef[] {
  if (!UNRELEASED || store.get('alertBazaarSeed') === true) return alerts
  const next = withBazaarAlert(alerts, store.get('soundPacks'))
  if (next !== alerts) store.set('alerts', next)
  store.set('alertBazaarSeed', true)
  return next
}
