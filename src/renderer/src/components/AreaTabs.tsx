// AreaTabs — the header that turns several views into one place.
//
// WHAT IT IS. An AREA is a set of views behind ONE nav row (appViews.ts `GEAR_AREA_VIEWS`,
// `SPELL_AREA_VIEWS`), and this bar is how you move between them. It is drawn above the mounted
// view - outside the content area's scroll box, so it stays put while a long table scrolls under it
// - and only while the current view is one of the set.
//
// WHY IT IS NOT A ROUTER. Every tab click calls the app's own `selectView`, the same function the
// nav drawer's rows call. That is deliberate and it is the whole reason the gear collapse (JOS-324)
// cost no semantics: the Back stack treats a tab click as MANUAL navigation and drops the parked
// trail (navOrigin.ts), the outgoing view unmounts on its `viewKey` exactly as it always did, and a
// deep link into any member still lands with the bar already reading the right tab. A bespoke
// in-area router would have had to re-earn all three.
//
// ── IT WAS `GearAreaTabs` UNTIL THE SPELLS AREA (2026-09-10) ──────────────────────────────────
//
// The file was gear-specific in name only: it read `GEAR_AREA_VIEWS` from module scope and hard-coded
// one testid. A second area arrived (docs/plans/spell-upgrades-and-loadout.md §2) and the choice was
// a copy or a parameter. A copy would have been two components with one opinion between them about
// what an in-area bar DOES - the sticky behaviour, the 40px row, the `tab-<view>` handle the e2e
// clicks - and the second copy is always the one that stops matching.
//
// SO THE VIEWS AND THE TESTID ARE PROPS, AND NOTHING ELSE CHANGED. `data-testid="gear-area-tabs"`
// and every `tab-<view>` are byte-identical to what `GearAreaTabs` rendered, which is what lets the
// existing e2e family keep its selectors: this is a rename plus two props, not a redesign.
//
// AN EMPTY ROSTER DRAWS NOTHING. `SPELL_AREA_VIEWS` is the empty array in a packaged build while its
// review gate is up, and a `<Tabs>` with no children and a `value` matching none of them is an MUI
// warning plus an empty 40px rule across the page. The guard is one line and it is the honest
// rendering of "this build has no such area".
//
// The bar renders even on a machine with no character logs, where the content underneath is the
// fresh-machine empty state. That matches the nav drawer, which likewise draws every row on such a
// machine: navigation chrome that vanishes with the data would strand a reader on whichever surface
// they happened to open.

import type { JSX } from 'react'
import { Tab, Tabs } from '@mui/material'
import { VIEW_LABELS, type View } from '../appViews'

export interface AreaTabsProps {
  /** The area's members, in tab order. Already filtered to what this build can draw. */
  views: readonly View[]
  /** Which of them is on screen. */
  view: View
  /** The app's own `selectView` - never a local router. See the header. */
  onSelect: (v: View) => void
  /**
   * The bar's own handle, so a spec can ask whether the area is mounted at all before making a
   * claim about which tabs it offers. `gear-area-tabs` for Gear, `spell-area-tabs` for Spells.
   */
  testId: string
}

/**
 * The in-area tab bar. `data-testid="tab-<view>"` is the stable handle the e2e clicks, mirroring the
 * nav drawer's `nav-<view>`.
 */
export default function AreaTabs({ views, view, onSelect, testId }: AreaTabsProps): JSX.Element | null {
  // A build whose gate strips every member of the area (see the header) has no bar to draw.
  if (views.length === 0) return null
  return (
    <Tabs
      data-testid={testId}
      value={view}
      onChange={(_e, v: View) => onSelect(v)}
      variant="standard"
      sx={{
        minHeight: 40,
        px: 2,
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
        '& .MuiTab-root': { minHeight: 40, py: 0, textTransform: 'none' }
      }}
    >
      {views.map((v) => (
        <Tab key={v} value={v} label={VIEW_LABELS[v]} data-testid={`tab-${v}`} />
      ))}
    </Tabs>
  )
}
