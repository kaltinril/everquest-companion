// useLevelUnlocks — the renderer's ONE pull of the level-unlock dataset, and the combo join
// every reader of it performs (docs/plans/levelup-whats-new.md).
//
// WHY A MODULE-LEVEL CACHE. The dataset is built in main from two COMPILE-TIME JSONs
// (spells.json + classes.json) plus the player's own spells_us.txt. One in-flight promise, shared
// by every caller, means the panel and the always-mounted ding detector cost exactly one IPC
// between them however many times either remounts.
//
// IT IS DROPPED WHEN THE EVERQUEST FOLDER CHANGES (`heldPull.ts`). Main then reads the game's file
// from the new folder, and a dataset pulled before that would lack its facts until restart.
//
// A FAILED PULL IS EMPTY, NEVER A THROW. The panel then renders its "no unlock data" state and
// the toast falls back to celebrating the level alone — the same shapes a class with zero
// unlocks at that level produces, so there is no second failure path to reason about.

import { useEffect, useMemo, useState } from 'react'
import { heldPull } from '@shared/heldPull'
import { EMPTY_UNLOCK_DATA, comboClassesOf, type ComboClasses, type LevelUnlockData } from '@shared/levelUnlocks'
import { useComboSnap } from '../profiles/ClassComboData'

/**
 * The pull, and the dataset once it has landed, so a re-mount STARTS with it (the lag sweep,
 * 2026-10-11). Every mount used to render once empty and once more when the already-settled
 * promise re-delivered the same object — for the Spellbook, a toolbar drawn twice on every open of
 * the tab.
 */
const held = heldPull<LevelUnlockData>({
  pull: () => window.eq.getLevelUnlocks(),
  empty: EMPTY_UNLOCK_DATA,
  staleOn: (cb) => void window.eq.onEqConfigChanged(cb)
})

/** The shared pull. Exported for the detector, which needs the data outside React's render. */
export function levelUnlocks(): Promise<LevelUnlockData> {
  return held.get()
}

/** The dataset, or the empty one until it lands. Never null — an unloaded panel shows empty lists. */
export function useLevelUnlocks(): LevelUnlockData {
  // A mount after the pull has landed takes the same object the effect below would set, so the
  // set is React's own no-op and the view renders once.
  const [data, setData] = useState<LevelUnlockData>(() => held.landed() ?? EMPTY_UNLOCK_DATA)
  useEffect(() => {
    let live = true
    const pull = (): void => {
      void levelUnlocks().then((d) => {
        if (live) setData(d)
      })
    }
    pull()
    // The EverQuest folder changed: ask again, and keep what is drawn until the answer lands.
    const stop = held.onStale(pull)
    return () => {
      live = false
      stop()
    }
  }, [])
  return data
}

/**
 * The loadout the character is running NOW — the panel's chips ("which of these are mine").
 *
 * The CURRENT interval, not a `Date.now()` join: they answer the same question, and the module's
 * own `current` cannot drift a frame behind the clock. The toast takes the other form
 * (`comboClassesAt(intervals, ding.ts)`, law 10) because a ding is a timestamped record.
 */
export function useCurrentComboClasses(): ComboClasses {
  const snap = useComboSnap()
  return useMemo(() => comboClassesOf(snap.current), [snap])
}
