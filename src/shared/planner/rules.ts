// planner/rules.ts — the exaltation RULES as pure functions (design §3.3).
//
// Every number here is DERIVED from the encoded rules in ../itemStats (EXALTATION_SLOT_TYPES,
// expToNextTier), never re-declared: the tier table and the merge-XP curve have exactly one home
// in this repo, and a planner that hardcoded "+4 costs 15" would drift from the item window the
// day the wiki corrects itself.
//
// The rules being enforced (docs/plans/exaltation-planner.md §1, verified 2026-08-04):
//   R1  a socket type unlocks at an item tier — Focus +1, Click +2, Worn +3, Proc +4 — and the
//       SAME threshold is the extraction threshold on the donor side.
//   R2  a transfer needs a shared equipment SLOT and at least one shared CLASS; socketing then
//       NARROWS the host's class list to the overlap. Wide-class donors are the valuable ones.
//   R3  haste never travels (../normalize.ts isHasteEffect owns which effects are haste).
//   R4  cost is merge XP: reaching tier T costs 2^T − 1 cumulative, and a difficulty-tier drop
//       is worth 2^n (D0=1 … D4=16) AND arrives pre-plussed at +n.

import { EXALTATION_SLOT_TYPES, expToNextTier } from '../itemStats'
import { equipSlotOf, planSlotLabel } from './types'
import type { ClassAbbr } from '../classCombo'
import type {
  EquipSlot,
  ExaltPlan,
  ExtractTier,
  PlanSlot,
  PlanSlotId,
  PlanSocket,
  PlannerDonor,
  SocketType
} from './types'

// ---- R1: which tier extracts which socket ---------------------------------------

/**
 * The merge tier a donor must reach before this socket's effect can be pulled out.
 *
 * Read out of `EXALTATION_SLOT_TYPES` rather than restated. The fallback is the STRICTEST tier:
 * if that table ever stopped naming a socket we would over-state the cost rather than promise an
 * extraction the game won't allow — and `plannerRules.test.mts` pins all four, so it can't apply
 * silently.
 */
export function extractionTier(socket: SocketType): ExtractTier {
  const row = EXALTATION_SLOT_TYPES.find((s) => s.type.toLowerCase() === socket)
  const t = row?.unlocksAt
  return t === 1 || t === 2 || t === 3 || t === 4 ? t : 4
}

// ---- R2: compatibility ----------------------------------------------------------

/** Why a donor cannot be socketed here. `haste` first — it is a property of the effect itself. */
export type IncompatibleReason = 'haste' | 'slot' | 'class'

export type SocketCompatibility = { ok: true } | { ok: false; reason: IncompatibleReason }

const OK: SocketCompatibility = { ok: true }

/**
 * Can this donor's effect be socketed into a host occupying `hostSlots`, on a set targeting
 * `planClasses`?
 *
 * Unknowns are NOT passes (law 1): a donor whose page stated no slot (`slots: []`) or no class
 * list (`classes: []`) cannot be PROVEN compatible, so it reports the missing dimension and the
 * UI says which fact is absent. The one deliberate exception is an empty `planClasses` — a set
 * that has not chosen a trio yet is asking for no class filter, not for zero classes.
 */
export function socketCompatibility(
  donor: PlannerDonor,
  hostSlots: readonly EquipSlot[],
  planClasses: readonly ClassAbbr[],
  cell?: EquipSlot | null
): SocketCompatibility {
  if (donor.hasteLocked) return { ok: false, reason: 'haste' }
  if (!slotFits(donor.slots, hostSlots, cell ?? null)) return { ok: false, reason: 'slot' }
  if (planClasses.length === 0) return OK
  if (!donor.classes.some((c) => planClasses.includes(c))) return { ok: false, reason: 'class' }
  return OK
}

