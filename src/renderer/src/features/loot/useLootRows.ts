import { useDeferredValue, useMemo } from 'react'
import type { LootEvent } from '@shared/types'
import { itemCountKey } from '../../lib/itemName'
import { normalizeQuery } from '../../lib/search'
import { kept, type Kept } from '../../lib/kept'
import { characterEpoch } from '../../lib/characterEpoch'
import type { InventoryRow } from '../inventory/reconcile'
import { buildInvOnlyRows, filterLootEvents, groupLootRows, type GroupRow, type KeyedLoot } from './lootGrouping'
import { selectInvOnly, showsInvOnly } from './ownedItems'
import type { LootSort, SortableLootRow } from './lootSort'

export interface LootRowsInput {
  history: LootEvent[]
  inventoryRows: InventoryRow[]
  /** The raw search box value — deferred in here, so typing never blocks on the filter. */
  query: string
  questOnly: boolean
  showInventoryOnly: boolean
  /** Which order the GROUPED table is in (lootSort.ts). The flat ledger is a chronological
   *  ledger and stays newest-first whatever this says — see the toolbar's gate. */
  sort: LootSort
}

export interface LootRows {
  /** The filtered flat history, most recent first. */
  events: KeyedLoot[]
  /** The grouped-by-item rows (loot only) — the "unique items" count comes from here. */
  grouped: GroupRow[]
  /** What the grouped table renders: `grouped`, plus the opt-in inventory-only tail. */
  groupRows: GroupRow[]
  /** Held per the export but never looted this epoch — the toolbar chip counts these. */
  invOnlySource: InventoryRow[]
  /** Those of them the current filters admit. Already inside `groupRows`; surfaced separately so
   *  the UNGROUPED ledger — which renders loot events and so can never hold one — can still say
   *  that a search matched something the app owns (JOS-160). */
  invOnlyRows: GroupRow[]
  /** countKey → reconciled inventory row, for the O(1) per-row "In inventory" estimate. */
  invByKey: Map<string, InventoryRow>
}

// THE LEDGER FOLDS OUTLIVE THE VIEW (lib/kept.ts, the 2026-11-06 renderer pass). The Loot tab
// unmounts on every tab switch, and `useMemo` forgets with it, so each revisit re-keyed, re-filtered
// and re-grouped the whole history (79-129 ms measured on an 11k-row ledger) for the rows it had
// just been showing. The folds over the ledger are now module-scope slots keyed on the history's
// identity (held across visits by useModule) and the character epoch, and on PRIMITIVES for the
// per-mount inputs (the sort is read back from storage as a fresh object each mount). One Loot
// view exists at a time, so one slot per question is the whole cache.
const keyedSlot: Kept<KeyedLoot[]> = { last: null }
const countKeysSlot: Kept<Set<string>> = { last: null }
const invByKeySlot: Kept<Map<string, InventoryRow>> = { last: null }
const invOnlySlot: Kept<InventoryRow[]> = { last: null }
const eventsSlot: Kept<KeyedLoot[]> = { last: null }
const groupedSlot: Kept<GroupRow[]> = { last: null }

/**
 * Everything the Loot tables derive from the raw history + reconciled inventory. Split out
 * of the view because it is pure derivation: each step is memoized on exactly the inputs it
 * reads, so a keystroke re-runs the filter and nothing else.
 */
export function useLootRows({
  history,
  inventoryRows,
  query,
  questOnly,
  showInventoryOnly,
  sort
}: LootRowsInput): LootRows {
  // Typing echoes IMMEDIATELY (the caller's local `query` state); the filter consumes a
  // DEFERRED copy so a keystroke never blocks on the filter + re-render (Task #41).
  const deferredQuery = useDeferredValue(query)
  const q = normalizeQuery(deferredQuery)

  const epoch = characterEpoch()
  // Precompute the lowercase + counting keys ONCE per history change (not per keystroke).
  const keyed = kept(keyedSlot, [history, epoch], () =>
    history.map((e) => ({ ...e, itemKey: e.item.toLowerCase(), countKey: itemCountKey(e.item) }))
  )

  // countKey → reconciled inventory row, rebuilt ONCE per inventory change so the estimate
  // lookup stays O(1) per rendered row (the table is windowed; never scan per row).
  const invByKey = kept(invByKeySlot, [inventoryRows, epoch], () => {
    const m = new Map<string, InventoryRow>()
    for (const r of inventoryRows) m.set(r.key, r)
    return m
  })

  // Every counting key that appears in loot history, so "inventory-only" means exactly
  // "held per the export but never looted this epoch".
  const lootCountKeys = kept(countKeysSlot, [keyed], () => new Set(keyed.map((e) => e.countKey)))

  const invOnlySource = kept(invOnlySlot, [inventoryRows, lootCountKeys], () =>
    selectInvOnly(inventoryRows, lootCountKeys)
  )

  const events = kept(eventsSlot, [keyed, q, questOnly], () => filterLootEvents({ keyed, questOnly, q }))
  // Re-sorting is the ONLY thing a sort change costs: the filter above it is memoized on the
  // query, so switching to "last looted" never re-runs the per-keystroke work.
  // The In-inventory column sorts on the same `net` its cell draws, joined by counting key.
  const grouped = kept(groupedSlot, [events, sort.key, sort.dir, invByKey], () => {
    const invOf = (r: SortableLootRow): number => invByKey.get((r as GroupRow).countKey)?.net ?? 0
    return groupLootRows(events, sort, invOf)
  })

  // The inventory-only tail is kept OUT of the default BROWSE so the Loot table stays a loot
  // table (the toolbar chip says how many are hiding) — but a SEARCH always reaches it, because a
  // search asks whether the app knows this item at all (JOS-160, `showsInvOnly`).
  const invOnlyRows = useMemo<GroupRow[]>(
    () =>
      showsInvOnly(showInventoryOnly, q)
        ? buildInvOnlyRows({ source: invOnlySource, questOnly, q })
        : [],
    [showInventoryOnly, invOnlySource, questOnly, q]
  )

  const groupRows = useMemo(
    () => (invOnlyRows.length === 0 ? grouped : [...grouped, ...invOnlyRows]),
    [grouped, invOnlyRows]
  )

  return { events, grouped, groupRows, invOnlySource, invOnlyRows, invByKey }
}
