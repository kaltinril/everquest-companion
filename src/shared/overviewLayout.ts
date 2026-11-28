// overviewLayout.ts — which Overview cards are shown, in what order, and how wide. Pure.
//
// Plan: docs/community/plans/2026-11-27-overview-widgets.md. Owner rulings, 2026-11-27: every card
// is a widget the player may add or remove, the existing six included; ONE layout per install
// ("always the same for every character on that computer"), so it lives in the settings store,
// not localStorage (a dev and a built app read different localStorage origins). 2026-11-28: the
// cards sit on a 4-column grid, each 1 to 4 columns wide, placed by drag and drop.
//
// THE STORED SHAPE (version 2) is every known card once, in order, with an on/off flag and a
// width. Reading it back: unknown ids and repeats are dropped, and a card this build knows but the
// stored list does not name (one added in a later release) is appended OFF, so an upgrade changes
// nobody's page. Nothing stored reads as the default. A Phase 1 layout (no version, no widths)
// keeps its on/off and order and takes the default widths.

/** How many columns a card spans on the full-width grid. */
export type OverviewWidth = 1 | 2 | 3 | 4

/** The grid's column count when the page is wide enough for all of them. */
export const OVERVIEW_COLUMNS = 4

export const OVERVIEW_LAYOUT_VERSION = 2

/** One card the Overview can show. `defaultOn` is the page as it was before widgets existed. */
export interface OverviewWidgetDef {
  id: string
  /** The checklist's name for it. */
  label: string
  defaultOn: boolean
  defaultWidth: OverviewWidth
  /** The narrowest the card stays usable at; the width control offers nothing below it. */
  minWidth: OverviewWidth
  /** Live cards describe "now" and wait out the startup replay; feeds are history and do not. */
  live: boolean
}

export const OVERVIEW_WIDGETS = [
  { id: 'dps', label: 'Damage', defaultOn: true, defaultWidth: 1, minWidth: 1, live: true },
  { id: 'leveling', label: 'Leveling', defaultOn: true, defaultWidth: 2, minWidth: 1, live: true },
  { id: 'target', label: 'Target', defaultOn: true, defaultWidth: 1, minWidth: 1, live: true },
  // Minimums, from the cards at one column of a 1280 px window (~245 px): the curve's elapsed
  // axis and peak label crowd together, and a feed row cuts item and mob names to a few letters.
  { id: 'dpsCurve', label: 'DPS over time', defaultOn: true, defaultWidth: 4, minWidth: 2, live: true },
  { id: 'drops', label: 'Recent drops', defaultOn: true, defaultWidth: 2, minWidth: 2, live: false },
  { id: 'kills', label: 'Recent kills', defaultOn: true, defaultWidth: 2, minWidth: 2, live: false },
  { id: 'buffs', label: 'Buffs running out', defaultOn: false, defaultWidth: 1, minWidth: 1, live: true },
  { id: 'respawns', label: 'Respawns here', defaultOn: false, defaultWidth: 1, minWidth: 1, live: true },
  { id: 'motes', label: 'Motes', defaultOn: false, defaultWidth: 1, minWidth: 1, live: true },
  { id: 'coin', label: 'Coin', defaultOn: false, defaultWidth: 1, minWidth: 1, live: true }
] as const satisfies readonly OverviewWidgetDef[]

export type OverviewWidgetId = (typeof OVERVIEW_WIDGETS)[number]['id']

export interface OverviewWidgetEntry {
  id: OverviewWidgetId
  on: boolean
  width: OverviewWidth
}

/** Every known card exactly once, in the order the page draws the ones that are on. */
export interface OverviewLayout {
  version: typeof OVERVIEW_LAYOUT_VERSION
  widgets: OverviewWidgetEntry[]
}

const BY_ID = Object.fromEntries(OVERVIEW_WIDGETS.map((w) => [w.id, w])) as Readonly<Record<OverviewWidgetId, OverviewWidgetDef>>

export function isOverviewWidgetId(v: unknown): v is OverviewWidgetId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, v)
}

function def(id: OverviewWidgetId): OverviewWidgetDef {
  return BY_ID[id]
}

/** The checklist label for a card id. */
export function overviewWidgetLabel(id: OverviewWidgetId): string {
  return def(id).label
}

export function overviewWidgetMinWidth(id: OverviewWidgetId): OverviewWidth {
  return def(id).minWidth
}

/** Feeds describe the past and are complete during the startup replay; every other card is live. */
export function overviewWidgetLive(id: OverviewWidgetId): boolean {
  return def(id).live
}

/** A width for this card: a whole number of columns, at least its minimum, at most 4. Anything
 *  that is not a number of columns reads as the card's default. */
export function clampOverviewWidth(id: OverviewWidgetId, raw: unknown): OverviewWidth {
  const d = def(id)
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return d.defaultWidth
  const w = Math.round(raw)
  return Math.min(OVERVIEW_COLUMNS, Math.max(d.minWidth, w)) as OverviewWidth
}

