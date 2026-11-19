// useRespawnAlert - the alert-before-respawn setting (shared/respawnAlert.ts), one copy per window.
// useBazaarWatch's arrangement: the Timers tab and the always-mounted watcher read the same
// module-scope copy, every edit is written through, and only the newest write's reply lands.

import { useSyncExternalStore } from 'react'
import { DEFAULT_RESPAWN_ALERT, type RespawnAlertSetting } from '@shared/respawnAlert'
import { afterLoad, replyGate } from '../bazaar/latestReply'

let setting: RespawnAlertSetting = DEFAULT_RESPAWN_ALERT
let loaded: ((edit: () => void) => void) | null = null
const listeners = new Set<() => void>()
const replies = replyGate()

function emit(next: RespawnAlertSetting): void {
  setting = next
  for (const l of listeners) l()
}

function landing(ticket: number): (stored: RespawnAlertSetting) => void {
  return (stored) => {
    if (replies.isLatest(ticket)) emit(stored)
  }
}

function load(): (edit: () => void) => void {
  loaded ??= afterLoad(window.eq.getRespawnAlert().then(landing(0), () => undefined))
  return loaded
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  load()
  return () => {
    listeners.delete(listener)
  }
}

/** Change part of the setting; an edit made before the first load waits for it. */
export function editRespawnAlert(change: Partial<RespawnAlertSetting>): void {
  load()(() => {
    const ticket = replies.next()
    emit({ ...setting, ...change })
    void window.eq.setRespawnAlert(setting).then(landing(ticket), () => undefined)
  })
}

export function useRespawnAlert(): RespawnAlertSetting {
  return useSyncExternalStore(subscribe, () => setting)
}
