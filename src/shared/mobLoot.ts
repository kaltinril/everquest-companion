// shared/mobLoot.ts — what a mob page lists under `|known_loot` from the loot ledger: each item on how
// many corpses, a drop group's members folded into the group line (owner's 2026-10-21 ruling, on the
// page since 2026-11-10: his A kobold (Rathe Mountains) page listed every rusty weapon), and, for a row
// whose page is titled with its zone, only that zone's loot (owner, 2026-11-10: "we shouldn't be
// pulling in loot from other 'a kobold (zone)' to ours"). Pure; wikiPage.ts rates the lines.

import { foldZoneTally, type GapRow } from './gaps'
import { groupOfItem, type DropGroups } from './gapDrops'
import { itemBaseName } from './itemStats'
import { mobSourceOf } from './rewardChest'
import type { LootEvent } from './types'
import { zoneBaseName } from './zones'

/** One `|known_loot` line's facts: the item or group, and the corpses it dropped from. */
export interface MobLootLine {
  item: string
  drops: number
  /** The line is a drop group's (`[[Rusty Weapons]]`), its members folded. */
  group?: true
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
/** An item at any tier is one item (owner, 2026-10-19): `Rusty Sword +4` is `Rusty Sword`. */
const itemKey = (name: string): string => itemBaseName(name).toLowerCase()
/** One corpse: a loot line per copy of an item prints the same second from the same corpse. */
const corpseOf = (e: LootEvent): string => `${String(e.ts)}|${(e.source ?? '').toLowerCase()}`

interface Seen {
  item: string
  group?: true
  corpses: Set<string>
}

/**
 * Whether a loot line is this row's mob: the name, and for a row whose page is titled with its zone
 * (`zoneTitled`: `A kobold (Rathe Mountains)`), the zone too (owner, 2026-11-10: "we shouldn't be
 * pulling in loot from other 'a kobold (zone)' to ours"). A line with no zone is left out of such a row.
 */
function ownLoot(row: GapRow, zones: ReadonlySet<string>): (e: LootEvent) => boolean {
  return (e) => {
    const mob = mobSourceOf(e)
    if (mob === undefined || !same(mob, row.name)) return false
    return row.zoneTitled !== true || (e.zone !== undefined && zones.has(zoneBaseName(e.zone).toLowerCase()))
  }
}

/** A looted name as the page lists it: its drop group when the wiki has one (`[[Rusty Weapons]]`), else the item (`{{:Item}}`). */
function lootedAs(groups: DropGroups | undefined): (item: string) => { item: string; group?: true } {
  const groupOf = groups === undefined ? () => undefined : groupOfItem(groups)
  return (item) => {
    const group = groupOf(item)
    return group === undefined ? { item: itemBaseName(item) } : { item: group, group: true }
  }
}

/** The ledger's loot of the row's mob, by the name the page lists it under, each corpse once. */
function ledgerLoot(row: GapRow, loot: readonly LootEvent[], filedAs: (item: string) => { item: string; group?: true }): Map<string, Seen> {
  // The zone in the page's title: the one the row was named in most (zoneTitledPage).
  const top = row.details.zones === undefined ? undefined : foldZoneTally(row.details.zones).entries[0]?.name
  const mine = ownLoot(row, new Set(top === undefined ? [] : [top.toLowerCase()]))
  const byItem = new Map<string, Seen>()
  for (const e of loot) {
    if (!mine(e)) continue
    const as = filedAs(e.item)
    // A group's rate is the corpses that dropped ANY member (gapDrops.ts, review D2).
    const seen = byItem.get(itemKey(as.item)) ?? { ...as, corpses: new Set<string>() }
    seen.corpses.add(corpseOf(e))
    byItem.set(itemKey(as.item), seen)
  }
  return byItem
}

const line = (item: string, drops: number, group: true | undefined): MobLootLine => ({ item, drops, ...(group === true ? { group: true as const } : {}) })

/** What the ledger looted from the mob, by base item or group, on how many corpses, A to Z. */
export function mobLoot(row: GapRow, loot: readonly LootEvent[], groups?: DropGroups): MobLootLine[] {
  const filedAs = lootedAs(groups)
  const byItem = ledgerLoot(row, loot, filedAs)
  const out = new Map([...byItem].map(([k, v]) => [k, line(v.item, v.corpses.size, v.group)]))
  // The row's own drop list names what the ledger may not hold (lines, not corpses: no better count).
  for (const d of row.details.drops?.entries ?? []) {
    const as = filedAs(d.name)
    if (!byItem.has(itemKey(as.item))) out.set(itemKey(as.item), line(as.item, (out.get(itemKey(as.item))?.drops ?? 0) + d.n, as.group))
  }
  return [...out.values()].sort((a, b) => a.item.localeCompare(b.item))
}
