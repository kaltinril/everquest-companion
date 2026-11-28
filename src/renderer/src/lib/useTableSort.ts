// lib/useTableSort.ts — the ONE store for a table's remembered sort (dup-ui-a-7, 2026-11-27).
//
// A table keeps its sort in localStorage under its own key from `TABLE_SORT_KEYS`
// (`@shared/tableSort`), through `useRawPref`: it survives a tab switch (only one view is mounted at
// a time), a restart, and it is live across windows. A value that does not parse, or names a column
// the table no longer has, reads as the table's default (the table's `sanitize`).

import { useCallback, useMemo, useState } from 'react'
import { useRawPref } from '../features/combat/useCombatPrefs'

function parse(raw: string | null): unknown {
  if (raw === null || raw === '') return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** A remembered sort: `sanitize` turns the stored JSON into the table's sort shape. */
export function useSortPref<S>(key: string, sanitize: (raw: unknown) => S): [S, (next: S) => void] {
  const [raw, setRaw] = useRawPref(key)
  // A click whose write failed (storage denied, quota) still sorts this session; not remembered.
  const [unsaved, setUnsaved] = useState<{ sort: S } | null>(null)
  // `sanitize` must be a stable (module-level) function: the stored string is the identity.
  const stored = useMemo(() => sanitize(parse(raw)), [raw, sanitize])
  const set = useCallback(
    (next: S) => {
      try {
        setRaw(JSON.stringify(next))
        setUnsaved(null)
      } catch {
        setUnsaved({ sort: next })
      }
    },
    [setRaw]
  )
  return [unsaved === null ? stored : unsaved.sort, set]
}
