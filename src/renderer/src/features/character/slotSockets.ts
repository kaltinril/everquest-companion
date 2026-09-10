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
/** The four transferable sockets: everything a +4 unlocks minus Ornamentation, which sits first at 0. */
const TRANSFERABLE: readonly ExaltationSlotType[] = unlockedExaltationSlots(4).slice(1)

export function socketStates(tier: number | undefined): SocketState[] {
  if (tier === undefined) return []
  return TRANSFERABLE.map((s) => ({ ...s, unlocked: tier >= s.unlocksAt }))
}

// ---- the merged socket row (fork ask, kaltinril 2026-09-09) -------------------------------------
//
// The sheet used to draw WHAT IS SOCKETED (the client's own `-Slot<n>` chips) and WHAT CAN BE
// (the bare `Focus Click Worn Proc` line) as two unrelated rows, and the user report read them
// exactly as that renders: "randomly showing some of the focus, click and worn abilities, but not
// all". One row now says both, per socket, the way the item window itself lists them:
// `Proc: Short Sword of the Ykesha` filled, `Worn` dimmed-open, `Proc @+4` dimmed-locked.

/** One chip of the merged row: the socket, its state, and the words the chip and its hover wear. */
export interface SocketChip {
  type: string
  label: string
  state: 'filled' | 'open' | 'locked'
  hover: string
}

/** The slice of `SheetItem` the row reads — structural, so the node test needs no dump. */
export interface SocketedItem {
  tier?: number
  sockets: readonly { type: string; name: string | null }[]
}

/**
 * The merged row's chips, in the window's socket order.
 *
 * THE TWO SOURCES KEEP THEIR OWN AUTHORITY. A socket the dump STATED (a `-Slot<n>` row, filled or
 * `Empty`) is drawn on the file's word alone — an `Empty` row is an open socket whatever the
 * ` +N` says. A socket the dump printed NO row for falls back to the wiki's unlock table at the
 * item's stated tier (open, or `@+N` locked) — and when the name stated no tier either, that
 * socket draws NOTHING, the same silence `socketStates` keeps: a promise the data cannot back.
 */
export function socketChips(item: SocketedItem): SocketChip[] {
  const stated = new Map(item.sockets.map((s) => [s.type, s.name]))
  const out: SocketChip[] = []
  for (const s of TRANSFERABLE) {
    const name = stated.get(s.type)
    if (name != null) {
      out.push({
        type: s.type,
        label: `${s.type}: ${name}`,
        state: 'filled',
        hover: `${s.what} - ${name} is socketed here.`
      })
    } else if (name === null || (item.tier !== undefined && item.tier >= s.unlocksAt)) {
      out.push({ type: s.type, label: s.type, state: 'open', hover: `${s.what} - this socket is open and empty.` })
    } else if (item.tier !== undefined) {
      out.push({
        type: s.type,
        label: `${s.type} @+${String(s.unlocksAt)}`,
        state: 'locked',
        hover: `${s.what} - unlocks at +${String(s.unlocksAt)}.`
      })
    }
  }
  return out
}

/**
 * The exaltation names the merged row could NOT place — a child at an index the measured map does
 * not name. Drawn as the old unlabelled chips so nothing the file said is dropped; empty for
 * every dump measured so far.
 */
export function unplacedExaltations(
  exaltations: readonly string[],
  sockets: readonly { name: string | null }[]
): string[] {
  const placed = new Set(sockets.map((s) => s.name).filter((n): n is string => n !== null))
  return exaltations.filter((n) => !placed.has(n))
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
