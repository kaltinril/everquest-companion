// navSx — the left menu's row, icon, text and heading styles, shared by the main nav
// (NavDrawer.tsx) and the Preferences rail (features/preferences/PrefsRail.tsx), so the two
// draw alike and both follow the menu's text and row size settings (fork #10; owner, 2026-11-26:
// the Preferences rail "should match the sizing preferences we setup for the side bar").
//
// The sizes are CSS variables set once on each rail's root by `navVars`; a row reads them.

import { navPx, type NavMenuMetrics } from '@shared/navMenu'

/** The menu's width, px. */
export const NAV_WIDTH = 220

/** Compact and quiet: a heading is orientation for the rows under it, never a destination. */
export const GROUP_HEADING_SX = { minHeight: 28, mt: 0.5, py: 0, pr: 1 } as const
export const GROUP_HEADING_TEXT_SX = { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' } as const

/** A destination row's metrics (fork #10): the `--nav-*` variables `navVars` sets. */
export const NAV_ROW_SX = { minHeight: 'var(--nav-row)', py: 0 } as const
export const NAV_ICON_SX = {
  minWidth: 'var(--nav-icon-col)',
  '& .MuiSvgIcon-root': { fontSize: 'var(--nav-icon)' }
} as const
export const NAV_TEXT_SX = {
  my: 0,
  '& .MuiListItemText-primary': { fontSize: 'var(--nav-text)', lineHeight: 1.3 }
} as const

/** Rows under a group heading sit this far in (owner, 2026-11-26). */
export const NAV_GROUP_INDENT = '4px'

/** The `--nav-*` variables for a rail's root element. */
export function navVars(menu: NavMenuMetrics): Record<string, string> {
  return {
    '--nav-row': navPx(menu.rowPx),
    '--nav-text': navPx(menu.textPx),
    '--nav-icon': navPx(menu.iconPx),
    '--nav-icon-col': navPx(menu.iconCol)
  }
}
