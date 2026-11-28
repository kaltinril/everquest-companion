// OverviewView — the at-a-glance landing surface: current DPS (headline + the live curve), the
// mob in front of you and its drops, your zone, and the recent-drops feed. A COMPOSITION over module
// snapshots + the combat engine's pull-snapshot; it owns no state of its own and is deliberately
// not an EqModule (docs/plans/overview-tab.md §0).
//
// EVERY CARD IS A WIDGET (owner, 2026-11-27; docs/community/plans/2026-11-27-overview-widgets.md).
// The player picks which cards show and in what order from "Customize" on the zone strip; one
// layout per install, in the settings store (shared/overviewLayout.ts). The default is the page
// as it was: Damage, Leveling, Target, the DPS curve, Recent drops, Recent kills.
//
// IT ROUTES, IT NEVER NAVIGATES. Every destination arrives as a callback from App.tsx, which is
// what lets a card be added here without touching the router — each card owns its own hook and
// asks for its own data (overviewWidgets.tsx), so a new card is one file plus one registry row,
// and a card the player turned off subscribes to nothing.
//
// LAYOUT. `minmax(0, 1fr)` is the load-bearing part of the grid: it lets a track shrink BELOW its
// content, so no card can dictate the grid's size (an intrinsic track is exactly how a growing
// panel used to push the page taller — Task #56). The view owns exactly the height it is given
// and scrolls INSIDE the grid, so the app's content area never gains a page-level scrollbar.
//
// THE CLASS-LOADOUT CARD IS GONE FROM HERE (owner decision, 2026-08-04). The FEATURE is not —
// it lives on in Preferences → Profiles (the history + the correction editor) and in the boss
// surfaces that read a kill's loadout. What it was not is a GLANCE: your three classes change a
// few times a month, and a card restating them every second is the one thing on this page that
// never answers "what is happening right now".
//
// REGIONS, NOT A FLAT GRID (symmetry pass, 2026-08-03; kept for widgets, 2026-11-28). Each card
// has a region kind (`overviewRegions`): RANK cards are peers (1 → 2 → 3 across, with a row
// FLOOR so a row reads as one band), the DPS curve is WIDE (full width), and the two FEEDS are
// twins in symmetric tracks. Consecutive cards of one kind share one region grid, so any subset
// in any order keeps those rules, and the default order is exactly the three regions the page
// had: NOW, the curve, HISTORY. The regions are plain Boxes — the cards still own the ONLY borders
// on the page (the de-nesting rule), and the two gap scales are the whole visual hierarchy: 1.5
// WITHIN a region, 2 BETWEEN them.
//
// HYDRATION IS A STATE (§4). During the startup replay every combat snapshot describes the PAST:
// an hours-old fight is `current` and a mob you killed at lunch is `currentTarget`. So every LIVE
// region gives way to ONE quiet placeholder, drawn where the first of them was, until `hydrating`
// clears (`overviewBlocks`). `snap === null` (the first pull still in flight) reads the same way,
// which is why the gate is `snap?.hydrating ?? true`. The two feeds are NOT gated: they are
// HISTORY surfaces whose module snapshots are complete and correct during the replay.

import type { JSX } from 'react'
import { useMemo } from 'react'
import { Box, CircularProgress, Paper, Skeleton, Stack, Typography } from '@mui/material'
import type { CombatSnapshot } from '@shared/combat'
import { overviewBlocks, shownOverviewWidgets, type OverviewRegion } from '@shared/overviewLayout'
import type { CombatFocus } from '../combat/combatFocus'
import type { MobTarget } from '../mobs/mobTarget'
import type { View } from '../../appViews'
import { LogReadReport } from '../../components/LogReadReport'
import { QuietNote } from '../combat/combatShared'
import { ZoneStrip } from './ZoneStrip'
import { OverviewCustomize } from './OverviewCustomize'
import { OverviewWidget, type OverviewLinks } from './overviewWidgets'
import { useOverviewCombat } from './useOverviewCombat'
import { useOverviewLayout } from './useOverviewLayout'

export interface OverviewViewProps {
  /** DPS card → "Open in Combat": jump to an explicit scope + selection. */
  onOpenCombat: (f: CombatFocus) => void
  /** Mob card AND the recent-kills feed → the app-wide mob detail router (Mobs tab), seeded
   *  with whatever the caller already holds. */
  onOpenMob: (t: MobTarget) => void
  /**
   * The Loot tab. Called with an item it is a DEEP LINK — that item's detail pane opens
   * directly, breadcrumb and all — and called bare it is the plain "All loot" switch. The
   * drops feed uses both: the header link is the ledger, a row is the item.
   */
  onOpenLoot: (item?: string) => void
  /** Leveling card → the Leveling tab: charts, the drag-selected range, AA. */
  onOpenLeveling: () => void
  /** A plain tab switch, for the widgets whose tab takes no payload (Buffs, Timers). */
  onOpenView: (v: View) => void
  /** which world this mount views (App's `viewKey`): a revisit of it paints the kept combat answer */
  world?: string
}

