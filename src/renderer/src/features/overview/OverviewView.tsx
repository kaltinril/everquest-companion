// OverviewView — the at-a-glance landing surface: current DPS (headline + the live curve), the
// mob in front of you and its drops, your zone, and the recent-drops feed. A COMPOSITION over module
// snapshots + the combat engine's pull-snapshot; it owns no state of its own and is deliberately
// not an EqModule (docs/plans/overview-tab.md §0).
//
// EVERY CARD IS A WIDGET (owner, 2026-11-27; docs/community/plans/2026-11-27-overview-widgets.md).
// The player picks which cards show and in what order from "Customize" on the zone strip, and
// places them and sets their widths in "Edit layout" beside it (owner, 2026-11-28); one layout per
// install, in the settings store (shared/overviewLayout.ts). The default is the page as it was:
// Damage, Leveling, Target, the DPS curve, Recent drops, Recent kills.
//
// IT ROUTES, IT NEVER NAVIGATES. Every destination arrives as a callback from App.tsx, which is
// what lets a card be added here without touching the router — each card owns its own hook and
// asks for its own data (overviewWidgets.tsx), so a new card is one file plus one registry row,
// and a card the player turned off subscribes to nothing.
//
// LAYOUT: ONE 4-COLUMN GRID (2026-11-28). Each card spans its stored width (1 to 4 columns) and
// the cards flow left to right into rows in the stored order: plain row flow, never `dense`, so
// what you see is the order you set (a card too wide for what is left of a row starts the next
// one). A row is as tall as its tallest card, and the others in it stretch to match. Below
// `OVERVIEW_FOUR_COLUMNS_MIN_PX` of width the grid has 2 columns, below the two-column floor 1,
// and a card's span is cut to the columns there are, for display only.
//
// `minmax(0, 1fr)` is the load-bearing part of the grid: it lets a track shrink BELOW its
// content, so no card can dictate the grid's size (an intrinsic track is exactly how a growing
// panel used to push the page taller — Task #56). The view owns exactly the height it is given
// and scrolls INSIDE the grid, so the app's content area never gains a page-level scrollbar. The
// cards still own the ONLY borders on the page (the de-nesting rule).
//
// THE CLASS-LOADOUT CARD IS GONE FROM HERE (owner decision, 2026-08-04). The FEATURE is not —
// it lives on in Preferences → Profiles (the history + the correction editor) and in the boss
// surfaces that read a kill's loadout. What it was not is a GLANCE: your three classes change a
// few times a month, and a card restating them every second is the one thing on this page that
// never answers "what is happening right now".
//
// HYDRATION IS A STATE (§4). During the startup replay every combat snapshot describes the PAST:
// an hours-old fight is `current` and a mob you killed at lunch is `currentTarget`. So every LIVE
// card gives way to ONE quiet full-width placeholder, drawn where the first of them was, until
// `hydrating` clears (`overviewBlocks`). `snap === null` (the first pull still in flight) reads the
// same way, which is why the gate is `snap?.hydrating ?? true`. The two feeds are NOT gated: they
// are HISTORY surfaces whose module snapshots are complete and correct during the replay.

import type { JSX } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, CircularProgress, Paper, Skeleton, Stack, Typography } from '@mui/material'
import type { CombatSnapshot } from '@shared/combat'
import {
  moveOverviewWidgetAmongShown,
  moveOverviewWidgetTo,
  overviewBlocks,
  overviewDisplaySpan,
  overviewWidgetLabel,
  setOverviewWidgetWidth,
  shownOverviewWidgets,
  type OverviewDropSlot,
  type OverviewLayout,
  type OverviewWidgetId,
  type OverviewWidth
} from '@shared/overviewLayout'
import type { CombatFocus } from '../combat/combatFocus'
import type { MobTarget } from '../mobs/mobTarget'
import type { View } from '../../appViews'
import { LogReadReport } from '../../components/LogReadReport'
import { QuietNote } from '../combat/combatShared'
import { ZoneStrip } from './ZoneStrip'
import { OverviewCustomize } from './OverviewCustomize'
import { OverviewEditToggle, type OverviewEditProps } from './OverviewEditBar'
import { OverviewWidget, type OverviewLinks } from './overviewWidgets'
import { useOverviewCombat } from './useOverviewCombat'
import { useOverviewLayout } from './useOverviewLayout'
import { useOverviewColumns, useOverviewDrag, type OverviewDrag } from './useOverviewGrid'

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
 * The live cards while the engine is still folding history. Same visual language as CombatView's
 * `HydratingPanel` — state ("Reading log…"), never process — with its own testid so the e2e can
 * tell the two surfaces apart.
 */
