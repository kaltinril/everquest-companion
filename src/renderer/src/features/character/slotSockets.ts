// slotSockets.ts — THE CHARACTER SHEET'S EXALTATION ANSWER, PER CELL: which sockets this worn item
// has unlocked, and which wished-for donors belong to this slot.
//
// Owner ask, 2026-08-23 (the exaltations conversation): *"for each slot [I need to know] which
// exist and which I want to go for and where to get them"*. The pieces already exist one tab
// apart — the Exaltations browser finds effects, the Wish toggle marks them, the Wish list routes
// them — and the per-slot JOIN is what was missing since JOS-326 retired the plan board. This
// module is that join, deliberately smaller than the board it is not bringing back: it WRITES
// nothing, plans nothing, and every line it draws is either the client's own dump or a wish the
// user already made. "Where to get them" stays the Wish list tab's job.
//
// Pure and node-tested (tests/characterSlotSockets.test.mts): relative value imports, no React.

import { EXALTATION_SLOT_TYPES, type ExaltationSlotType } from '../../../../shared/itemStats'
import { SLOT_OF_LOCATION } from '../../../../shared/planner/inventorySlots'
import type { EquipLocationToken } from '../../../../shared/outputs/inventory'
import { extractionTier } from '../../../../shared/planner/rules'
import type { WishEntry } from '../../../../shared/planner/wishlist'
import type { GearRow } from '../../../../shared/planner/gear'
import type { EquipSlot } from '../../../../shared/planner/types'

/** One socket type's state on one worn item: the wiki row, plus whether THIS item's tier opens it. */
export interface SocketState extends ExaltationSlotType {
  unlocked: boolean
}

/**
 * The four transferable sockets for an item at this tier. Ornamentation is left out on the
 * `SocketType` precedent (planner/types.ts R5: cosmetic, token-gated) — this line answers "what
 * can I move INTO this item", and appearance is not an answer.
 *
 * AN ABSENT TIER READS AS BASE, the JOS-416 floor argument restated: the dump's name carried no
 * ` +N`, which the sheet model records as unknown rather than 0 — but a socket line has to say
 * something, and "reads as base" UNDERSTATES what the item may have unlocked, which is the safe
 * direction. It can tell you a socket is still locked when it is open; it can never promise one
 * the game won't give.
 */
export function socketStates(tier: number | undefined): SocketState[] {
  const at = tier ?? 0
  return EXALTATION_SLOT_TYPES.filter((s) => s.unlocksAt > 0).map((s) => ({
    ...s,
    unlocked: at >= s.unlocksAt
  }))
}

/** One wished donor, placed at a slot: what to say on the chip and in its hover. */
export interface SlotWish {
  /** the donor item's display name, as the wish spelled it */
  name: string
  /** the effect the donor was wished FOR — present on every row this module places */
  effect: string
  /** the merge tier the effect extracts at, off the wish's own socket; absent when it stated none */
  tierRequired?: number
}

/**
 * Every DONOR wish, placed at the equip slots its corpus row says it fits — the transfer rule R2
 * ("destination must share the donor's equipment slot") read for display.
 *
 * ONLY DONOR WISHES PLACE. A gear wish is about looting the item, not socketing its effect, and it
 * already has a surface (the Gear tab's wish column, the Wish list's route) — repeating it here
 * would file "I want this breastplate" under a socket question it never asked.
 *
 * A WISH THE CORPUS CANNOT PLACE PLACES NOWHERE, and that is a silence, not a loss: the Wish list
 * tab still lists it (that list renders without the corpus on purpose). This map only claims what
 * a row actually states, so a machine whose corpus lost the donor draws fewer chips, never wrong
 * ones.
 */
export function wishesBySlot(
  entries: readonly WishEntry[],
  rowsByKey: ReadonlyMap<string, GearRow>
): ReadonlyMap<EquipSlot, readonly SlotWish[]> {
  const out = new Map<EquipSlot, SlotWish[]>()
  for (const entry of entries) {
    if (entry.kind !== 'donor' || entry.effect === undefined) continue
    const row = rowsByKey.get(entry.itemKey)
    if (row === undefined) continue
    const wish: SlotWish = {
      name: entry.name,
      effect: entry.effect,
      ...(entry.socket === undefined ? {} : { tierRequired: extractionTier(entry.socket) })
    }
    for (const slot of row.slots) {
      const held = out.get(slot)
      if (held) held.push(wish)
      else out.set(slot, [wish])
    }
  }
  return out
}

/**
 * The planner slot a sheet cell answers to, off the client's own Location token — `null` for the
 * two tokens the wiki cannot name (`Any Slot`, `Held`), exactly as `SLOT_OF_LOCATION` states, and
 * for any token outside the client vocabulary (a sheet renders what the file said; this join only
 * speaks where the wiki does too).
 */
export function slotOfCell(location: string): EquipSlot | null {
  return SLOT_OF_LOCATION[location as EquipLocationToken] ?? null
}