/**
 * The RANK regions' height FLOOR, and the reason their cards read as peers.
 *
 * MEASURED, never guessed (the e2e harness dumps every card's box): the tallest natural card in
 * the rank is the DPS card at 303px — label, headline, supporting line, drill strip, five bars and
 * the "+N more" tail. A floor a hair above that lands every row of the rank on ONE height, so the
 * rank reads as a single band instead of the ragged 303/198 pair the cards' natural heights
 * produce on their own.
 *
 * It is a FLOOR and not a cap on purpose (`minmax(N, auto)`, never `minmax(N, min-content)`): a
 * card whose content legitimately outgrows it pushes its whole row taller rather than being
 * clipped, and its row-mates follow. Nothing here has to bound a growing list — every card holding
 * one already bounds it internally (AGENTS.md's fixed-height law), which is precisely what lets
 * this be a floor at all.
 *
 * xs is exempt: stacked in one column, three 304px cards would be most of a screen of scrolling
 * before the feeds even start.
 */
const NOW_ROW_MIN_PX = 304

/**
 * The live regions while the engine is still folding history. Same visual language as CombatView's
 * `HydratingPanel` — state ("Reading log…"), never process — with its own testid so the e2e can
 * tell the two surfaces apart.
 */
function OverviewHydrating(): JSX.Element {
  return (
    <Paper variant="outlined" data-testid="overview-hydrating" sx={{ p: 1.5, minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <CircularProgress size={13} thickness={5} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Reading log…
        </Typography>
      </Stack>
      <LogReadReport />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={22} sx={{ mb: '3px', opacity: 1 - i * 0.18 }} />
      ))}
    </Paper>
  )
}

/** A rank region: peers, 1 → 2 → 3 across, one row height. */
const RANK_SX = {
  display: 'grid',
  gap: 1.5,
  minWidth: 0,
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr)',
    md: 'repeat(2, minmax(0, 1fr))',
    lg: 'repeat(3, minmax(0, 1fr))'
  },
  gridAutoRows: { xs: 'min-content', md: `minmax(${String(NOW_ROW_MIN_PX)}px, auto)` },
  '& > *': { minWidth: 0, minHeight: 0 }
} as const

/** A feed region: twins, side by side on md and stacked on xs, in symmetric tracks of their own,
 *  so the pair never inherits an odd column rule from a rank above it. */
const FEED_SX = {
  display: 'grid',
  gap: 1.5,
  minWidth: 0,
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
  '& > *': { minWidth: 0, minHeight: 0 }
} as const

function Region({
  region,
  first,
  snap,
  links
}: {
  region: OverviewRegion
  /** the first rank region keeps the page's original `overview-now` testid */
  first: boolean
  snap: CombatSnapshot | null
  links: OverviewLinks
}): JSX.Element {
  const cards = region.ids.map((id) => <OverviewWidget key={id} id={id} snap={snap} links={links} />)
  // A wide card is a direct child of the page grid, full width, exactly as the curve always was.
  if (region.kind === 'wide') return <>{cards}</>
  return (
    <Box
      data-region={region.kind}
      {...(first ? { 'data-testid': 'overview-now' } : {})}
      sx={region.kind === 'rank' ? RANK_SX : FEED_SX}
    >
      {cards}
    </Box>
  )
}

export default function OverviewView({
  onOpenCombat,
  onOpenMob,
  onOpenLoot,
  onOpenLeveling,
  onOpenView,
  world
}: OverviewViewProps): JSX.Element {
  const snap = useOverviewCombat(world)
  const hydrating = snap?.hydrating ?? true
  const { layout, save } = useOverviewLayout()
  const links = useMemo<OverviewLinks>(
    () => ({ onOpenCombat, onOpenMob, onOpenLoot, onOpenLeveling, onOpenView }),
    [onOpenCombat, onOpenMob, onOpenLoot, onOpenLeveling, onOpenView]
  )
  const blocks = useMemo(
    () => (layout === null ? [] : overviewBlocks(shownOverviewWidgets(layout), hydrating)),
    [layout, hydrating]
  )
  const firstRank = blocks.find((b) => b.kind === 'region' && b.region.kind === 'rank')

  return (
    <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {!hydrating && <ZoneStrip right={<OverviewCustomize layout={layout} onSave={save} />} />}
      <Box
        data-testid="overview-grid"
        sx={{
          display: 'grid',
          // BETWEEN regions. The regions set their own, tighter gap between the cards inside
          // them, and that difference is the only thing marking the bands apart — no rule, no
          // second border level, just the spacing scale doing the sectioning.
          gap: 2,
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'auto',
          alignContent: 'start',
          gridTemplateColumns: 'minmax(0, 1fr)',
          // Every card is internally bounded (a fixed-height scroll box around anything that
          // grows), so `min-content` rows are safe here and keep the regions from being stretched
          // into tall empty boxes on a big window.
          gridAutoRows: 'min-content',
          '& > *': { minWidth: 0, minHeight: 0 }
        }}
      >
        {blocks.map((b) =>
          b.kind === 'hydrating' ? (
            <OverviewHydrating key="hydrating" />
          ) : (
            <Region key={b.region.ids.join('|')} region={b.region} first={b === firstRank} snap={snap} links={links} />
          )
        )}
        {layout !== null && blocks.length === 0 && (
          <QuietNote>No cards on Overview - pick some with Customize at the top right.</QuietNote>
        )}
      </Box>
    </Stack>
  )
}
