// character/socketOptimize.ts — THE BOARD OPTIMIZER (user ask, kaltinril 2026-09-10: "using the
// idea of the traveling salesman... find all the slots that have the highest we own, then the
// ones where there is only 1 at that highest, like belt").
//
// WHAT IS OPTIMIZED, AND WHAT IS DELIBERATELY NOT. The objective is the one thing that needs no
// invented exchange rate: place as MANY DISTINCT effect families as legally possible, each at its
// highest owned tier, over the worn board's sockets — a maximum bipartite matching (Kuhn's
// augmenting paths; the board is ~100 sockets and ~40 families, so the classic algorithm is
// instant). Families are seated in tier order, so when two seatings tie on COUNT the higher
// tiers hold the seats. What is NOT decided here is which of two families deserves a CONTESTED
// socket — Burning Affliction III and Summoning Haste III can both only live in a belt's Focus,
// and no corpus states which is worth more. The matching places one (more families beats fewer),
// and the loser is reported as CONTESTED with exactly what beat it where, so the player makes
// the one call only a player can make.
//
// THE RULES ARE THE RECOMMENDER'S (socketRecommend.ts states them): R2 both halves — donor's
// slots must include the destination cell's slot, donor's classes must overlap the host item's —
// the loadout class gate, socket-type match, one physical copy seated once. And a PROC IS PER
// WEAPON (owner correction 2026-09-12): the matching seats each family once, then `secondHand`
// gives a Proc family's spare copy the other hand — only a seat the matching left free, so a
// second Lifebite never costs a distinct family its seat. Socketed copies
// COUNT AS OWNED: the plan is a target layout for everything you have, and the MOVES list is the
// diff from where things sit today. Whether prying a socketed gem out is free, lossy, or
// impossible is a game rule this corpus does not state — the panel says so once.
//
// Pure and node-tested (tests/socketOptimize.test.mts).

import type { GearRow } from '../../../../shared/planner/gear'
import type { OwnedExaltation } from '../../../../shared/characterSheet'
import { bestEffectFor, usable, type KindEffect, type Loadout } from './exaltationAudit'
// R2 lives THERE, not here (owner catch 2026-09-11). This file's header has always said "the rules
// are the recommender's"; until now it said so while carrying its own copy of them.
import { inForcePerSeat, seatFits, seatIsLive, type SocketHostCell } from './socketRecommend'

/** One family's claim: its best owned tier and the donor gems that carry it. How many copies
 *  each donor has is the ledger's business (`PlanContext.left`), not the claim's. */
interface FamilyClaim {
  family: string
  eff: KindEffect
  /** the donor keys whose best effect of this kind IS this family at the best tier */
  donors: { key: string; row: GearRow; type: string }[]
  gemName: string
}

/** One seat of the plan: which family the matching placed in which socket. */
export interface Placement {
  cellId: string
  cellLabel: string
  item: string
  type: string
  family: string
  effect: string
  tier: number
  gemName: string
}

/** A move the plan implies: the seat's target differs from what sits there today. */
export interface PlanMove {
  cellLabel: string
  item: string
  type: string
  gemName: string
  effect: string
  /** what currently occupies the seat, or null when it is empty */
  replacesName: string | null
  replacesEffect: string | null
}

/** A family the matching could not seat — with the contest spelled out. */
export interface ContestedFamily {
  effect: string
  gemName: string
  /** the seats it could legally take, and the effect the plan put there instead */
  options: { cellLabel: string; type: string; heldBy: string }[]
  /** true when it has NO legal seat at all on the current board */
  noSeat: boolean
}

/** A seat the plan VACATES: its gem's family now lives elsewhere, so leaving it would keep a
 *  duplicate in force (user catch 2026-09-10 — the plan seated a family at a new spot and said
 *  nothing about the old copy still sitting where it was). */
export interface PlanClear {
  cellLabel: string
  item: string
  gemName: string
  effect: string
  movedTo: string
}

