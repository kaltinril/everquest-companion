// factionLink - the one door INTO the Factions tab, for a tab that names a faction (owner,
// 2026-11-20: "fully integrated with maps and other tabs").
//
// A context, by `lib/tradeskillLink.tsx`'s argument: the opener lives in `appRouting.ts`
// (`openFactions`) and the names that want it sit several components deep (the Tradeskills
// route's Faction goal is the first). Published once by App (`lib/appLinks.tsx`), read where a
// name is drawn. Where no app published one (the overlay windows, a unit harness) the hook
// answers null and the name stays the plain text it was.

import { createContext, useContext, type JSX, type ReactNode } from 'react'
import { CellLink } from './CellLink'

/** Opens the Factions tab on one faction, by a name the tab's search matches. */
export type OpenFactions = (faction: string) => void

const FactionLinkContext = createContext<OpenFactions | null>(null)

/** Publish the app's opener to every faction link below it. The value is the router's memoized one. */
export function FactionLinkProvider({ open, children }: { open: OpenFactions; children: ReactNode }): JSX.Element {
  return <FactionLinkContext.Provider value={open}>{children}</FactionLinkContext.Provider>
}

/** The app's opener, or null where no app published one: the caller then draws no link. */
export function useFactionLink(): OpenFactions | null {
  return useContext(FactionLinkContext)
}

export interface FactionLinkProps {
  /** The faction as the host words it. */
  name: string
  /** What the Factions tab should search for, when that is another spelling (the dump's own). */
  openAs?: string
  /** The link's words when they are not the name ("Open on the Factions tab"). */
  text?: string
}

/** A faction's name as a link to the Factions tab on that faction; plain text with no opener in hand. */
export function FactionLink({ name, openAs, text }: FactionLinkProps): JSX.Element {
  const open = useFactionLink()
  if (open === null) return <>{text ?? name}</>
  return (
    <span data-testid="faction-link">
      <CellLink
        text={text ?? name}
        onOpen={() => {
          open(openAs ?? name)
        }}
      />
    </span>
  )
}