/**
 * R2's SLOT HALF, corrected (user report via a fork player, 2026-09-10).
 *
 * ── WHAT THE RULE ACTUALLY IS ─────────────────────────────────────────────────────────────────
 *
 * The report, near-verbatim: *"We told it that Slot restrictions must be followed. We should have
 * told it that Exaltation Slot restrictions must MATCH AT LEAST ONE OF THE ITEM Slot restrictions.
 * The resulting combination may further restrict what slots the combined Item and Exaltation can be
 * placed in. An Any slot can take any valid Item + Exaltation combination."*
 *
 * So there are three facts and the old code conflated two of them:
 *
 *   1. the EXALTATION's slots, 2. the HOST ITEM's slots, and 3. the CELL you are putting it in.
 *
 * The rule is `donor ∩ item ≠ ∅` FIRST - that is what makes the pair legal at all - and the cell is
 * a SECOND, separate constraint on where the combined thing may then be worn.
 *
 * ── WHAT WAS BROKEN, AND WHY IT ONLY SHOWED ON `Any Slot` ─────────────────────────────────────
 *
 * Every caller was testing the donor against the CELL and never against the ITEM. For a NAMED cell
 * those give the same answer by accident: the host item is being worn in that cell, so the cell is
 * necessarily one of the item's own slots, and `donor ∋ cell` is exactly `cell ∈ donor ∩ item`.
 *
 * `Any Slot` is where the accident stops working. It names no equip slot at all (the client's own
 * token; `planner/inventorySlots.ts` maps it to null because there is no wiki slot to name), so a
 * caller asking "is the cell in the donor's slots" is asking about a slot that does not exist - and
 * since no exaltation is ever stated as `Any Slot`, the answer was always no. MEASURED on the
 * owner's own dump: his two `Any Slot` cells hold `Bladestopper +5` and `Shield of Rainbow Hues +6`,
 * both plain SECONDARY items the corpus knows, with SEVEN empty sockets between them - and the
 * advisor offered nothing for any of them. Re-measured after the fix: **288 effect-bearing donors
 * in the committed corpus fit each of those two items**, against 0 before.
 *
 * ── THE UNKNOWN RULES, WHICH ARE LAW 1 IN BOTH DIRECTIONS ─────────────────────────────────────
 *
 * A donor that states NO slot fails, here as everywhere: it shares a slot with nothing, and an
 * unproven claim is not a pass.
 *
 * An unknown HOST (`hostSlots` empty - not in the corpus, or a page that stated no slot) is a
 * different kind of silence: it is a fact about our data rather than about the item, so it does not
 * get to veto. The cell then decides alone, which is precisely the behaviour every caller had
 * before this fix - so a corpus miss is no worse off than it was, and a corpus HIT gains the whole
 * rule. An unknown host under an ANY cell stays unanswerable and returns false: nothing is known
 * about where the pair could go, and inventing a yes there is what the report was complaining about
 * in reverse.
 */
export function slotFits(
  donorSlots: readonly EquipSlot[],
  hostSlots: readonly EquipSlot[],
  /** The equip slot of the cell, or NULL for an `Any Slot` cell, which constrains nothing. */
  cell: EquipSlot | null
): boolean {
  // 1. THE PAIR. Deliberately NOT `narrowedSlots`, which is the DISPLAY twin and is tolerant of an
  //    unknown on either side - right for "what is this pair restricted to", wrong for "is this
  //    pair legal". Here the donor must have stated slots (law 1: an unproven claim is not a pass)
  //    while an unknown HOST is our ignorance and does not get to veto.
  if (donorSlots.length === 0) return false
  const combined =
    hostSlots.length === 0 ? donorSlots : donorSlots.filter((sl) => hostSlots.includes(sl))
  if (combined.length === 0) return false
  // 2. THE PLACE. An any-cell constrains nothing, so a legal pair is legal there - which is the
  //    whole of the reported fix. A named cell has to survive the narrowing.
  //
  //    AN UNKNOWN HOST UNDER AN ANY-CELL ANSWERS TRUE, and the reason is what this function IS:
  //    "does anything we know contradict this pair, here". Nothing does - we simply have no row
  //    for the host - so the honest answer is yes, and JOS-104's own regression test is the case
  //    that says so out loud (a player reported the any-cells refusing the chest piece he was
  //    wearing in one; a cell that does that is worse than no cell).
  //
  //    A SUGGESTER WANTS THE OPPOSITE and must not rely on this. "Nothing contradicts it" is the
  //    right bar for a LINT, which must never cry wolf on missing data, and the wrong bar for a
  //    RECOMMENDER, which must not offer what it cannot verify. `socketRecommend.ts` and
  //    `socketOptimize.ts` therefore keep their own explicit guard and stay silent on an any-cell
  //    whose host the corpus does not know.
  if (cell === null) return true
  return combined.includes(cell)
}