export interface BoardPlan {
  placements: Placement[]
  moves: PlanMove[]
  clears: PlanClear[]
  contested: ContestedFamily[]
}

/** Copies per donor key, socketed and loose alike — the plan reseats everything owned. */
function copyCounts(owned: readonly OwnedExaltation[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const o of owned) out.set(o.key, (out.get(o.key) ?? 0) + 1)
  return out
}

/**
 * The optimizer's fixed facts plus THE COPY LEDGER every placement spends.
 *
 * "One physical copy seated once" was a counter on the CLAIM (`copies`, summed over every donor
 * of the family and over every effect kind), and the second hand spent it while `placementOf`
 * named whichever donor fit first (validator catch 2026-09-25): Fangs x1 and Claw x1, both
 * Lifebite, two empty Proc seats - the claim had two copies, so the second hand took the other
 * hand, and BOTH seats were named "Fangs". The ledger is per donor KEY: `left` starts at
 * `copyCounts(owned)` and every placement takes one from the donor it names, so a copy that has
 * been named is not there to name again, whichever claim or hand asks.
 */
interface PlanContext {
  rowByKey: ReadonlyMap<string, GearRow>
  /** who wears the board - `seatFits` refuses a seat whose combined item they could not wear */
  loadout: Loadout
  /** copies of each donor key not yet named by a placement */
  left: Map<string, number>
}

/** Every family's best owned claim. ONE claim per family (user catch 2026-09-10: keyed by
 *  family-and-type, a family could be seated twice through two socket types); its donors carry
 *  the type each serves, and the tier is the best across all of them. */
function familyClaims(
  counts: ReadonlyMap<string, number>,
  rowByKey: ReadonlyMap<string, GearRow>,
  loadout: Loadout,
  types: readonly string[]
): FamilyClaim[] {
  const best = new Map<string, FamilyClaim>()
  for (const key of counts.keys()) {
    const row = rowByKey.get(key)
    if (row === undefined || !usable(row, loadout)) continue
    for (const type of types) {
      const eff = bestEffectFor(row, type)
      if (eff === null) continue
      const held = best.get(eff.family)
      if (held === undefined || eff.tier > held.eff.tier) {
        best.set(eff.family, { family: eff.family, eff, donors: [{ key, row, type }], gemName: row.name })
      } else if (eff.tier === held.eff.tier) {
        held.donors.push({ key, row, type })
      }
    }
  }
  // Seated in tier order, so count-ties resolve toward the higher tiers.
  return [...best.values()].sort((a, b) => b.eff.tier - a.eff.tier)
}

/** Can this claim's own donors keep a seat its family ALREADY occupies? The incumbent test. */
function currentSeatExists(
  c: FamilyClaim,
  sockets: readonly SocketHostCell[],
  ctx: PlanContext
): boolean {
  return sockets.some((s) => {
    if (s.currentKey === null || !seatIsLive(s)) return false
    const occ = bestEffectFor(ctx.rowByKey.get(s.currentKey), s.type)
    if (occ?.family !== c.eff.family) return false
    const hostRow = ctx.rowByKey.get(s.itemKey)
    return c.donors.some((d) => d.type === s.type && seatFits(d.row, s, hostRow, ctx.loadout))
  })
}

/** The eligible seat indexes per claim — the bipartite graph's edges, CURRENT SEATS FIRST.
 *  Kuhn tries edges in order, so listing the seats a family already occupies ahead of the rest
 *  makes the matching stable: nothing moves unless moving buys another family a seat (user
 *  review 2026-09-10 — the plan reseated Serpent Sight across the board for no gain). */
