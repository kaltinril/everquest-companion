// tradeskillLink — the one door INTO the Tradeskills section, for every tab that names a
// tradeskill or a made item (owner, 2026-11-20: "fully integrated with maps and other tabs").
//
// A context, by `lib/spellLink.tsx`'s argument: the opener lives in `appRouting.ts`
// (`openTradeskills`) and the names that want it sit several components deep in the Loot page,
// the item card, the Bazaar toolbar, the Skills table, the wish list and the Gear table. Published
// once by App, read where a name is drawn. Where no app published one (the overlay windows, a
// unit harness) the hook answers null and the name stays the plain text it was.
//
// Each host draws the link in its own way (a chip on the Loot page, a `CellLink` in a table cell);
// only `MadeByLink` is drawn here, because three tabs word a made item the same way.

import { createContext, useContext, type JSX, type ReactNode } from 'react'
import type { Tradeskill } from '@shared/tradeskills'
import { CellLink } from './CellLink'
import { useItemMarks } from './itemMarks'

/** What a link in asks for: a tradeskill's workbench, and the item whose recipe to pick there. */
export interface TradeskillFocus {
  tradeskill: Tradeskill
  /** The workbench picks the recipe that makes this item, or failing that the first that uses it. */
  item?: string
}

/** With no focus the section opens on the screen the player left it on (the Skills tab's "Open Tradeskills"). */
export type OpenTradeskills = (focus?: TradeskillFocus) => void

const TradeskillLinkContext = createContext<OpenTradeskills | null>(null)

/** Publish the app's opener to every tradeskill link below it. The value is the router's memoized one. */
export function TradeskillLinkProvider({ open, children }: { open: OpenTradeskills; children: ReactNode }): JSX.Element {
  return <TradeskillLinkContext.Provider value={open}>{children}</TradeskillLinkContext.Provider>
}

/** The app's opener, or null where no app published one: the caller then draws no link. */
export function useTradeskillLink(): OpenTradeskills | null {
  return useContext(TradeskillLinkContext)
}

/**
 * "made: Tailoring" for an item a tradeskill makes, the tradeskill a link to its workbench with
 * that item's recipe picked. When the item data names no tradeskill that makes it, or no opener
 * is in hand, it draws `otherwise` (the cell's own empty mark), or nothing. The marks are the
 * row's own batched read (`lib/itemMarks`).
 */
export function MadeByLink({ item, otherwise }: { item: string; otherwise?: string }): JSX.Element | null {
  const open = useTradeskillLink()
  const tradeskill = useItemMarks(item)?.madeBy?.[0]
  if (open === null || tradeskill === undefined) return otherwise === undefined ? null : <>{otherwise}</>
  return (
    <span data-testid="made-by-link">
      made:{' '}
      <CellLink
        text={tradeskill}
        onOpen={() => {
          open({ tradeskill, item })
        }}
      />
    </span>
  )
}