/**
 * R2's OTHER side effect: socketing narrows the HOST's equip slots to the overlap with the donor's.
 *
 * The twin of `narrowedClasses` below, and the report named it explicitly - *"the resulting
 * combination may further restrict what slots the combined Item and Exaltation can be placed in"*.
 * A SECONDARY-or-PRIMARY sword taking a SECONDARY-only gem becomes a secondary-only sword, and a
 * player who was moving it between hands needs to be told.
 *
 * An empty list means UNKNOWN on either side, so narrowing against one returns the other unchanged
 * rather than claiming an intersection nobody stated - identical to `narrowedClasses`, and for the
 * identical reason: an empty result would read as "wearable nowhere".
 */
export function narrowedSlots(
  hostSlots: readonly EquipSlot[],
  donorSlots: readonly EquipSlot[]
): EquipSlot[] {
  if (hostSlots.length === 0) return [...donorSlots]
  if (donorSlots.length === 0) return [...hostSlots]
  return hostSlots.filter((sl) => donorSlots.includes(sl))
}

/**
 * R2's side effect: socketing narrows the HOST's class list to the overlap with the donor's.
 * Shown on the host line whenever a socket is planned — this is how a 6-class sword silently
 * becomes a 4-class sword.
 *
 * An empty list means UNKNOWN, so narrowing against one returns the other side unchanged rather
 * than claiming an intersection nobody stated (an empty result would read as "usable by nobody").
 */
export function narrowedClasses(
  hostClasses: readonly ClassAbbr[],
  donorClasses: readonly ClassAbbr[]
): ClassAbbr[] {
  if (hostClasses.length === 0) return [...donorClasses]
  if (donorClasses.length === 0) return [...hostClasses]
  return hostClasses.filter((c) => donorClasses.includes(c))
}

// ---- R4: what the merge costs ---------------------------------------------------

/** The difficulty tier a D4 instance drop arrives at — pre-plussed, per R4. */
const D4_DROP_TIER = 4

/** Cumulative merge XP to reach `tier` from a fresh drop: Σ expToNextTier(0…tier-1) = 2^tier − 1. */
function cumulativeXp(tier: number): number {
  let xp = 0
  for (let t = 0; t < tier; t++) xp += expToNextTier(t) ?? 0
  return xp
}

export interface ExtractionCost {
  tier: ExtractTier
  /** cumulative merge XP the donor must bank (2^tier − 1) */
  xp: number
  /** D0 copies still to farm, given you already hold one — each is worth 1 XP, so this IS the XP */
  d0Copies: number
  /** D4 copies still to farm — a D4 drop lands at +4, so one drop is already extractable */
  d4Copies: number
}

/**
 * The honest farm estimate for extracting an effect: "≈15 D0 copies, or 1 D4 copy" (R4).
 *
 * Both counts answer the SAME question — how many more drops must you farm, assuming you already
 * hold one copy of the item. A D0 copy adds 1 XP per merge, so a +4 proc donor wants 15 of them.
 * A D4 copy is worth 16 XP AND arrives pre-plussed at +4, so for every tier the planner cares
 * about (1–4) the very first D4 drop is already extractable with zero merging.
 */
export function extractionCost(tierRequired: ExtractTier): ExtractionCost {
  const xp = cumulativeXp(tierRequired)
  const banked = cumulativeXp(D4_DROP_TIER)
  const d4Copies = banked >= xp ? 1 : Math.ceil((xp - banked) / 2 ** D4_DROP_TIER) + 1
  return { tier: tierRequired, xp, d0Copies: xp, d4Copies }
}

// ---- set-level lint -------------------------------------------------------------

export type PlanWarningKind = 'unknown-donor' | 'haste' | 'slot' | 'class' | 'no-host'

export interface PlanWarning {
  /** the CELL, so a warning about your second ring says so (JOS-67) */
  slot: PlanSlotId
  /** absent for a slot-level warning ('no-host') */
  socket?: SocketType
  kind: PlanWarningKind
  donorKey?: string
  /** short state phrasing for the UI chip ("Ghoulbane — haste can't be moved") */
  message: string
}

/**
 * A donor key maps to MANY rows — one per effect on that item — so the lookup is a list and the
 * planned effect picks the row. (The design wrote `donorsByKey`; one row per key cannot express
 * an item with a proc and a click.)
 */
export type DonorIndex = ReadonlyMap<string, readonly PlannerDonor[]>

