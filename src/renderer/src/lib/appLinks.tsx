// appLinks — the app router's openers that are published by CONTEXT, mounted as one element.
//
// Two doors are reached from too many places to thread as props: a spell name's drilldown
// (`lib/spellLink.tsx`, which carries the argument) and a link into the Tradeskills section
// (`lib/tradeskillLink.tsx`). App.tsx mounts this one provider where it used to mount the spell
// one, so a new context door costs that file no lines (it sits at its measured ceiling).

import type { JSX, ReactNode } from 'react'
import type { AppRouting } from '../appRouting'
import { SpellLinkProvider } from './spellLink'
import { TradeskillLinkProvider } from './tradeskillLink'

/** Every spell name and every tradeskill link below this is live. Both values are the router's memoized openers. */
export function AppLinkProvider({ routing, children }: { routing: AppRouting; children: ReactNode }): JSX.Element {
  return (
    <SpellLinkProvider open={routing.openSpell}>
      <TradeskillLinkProvider open={routing.openTradeskills}>{children}</TradeskillLinkProvider>
    </SpellLinkProvider>
  )
}