function edges(
  claims: readonly FamilyClaim[],
  sockets: readonly SocketHostCell[],
  ctx: PlanContext
): number[][] {
  return claims.map((c) => {
    const current: number[] = []
    const empty: number[] = []
    const occupied: number[] = []
    sockets.forEach((s, i) => {
      // A proc seat nothing swings is not a seat (`seatIsLive`), so it never becomes an edge and
      // the matching cannot spend a family on it.
      if (!seatIsLive(s)) return
      const hostRow = ctx.rowByKey.get(s.itemKey)
      if (!c.donors.some((d) => d.type === s.type && seatFits(d.row, s, hostRow, ctx.loadout))) return
      const occupant = s.currentKey === null ? null : bestEffectFor(ctx.rowByKey.get(s.currentKey), s.type)
      if (occupant !== null && occupant.family === c.family) current.push(i)
      else if (s.currentKey === null) empty.push(i)
      else occupied.push(i)
    })
    // Current seats, then EMPTY seats, then seats somebody else holds: an augmenting path only
    // displaces an incumbent when no free seat serves, so the plan never shuffles for nothing.
    return [...current, ...empty, ...occupied]
  })
}

/** Kuhn's augmenting path: can claim `u` be seated, evicting and reseating others as needed? */
function tryPlace(u: number, adj: readonly number[][], seatOf: number[], seen: boolean[]): boolean {
  for (const v of adj[u]) {
    if (seen[v]) continue
    seen[v] = true
    if (seatOf[v] === -1 || tryPlace(seatOf[v], adj, seatOf, seen)) {
      seatOf[v] = u
      return true
    }
  }
  return false
}

/** The maximum matching: claim index per seat, or -1 where the seat stays free. */
function match(claimCount: number, adj: readonly number[][], seatCount: number): number[] {
  const seatOf = new Array<number>(seatCount).fill(-1)
  for (let u = 0; u < claimCount; u++) {
    tryPlace(u, adj, seatOf, new Array<boolean>(seatCount).fill(false))
  }
  return seatOf
}

/** The matching read the other way: seat index per claim, or -1 when the claim went unseated. */
function placedOf(seatOf: readonly number[], claimCount: number): number[] {
  const placed = new Array<number>(claimCount).fill(-1)
  seatOf.forEach((u, v) => {
    if (u !== -1) placed[u] = v
  })
  return placed
}

/**
 * THE SECOND HAND (owner correction, kaltinril 2026-09-12: *"You can have 2 procs, one on the
 * primary and one on the secondary and that is fine they will both work"*).
 *
 * The matching seats every family ONCE, which is the whole objective for Focus, Click and Worn:
 * a second copy anywhere on the body grants nothing. A proc is the weapon's, not the body's, so
 * a Proc family that owns a spare copy may hold BOTH hands. It gets them here, AFTER the
 * matching and only from the seats the matching left free — the objective is still distinct
 * families, and a second Lifebite must never evict an Earthquake from the other hand. A Proc
 * seat with no free edge simply stays as the matching left it. `socketRecommend.forceKey` is
 * the same rule for the other engine.
 *
 * Whether a spare copy EXISTS is the ledger's answer, not a counter's: `place` names a donor
 * of the claim that fits the seat and still has a copy left, or nothing - so the hand is taken
 * only when there is a copy to put in it, and the placement says which.
 */
function secondHand(
  claims: readonly FamilyClaim[],
  adj: readonly number[][],
  seatOf: number[],
  place: (u: number, v: number) => Placement | null
): Placement[] {
  const out: Placement[] = []
  claims.forEach((c, u) => {
    if (!isProcClaim(c) || !seatOf.includes(u)) return
    for (const v of adj[u]) {
      if (seatOf[v] !== -1) continue
      const p = place(u, v)
      if (p === null) continue
      seatOf[v] = u
      out.push(p)
    }
  })
  return out
}

/** A claim whose donors serve the one kind `socketRecommend` holds in force per seat. */
function isProcClaim(c: FamilyClaim): boolean {
  return c.donors.some((d) => inForcePerSeat(d.type))
}

