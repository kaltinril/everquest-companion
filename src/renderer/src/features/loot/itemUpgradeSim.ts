// loot/itemUpgradeSim.ts — the item card's simulate-upgrade slider, as a PURE MODEL.
//
// The Loot drill-down draws a wearable item at any plus-state with the Gear toolbar's own control
// (fork decision, kaltinril 2026-09-13). The component (ItemDetailDialog.tsx `ItemWindowColumn`)
// owns one `useState`; every decision around it is here, where a node test can reach it:
//
//   * WHICH ITEMS get the control — the ones that state a `Slot:` line. That is the same census the
//     Gear tab's index takes (shared/planner/gear.ts: a row exists when it has a slot); an item
//     with no slot is not worn and has nothing to simulate.
//   * WHERE THE SLIDER OPENS — the tier the displayed name states, else base. `upgradeStateForTier`
//     is the one reading of a ` +N` the app has (a name says the tier and stops), so a ` +3` loot
//     line opens at tier 3 with the wiki's base numbers scaled to it.
//   * WHEN THE WINDOW IS TOLD — only once the reader has moved off the seed. At the seed the
//     window is handed nothing and reads exactly as it always has (the name's tier, or your own
//     merge history with its `yours` tag); a simulation nobody asked for is never on screen.
//
// Nothing here scales a number: that is `scaleStatBlock` (shared/itemUpgrade.ts), called by the
// window itself.

import { itemTierFromName, parseStatsBlock, type ItemStatBlock } from '../../../../shared/itemStats'
import { normalizeUpgradeState, upgradeStateForTier, type ItemUpgradeState } from '../../../../shared/itemUpgrade'

/** The block the window draws: the lookup's structured one when it has arrived, else the raw text parsed. */
export function itemWindowBlock(stats?: ItemStatBlock, raw?: string): ItemStatBlock | undefined {
  return stats ?? (raw ? parseStatsBlock(raw) : undefined)
}

/** An item is wearable when it states a slot — the Gear index's own rule. No block, no slot, no slider. */
export function isWearable(block?: ItemStatBlock): boolean {
  return Boolean(block?.slot)
}

/** Where the slider opens: the tier the name states, else base. */
export function upgradeSeed(name: string): ItemUpgradeState {
  return upgradeStateForTier(itemTierFromName(name))
}

/** Two states are the same when they normalize to the same tier and fraction. */
export function sameUpgradeState(a: ItemUpgradeState, b: ItemUpgradeState): boolean {
  const x = normalizeUpgradeState(a)
  const y = normalizeUpgradeState(b)
  return x.full === y.full && x.fraction === y.fraction
}

/** What the window is handed: nothing at the seed, the state once the reader has moved it. */
export function simulatedUpgrade(state: ItemUpgradeState, seed: ItemUpgradeState): ItemUpgradeState | undefined {
  return sameUpgradeState(state, seed) ? undefined : normalizeUpgradeState(state)
}