/** The page before anybody customized it. */
export function defaultOverviewLayout(): OverviewLayout {
  return {
    version: OVERVIEW_LAYOUT_VERSION,
    widgets: OVERVIEW_WIDGETS.map((w) => ({ id: w.id, on: w.defaultOn, width: w.defaultWidth }))
  }
}

/**
 * The stored entries this build can read: known ids, first mention wins, `on` only when true.
 * Version 1 (Phase 1, no `version` field) stored no widths, so every card takes its default;
 * version 2 or later reads each width through the clamp.
 */
function readEntries(raw: unknown): OverviewWidgetEntry[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { widgets: list, version } = raw as { widgets?: unknown; version?: unknown }
  if (!Array.isArray(list)) return null
  const hasWidths = typeof version === 'number' && version >= 2
  const seen = new Set<string>()
  const out: OverviewWidgetEntry[] = []
  for (const item of list as unknown[]) {
    const entry = typeof item === 'object' && item !== null ? (item as { id?: unknown; on?: unknown; width?: unknown }) : {}
    const id = entry.id
    if (!isOverviewWidgetId(id) || seen.has(id)) continue
    seen.add(id)
    out.push({ id, on: entry.on === true, width: clampOverviewWidth(id, hasWidths ? entry.width : undefined) })
  }
  return out
}

/**
 * Any stored value to a full layout. Never throws. A card the stored list does not name is
 * appended OFF: it is new to this install, and the page must not change until the player picks.
 */
export function normalizeOverviewLayout(raw: unknown): OverviewLayout {
  const entries = readEntries(raw)
  if (entries === null) return defaultOverviewLayout()
  const named = new Set<string>(entries.map((e) => e.id))
  const added = OVERVIEW_WIDGETS.filter((w) => !named.has(w.id)).map((w) => ({ id: w.id, on: false, width: w.defaultWidth }))
  return { version: OVERVIEW_LAYOUT_VERSION, widgets: [...entries, ...added] }
}

/** The cards the page draws, in order. */
export function shownOverviewWidgets(layout: OverviewLayout): OverviewWidgetId[] {
  return layout.widgets.filter((w) => w.on).map((w) => w.id)
}

function withEntry(layout: OverviewLayout, id: OverviewWidgetId, patch: Partial<OverviewWidgetEntry>): OverviewLayout {
  return { version: OVERVIEW_LAYOUT_VERSION, widgets: layout.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) }
}

/** Turn one card on or off. An unknown id changes nothing. */
export function setOverviewWidgetOn(layout: OverviewLayout, id: OverviewWidgetId, on: boolean): OverviewLayout {
  return withEntry(layout, id, { on })
}

/** Set one card's width, through the clamp (a curve asked for 1 column gets its minimum, 2). */
export function setOverviewWidgetWidth(layout: OverviewLayout, id: OverviewWidgetId, width: number): OverviewLayout {
  return withEntry(layout, id, { width: clampOverviewWidth(id, width) })
}

/** Move one card a step up (-1) or down (+1) in the full list (the checklist's arrows). At
 *  either end it stays where it is. */
export function moveOverviewWidget(layout: OverviewLayout, id: OverviewWidgetId, step: -1 | 1): OverviewLayout {
  const i = layout.widgets.findIndex((w) => w.id === id)
  const j = i + step
  if (i < 0 || j < 0 || j >= layout.widgets.length) return layout
  const widgets = [...layout.widgets]
  ;[widgets[i], widgets[j]] = [widgets[j], widgets[i]]
  return { version: OVERVIEW_LAYOUT_VERSION, widgets }
}

/** Where a dragged card lands: just before or just after another card. */
export interface OverviewDropSlot {
  id: OverviewWidgetId
  side: 'before' | 'after'
}

/**
 * THE DROP. Take the card out of the full list and put it beside the target, so the cards that
 * are off keep their places among the rest. Dropping a card on itself, or on an unknown id,
 * returns the same layout object.
 */
export function moveOverviewWidgetTo(layout: OverviewLayout, id: OverviewWidgetId, slot: OverviewDropSlot): OverviewLayout {
  const from = layout.widgets.findIndex((w) => w.id === id)
  if (from < 0 || slot.id === id || !layout.widgets.some((w) => w.id === slot.id)) return layout
  const rest = layout.widgets.filter((w) => w.id !== id)
  const at = rest.findIndex((w) => w.id === slot.id) + (slot.side === 'after' ? 1 : 0)
  const widgets = [...rest.slice(0, at), layout.widgets[from], ...rest.slice(at)]
  if (widgets.every((w, i) => w.id === layout.widgets[i].id)) return layout
  return { version: OVERVIEW_LAYOUT_VERSION, widgets }
}