/** The seat's placement names the donor that actually FITS it (user catch 2026-09-10: a claim
 *  carried by several donors printed its FIRST donor's name, which read as a SECONDARY-only
 *  shield gem being sent to the neck - the matching had legally seated a different, neck-slot
 *  donor of the same effect, and the label lied about which).
 *
 *  AND, AMONG THE DONORS THAT FIT, THE SEAT'S OWN OCCUPANT FIRST (validator catch 2026-09-25).
 *  Two gems of one effect at one tier are two donors of one claim, and `find` took whichever the
 *  dump listed first - so with Gem A socketed and Gem B loose, a dump that listed B first made
 *  the plan say "socket Gem B replacing Gem A": a swap that buys nothing, and one that came and
 *  went with the ORDER of the dump. The incumbent is a fit like any other; it is simply the fit
 *  that costs no move.
 *
 *  A donor with no copy LEFT in the ledger does not fit, and a seat no donor fits gets NO
 *  placement (null) rather than the claim's name over a copy that is already spoken for. */
function placementOf(
  claim: FamilyClaim,
  socket: SocketHostCell,
  ctx: PlanContext
): Placement | null {
  const hostRow = ctx.rowByKey.get(socket.itemKey)
  const fits = claim.donors.filter(
    (d) => d.type === socket.type && (ctx.left.get(d.key) ?? 0) > 0 && seatFits(d.row, socket, hostRow, ctx.loadout)
  )
  const donor = fits.find((d) => d.key === socket.currentKey) ?? fits[0]
  if (donor === undefined) return null
  ctx.left.set(donor.key, (ctx.left.get(donor.key) ?? 0) - 1)
  return {
    cellId: socket.cellId,
    cellLabel: socket.cellLabel,
    item: socket.item,
    type: socket.type,
    family: claim.family,
    effect: claim.eff.effect,
    tier: claim.eff.tier,
    gemName: donor.row.name
  }
}

/** The diff from today's board: seats whose target differs from their occupant. */
function movesOf(
  placements: readonly Placement[],
  sockets: readonly SocketHostCell[],
  rowByKey: ReadonlyMap<string, GearRow>
): PlanMove[] {
  const byCell = new Map(placements.map((p) => [`${p.cellId}|${p.type}`, p]))
  const out: PlanMove[] = []
  for (const s of sockets) {
    const p = byCell.get(`${s.cellId}|${s.type}`)
    if (p === undefined) continue
    if (s.currentName !== null && p.gemName.toLowerCase() === s.currentName.toLowerCase()) continue
    const curEff = s.currentKey === null ? null : bestEffectFor(rowByKey.get(s.currentKey), s.type)
    out.push({
      cellLabel: s.cellLabel,
      item: s.item,
      type: s.type,
      gemName: p.gemName,
      effect: p.effect,
      replacesName: s.currentName,
      replacesEffect: curEff?.effect ?? null
    })
  }
  return out
}

/** Seats holding a gem whose family the plan put SOMEWHERE ELSE: pull these, or the family is
 *  in force twice and the seat is dead. A seat whose family the plan left in place, or whose
 *  family went unseated entirely, is not a clear. */
function clearsOf(
  placements: readonly Placement[],
  sockets: readonly SocketHostCell[],
  rowByKey: ReadonlyMap<string, GearRow>
): PlanClear[] {
  // A family holds ONE seat, except a Proc family the second hand seated twice.
  const seatsOfFamily = new Map<string, Placement[]>()
  for (const p of placements) seatsOfFamily.set(p.family, [...(seatsOfFamily.get(p.family) ?? []), p])
  const out: PlanClear[] = []
  for (const s of sockets) {
    if (s.currentKey === null || s.currentName === null) continue
    const occ = bestEffectFor(rowByKey.get(s.currentKey), s.type)
    if (occ === null) continue
    const seats = seatsOfFamily.get(occ.family)
    if (seats === undefined || seats.some((p) => p.cellId === s.cellId && p.type === s.type)) continue
    const seat = seats[0]
    out.push({
      cellLabel: s.cellLabel,
      item: s.item,
      gemName: s.currentName,
      effect: occ.effect,
      // The item disambiguates the paired cells: 'Ear (Earring of Bashing)', not 'Ear' twice.
      movedTo: `${seat.cellLabel} (${seat.item})`
    })
  }
  return out
}

