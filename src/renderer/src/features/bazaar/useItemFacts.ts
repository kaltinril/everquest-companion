// useItemIcons — each Bazaar item's icon id, for the icon beside its name (the Gear tab's look).
//
// Asked once per name through `lookupItem`, which answers from the item database first; every
// name the Bazaar shows IS a database name (the parser only reads those), so no page is fetched.
// The image itself comes through `itemIconUrl`, the app's permanent icon cache.

import { useEffect, useSyncExternalStore } from 'react'

const icons = new Map<string, number | null>()
let version = 0
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function settle(name: string, iconId: number | null): void {
  icons.set(name, iconId)
  version++
  for (const l of listeners) l()
}

/** The icon id for each of `names` once known; undefined while asked or when there is none. */
export function useItemIcons(names: readonly string[]): (name: string) => number | undefined {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    for (const name of names) {
      if (icons.has(name)) continue
      icons.set(name, null)
      window.eq.lookupItem(name).then(
        (k) => settle(name, k.iconId ?? null),
        () => undefined
      )
    }
  }, [names])
  return (name) => icons.get(name) ?? undefined
}
