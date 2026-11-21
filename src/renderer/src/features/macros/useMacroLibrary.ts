// macros/useMacroLibrary.ts — the Macros tab's library: loaded once from main, changed through the
// pure operations in shared/macros, and saved whole a moment after each change. Every change by
// the player is an Undo step (shared/macros/history.ts); an Undo or a Redo is saved like any other.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type History, amend as amendHistory, canRedo, canUndo, record, redo as redoHistory, startHistory, undo as undoHistory } from '@shared/macros/history'
import type { MacroLibrary } from '@shared/macros/types'

/** A change is saved this long after the last one, so typing is one write, not one a key. */
const SAVE_DELAY_MS = 400

type Update = (library: MacroLibrary) => MacroLibrary

export interface MacroStore {
  library: MacroLibrary
  /**
   * Replace the library with what `update` makes of the current one: one Undo step. Typing passes
   * the `field` it happens in, so a run of keys in one field is one step.
   */
  change: (update: Update, field?: string) => void
  /** A change that is not the player's (the game's macros brought in): saved, but no Undo step. */
  amend: (update: Update) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export interface MacroLibraryState {
  /** Null until main has answered. */
  store: MacroStore | null
  /** The library could not be loaded: nothing is shown and nothing is saved. */
  loadFailed: boolean
  /** The last save did not land. */
  saveFailed: boolean
}

type LibraryHistory = History<MacroLibrary>

export function useMacroLibrary(): MacroLibraryState {
  const [history, setHistory] = useState<LibraryHistory | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const library = history?.present ?? null
  const latest = useRef<MacroLibrary | null>(null)
  /** A change the save has not been sent for yet. */
  const dirty = useRef(false)

  useEffect(() => {
    let live = true
    window.eq.macrosLoad().then(
      (loaded) => {
        if (live) setHistory(startHistory(loaded))
      },
      () => {
        if (live) setLoadFailed(true)
      }
    )
    return () => {
      live = false
    }
  }, [])

  const flush = useCallback(() => {
    if (!dirty.current || latest.current === null) return
    dirty.current = false
    window.eq.macrosSave(latest.current).then(
      (ok) => {
        setSaveFailed(!ok)
      },
      () => {
        setSaveFailed(true)
      }
    )
  }, [])

  useEffect(() => {
    latest.current = library
    if (!dirty.current) return undefined
    const timer = setTimeout(flush, SAVE_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [library, flush])

  // Leaving the tab or closing the window sends what the delay was still holding.
  useEffect(() => {
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flush])

  /** Every way the library moves goes through here, so each one is saved. */
  const move = useCallback((step: (current: LibraryHistory) => LibraryHistory) => {
    dirty.current = true
    setHistory((current) => (current === null ? current : step(current)))
  }, [])
  const change = useCallback(
    (update: Update, field?: string) => {
      move((current) => record(current, update(current.present), { field: field ?? null, at: Date.now() }))
    },
    [move]
  )
  const amend = useCallback(
    (update: Update) => {
      move((current) => amendHistory(current, update(current.present)))
    },
    [move]
  )
  const undo = useCallback(() => {
    move(undoHistory)
  }, [move])
  const redo = useCallback(() => {
    move(redoHistory)
  }, [move])

  const store = useMemo<MacroStore | null>(
    () => (history === null ? null : { library: history.present, change, amend, undo, redo, canUndo: canUndo(history), canRedo: canRedo(history) }),
    [history, change, amend, undo, redo]
  )
  return { store, loadFailed, saveFailed }
}
