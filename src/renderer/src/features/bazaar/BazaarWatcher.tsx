// BazaarWatcher — the Bazaar watchlist's alerts, mounted for the life of the window
// (AppCelebrations, through unreleasedBazaar.tsx) so an offer is caught whatever tab is open.
//
// It reads the engine's live offers (bazaar.rs `LiveOffer`): only offers heard after the replay
// caught up are ever there, and the first snapshot's are a baseline, never alerted on (the
// useLevelUpToast rule: what was already there when you looked is history). A matched offer fires
// the 'bazaarWatch' app signal, so the Alerts tab's "Bazaar watchlist match" alert says it with
// its own sound, voice, banner and cooldown, and is kept in a short list the tab shows, so one
// missed with the banner closed is still there to read.
//
// IT WATCHES THE MODULE ONLY WHILE THERE IS A WATCHLIST (the 2026-11-06 renderer pass). The
// module subscription is a hydration over IPC and a re-read of the bazaar snapshot on every push,
// paid for the life of the window; with nothing on the list there is nothing an offer could
// match, so the reader below is mounted only while the list is non-empty. A list that becomes
// non-empty mounts it fresh, and its first snapshot is the baseline, exactly as at launch.

import { useEffect, useRef, useSyncExternalStore, type JSX } from 'react'
import { BAZAAR_MODULE_ID, type BazaarSnap, type LiveOffer } from '@shared/bazaar'
import { freshWatchAlerts, watchAlertCaptures, type BazaarWatchlist } from '@shared/bazaarWatch'
import { useModule } from '../../lib/useModule'
import { fireAppSignal } from '../alerts/player'
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

function raise(o: LiveOffer, reason: string, text: string): void {
  fireAppSignal('bazaarWatch', text, watchAlertCaptures(o, reason))
  record({ seq: o.seq, at: o.at, text })
}

export default function BazaarWatcher(): JSX.Element | null {
  const { list } = useBazaarWatch()
  return list.entries.length === 0 ? null : <OffersReader list={list} />
}

/** The module reader, alive only while the watchlist has an entry (file header). */
function OffersReader({ list }: { list: BazaarWatchlist }): null {
  const snap = useModule<BazaarSnap>(BAZAAR_MODULE_ID)
  const seen = useRef<number | null>(null)

  useEffect(() => {
    if (snap === null) {
      // A character switch clears the store; the next snapshot is a fresh baseline.
      seen.current = null
      return
    }
    const { newest, alerts } = freshWatchAlerts(snap, list, seen.current)
    seen.current = newest
    for (const a of alerts) raise(a.offer, a.reason, a.text)
  }, [snap, list])

  return null
}
