// spells/useLoadoutViews.ts — THE CLIENT'S STACKING ROWS FOR A CANDIDATE SET.
//
// The Loadout tab wants EXACT conflict verdicts, and exact means the game's own rules, which means
// the twelve effect slots out of the player's own `spells_us.txt`. This hook is the one door to
// them (docs/plans/spell-upgrades-and-loadout.md §3.5).
//
// ── IT ASKS ABOUT A BOUNDED SET, NOT THE TABLE ────────────────────────────────────────────────
//
// The parsed client table is ~48k entries. The question here is about the buffs one class trio can
// cast, which is tens of spells, so the request carries the names and the reply carries those rows.
// The standing no-bulk ruling is a ruling about any door, not only the engine's frames.
//
// ── AND NO ANSWER IS A SUPPORTED STATE, SAID RATHER THAN HIDDEN ───────────────────────────────
//
// A machine with no EverQuest install has no `spells_us.txt`, so the reply is an empty map. That is
// not a failure: `spellLoadout.ts` degrades to its FLAGGED tier - two spells that state the same
// stat in the committed catalog are reported as probably contesting, which is a true statement
// about the wiki's own words and is NOT a stacking verdict. The panel says which tier it is in.

import { useEffect, useMemo, useState } from 'react'
import { stackView, type StackSource, type StackSpellView } from '@shared/spellStack'

/** Name -> the client's view of it. Empty until the request lands, and empty forever with no install. */
export type LoadoutViews = ReadonlyMap<string, StackSpellView>

const EMPTY: LoadoutViews = new Map()

/**
 * Fetch the client rows for these spell names.
 *
 * KEYED ON THE JOINED NAMES rather than on the array identity: the caller derives its candidate list
 * inside a `useMemo` and a new array every render would re-request on every keystroke. The set is
 * tens of names, so joining them is cheaper than the round trip it prevents.
 */
export function useLoadoutViews(names: readonly string[]): LoadoutViews {
  const key = useMemo(() => [...names].sort((a, b) => a.localeCompare(b)).join('\u0000'), [names])
  const [views, setViews] = useState<LoadoutViews>(EMPTY)
  useEffect(() => {
    if (key === '') {
      setViews(EMPTY)
      return
    }
    let live = true
    void window.eq
      .getSpellStackViews(key.split('\u0000'))
      .then((rows: Record<string, StackSource>) => {
        if (!live) return
        const out = new Map<string, StackSpellView>()
        for (const [name, row] of Object.entries(rows)) out.set(name, stackView(row))
        setViews(out)
      })
      // A FAILED PULL IS EMPTY, NEVER A THROW - `useLevelUnlocks`' own rule. The panel then reports
      // its flagged tier, which is the same shape a machine with no install produces, so there is
      // no second failure path to reason about.
      .catch(() => {
        if (live) setViews(EMPTY)
      })
    return () => {
      live = false
    }
  }, [key])
  return views
}
