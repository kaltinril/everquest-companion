// macros/useMacroLibrary.ts — the Macros tab's library: loaded once from main, changed through the
// pure operations in shared/macros, and saved whole a moment after each change.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MacroLibrary } from '@shared/macros/types'

/** A change is saved this long after the last one, so typing is one write, not one a key. */
const SAVE_DELAY_MS = 400

export interface MacroStore {
  library: MacroLibrary
  /** Replace the library with what `update` makes of the current one. */
  change: (update: (library: MacroLibrary) => MacroLibrary) => void
}

export interface MacroLibraryState {
  /** Null until main has answered. */
  library: MacroLibrary | null
  change: MacroStore['change']
  /** The library could not be loaded: nothing is shown and nothing is saved. */
  loadFailed: boolean
  /** The last save did not land. */
  saveFailed: boolean
}

export function useMacroLibrary(): MacroLibraryState {
  const [library, setLibrary] = useState<MacroLibrary | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const latest = useRef<MacroLibrary | null>(null)
  /** A change the save has not been sent for yet. */
  const dirty = useRef(false)

  useEffect(() => {
    let live = true
    window.eq.macrosLoad().then(
      (loaded) => {
        if (live) setLibrary(loaded)
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

  const change = useCallback((update: (current: MacroLibrary) => MacroLibrary) => {
    dirty.current = true
    setLibrary((current) => (current === null ? current : update(current)))
  }, [])

  return { library, change, loadFailed, saveFailed }
}