/** The unseated claims, each with the seats it could have taken and who holds them in the plan. */
/** The matching's outcome, bundled once so the reporters keep four parameters. */
interface MatchOutcome {
  claims: readonly FamilyClaim[]
  placed: readonly number[]
  adj: readonly number[][]
  sockets: readonly SocketHostCell[]
}

function contestedOf(m: MatchOutcome, placements: readonly Placement[]): ContestedFamily[] {
  const byCell = new Map(placements.map((p) => [`${p.cellId}|${p.type}`, p]))
  const out: ContestedFamily[] = []
  for (let u = 0; u < m.claims.length; u++) {
    if (m.placed[u] !== -1) continue
    const options = m.adj[u].map((v) => {
      const s = m.sockets[v]
      return {
        cellLabel: s.cellLabel,
        type: s.type,
        heldBy: byCell.get(`${s.cellId}|${s.type}`)?.effect ?? 'empty'
      }
    })
    out.push({
      effect: m.claims[u].eff.effect,
      gemName: m.claims[u].gemName,
      options,
      noSeat: options.length === 0
    })
  }
  return out
}

/** The four transferable socket types, as the sheet spells them. */
const TYPES = ['Focus', 'Click', 'Worn', 'Proc']

/**
 * The whole plan: the matching, the diff from today, and the contests only a player can judge.
 * `sockets` is `socketHosts(sheet.cells)` — every STATED socket of every worn item.
 */
export function planBoard(
  owned: readonly OwnedExaltation[],
  rows: readonly GearRow[],
  loadout: Loadout,
  sockets: readonly SocketHostCell[]
): BoardPlan {
  const rowByKey = new Map(rows.map((r) => [r.key, r]))
  const ctx: PlanContext = { rowByKey, loadout, left: copyCounts(owned) }
  // THE INCUMBENT TIEBREAK, third and final form (user reports 2026-09-10, the belt three
  // times). A claim is incumbent only when ITS OWN best-tier donors can KEEP a seat the family
  // already holds — "the family is socketed somewhere" was too coarse: Summoning Haste counted
  // as incumbent through the tier-I gem in a ring that its belt-only tier-III donor cannot use,
  // and outmuscled the belt's true incumbent on a tie. Incumbents-that-can-stay are seated
  // first at equal tier, so a claim can only take a contested seat by OUTRANKING its holder.
  const claims = familyClaims(ctx.left, rowByKey, loadout, TYPES)
  const keeps = claims.map((c) => currentSeatExists(c, sockets, ctx))
  const order = claims
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.eff.tier - a.c.eff.tier || Number(keeps[b.i]) - Number(keeps[a.i]))
    .map((x) => x.c)
  const adj = edges(order, sockets, ctx)
  const seatOf = match(order.length, adj, sockets.length)
  // The contests are the MATCHING's: a spare proc copy going unseated is not one.
  const placed = placedOf(seatOf, order.length)
  // The matching's seats are named first, so they spend the ledger before any second hand does.
  // (A gem that donates to TWO families - a proc of one and a click of another - is one copy the
  // matching may seat twice; the ledger then names it once and the later seat gets nothing,
  // which is quieter than the contested list but no longer a copy in two places.)
  const placements: Placement[] = []
  for (let u = 0; u < order.length; u++) {
    if (placed[u] === -1) continue
    const p = placementOf(order[u], sockets[placed[u]], ctx)
    if (p !== null) placements.push(p)
  }
  placements.push(...secondHand(order, adj, seatOf, (u, v) => placementOf(order[u], sockets[v], ctx)))
  return {
    placements,
    moves: movesOf(placements, sockets, rowByKey),
    clears: clearsOf(placements, sockets, rowByKey),
    contested: contestedOf({ claims: order, placed, adj, sockets }, placements)
  }
}
