// aa/useAaRanks.ts — the current character's AA ranks (shared/aaRanks.ts) and the stat cap they set
// (shared/reincarnationCap.ts), for the Alt. Advancement tab and the Best in slot sheet.
//
// The log side is the `leveling` snapshot's purchase lines, its latest `/alt list` run and the AAs
// seen activated (the order of proof is shared/aaRanks.ts's); the player's picks are kept per
// character name under `AA_PICKS_KEY` in localStorage, one store for every caller in the window.
// Free ranks the game grants (shared/aaGranted.ts) read the log's last stated level and the class combo.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { CharacterSnap } from '@shared/characterTypes'
import type { LevelingSnap } from '@shared/types'
import {
  AA_PICKS_KEY,
  rankAasFrom,
  sanitizeAaPicks,
  withAaPick,
  type AaPicks,
  type AaPicksByCharacter,
  type AaRanked
} from '@shared/aaRanks'
import { withGranted } from '@shared/aaGranted'
import { resolvedClasses, type ClassAbbr } from '@shared/classCombo'
import { reincarnations as reincarnationsOf } from '@shared/reincarnationClimbs'
import { statCapOf, type StatCap } from '@shared/reincarnationCap'
import { useModule } from '../../lib/useModule'
import { useComboSnap } from '../profiles/ClassComboData'

const listeners = new Set<() => void>()
const NO_PICKS: AaPicks = {}
let cache: { raw: string | null; value: AaPicksByCharacter } = { raw: null, value: {} }
/** Picks a blocked store refused to keep: they still apply for this session. */
let unsaved: AaPicksByCharacter | null = null

function notifyAll(): void {
  for (const l of [...listeners]) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  if (listeners.size === 1) window.addEventListener('storage', notifyAll)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0) window.removeEventListener('storage', notifyAll)
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(AA_PICKS_KEY)
  } catch {
    return null
  }
}

/** The stored picks, parsed once per stored string so the snapshot keeps its identity. */
function snapshot(): AaPicksByCharacter {
  if (unsaved !== null) return unsaved
  const raw = readRaw()
  if (raw !== cache.raw) {
    let parsed: unknown = null
    try {
      parsed = raw === null || raw === '' ? null : JSON.parse(raw)
    } catch {
      parsed = null
    }
    cache = { raw, value: sanitizeAaPicks(parsed) }
  }
  return cache.value
}

function write(next: AaPicksByCharacter): void {
  try {
    localStorage.setItem(AA_PICKS_KEY, JSON.stringify(next))
    unsaved = null
  } catch {
    unsaved = next
  }
  notifyAll()
}

export interface AaRanksState {
  /** The current character's name; null before the log names one. */
  character: string | null
  /** The level the log last stated; null before one. */
  level: number | null
  /** The classes the log shows (the combo); empty before one is known. */
  detected: ClassAbbr[]
  /** False until the `leveling` snapshot is served. */
  served: boolean
  ranked: AaRanked[]
  /** The ranks before free ranks are laid on, for another combo's grants. */
  ungranted: AaRanked[]
  /** When the latest `/alt list` run was printed; null before one. */
  listTs: number | null
  /** When each reincarnation the log shows happened, newest first. */
  reincarnations: number[]
  /** Set this character's rank in the row stored under `key`, or `null` to go back to the log. */
  setPick: (key: string, rank: number | null) => void
}

/** The current character's rank in every row of the AA table; free ranks for `planned` classes when given. */
export function useAaRanks(planned: readonly ClassAbbr[] | null = null): AaRanksState {
  const snap = useModule<LevelingSnap>('leveling')
  const charSnap = useModule<CharacterSnap>('character')
  const character = charSnap?.character?.name ?? null
  const level = charSnap?.level?.level ?? null
  const combo = useComboSnap().current
  const detected = useMemo(() => (combo === null ? [] : resolvedClasses(combo)), [combo])
  const classes = planned ?? detected
  const all = useSyncExternalStore(subscribe, snapshot, () => cache.value)
  const picks = character === null ? NO_PICKS : (all[character] ?? NO_PICKS)
  const spends = snap?.aaSpends
  const levels = snap?.levels
  const found = useMemo(() => reincarnationsOf(levels ?? [], spends ?? []), [levels, spends])
  const list = snap?.aaList ?? null
  const activations = snap?.aaActivations
  const ungranted = useMemo(
    () => rankAasFrom({ spends: spends ?? [], races: found.map((r) => r.race), list, activations: activations ?? [] }, picks),
    [spends, picks, found, list, activations]
  )
  const ranked = useMemo(() => withGranted(ungranted, { level, classes }), [ungranted, level, classes])
  const reincarnations = useMemo(() => found.map((r) => r.ts), [found])
  const setPick = useCallback(
    (key: string, rank: number | null) => {
      if (character !== null) write(withAaPick(snapshot(), character, key, rank))
    },
    [character]
  )
  return { character, level, detected, served: snap !== null, ranked, ungranted, listTs: list?.ts ?? null, reincarnations, setPick }
}

/** The current character's base stat cap: hard with no reincarnation, soft (and raised) after one. */
export function useReincarnationCap(hardCap?: number): StatCap {
  const { ranked, reincarnations } = useAaRanks()
  return useMemo(() => statCapOf(ranked, reincarnations, hardCap), [ranked, reincarnations, hardCap])
}
