// AaPointsWatcher - fires the 'aaPointsUnspent' app signal once each time the unspent AA points rise
// to or past the player's N (shared/aaPointsWarn.ts), mounted for the life of the window
// (AppCelebrations). The first count seen is a silent baseline, as useLevelUpToast's is.

import { useEffect, useRef } from 'react'
import { aaAlertCrossed, aaPointsCaptures } from '@shared/aaPointsWarn'
import { fireAppSignal } from '../alerts/player'
import { useAaAlertAt, useAaUnspent } from './useAaUnspent'

export default function AaPointsWatcher(): null {
  const unspent = useAaUnspent()
  const [at] = useAaAlertAt()
  const before = useRef<number | null>(null)

  // A character switch rebuilds the world, so its first count is a baseline too.
  useEffect(
    () =>
      window.eq.onCharacter(() => {
        before.current = null
      }),
    []
  )

  useEffect(() => {
    const prev = before.current
    before.current = unspent
    if (unspent !== null && aaAlertCrossed(prev, unspent, at)) {
      fireAppSignal('aaPointsUnspent', `${String(unspent)} unspent AA points`, aaPointsCaptures(unspent))
    }
  }, [unspent, at])

  return null
}
