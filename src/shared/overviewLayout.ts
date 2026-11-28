// overviewLayout.ts — which Overview cards are shown, and in what order. Pure.
//
// Plan: docs/community/plans/2026-11-27-overview-widgets.md, Phase 1. Owner rulings, 2026-11-27:
// every card is a widget the player may add or remove, the existing six included; ONE layout per
// install ("always the same for every character on that computer"), so it lives in the settings
// store, not localStorage (a dev and a built app read different localStorage origins).
//
// THE STORED SHAPE is every known card once, in order, with an on/off flag. Reading it back:
// unknown ids and repeats are dropped, and a card this build knows but the stored list does not
// name (one added in a later release) is appended OFF, so an upgrade changes nobody's page.
// Nothing stored reads as the default: today's six on in today's order, the new ones off.

/** One card the Overview can show. `defaultOn` is the page as it was before widgets existed. */
export interface OverviewWidgetDef {
  id: string
  /** The checklist's name for it. */
  label: string
  defaultOn: boolean
}

export const OVERVIEW_WIDGETS = [
  { id: 'dps', label: 'Damage', defaultOn: true },
  { id: 'leveling', label: 'Leveling', defaultOn: true },
  { id: 'target', label: 'Target', defaultOn: true },
  { id: 'dpsCurve', label: 'DPS over time', defaultOn: true },
  { id: 'drops', label: 'Recent drops', defaultOn: true },
  { id: 'kills', label: 'Recent kills', defaultOn: true },
  { id: 'buffs', label: 'Buffs running out', defaultOn: false },
  { id: 'respawns', label: 'Respawns here', defaultOn: false },
  { id: 'motes', label: 'Motes', defaultOn: false },
  { id: 'coin', label: 'Coin', defaultOn: false }
] as const satisfies readonly OverviewWidgetDef[]

export type OverviewWidgetId = (typeof OVERVIEW_WIDGETS)[number]['id']

export interface OverviewWidgetEntry {
  id: OverviewWidgetId
  on: boolean
}

/** Every known card exactly once, in the order the page draws the ones that are on. */
export interface OverviewLayout {
  widgets: OverviewWidgetEntry[]
}

const KNOWN: ReadonlySet<string> = new Set(OVERVIEW_WIDGETS.map((w) => w.id))

export function isOverviewWidgetId(v: unknown): v is OverviewWidgetId {
  return typeof v === 'string' && KNOWN.has(v)
}

/** The checklist label for a card id. */
export function overviewWidgetLabel(id: OverviewWidgetId): string {
  return OVERVIEW_WIDGETS.find((w) => w.id === id)?.label ?? id
}

/** The page before anybody customized it. */
export function defaultOverviewLayout(): OverviewLayout {
  return { widgets: OVERVIEW_WIDGETS.map((w) => ({ id: w.id, on: w.defaultOn })) }
}

/** The stored entries this build can read: known ids, first mention wins, `on` only when true. */
function readEntries(raw: unknown): OverviewWidgetEntry[] | null {
  if (typeof raw !== 'object' || raw === null) return null
  const list = (raw as { widgets?: unknown }).widgets
  if (!Array.isArray(list)) return null
  const seen = new Set<string>()
  const out: OverviewWidgetEntry[] = []
  for (const item of list as unknown[]) {
    const id = typeof item === 'object' && item !== null ? (item as { id?: unknown }).id : undefined
    if (!isOverviewWidgetId(id) || seen.has(id)) continue
    seen.add(id)
    out.push({ id, on: (item as { on?: unknown }).on === true })
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
  const added = OVERVIEW_WIDGETS.filter((w) => !named.has(w.id)).map((w) => ({ id: w.id, on: false }))
  return { widgets: [...entries, ...added] }
}

/** The cards the page draws, in order. */
export function shownOverviewWidgets(layout: OverviewLayout): OverviewWidgetId[] {
  return layout.widgets.filter((w) => w.on).map((w) => w.id)
}

/** Turn one card on or off. An unknown id changes nothing. */
export function setOverviewWidgetOn(layout: OverviewLayout, id: OverviewWidgetId, on: boolean): OverviewLayout {
  return { widgets: layout.widgets.map((w) => (w.id === id ? { id, on } : w)) }
}

/** Move one card a step up (-1) or down (+1). At either end it stays where it is. */
export function moveOverviewWidget(layout: OverviewLayout, id: OverviewWidgetId, step: -1 | 1): OverviewLayout {
  const i = layout.widgets.findIndex((w) => w.id === id)
  const j = i + step
  if (i < 0 || j < 0 || j >= layout.widgets.length) return layout
  const widgets = [...layout.widgets]
  ;[widgets[i], widgets[j]] = [widgets[j], widgets[i]]
  return { widgets }
}

/** Is this the page nobody customized? (The checklist's Reset is then a no-op.) */
export function isDefaultOverviewLayout(layout: OverviewLayout): boolean {
  const d = defaultOverviewLayout().widgets
  return (
    layout.widgets.length === d.length &&
    layout.widgets.every((w, i) => w.id === d[i].id && w.on === d[i].on)
  )
}

/**
 * WHICH REGION A CARD SITS IN. The page keeps the original three-region look for any subset and
 * order: a run of consecutive `rank` cards shares one NOW-style grid (peers, one row height), a
 * `wide` card takes the full width, and a run of `feed` cards shares the twin-feed grid.
 */
export type OverviewRegionKind = 'rank' | 'wide' | 'feed'

const REGION: Readonly<Record<OverviewWidgetId, OverviewRegionKind>> = {
  dps: 'rank',
  leveling: 'rank',
  target: 'rank',
  dpsCurve: 'wide',
  drops: 'feed',
  kills: 'feed',
  buffs: 'rank',
  respawns: 'rank',
  motes: 'rank',
  coin: 'rank'
}

/** Feeds describe the past and are complete during the startup replay; every other card is live. */
export function overviewWidgetLive(id: OverviewWidgetId): boolean {
  return REGION[id] !== 'feed'
}

export interface OverviewRegion {
  kind: OverviewRegionKind
  ids: OverviewWidgetId[]
}

/** The shown cards cut into regions: consecutive cards of one kind share a region. */
export function overviewRegions(shown: readonly OverviewWidgetId[]): OverviewRegion[] {
  const out: OverviewRegion[] = []
  for (const id of shown) {
    const kind = REGION[id]
    const last = out[out.length - 1]
    if (last?.kind === kind && kind !== 'wide') last.ids.push(id)
    else out.push({ kind, ids: [id] })
  }
  return out
}

/** One block of the page: a region of cards, or the one "Reading log" placeholder. */
export type OverviewBlock = { kind: 'region'; region: OverviewRegion } | { kind: 'hydrating' }

/**
 * What the page draws. While the startup replay runs, every live region gives way to ONE quiet
 * placeholder, drawn where the first of them was; the feeds still draw. With the default layout
 * that is exactly the page before widgets: placeholder, then the two feeds.
 */
export function overviewBlocks(shown: readonly OverviewWidgetId[], hydrating: boolean): OverviewBlock[] {
  const out: OverviewBlock[] = []
  let placed = false
  for (const region of overviewRegions(shown)) {
    const live = region.ids.some(overviewWidgetLive)
    if (!hydrating || !live) {
      out.push({ kind: 'region', region })
    } else if (!placed) {
      out.push({ kind: 'hydrating' })
      placed = true
    }
  }
  return out
}
