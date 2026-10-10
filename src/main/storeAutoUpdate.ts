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
