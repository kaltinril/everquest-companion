// spells/useLoadoutPool.ts — THE BUFF SET'S CANDIDATES, AND THE GROUP THEY ARE DRAWN FROM.
//
// The Loadout tab's pool used to be one `loadoutCandidates` call over your own classes. With a
// group it is `partyCandidates` (`shared/spellParty.ts`), and the group itself is a stored view
// preference - so both live here, and `SpellLoadoutView`, which sits at this tree's
// 100-line-per-function ceiling, trades a four-line memo for one call.
//
// The group is a per-machine preference like the class filters: one localStorage key, read once,
// validated by the shared reader on the way back in.

import { useCallback, useMemo, useState } from 'react'
import type { ClassAbbr } from '@shared/classCombo'
import type { UnlockSpell } from '@shared/levelUnlocks'
import { DEFAULT_STAT_WEIGHTS, type LoadoutCandidate } from '@shared/spellLoadout'
import { castByLabel, partyCandidates, readParty, type PartyMember } from '@shared/spellParty'

const PARTY_KEY = 'eq.spells.party'

/** The pool, who casts what in it, and the group with its one writer. */
export interface LoadoutPool {
  candidates: LoadoutCandidate[]
  party: PartyMember[]
  setParty: (next: PartyMember[]) => void
  /** Who casts a spell, in words. Undefined with no group: every row is yours. */
  castBy: (name: string) => string | undefined
}

export function useLoadoutPool(
  spells: readonly UnlockSpell[],
  classes: readonly ClassAbbr[],
  level: number
): LoadoutPool {
  const [party, setStored] = useState(() => readParty(localStorage.getItem(PARTY_KEY)))
  const setParty = useCallback((next: PartyMember[]) => {
    localStorage.setItem(PARTY_KEY, JSON.stringify(next))
    setStored(next)
  }, [])
  // LEVEL AND ERA ARE PART OF THE QUESTION (owner, 2026-09-10). Without them the tab recommended
  // spells he could not cast - see `CandidateQuery.level` for the count.
  const pool = useMemo(
    () => partyCandidates(spells, classes, party, { weights: DEFAULT_STAT_WEIGHTS, query: { level } }),
    [spells, classes, party, level]
  )
  const castBy = useCallback(
    (name: string) => {
      const names = pool.casters.get(name)
      return names === undefined ? undefined : castByLabel(names)
    },
    [pool]
  )
  return { candidates: pool.candidates, party, setParty, castBy }
}
