// character/socketRecommend.ts — THE SOCKET RECOMMENDER, split out of exaltationAudit.ts at the
// measured 400-line file ceiling (split, never ratchet). The audit module keeps the passive
// findings (duplicates, superseded tiers); this one owns the worn BOARD — keeper decision,
// swaps, dead sockets, fills — and every rule the board obeys:
//
//   KEEPER-FIRST (user catch 2026-09-10): one keeper per effect family; only the keeper is
//   offered an upgrade, every other holder is a dead socket. The old order upgraded a socket it
//   also called dead.
//   R2, BOTH HALVES (user ruling 2026-09-10): a gem fits only a host whose cell SLOT its donor
//   states, and only a host whose CLASSES overlap the donor's — socketing re-restricts the host
//   to the donor's classes, so a MNK-only gem needs a monk-capable item.
//   NO CROSS-FAMILY EXCHANGE RATE: swaps are same-family only; the one objective cross-family
//   call is replacing a DEAD socket, where anything beats nothing.
//   POOL DISCIPLINE: one physical loose copy is never recommended twice.
//
// Pure and node-tested (tests/exaltationAudit.test.mts drives both modules).

import type { ClassAbbr } from '../../../../shared/classCombo'
import type { GearRow } from '../../../../shared/planner/gear'
import type { OwnedExaltation, SheetCellView } from '../../../../shared/characterSheet'
import { ownershipKey } from '../../../../shared/planner/ownership'
import { SLOT_OF_LOCATION } from '../../../../shared/planner/inventorySlots'
import type { EquipLocationToken } from '../../../../shared/outputs/inventory'
import type { EquipSlot } from '../../../../shared/planner/types'
import { bestEffectFor, usable, type KindEffect } from './exaltationAudit'

// ---- the recommender (the "best with what we have" ask) ----------------------------------------
//
// NOT a proven optimum, and the panel must never claim one. Sockets are scarce and effects are
// not comparable ACROSS families (is Improved Damage III worth more than 41% haste? the corpus
// states no exchange rate), so this is deliberately two honest greedy passes rather than an
// assignment solver over an invented value function:
//
//   SWAPS — a socketed gem is replaced only by a LOOSE copy of the SAME family at a strictly
//   higher tier, usable by the loadout. Same family is what makes "better" a fact instead of a
//   taste; loose is what makes the swap free (a copy socketed elsewhere is already in force).
//
//   FILLS — an open empty socket takes the best remaining loose gem that grants an effect of its
//   kind. Unranked effects fill at tier 0: an effect beats an empty socket, and claims no more.
//
// The pool decrements per physical copy, so one loose gem is never recommended twice.

/** One socket of one WORN item, as the sheet states it — the recommender's board. */
export interface SocketHostCell {
  cellId: string
  cellLabel: string
  item: string
  type: string
  /** the cell's planner slot — R2's destination: a gem fits only where its donor's slots
   *  include this. Null for the two client tokens the wiki cannot name (Any Slot, Held), and a
   *  null-slot host takes NO suggestions, because R2 cannot be checked there. */
  slot: EquipSlot | null
  /** `ownershipKey(item)` — the host item's corpus row, for R2's CLASS half: socketing a
   *  class-restricted gem narrows the host to the donor's classes, so the two must overlap
   *  (user ruling 2026-09-10: a MNK-only gem needs a monk-capable item and makes it MNK-only). */
  itemKey: string
  currentKey: string | null
  currentName: string | null
}

export interface SwapRec {
  cellId: string
  cellLabel: string
  item: string
  type: string
  fromName: string
  fromEffect: string
  toName: string
  toEffect: string
  /** where the better loose copy sits, in the dump's own words */
  toWhere: string
}

export interface FillRec {
  cellId: string
  cellLabel: string
  item: string
  type: string
  gemName: string
  effect: string
  where: string
}

/** A socketed gem whose effect family is ALREADY IN FORCE at a higher (or equal, earlier) tier
 *  elsewhere on the body — same-name effects do not stack, so this socket grants NOTHING. */
export interface RedundantRec {
  cellId: string
  cellLabel: string
  item: string
  type: string
  name: string
  effect: string
  /** where the copy that actually counts sits, and the effect IT grants (the higher tier -
   *  naming the dead copy's own tier here read as a wrong claim, user report 2026-09-10) */
  keptIn: string
  keptEffect: string
  /** the best loose gem of a family NOT already in force — anything beats a dead socket */
  replaceWith?: { name: string; effect: string; where: string }
}

export interface Recommendations {
  swaps: SwapRec[]
  fills: FillRec[]
  redundant: RedundantRec[]
  /** cellId → the socketed donor keys advice wants OUT — the red flag the grid draws */
  flaggedByCell: ReadonlyMap<string, ReadonlySet<string>>
}