interface WarnCtx {
  /** the cell being linted */
  cell: PlanSlotId
  classes: readonly ClassAbbr[]
  donors: DonorIndex
  /**
   * The HOST item's own equip slots, when the corpus knows them.
   *
   * R2's slot half is `donor ∩ item`, and the cell is a second constraint on top (see `slotFits`) -
   * so the lint has to know what the host IS, not only where it sits. Empty when the plan has
   * picked no host, or when the host carries no effect and therefore has no donor row to read its
   * slots off; `slotFits` treats that as our ignorance rather than the item's, and lets the cell
   * decide alone exactly as this lint did before the fix.
   */
  hostSlots: readonly EquipSlot[]
}

const REASON_MESSAGE: Record<IncompatibleReason, (donor: PlannerDonor, ctx: WarnCtx) => string> = {
  haste: (d) => `${d.name} - haste can't be moved`,
  // Named by CELL, because "can't go in FINGER 2" is what the user is looking at; the RULE it
  // failed is about the slot, and `socketCompatibility` below is asked in those terms.
  slot: (d, ctx) => `${d.name} can't go in ${planSlotLabel(ctx.cell)}`,
  class: (d, ctx) => `${d.name} - no class overlap with ${ctx.classes.join('/')}`
}

function socketWarning(ctx: WarnCtx, socket: SocketType, planned: PlanSocket): PlanWarning | null {
  const donor = ctx.donors.get(planned.donorKey)?.find((d) => d.effect === planned.effect)
  if (!donor) {
    return {
      slot: ctx.cell,
      socket,
      kind: 'unknown-donor',
      donorKey: planned.donorKey,
      message: `${planned.effect} - no donor item in the database`
    }
  }
  // THE HOST ITEM'S slots and the CELL, as two separate facts (the 2026-09-10 slot-rule fix). The
  // old call passed `hostSlotsOf(ctx.cell)` for both, which made an any-cell hand R2 all eighteen -
  // permissive rather than wrong here, but it meant the lint never once asked what the host WAS.
  // `equipSlotOf` answers null for an any-cell, which is exactly what `slotFits` wants. The class
  // half is untouched: an any-slot is a place to wear something, never a permit to socket a Ranger
  // proc into a robe.
  const compat = socketCompatibility(donor, ctx.hostSlots, ctx.classes, equipSlotOf(ctx.cell))
  if (compat.ok) return null
  return {
    slot: ctx.cell,
    socket,
    kind: compat.reason,
    donorKey: donor.key,
    message: REASON_MESSAGE[compat.reason](donor, ctx)
  }
}

/**
 * Set-level lint: every planned socket whose donor is unreachable (class-incompatible with the
 * set's trio, wrong slot, haste-locked, or absent from the DB), plus slots that plan sockets with
 * no host item picked. Decoration-free — this reads the PLAN, never the user's inventory.
 */
/**
 * The host item's own equip slots, read off any donor row the corpus holds for it.
 *
 * A DonorIndex is keyed by item and every row of one item repeats that item's slots, so the first
 * row answers. Empty when no host is picked or when the host bears no effect at all - an item with
 * nothing to donate has no row here, which is a gap in what we can see rather than a fact about the
 * item, and `slotFits` is written to treat it that way.
 */
function hostSlotsFromPlan(planSlot: PlanSlot, donors: DonorIndex): readonly EquipSlot[] {
  const key = planSlot.hostKey
  if (key == null) return []
  return donors.get(key)?.[0]?.slots ?? []
}

export function planWarnings(plan: ExaltPlan, donorsByKey: DonorIndex): PlanWarning[] {
  const out: PlanWarning[] = []
  for (const [slotName, planSlot] of Object.entries(plan.slots)) {
    if (!planSlot) continue
    const cell = slotName as PlanSlotId
    const entries = Object.entries(planSlot.sockets) as [SocketType, PlanSocket | undefined][]
    const ctx: WarnCtx = {
      cell,
      classes: plan.classes,
      donors: donorsByKey,
      hostSlots: hostSlotsFromPlan(planSlot, donorsByKey)
    }
    if (planSlot.hostKey == null && entries.some(([, s]) => s != null)) {
      out.push({ slot: cell, kind: 'no-host', message: 'No host item picked' })
    }
    for (const [socket, planned] of entries) {
      const warning = planned == null ? null : socketWarning(ctx, socket, planned)
      if (warning) out.push(warning)
    }
  }
  return out
}
