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
// the loadout class gate, socket-type match, one physical copy seated once. Socketed copies
// COUNT AS OWNED: the plan is a target layout for everything you have, and the MOVES list is the
// diff from where things sit today. Whether prying a socketed gem out is free, lossy, or
// impossible is a game rule this corpus does not state — the panel says so once.
//
// Pure and node-tested (tests/socketOptimize.test.mts).

import type { ClassAbbr } from '../../../../shared/classCombo'
import type { GearRow } from '../../../../shared/planner/gear'
import type { OwnedExaltation } from '../../../../shared/characterSheet'
import { bestEffectFor, usable, type KindEffect } from './exaltationAudit'
import type { SocketHostCell } from './socketRecommend'

/** One family's claim: its best owned tier, the donor gems that carry it, and how many copies. */
interface FamilyClaim {
  family: string
  eff: KindEffect
  /** the donor keys whose best effect of this kind IS this family at the best tier */
  donors: { key: string; row: GearRow; type: string }[]
  copies: number
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

export interface BoardPlan {
  placements: Placement[]
  moves: PlanMove[]
  contested: ContestedFamily[]
}

/** Copies per donor key, socketed and loose alike — the plan reseats everything owned. */
function copyCounts(owned: readonly OwnedExaltation[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const o of owned) out.set(o.key, (out.get(o.key) ?? 0) + 1)
  return out
}

/** Every family's best owned claim, per socket TYPE it can serve (family+type is the unit). */
function familyClaims(
  counts: ReadonlyMap<string, number>,
  rowByKey: ReadonlyMap<string, GearRow>,
  classes: readonly ClassAbbr[],
  types: readonly string[]
): FamilyClaim[] {
  const best = new Map<string, FamilyClaim>()
  for (const [key, copies] of counts) {
    const row = rowByKey.get(key)
    if (row === undefined || !usable(row, classes)) continue
    for (const type of types) {
      const eff = bestEffectFor(row, type)
      if (eff === null) continue
      const id = `${eff.family}|${type}`
      const held = best.get(id)
      if (held === undefined || eff.tier > held.eff.tier) {
        best.set(id, { family: id, eff, donors: [{ key, row, type }], copies, gemName: row.name })
      } else if (eff.tier === held.eff.tier && held.eff.family === eff.family) {
        held.donors.push({ key, row, type })
        held.copies += copies
      }
    }
  }
  // Seated in tier order, so count-ties resolve toward the higher tiers.
  return [...best.values()].sort((a, b) => b.eff.tier - a.eff.tier)
}

/** R2 + type for one donor row against one seat. */
function fits(row: GearRow, socket: SocketHostCell, hostRow: GearRow | undefined): boolean {
  if (socket.slot === null || !row.slots.includes(socket.slot)) return false
  if (hostRow !== undefined && row.classes.length > 0 && hostRow.classes.length > 0) {
    return row.classes.some((c) => hostRow.classes.includes(c))
  }
  return true
}

/** The eligible seat indexes per claim — the bipartite graph's edges. */
function edges(
  claims: readonly FamilyClaim[],
  sockets: readonly SocketHostCell[],
  rowByKey: ReadonlyMap<string, GearRow>
): number[][] {
  return claims.map((c) =>
    sockets.flatMap((s, i) => {
      const hostRow = rowByKey.get(s.itemKey)
      return c.donors.some((d) => d.type === s.type && fits(d.row, s, hostRow)) ? [i] : []
    })
  )
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

/** The maximum matching: seat index per claim, or -1 when the claim went unseated. */
function match(claims: readonly FamilyClaim[], adj: readonly number[][], seatCount: number): number[] {
  const seatOf = new Array<number>(seatCount).fill(-1)
  for (let u = 0; u < claims.length; u++) {
    tryPlace(u, adj, seatOf, new Array<boolean>(seatCount).fill(false))
  }
  const placed = new Array<number>(claims.length).fill(-1)
  for (let v = 0; v < seatCount; v++) if (seatOf[v] !== -1) placed[seatOf[v]] = v
  return placed
}

function placementOf(claim: FamilyClaim, socket: SocketHostCell): Placement {
  return {
    cellId: socket.cellId,
    cellLabel: socket.cellLabel,
    item: socket.item,
    type: socket.type,
    family: claim.family,
    effect: claim.eff.effect,
    tier: claim.eff.tier,
    gemName: claim.gemName
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
  classes: readonly ClassAbbr[],
  sockets: readonly SocketHostCell[]
): BoardPlan {
  const rowByKey = new Map(rows.map((r) => [r.key, r]))
  const claims = familyClaims(copyCounts(owned), rowByKey, classes, TYPES)
  const adj = edges(claims, sockets, rowByKey)
  const placed = match(claims, adj, sockets.length)
  const placements: Placement[] = []
  for (let u = 0; u < claims.length; u++) {
    if (placed[u] !== -1) placements.push(placementOf(claims[u], sockets[placed[u]]))
  }
  return {
    placements,
    moves: movesOf(placements, sockets, rowByKey),
    contested: contestedOf({ claims, placed, adj, sockets }, placements)
  }
}
