// slotSockets.ts — THE CHARACTER SHEET'S EXALTATION ANSWER, PER CELL: which sockets this worn item
// has unlocked, and which wishes belong to this slot.
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

import {
  EXALTATION_SLOT_TYPES,
  unlockedExaltationSlots,
  type ExaltationSlotType
} from '../../../../shared/itemStats'
import { SLOT_OF_LOCATION } from '../../../../shared/planner/inventorySlots'
import type { EquipLocationToken } from '../../../../shared/outputs/inventory'
import type { WishEntry, WishKind } from '../../../../shared/planner/wishlist'
import type { EquipSlot } from '../../../../shared/planner/types'
import { factsFor, tierFor, type WishIndices } from '../wishlist/wishFarm'

/** One socket type's state on one worn item: the wiki row, plus whether THIS item's tier opens it. */
export interface SocketState extends ExaltationSlotType {
  unlocked: boolean
}

/**
 * The four transferable sockets for an item at this tier — `unlockedExaltationSlots` (the item
 * window's own answer) says which are open, and the rest are drawn dimmed with the tier that opens
 * them. Ornamentation is left out on the `SocketType` precedent (planner/types.ts: cosmetic,
 * token-gated) — this line answers "what can I move INTO this item", and appearance is not an
 * answer.
 *
 * AN UNSTATED TIER DRAWS NOTHING. The sheet model records a name with no ` +N` as unknown rather
 * than 0 (`SheetItem.tier`), and this line keeps that silence: a row of four locked chips under an
 * ammo stack or a quest token is a promise the data cannot back, and "all locked" is not what the
 * dump said — it said nothing. The item window's own tier ladder is the surface that answers for
 * a base-name item.
 */
export function socketStates(tier: number | undefined): SocketState[] {
  if (tier === undefined) return []
  const open = new Set(unlockedExaltationSlots(tier).map((s) => s.type))
  return EXALTATION_SLOT_TYPES.filter((s) => s.unlocksAt > 0).map((s) => ({
    ...s,
    unlocked: open.has(s.type)
  }))
}

/** One wish, placed at a slot: what to say on the chip and in its hover. */
export interface SlotWish {
  /** which chip style — a donor chip names its effect, a gear chip names the item */
  kind: WishKind
  /** the item's display name — the corpus spelling when an index knows it, else the wish's own */
  name: string
  /** the effect a DONOR wish was made for; absent on a gear wish, which never asked about one */
  effect?: string
  /** the merge tier the effect extracts at (wishFarm `tierFor`); absent on a gear wish */
  tierRequired?: number
}

/**
 * Every wish, placed at the equip slots its corpus row states — the transfer rule R2 ("destination
 * must share the donor's equipment slot") read for display, and for a gear wish simply where the
 * item is worn.
 *
 * BOTH KINDS PLACE. The owner's ask was "for each slot, which I want to go for", and a breastplate
 * added from the Gear tab or Recommended is exactly that for the chest cell — the first cut of this
 * module filed it under "a loot errand, not a socket answer" and so the grid missed half the list.
 * The two kinds keep their own chip: a donor chip is about an EFFECT, a gear chip about an ITEM.
 *
 * RESOLVED THE WAY THE WISH LIST TAB RESOLVES (`wishFarm.factsFor` / `tierFor`): the donor corpus
 * by (key, effect) first, then the gear index by key, then the honest unknown — so the slots a
 * chip lands on here are the slots the route beside it states.
 *
 * A WISH NEITHER INDEX CAN PLACE PLACES NOWHERE, and that is a silence, not a loss: the Wish list
 * tab still lists it (that list renders without the corpus on purpose). This map only claims what
 * a row actually states, so a machine whose corpus lost the item draws fewer chips, never wrong
 * ones.
 */
export function wishesBySlot(
  entries: readonly WishEntry[],
  index: WishIndices
): ReadonlyMap<EquipSlot, readonly SlotWish[]> {
  const out = new Map<EquipSlot, SlotWish[]>()
  for (const entry of entries) {
    const facts = factsFor(entry, index)
    const tierRequired = tierFor(entry, index)
    const wish: SlotWish = {
      kind: entry.kind,
      name: facts.name,
      ...(entry.effect === undefined ? {} : { effect: entry.effect }),
      ...(tierRequired === undefined ? {} : { tierRequired })
    }
    for (const slot of facts.slots) {
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

/**
 * WHICH CELLS CARRY A SLOT'S WISHES: the first cell of each slot, in sheet order. The sheet has two
 * Ear cells, two Wrist cells and two Fingers cells that answer to ONE planner slot each
 * (characterSheet.ts SHEET_SLOTS shares the Location token across a pair), and a wish is a fact
 * about the slot, not about the pair — drawn on both it reads as two wishes, and on the second
 * cell it sits under the wrong item's name half the time. The first cell of the pair is where the
 * eye lands first, so that is the one. A cell with no planner slot (`Any Slot`, `Held`) is never in
 * the set.
 */
export function cellsShowingWishes(
  cells: readonly { id: string; location: string }[]
): ReadonlySet<string> {
  const seen = new Set<EquipSlot>()
  const out = new Set<string>()
  for (const cell of cells) {
    const slot = slotOfCell(cell.location)
    if (slot === null || seen.has(slot)) continue
    seen.add(slot)
    out.add(cell.id)
  }
  return out
}
