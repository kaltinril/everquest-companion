// storeAutoUpdate.ts: the persisted "Update automatically" switch, through the `settingsStore`
// door because store.ts sits at its 400-line ceiling. Additive and optional, so no schema bump:
// an absent key means on, the shipped behaviour.

import { settingsStore } from './store'

/** True when the user switched automatic updates off. */
export function getAutoUpdateOff(): boolean {
  return settingsStore.get('autoUpdateOff') === true
}

export function setAutoUpdateOff(off: boolean): void {
  settingsStore.set('autoUpdateOff', off)
}

/**
 * The version a finished download left on disk. Kept so the next launch can say a newer build is
 * downloaded but not installed; the 'ready' state itself is never persisted (updater.ts). Additive
 * and optional like the switch: an absent key means nothing is waiting.
 */
export function getUpdateStagedVersion(): string | undefined {
  const version = settingsStore.get('updateStagedVersion')
  return typeof version === 'string' && version.length > 0 ? version : undefined
}

export function setUpdateStagedVersion(version: string | undefined): void {
  if (version === undefined) settingsStore.delete('updateStagedVersion')
  else settingsStore.set('updateStagedVersion', version)
}
