// alertRespawnSeed.ts - the respawn pre-alert (fork #7), an ordinary seeded alert on the
// 'respawnSoon' app signal, so its sound, voice, banner and history are the Alerts tab's.
// Seeded once, in its own file, both for alertBazaarSeed.ts's reasons.

import { DEFAULT_ALERT_PACK_ID, DEFAULT_ALERT_SOUNDS } from './data/defaultPacks'
import { seedAlertsWith } from './alertSeeds'
import type { CachedStore } from './storeCache'
import type { StoreShape } from './storeShape'
import { RESPAWN_ALERT_BANNER, RESPAWN_ALERT_SPEECH } from '../shared/respawnAlert'
import type { AlertDef } from '../shared/types'

export const RESPAWN_SOON_ALERT_ID = 'respawn-soon'

const RESPAWN_SOON_ALERT: AlertDef = {
  id: RESPAWN_SOON_ALERT_ID,
  name: 'Respawn timer ending',
  enabled: true,
  trigger: { type: 'app', signal: 'respawnSoon' },
  sound: { packId: DEFAULT_ALERT_PACK_ID, soundId: DEFAULT_ALERT_SOUNDS.buffWearsOff },
  audio: 'speech',
  speech: { mode: 'custom', phrase: RESPAWN_ALERT_SPEECH },
  bannerText: RESPAWN_ALERT_BANNER,
  // Two mobs due within the default 2 s cooldown must both be heard; the watcher fires each clock once.
  cooldownMs: 0,
  note: 'Seeded default - fires before a watched mob respawns, when "Alert before respawn" is ticked on the Timers tab.'
}

/**
 * The list with the respawn alert added, when the list has none. `seed` is the sound-ref step,
 * which reads the installed packs through Electron: a parameter so tests/alertRespawnSeed.test.mts
 * can run these rules without it.
 */
export function withRespawnAlert(alerts: AlertDef[], storedPrefs: unknown, seed: typeof seedAlertsWith = seedAlertsWith): AlertDef[] {
  if (alerts.some((a) => a.id === RESPAWN_SOON_ALERT_ID)) return alerts
  return [...alerts, ...seed([RESPAWN_SOON_ALERT], storedPrefs)]
}

/** The stored list with the respawn alert added the first time only. */
export function seedRespawnAlertOnce(
  alerts: AlertDef[],
  store: Pick<CachedStore<StoreShape>, 'get' | 'set'>,
  seed: typeof seedAlertsWith = seedAlertsWith
): AlertDef[] {
  if (store.get('alertRespawnSeed') === true) return alerts
  const next = withRespawnAlert(alerts, store.get('soundPacks'), seed)
  if (next !== alerts) store.set('alerts', next)
  store.set('alertRespawnSeed', true)
  return next
}
