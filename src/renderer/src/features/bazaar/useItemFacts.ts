// useItemFacts — what the Bazaar needs to know about each item: its icon (the Gear tab's look) and
// whether the wiki marks it No Drop or No Trade, which a "Hide No Drop" switch filters on, since
// trade chat sometimes offers what cannot be traded.
//
// Asked once per name through `lookupItem`, which answers from the item database first; every
// name the Bazaar shows IS a database name (the parser only reads those), so no page is fetched.
// The image itself comes through `itemIconUrl`, the app's permanent icon cache.

import { useCallback, useEffect, useSyncExternalStore } from 'react'

export interface ItemFacts {
  iconId?: number
  /** The wiki's No Drop, No Trade or NODROP flag. */
  noTrade: boolean
}

const NO_TRADE = new Set(['no drop', 'no trade', 'nodrop'])
const facts = new Map<string, ItemFacts | null>()
let version = 0
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

let flush: ReturnType<typeof setTimeout> | null = null

/** Answers land a few hundred at once on the first open; readers hear of them in one batch. */
function settle(name: string, f: ItemFacts): void {
  facts.set(name, f)
  flush ??= setTimeout(() => {
    flush = null
    version++
    for (const l of listeners) l()
  }, 100)
}

/** Each of `names`' facts once known; undefined while asked. */
export function useItemFacts(names: readonly string[]): (name: string) => ItemFacts | undefined {
  const v = useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    for (const name of names) {
      if (facts.has(name)) continue
      facts.set(name, null)
      window.eq.lookupItem(name).then(
        (k) => settle(name, { iconId: k.iconId, noTrade: (k.stats?.flags ?? []).some((f) => NO_TRADE.has(f.toLowerCase())) }),
        () => undefined
      )
    }
  }, [names])
  // `v` ties the reader to the store's version: a settled batch hands out a new reader, so its
  // readers re-render, and every other render keeps the same one, so the tab's memos still hit.
  return useCallback((name: string) => (v >= 0 ? (facts.get(name) ?? undefined) : undefined), [v])
}
