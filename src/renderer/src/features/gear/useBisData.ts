// gear/useBisData.ts — THE BEST IN SLOT TAB'S STATE AND MODEL, and the Gear tab's BEST column's door to
// the same board (plans/2026-11-24-bis-sheet.md; owner, 2026-11-24: the feature *"will also
// correct/tie in to our existing BEST stat"*).

import { useCallback, useMemo, useState } from 'react'
import type { ClassAbbr } from '@shared/classCombo'
import type { GearRow } from '@shared/planner/gear'
import type { TierSetup } from '@shared/planner/tierChips'
import { buildTierModel, type TierModel } from '@shared/planner/tierWeights'
import { activeSetup, readBisPrefs, writeBisPrefs, type BisPrefs } from './bisPrefs'
import { useEraHidden } from './gearData'

/** The tab's choices, stored at `eq.gear.tiers` on every change. */
export function useBisPrefs(): [BisPrefs, (next: BisPrefs) => void] {
  const [prefs, setState] = useState<BisPrefs>(readBisPrefs)
  const set = useCallback((next: BisPrefs) => {
    setState(next)
    writeBisPrefs(next)
  }, [])
  return [prefs, set]
}

/**
 * The model for the classes and level: units and budgets measured over the IN-ERA rows whatever the
 * tab's era toggle says, so the meaning of "S" does not move when the player shows old items.
 */
export function useTierModel(rows: readonly GearRow[], classes: readonly ClassAbbr[], level: number): TierModel {
  const { eraHidden } = useEraHidden()
  const key = classes.join(' ')
  return useMemo(
    () => buildTierModel(rows, key === '' ? [] : (key.split(' ') as ClassAbbr[]), level, (r) => !eraHidden(r as GearRow)),
    [rows, eraHidden, key, level]
  )
}

/** What the Gear tab's BEST column scores by: the board in force and its model. */
export interface TierScoring {
  model: TierModel
  setup: TierSetup
}

/**
 * THE BEST COLUMN'S BOARD: the one the Best in slot tab stores, or the default for the classes picked
 * when the player has never touched it. Read once per mount (the two tabs are never on screen
 * together, and each tab switch remounts the view).
 */
export function useTierScoring(rows: readonly GearRow[], classes: readonly ClassAbbr[]): TierScoring {
  const [prefs] = useState<BisPrefs>(readBisPrefs)
  const model = useTierModel(rows, classes, prefs.level)
  const key = classes.join(' ')
  return useMemo(() => ({ model, setup: activeSetup(prefs, key === '' ? [] : (key.split(' ') as ClassAbbr[])) }), [model, prefs, key])
}