/**
 * The recommender's board off the sheet's own cells: one host per STATED socket of every worn
 * item. Iteration, not array combinators, so the domain rows are only ever read (ruling 4).
 */
export function socketHosts(cells: readonly SheetCellView[]): SocketHostCell[] {
  const out: SocketHostCell[] = []
  for (const cell of cells) {
    const item = cell.item
    if (!item) continue
    const slot = SLOT_OF_LOCATION[cell.location as EquipLocationToken] ?? null
    for (const s of item.sockets) {
      out.push({
        cellId: cell.id,
        cellLabel: cell.label,
        item: item.baseName,
        type: s.type,
        slot,
        itemKey: ownershipKey(item.baseName),
        currentKey: s.name === null ? null : ownershipKey(s.name),
        currentName: s.name
      })
    }
  }
  return out
}

/** The spendable pool: loose copies per key, counted, with one representative place each. */
interface LoosePool {
  take: (key: string) => string | undefined
  keys: () => string[]
}

function loosePool(owned: readonly OwnedExaltation[]): LoosePool {
  const counts = new Map<string, { n: number; where: string }>()
  for (const o of owned) {
    if (o.socketed) continue
    const held = counts.get(o.key)
    if (held) held.n += 1
    else counts.set(o.key, { n: 1, where: o.where })
  }
  return {
    take: (key) => {
      const held = counts.get(key)
      if (!held || held.n === 0) return undefined
      held.n -= 1
      return held.where
    },
    keys: () => [...counts.entries()].filter(([, v]) => v.n > 0).map(([k]) => k)
  }
}

/** The best loose candidate for one socket, under a predicate on its effect. */
/** The recommender's fixed context, bundled once so the lookups keep four parameters. */
interface RecContext {
  pool: LoosePool
  rowByKey: ReadonlyMap<string, GearRow>
  classes: readonly ClassAbbr[]
}

function bestLoose(
  ctx: RecContext,
  host: Pick<SocketHostCell, 'type' | 'slot' | 'itemKey'>,
  accept: (eff: KindEffect) => boolean
): { key: string; row: GearRow; eff: KindEffect } | null {
  // R2: no destination slot the wiki can name, no suggestion at all.
  if (host.slot === null) return null
  const hostRow = ctx.rowByKey.get(host.itemKey)
  let best: { key: string; row: GearRow; eff: KindEffect } | null = null
  for (const key of ctx.pool.keys()) {
    const row = ctx.rowByKey.get(key)
    if (row === undefined || !usable(row, ctx.classes)) continue
    if (!row.slots.includes(host.slot)) continue
    if (!classesOverlap(row, hostRow)) continue
    const eff = bestEffectFor(row, host.type)
    if (eff === null || !accept(eff)) continue
    if (best === null || eff.tier > best.eff.tier) best = { key, row, eff }
  }
  return best
}

/** R2's class half: the gem re-restricts the host to the donor's classes, so they must share
 *  one. Either list unstated (or the host unknown to the corpus) passes — law 1. */
function classesOverlap(donor: GearRow, host: GearRow | undefined): boolean {
  if (host === undefined || donor.classes.length === 0 || host.classes.length === 0) return true
  return donor.classes.some((c) => host.classes.includes(c))
}

function flag(map: Map<string, Set<string>>, cellId: string, key: string): void {
  const held = map.get(cellId)
  if (held) held.add(key)
  else map.set(cellId, new Set([key]))
}

/** One filled host with the effect its gem currently grants — the keeper board. */
interface EffectiveHost {
  host: SocketHostCell
  eff: KindEffect
  name: string
}

/**
 * KEEPER-FIRST (user catches, kaltinril 2026-09-10: the greedy order recommended upgrading a
 * socket it ALSO called dead, and offered a WAIST gem to a FINGER socket). For each effect
 * family in force, exactly ONE holder is the keeper: the highest current tier, sheet order on
 * ties. Only the keeper is offered a same-family upgrade; every other holder is a dead socket
 * offered a NOT-in-force family. And every suggestion passes R2 — the donor's stated slots
 * must include the destination cell's slot — the same transfer rule the Exaltations browser
 * enforces (`plannerPreset.itemFits`); a cell whose slot the wiki cannot name takes none.
 */
function filledHosts(ctx: RecContext, hosts: readonly SocketHostCell[]): EffectiveHost[] {
  const out: EffectiveHost[] = []
  for (const host of hosts) {
    if (host.currentKey === null) continue
    // A current gem the corpus cannot rank is left alone: "better" would be a guess.
    const cur = bestEffectFor(ctx.rowByKey.get(host.currentKey), host.type)
    if (cur === null) continue
    out.push({ host, eff: cur, name: host.currentName ?? host.currentKey })
  }
  return out
}