function OverviewHydrating(): JSX.Element {
  return (
    <Paper variant="outlined" data-testid="overview-hydrating" sx={{ p: 1.5, minWidth: 0, gridColumn: '1 / -1' }}>
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

/** Edit layout: on until the player turns it off, presses Esc, leaves the tab, or the log is re-read. */
function useEditMode(hydrating: boolean, drag: OverviewDrag): [boolean, () => void] {
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (hydrating) setEditing(false)
  }, [hydrating])
  const { drag: dragging, cancel } = drag
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      // Esc during a drag drops nothing; a second Esc leaves the mode.
      if (dragging) cancel()
      else setEditing(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [editing, dragging, cancel])
  const toggle = useCallback(() => {
    setEditing((e) => !e)
  }, [])
  return [editing, toggle]
}

interface GridProps {
  layout: OverviewLayout | null
  hydrating: boolean
  editing: boolean
  columns: number
  drag: OverviewDrag
  snap: CombatSnapshot | null
  links: OverviewLinks
  save: (next: OverviewLayout) => void
}

interface EditFor {
  layout: OverviewLayout
  id: OverviewWidgetId
  width: OverviewWidth
  shown: readonly OverviewWidgetId[]
}

function editPropsFor({ layout, id, width, shown }: EditFor, drag: OverviewDrag, save: (next: OverviewLayout) => void): OverviewEditProps {
  return {
    width,
    first: shown[0] === id,
    last: shown[shown.length - 1] === id,
    drag,
    onWidth: (w) => {
      save(setOverviewWidgetWidth(layout, id, w))
    },
    onStep: (step) => {
      save(moveOverviewWidgetAmongShown(layout, id, step))
    }
  }
}

function OverviewCards({ layout, hydrating, editing, columns, drag, snap, links, save }: GridProps): JSX.Element {
  const blocks = useMemo(() => (layout === null ? [] : overviewBlocks(layout, hydrating)), [layout, hydrating])
  const shown = useMemo(() => (layout === null ? [] : shownOverviewWidgets(layout)), [layout])
  return (
    <>
      {blocks.map((b) =>
        b.kind === 'hydrating' ? (
          <OverviewHydrating key="hydrating" />
        ) : (
          <OverviewWidget
            key={b.id}
            id={b.id}
            span={overviewDisplaySpan(b.width, columns)}
            edit={editing && layout ? editPropsFor({ layout, id: b.id, width: b.width, shown }, drag, save) : null}
            snap={snap}
            links={links}
          />
        )
      )}
      {layout !== null && blocks.length === 0 && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <QuietNote>No cards on Overview - pick some with Customize at the top right.</QuietNote>
        </Box>
      )}
    </>
  )
}

/** The card being dragged, named beside the pointer, so it is plain what is moving. */
function DragGhost({ drag }: { drag: OverviewDrag['drag'] }): JSX.Element | null {
  if (!drag) return null
  return (
    <Paper
      elevation={6}
      data-testid="overview-drag-ghost"
      sx={{ position: 'fixed', left: drag.x + 14, top: drag.y + 10, px: 1, py: 0.25, pointerEvents: 'none', zIndex: 1300 }}
    >
      <Typography variant="caption">{overviewWidgetLabel(drag.id)}</Typography>
    </Paper>
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
  const rootRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const columns = useOverviewColumns(rootRef)
  const onDrop = useCallback(
    (id: OverviewWidgetId, slot: OverviewDropSlot) => {
      if (layout) save(moveOverviewWidgetTo(layout, id, slot))
    },
    [layout, save]
  )
  const drag = useOverviewDrag(gridRef, layout, onDrop)
  const [editing, toggleEditing] = useEditMode(hydrating, drag)

  return (
    <Stack ref={rootRef} spacing={1.5} sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {!hydrating && (
        <ZoneStrip
          right={
            <>
              <OverviewEditToggle editing={editing} disabled={layout === null} onToggle={toggleEditing} />
              <OverviewCustomize layout={layout} onSave={save} />
            </>
          }
        />
      )}
      <Box
        ref={gridRef}
        data-testid="overview-grid"
        data-columns={columns}
        data-editing={editing ? 'true' : undefined}
        sx={{
          display: 'grid',
          gap: 1.5,
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'auto',
          alignContent: 'start',
          gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
          // A row is as tall as its tallest card. Every card is internally bounded (a fixed-height
          // scroll box around anything that grows), so content-sized rows are safe, and
          // `alignContent: start` keeps them from stretching into tall empty boxes on a big window.
          gridAutoRows: 'min-content',
          // The drop marker sits in the gap beside the first and last columns.
          px: editing ? 1 : 0
        }}
      >
        <OverviewCards
          layout={layout}
          hydrating={hydrating}
          editing={editing}
          columns={columns}
          drag={drag}
          snap={snap}
          links={links}
          save={save}
        />
      </Box>
      <DragGhost drag={drag.drag} />
    </Stack>
  )
}
