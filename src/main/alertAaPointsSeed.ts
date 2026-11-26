// alertAaPointsSeed.ts - the unspent-AA-points alert (owner, 2026-11-25: "warn me when i hit N
// unspent AA points"), an ordinary seeded alert on the 'aaPointsUnspent' app signal. Seeded OFF:
// the player turns it on in the Alerts tab and sets N on the Alt. Adv. tab (default 45).
// Seeded once, in its own file, both for alertBazaarSeed.ts's reasons.

import { DEFAULT_ALERT_PACK_ID, DEFAULT_ALERT_SOUNDS } from './data/defaultPacks'
import { seedAlertsWith } from './alertSeeds'
import type { CachedStore } from './storeCache'
import type { StoreShape } from './storeShape'
import { AA_POINTS_ALERT_BANNER, AA_POINTS_ALERT_SPEECH } from '../shared/aaPointsWarn'
import type { AlertDef } from '../shared/types'

export const AA_POINTS_ALERT_ID = 'aa-points-unspent'

const AA_POINTS_ALERT: AlertDef = {
  id: AA_POINTS_ALERT_ID,
  name: 'Unspent AA points',
  enabled: false,
  trigger: { type: 'app', signal: 'aaPointsUnspent' },
  sound: { packId: DEFAULT_ALERT_PACK_ID, soundId: DEFAULT_ALERT_SOUNDS.buffWearsOff },
  audio: 'speech',
  speech: { mode: 'custom', phrase: AA_POINTS_ALERT_SPEECH },
  bannerText: AA_POINTS_ALERT_BANNER,
  note: 'Seeded default, off - fires when your unspent AA points reach the number set on the Alt. Adv. tab (45 unless changed).'
}

/** The list with the AA points alert added, when the list has none. `seed` as in alertRespawnSeed.ts. */
export function withAaPointsAlert(alerts: AlertDef[], storedPrefs: unknown, seed: typeof seedAlertsWith = seedAlertsWith): AlertDef[] {
  if (alerts.some((a) => a.id === AA_POINTS_ALERT_ID)) return alerts
  return [...alerts, ...seed([AA_POINTS_ALERT], storedPrefs)]
}

/** The stored list with the AA points alert added the first time only. */
export function seedAaPointsAlertOnce(
  alerts: AlertDef[],
  store: Pick<CachedStore<StoreShape>, 'get' | 'set'>,
  seed: typeof seedAlertsWith = seedAlertsWith
): AlertDef[] {
  if (store.get('alertAaPointsSeed') === true) return alerts
  const next = withAaPointsAlert(alerts, store.get('soundPacks'), seed)
  if (next !== alerts) store.set('alerts', next)
  store.set('alertAaPointsSeed', true)
  return next
}
