// The left menu's two sizes (fork #10), read from the localStorage subscription the drawer's folds
// use: right on first paint, and live between the Preferences card and the drawer beside it.

import { useCallback } from 'react'
import {
  NAV_ROW_DEFAULT,
  NAV_ROW_KEY,
  NAV_ROW_STEPS,
  NAV_TEXT_DEFAULT,
  NAV_TEXT_KEY,
  NAV_TEXT_STEPS,
  navMenuMetrics,
  readNavStep,
  stepNavStep,
  type NavMenuMetrics
} from '@shared/navMenu'
import { useRawPref } from '../features/combat/useCombatPrefs'

/** One ladder value and its stepper. The press writes the next stop, never an amount. */
export function useNavStep(
  key: string,
  steps: readonly number[],
  dflt: number
): [number, (dir: 1 | -1) => void] {
  const [raw, setRaw] = useRawPref(key)
  const value = readNavStep(raw, steps, dflt)
  const step = useCallback(
    (dir: 1 | -1) => {
      setRaw(String(stepNavStep(steps, value, dir)))
    },
    [setRaw, steps, value]
  )
  return [value, step]
}

export function useNavMenu(): NavMenuMetrics {
  const [textPx] = useNavStep(NAV_TEXT_KEY, NAV_TEXT_STEPS, NAV_TEXT_DEFAULT)
  const [rowPx] = useNavStep(NAV_ROW_KEY, NAV_ROW_STEPS, NAV_ROW_DEFAULT)
  return navMenuMetrics(textPx, rowPx)
}