function keepersByFamily(effective: readonly EffectiveHost[]): Map<string, EffectiveHost> {
  const kept = new Map<string, EffectiveHost>()
  for (const e of effective) {
    const held = kept.get(e.eff.family)
    if (held === undefined || e.eff.tier > held.eff.tier) kept.set(e.eff.family, e)
  }
  return kept
}

/** The keepers' same-family upgrades from the loose pool, under the R2 slot gate. */
function swapPass(
  ctx: RecContext,
  keepers: ReadonlyMap<string, EffectiveHost>,
  out: { swaps: SwapRec[]; flagged: Map<string, Set<string>> }
): void {
  for (const e of keepers.values()) {
    const better = bestLoose(ctx, e.host, (x) => x.family === e.eff.family && x.tier > e.eff.tier)
    const where = better === null ? undefined : ctx.pool.take(better.key)
    if (better === null || where === undefined) continue
    out.swaps.push({
      cellId: e.host.cellId,
      cellLabel: e.host.cellLabel,
      item: e.host.item,
      type: e.host.type,
      fromName: e.name,
      fromEffect: e.eff.effect,
      toName: better.row.name,
      toEffect: better.eff.effect,
      toWhere: where
    })
    if (e.host.currentKey !== null) flag(out.flagged, e.host.cellId, e.host.currentKey)
  }
}

/** Every non-keeper holder is a dead socket, offered a family NOT already in force. */
function redundancyPass(
  ctx: RecContext,
  effective: readonly EffectiveHost[],
  keepers: ReadonlyMap<string, EffectiveHost>,
  out: { redundant: RedundantRec[]; flagged: Map<string, Set<string>> }
): void {
  const inForce = new Set(keepers.keys())
  for (const e of effective) {
    if (keepers.get(e.eff.family) === e) continue
    out.redundant.push(redundantRec(ctx, e, keepers.get(e.eff.family), inForce))
    if (e.host.currentKey !== null) flag(out.flagged, e.host.cellId, e.host.currentKey)
  }
}

function redundantRec(
  ctx: RecContext,
  e: EffectiveHost,
  keptHost: EffectiveHost | undefined,
  inForce: Set<string>
): RedundantRec {
  const repl = bestLoose(ctx, e.host, (x) => !inForce.has(x.family))
  const where = repl === null ? undefined : ctx.pool.take(repl.key)
  if (repl !== null && where !== undefined) inForce.add(repl.eff.family)
  return {
    cellId: e.host.cellId,
    cellLabel: e.host.cellLabel,
    item: e.host.item,
    type: e.host.type,
    name: e.name,
    effect: e.eff.effect,
    keptIn: keptHost === undefined ? '' : keptHost.host.cellLabel,
    keptEffect: keptHost === undefined ? e.eff.effect : keptHost.eff.effect,
    ...(repl === null || where === undefined
      ? {}
      : { replaceWith: { name: repl.row.name, effect: repl.eff.effect, where } })
  }
}

/** Pass 3 — the best remaining loose gems into open empty sockets. */
function fillPass(ctx: RecContext, hosts: readonly SocketHostCell[], fills: FillRec[]): void {
  for (const host of hosts) {
    if (host.currentKey !== null) continue
    const best = bestLoose(ctx, host, () => true)
    if (best === null) continue
    const where = ctx.pool.take(best.key)
    if (where === undefined) continue
    fills.push({
      cellId: host.cellId,
      cellLabel: host.cellLabel,
      item: host.item,
      type: host.type,
      gemName: best.row.name,
      effect: best.eff.effect,
      where
    })
  }
}

/**
 * Keeper decision first, then the greedy passes — keeper upgrades, dead sockets, fills —
 * every suggestion under the R2 slot gate. Hosts arrive in sheet order and are answered in it,
 * so the same dump always yields the same advice.
 */
export function recommendSockets(
  owned: readonly OwnedExaltation[],
  rows: readonly GearRow[],
  classes: readonly ClassAbbr[],
  hosts: readonly SocketHostCell[]
): Recommendations {
  const ctx: RecContext = {
    pool: loosePool(owned),
    rowByKey: new Map(rows.map((r) => [r.key, r])),
    classes
  }
  const swaps: SwapRec[] = []
  const fills: FillRec[] = []
  const redundant: RedundantRec[] = []
  const flagged = new Map<string, Set<string>>()
  const effective = filledHosts(ctx, hosts)
  const keepers = keepersByFamily(effective)
  swapPass(ctx, keepers, { swaps, flagged })
  redundancyPass(ctx, effective, keepers, { redundant, flagged })
  fillPass(ctx, hosts, fills)
  return { swaps, fills, redundant, flaggedByCell: flagged }
}

