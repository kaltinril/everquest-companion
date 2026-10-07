// BazaarWatcher — the Bazaar watchlist's alerts, mounted for the life of the window
// (AppCelebrations, through unreleasedBazaar.tsx) so an offer is caught whatever tab is open.
//
// It reads the engine's live offers (bazaar.rs `LiveOffer`): only offers heard after the replay
// caught up are ever there, and the first snapshot's are a baseline, never alerted on (the
// useLevelUpToast rule: what was already there when you looked is history). A matched offer goes
// to the alert banner, is said aloud unless the app is muted, and is kept in a short list the tab
// shows, so one missed with the banner closed is still there to read.

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { BAZAAR_MODULE_ID, type BazaarSnap, type LiveOffer } from '@shared/bazaar'
import { freshWatchAlerts } from '@shared/bazaarWatch'
import { useModule } from '../../lib/useModule'
import { currentVoicePrefs, speak } from '../../lib/speech'
import { currentPrefs } from '../alerts/player'
import { useBazaarWatch } from './useBazaarWatch'

export interface HeardAlert {
  seq: number
  at: string
  text: string
}

const KEEP = 20
let heard: HeardAlert[] = []
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function record(a: HeardAlert): void {
  heard = [a, ...heard].slice(0, KEEP)
  for (const l of listeners) l()
}

/** The alerts raised this session, newest first. */
export function useHeardAlerts(): HeardAlert[] {
  return useSyncExternalStore(subscribe, () => heard)
}

function raise(o: LiveOffer, text: string): void {
  window.eq.showAlertBanner({
    id: `bazaar:${o.seq}`,
    alertId: 'bazaar-watch',
    ts: Date.now(),
    text,
    color: o.dir === 'sell' ? 'green' : 'blue'
  })
  const prefs = currentPrefs()
  if (!prefs.muted) {
    void speak(`${o.item} ${o.dir === 'sell' ? 'for sale' : 'wanted'}`, currentVoicePrefs(), { gain: prefs.globalVolume })
  }
  record({ seq: o.seq, at: o.at, text })
}

export default function BazaarWatcher(): null {
  const snap = useModule<BazaarSnap>(BAZAAR_MODULE_ID)
  const { list } = useBazaarWatch()
  const seen = useRef<number | null>(null)

  useEffect(() => {
    if (snap === null) {
      // A character switch clears the store; the next snapshot is a fresh baseline.
      seen.current = null
      return
    }
    const { newest, alerts } = freshWatchAlerts(snap, list, seen.current)
    seen.current = newest
    for (const a of alerts) raise(a.offer, a.text)
  }, [snap, list])

  return null
}
