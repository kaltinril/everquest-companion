// lib/useMetInLog.ts — FEEDS `shared/metInLog.ts` FROM THE ENGINE'S `met` MODULE, and tells the
// era-dependent views when that evidence moved.
//
// The owner ruling of 2026-10-17: the player's own log outranks a wiki era banner. A mob the log
// shows they killed, conned or looted from, an item they looted, a zone they entered, is in era for
// them. `shared/metInLog.ts` holds that evidence as module state so the PURE era predicates
// (`shared/mobEra.ts`, `shared/planner/era.ts`) can ask it; this file is the one writer.
//
// WHERE IT COMES FROM: the engine's `met` module (`met.rs`, `shared/metNames.ts`), the names the
// `kills`, `loot`, `consider` and `progression` modules fold, kept for the whole log. It used to be
// built here from those four, which kept all four watched on every tab: each kill or loot re-sent
// the whole loot ledger (perf review 2026-10-20 #1). `met` moves only when a name is new.
//
// MOUNTED ONCE, at the main window's root (`App.tsx` renders `MetInLogFeed`). It is a component that
// renders nothing, so the module updates it rides re-render it alone and never the whole app. A kind
// re-folds only when its list changed (`createMetFeed`); `setMet` still returns early on an
// unchanged set.
//
// RE-RENDERING THE VIEWS. An era verdict now depends on this evidence, and the evidence is module
// state React cannot see. `useMetVersion()` is the subscription: an era-dependent view reads it and
// puts it in the memo deps over a verdict, and the era chips read it so they redraw themselves.

import { useEffect, useState, useSyncExternalStore } from 'react'
// RELATIVE value imports (the mobSearch house law): the era join reaches this under the node runner.
import { metVersion, setMet, type MetKind } from '../../../shared/metInLog'
import { MET_MODULE, type MetSnap } from '../../../shared/metNames'
import { useModule } from './useModule'

const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** The evidence's version, as React state: a view that reads it re-renders when the log meets more. */
export function useMetVersion(): number {
  return useSyncExternalStore(subscribe, metVersion)
}

/** The same names in the same order? Compared from the newest end. */
export function sameNames(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== b[i]) return false
  return true
}

const KINDS: readonly MetKind[] = ['mobs', 'items', 'zones']

/**
 * A feeder that re-folds a kind only when its list changed (a `met` push is a new object every
 * time). `null` (no state yet, or a character switch) is no evidence. Returns whether the evidence
 * moved. `set` is `setMet`; a test passes a counting one.
 */
export function createMetFeed(set: typeof setMet = setMet): (now: MetSnap | null) => boolean {
  let was: Record<MetKind, readonly string[]> | null = null
  return (now) => {
    const before = metVersion()
    const next = { mobs: now?.mobs ?? [], items: now?.items ?? [], zones: now?.zones ?? [] }
    for (const k of KINDS) if (was === null || !sameNames(was[k], next[k])) set(k, next[k])
    was = next
    return metVersion() !== before
  }
}

/** Feed the evidence store from the served `met` module. Call it from ONE component (`MetInLogFeed`). */
export function useMetInLog(): void {
  const met = useModule<MetSnap>(MET_MODULE)
  const [feed] = useState(() => createMetFeed())

  useEffect(() => {
    if (feed(met)) for (const l of [...listeners]) l()
  }, [feed, met])
}

/** The root's mount point for the feed: renders nothing, so its updates re-render nothing else. */
export function MetInLogFeed(): null {
  useMetInLog()
  return null
}
