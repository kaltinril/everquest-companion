// unlockLink — ONE SEAM, EVERY "ON THE WAY TO" CHIP (the spellLink.tsx arrangement).
//
// A faction row, an item's knowledge section and a mob page each want to say that the thing on
// screen is on the way to a race, a class or a deity, and to open the Unlocks tab on that unlock.
// The opener lives in App (it is a view switch), and those three surfaces sit several components
// deep in files that take no router; a context makes the link a property of the APP rather than
// a prop drill through each of them. When the app publishes no opener (a build without the
// UNRELEASED tab, the overlay window), `useUnlockLink()` answers null and the chip stays inert
// text - a designed state, not an oversight.
//
// THE FOCUS RIDES BESIDE THE SWITCH, not through the router: `appRouting.ts` sits at its measured
// ceilings, and a view that reads one pending ref when it mounts needs nothing more than a
// module-level slot. The tab takes the ref (once) and scrolls to that row.

import { createContext, useCallback, useContext, type JSX, type ReactNode } from 'react'
import type { UnlockRef } from '@shared/unlocks/unlockGraph'
import type { View } from '../appViews'

export type OpenUnlock = (ref?: UnlockRef) => void

const UnlockLinkContext = createContext<OpenUnlock | null>(null)

export function UnlockLinkProvider({
  open,
  children
}: {
  open: OpenUnlock | null
  children: ReactNode
}): JSX.Element {
  return <UnlockLinkContext.Provider value={open}>{children}</UnlockLinkContext.Provider>
}

export function useUnlockLink(): OpenUnlock | null {
  return useContext(UnlockLinkContext)
}

let PENDING: UnlockRef | null = null

/** Park the unlock the tab should open on. */
export function setUnlockFocus(ref: UnlockRef | null): void {
  PENDING = ref
}

/** The parked unlock, taken once; null when nobody parked one. */
export function takeUnlockFocus(): UnlockRef | null {
  const ref = PENDING
  PENDING = null
  return ref
}

/** The row's DOM id, so a link can scroll to it. */
export function unlockRowId(ref: UnlockRef): string {
  return `unlock-${ref.kind}-${ref.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/** The opener App publishes: park the ref, then switch to the tab by the MANUAL navigator. */
export function useOpenUnlock(selectView: (v: View) => void): OpenUnlock {
  return useCallback(
    (ref?: UnlockRef) => {
      setUnlockFocus(ref ?? null)
      selectView('unlocks')
    },
    [selectView]
  )
}