/** Would this drop change the order the page draws? (No indicator, and no save, when it would not.) */
export function overviewDropChanges(layout: OverviewLayout, id: OverviewWidgetId, slot: OverviewDropSlot): boolean {
  const before = shownOverviewWidgets(layout)
  const after = shownOverviewWidgets(moveOverviewWidgetTo(layout, id, slot))
  return before.some((w, i) => w !== after[i])
}

/**
 * The page's own "earlier" and "later" buttons (the keyboard way to do what a drag does): step
 * past the neighbouring SHOWN card, never a card that is off, so every press moves something you
 * can see. The first shown card cannot go earlier, the last cannot go later.
 */
export function moveOverviewWidgetAmongShown(layout: OverviewLayout, id: OverviewWidgetId, step: -1 | 1): OverviewLayout {
  const shown = shownOverviewWidgets(layout)
  const i = shown.indexOf(id)
  const neighbour = i < 0 ? undefined : shown[i + step]
  if (neighbour === undefined) return layout
  return moveOverviewWidgetTo(layout, id, { id: neighbour, side: step < 0 ? 'before' : 'after' })
}

/** Is this the page nobody customized? (The checklist's Reset is then a no-op.) */
export function isDefaultOverviewLayout(layout: OverviewLayout): boolean {
  const d = defaultOverviewLayout().widgets
  return (
    layout.widgets.length === d.length &&
    layout.widgets.every((w, i) => w.id === d[i].id && w.on === d[i].on && w.width === d[i].width)
  )
}

// ── the grid on screen ───────────────────────────────────────────────────────────────────

/**
 * RESPONSIVE COLUMNS, from the width the Overview has (CSS px; the window less the 220 px nav).
 * Looked at in the hidden app, 2026-11-28: the default 1280 px window gives 1016 px, where a
 * one-column card is 245 px and Damage, Target, Motes, Coin and Buffs still read whole; 940 keeps
 * that card above ~225 px. Below 600 a half-width card would be under ~290 px, so one column.
 * The narrowest window a player can make (900) gives about 640: two columns.
 */
export const OVERVIEW_FOUR_COLUMNS_MIN_PX = 940
export const OVERVIEW_TWO_COLUMNS_MIN_PX = 600

export function overviewColumnsFor(widthPx: number): 1 | 2 | 4 {
  if (!(widthPx >= OVERVIEW_TWO_COLUMNS_MIN_PX)) return widthPx > 0 ? 1 : OVERVIEW_COLUMNS
  return widthPx >= OVERVIEW_FOUR_COLUMNS_MIN_PX ? OVERVIEW_COLUMNS : 2
}

/** The columns a card spans on screen: its stored width, cut to the columns there are. The stored
 *  width itself never changes with the window. */
export function overviewDisplaySpan(width: OverviewWidth, columns: number): number {
  return Math.max(1, Math.min(width, columns))
}

/** One card's box on screen, for the drop hit test. */
export interface OverviewCardRect {
  id: OverviewWidgetId
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * WHERE A DRAG WOULD DROP. The card under the pointer, or the nearest one when the pointer is in
 * a gap or past the last card; its left half means "before it", its right half "after it". Over
 * the dragged card itself there is no slot.
 */
export function overviewDropSlot(
  rects: readonly OverviewCardRect[],
  point: { x: number; y: number },
  dragged: OverviewWidgetId
): OverviewDropSlot | null {
  let best: OverviewCardRect | null = null
  let bestD = Infinity
  for (const r of rects) {
    const dx = point.x < r.left ? r.left - point.x : point.x > r.right ? point.x - r.right : 0
    const dy = point.y < r.top ? r.top - point.y : point.y > r.bottom ? point.y - r.bottom : 0
    const d = dx * dx + dy * dy
    if (d < bestD) {
      best = r
      bestD = d
    }
  }
  if (best === null || best.id === dragged) return null
  return { id: best.id, side: point.x < (best.left + best.right) / 2 ? 'before' : 'after' }
}

/** One block of the page: a card, or the one "Reading log" placeholder (full width). */
export type OverviewBlock = { kind: 'card'; id: OverviewWidgetId; width: OverviewWidth } | { kind: 'hydrating' }

/**
 * What the page draws, in order. While the startup replay runs, every live card gives way to ONE
 * quiet placeholder, drawn where the first of them was; the feeds still draw. With the default
 * layout that is exactly the page before widgets: placeholder, then the two feeds.
 */
export function overviewBlocks(layout: OverviewLayout, hydrating: boolean): OverviewBlock[] {
  const out: OverviewBlock[] = []
  let placed = false
  for (const w of layout.widgets) {
    if (!w.on) continue
    if (!hydrating || !overviewWidgetLive(w.id)) {
      out.push({ kind: 'card', id: w.id, width: w.width })
    } else if (!placed) {
      out.push({ kind: 'hydrating' })
      placed = true
    }
  }
  return out
}
