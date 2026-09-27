// spells/useLoadoutPool.ts — THE BUFF SET'S CANDIDATES, AND THE GROUP THEY ARE DRAWN FROM.
//
// The Loadout tab's pool used to be one `loadoutCandidates` call over your own classes. With a
// group it is `partyCandidates` (`shared/spellParty.ts`), and the group itself is a stored view
// preference - so both live here, and `SpellLoadoutView`, which sits at this tree's
// 100-line-per-function ceiling, trades a four-line memo for one call.
//
// The group is a per-machine preference like the class filters: two localStorage keys (the list,
// and your own colour), read once, validated by the shared readers on the way back in.
//
// EVERYTHING THAT GROUPS, ORDERS OR OFFERS IS THE SHARED MODULE'S (ruling 4). This file holds
// state and hands the shared answers on.

import { useCallback, useMemo, useState } from 'react'
import type { ClassAbbr } from '@shared/classCombo'
import type { UnlockSpell } from '@shared/levelUnlocks'
import { DEFAULT_STAT_WEIGHTS, type LoadoutCandidate } from '@shared/spellLoadout'
import {
  keepByCaster,
  partyCandidates,
  partyColors,
  partySuggestions,
  readParty,
  readSelfColor,
  type CasterGroup,
  type PartyMember,
  type PartySuggestion,
  type RosterClasses
} from '@shared/spellParty'
import { useModule } from '../../lib/useModule'

const PARTY_KEY = 'eq.spells.party'
const SELF_COLOR_KEY = 'eq.spells.party.self'

/** The group, as the strip draws and edits it. */
export interface LoadoutGroup {
  party: PartyMember[]
  setParty: (next: PartyMember[]) => void
  setSelfColor: (slot: number) => void
  /** The colour slot a caster wears, you included. */
  colorOf: (caster: string) => number
  /** Roster members whose classes a `/who` row stated and who are not in the group yet. */
  suggestions: PartySuggestion[]
}

/** The pool, who casts what in it, and the group it was drawn from. */
export interface LoadoutPool extends LoadoutGroup {
  candidates: LoadoutCandidate[]
  /** Everyone in the group who can cast a spell, you first. Empty with no group. */
  castersOf: (name: string) => readonly string[]
  /** The kept set by caster, you first. One group when nobody else is in it. */
  groupKeep: (keep: readonly LoadoutCandidate[]) => CasterGroup[]
}

/** The stored half: the list, your colour, and their writers. */
function useStoredGroup(): Omit<LoadoutGroup, 'suggestions'> {
  const [party, setStored] = useState(() => readParty(localStorage.getItem(PARTY_KEY)))
  const [selfColor, setSelf] = useState(() => readSelfColor(localStorage.getItem(SELF_COLOR_KEY)))
  const setParty = useCallback((next: PartyMember[]) => {
    localStorage.setItem(PARTY_KEY, JSON.stringify(next))
    setStored(next)
  }, [])
  const setSelfColor = useCallback((slot: number) => {
    localStorage.setItem(SELF_COLOR_KEY, String(slot))
    setSelf(readSelfColor(String(slot)))
  }, [])
  const colors = useMemo(() => partyColors(party, selfColor), [party, selfColor])
  const colorOf = useCallback((caster: string) => colors.get(caster) ?? 0, [colors])
  return { party, setParty, setSelfColor, colorOf }
}

export function useLoadoutPool(
  spells: readonly UnlockSpell[],
  classes: readonly ClassAbbr[],
  level: number
): LoadoutPool {
  const group = useStoredGroup()
  const { party } = group
  // THE ROSTER IS THE ENGINE'S, and a member carries `classes` only where a `/who` row stated
  // them. Absent on an engine that does not read other players' rows: then nothing is offered.
  const roster = useModule<{ members?: RosterClasses[] }>('roster')
  const suggestions = useMemo(() => partySuggestions(roster?.members ?? [], party), [roster, party])
  // LEVEL AND ERA ARE PART OF THE QUESTION (owner, 2026-09-10). Without them the tab recommended
  // spells he could not cast - see `CandidateQuery.level` for the count.
  const pool = useMemo(
    () => partyCandidates(spells, classes, party, { weights: DEFAULT_STAT_WEIGHTS, query: { level } }),
    [spells, classes, party, level]
  )
  const castersOf = useCallback((name: string) => pool.casters.get(name) ?? [], [pool])
  const groupKeep = useCallback(
    (keep: readonly LoadoutCandidate[]) => keepByCaster(keep, pool.casters, party),
    [pool, party]
  )
  return { ...group, suggestions, candidates: pool.candidates, castersOf, groupKeep }
}
