// aa/useAaUnspent.ts — the current character's unspent AA points (shared/aaPointsWarn.ts), for the
// nav row's "!", the Alt. Adv. tab's header and the alert watcher; and the player's N for the alert.

import { useCallback, useMemo } from 'react'
import { AA_POINTS_ALERT_AT_KEY, aaAlertAtOf, aaUnspentOf } from '@shared/aaPointsWarn'
import type { LevelingSnap } from '@shared/types'
import { useModule } from '../../lib/useModule'
import { useRawPref } from '../combat/useCombatPrefs'

/** Unspent points, or null before the log states any; recomputed only when the AA arrays move. */
export function useAaUnspent(): number | null {
  const snap = useModule<LevelingSnap>('leveling')
  const gains = snap?.aaGains
  const spends = snap?.aaSpends
  return useMemo(() => aaUnspentOf(gains, spends), [gains, spends])
}

/** The alert's N (default 45), kept in this window's storage. */
export function useAaAlertAt(): [number, (n: number) => void] {
  const [raw, setRaw] = useRawPref(AA_POINTS_ALERT_AT_KEY)
  const set = useCallback((n: number) => setRaw(String(aaAlertAtOf(String(n)))), [setRaw])
  return [aaAlertAtOf(raw), set]
}
