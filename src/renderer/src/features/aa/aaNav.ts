// aa/aaNav.ts — how the Alt. Advancement tab reaches the rest of the app and its own rows: the app's
// navigation (App.tsx hands it in), the open row, and a jump that opens a row on its own sub-tab.

import { createContext, useContext } from 'react'
import { GAP_DOMAIN_KEY } from '@shared/gapsViewPrefs'
import type { AaBoardRow } from '@shared/aaBoard'
import type { AaLinkTo } from '@shared/aaLinks'
import type { View } from '../../appViews'
import type { TradeskillFocus } from '../../lib/tradeskillLink'

export interface AaNav {
  go: (v: View) => void
  openTradeskill: (f: TradeskillFocus) => void
  /** The open row's id, or null. */
  open: string | null
  toggle: (id: string) => void
  /** Open a row on its own sub-tab. */
  jump: (b: AaBoardRow) => void
}

const NOOP: AaNav = { go: () => undefined, openTradeskill: () => undefined, open: null, toggle: () => undefined, jump: () => undefined }

export const AaNavContext = createContext<AaNav>(NOOP)

export function useAaNav(): AaNav {
  return useContext(AaNavContext)
}

/** A row's id on the page: a Class row's key can repeat across classes (Quick Evacuation). */
export function aaRowId(b: AaBoardRow): string {
  return `${b.r.row.section}:${b.r.row.class ?? ''}:${b.r.key}`
}

/** The DOM id a jump scrolls to. */
export function aaDomId(id: string): string {
  return `aa-row-${id.replace(/[^a-z0-9]+/gi, '-')}`
}

/** Follow a link chip: a workbench, a tab, or Wiki Gaps opened on its AAs list. */
export function followAaLink(nav: AaNav, to: AaLinkTo): void {
  if (to.kind === 'tradeskill') {
    nav.openTradeskill({ tradeskill: to.tradeskill })
    return
  }
  if (to.kind === 'gaps') {
    try {
      localStorage.setItem(GAP_DOMAIN_KEY, 'aa')
    } catch {
      // A blocked store: Wiki Gaps opens on the domain it had.
    }
    nav.go('gaps')
    return
  }
  nav.go(to.view)
}
