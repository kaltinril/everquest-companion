// character/exaltationAudit.ts — THE EXALTATION CLEANUP ADVISOR (fork ask, kaltinril 2026-09-09:
// "if I have Burning Affliction I and II, it should tell me to get rid of I. If I have 2 of the
// same, tell me to get rid of one" - and the items are class-specific).
//
// PURE AND NODE-TESTED (tests/exaltationAudit.test.mts), the slotSockets.ts posture: relative
// value imports, no React, no IPC. It WRITES nothing and destroys nothing - every line it
// produces is advice over two things the app already holds, the inventory dump's own
// `(Exaltation)` rows and the committed gear index's effect table. The player does the deciding.
//
// TWO KINDS OF FINDING, EACH WITH ITS HONESTY CLAUSE:
//
//   DUPLICATES - more copies of one exaltation than the dump shows socketed. Reported as counts,
//   never as "get rid of it": a loose second copy may be waiting for the offhand (the user's own
//   Blood Fire pair is exactly that), so the row states copies / socketed / loose and stops.
//
//   SUPERSEDED TIERS - a ranked effect (Burning Affliction I) owned while a higher tier of the
//   SAME family (Burning Affliction III) is also owned on a donor the character's classes can
//   use. The class gate runs on the BETTER copy: an unusable higher tier supersedes nothing,
//   which is the "items are class-specific" half of the ask. Rank comes from the corpus's own
//   focus parse (`GearEffect.family`/`familyTier`) with a roman-numeral fallback for the effect
//   kinds that parse never covered - the fallback reads only a trailing I..X off the effect name,
//   the exact spelling the wiki uses for every ranked line.

import type { ClassAbbr } from '../../../../shared/classCombo'
import type { GearRow } from '../../../../shared/planner/gear'
import type { OwnedExaltation, SheetCellView } from '../../../../shared/characterSheet'
import { ownershipKey } from '../../../../shared/planner/ownership'
import { socketTypeOf } from '../../../../shared/planner/normalize'

/** One exaltation owned in more copies than are socketed — stated, never commanded. */
export interface DuplicateFinding {
  name: string
  copies: number
  socketed: number
  wheres: string[]
}

/** One owned tier of a ranked effect that a better owned-and-usable tier makes redundant. */
export interface SupersededFinding {
  /** the redundant gem's donor name */
  name: string
  /** the ranked effect it carries, as the corpus spells it */
  effect: string
  tier: number
  /** the donor that makes it redundant, and that donor's tier of the same family */
  betterName: string
  betterEffect: string
  betterTier: number
  /** every place the redundant copy sits */
  wheres: string[]
  /** true when at least one redundant copy is currently socketed in worn gear */
  socketed: boolean
}

export interface ExaltationAudit {
  duplicates: DuplicateFinding[]
  superseded: SupersededFinding[]
}

/** A ranked effect off a gear row: the family it belongs to and where in the ladder it sits. */
interface RankedEffect {
  family: string
  tier: number
  effect: string
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }

/**
 * Every ranked effect a row states. The corpus's focus parse is preferred where it ran
 * (`family`/`familyTier`); the trailing-roman fallback covers the worn/click/proc lines it never
 * touches. An unranked effect contributes nothing — a family of one can supersede nothing.
 */
export function rankedEffects(row: GearRow): RankedEffect[] {
  const out: RankedEffect[] = []
  for (const e of row.effects) {
    if (e.family !== undefined && e.familyTier !== undefined) {
      out.push({ family: e.family.toLowerCase(), tier: e.familyTier, effect: e.name })
      continue
    }
    const m = /^(.+?)\s+([IVX]+)$/.exec(e.name.trim())
    const tier = m ? ROMAN[m[2]] : undefined
    if (m && tier !== undefined) out.push({ family: m[1].toLowerCase(), tier, effect: e.name })
  }
  return out
}

/** Can any of this character's classes use the donor? Unstated classes pass (law 1). */
function usable(row: GearRow, classes: readonly ClassAbbr[]): boolean {
  if (row.classes.length === 0 || classes.length === 0) return true
  return row.classes.some((c) => classes.includes(c))
}

/** One effect ranked for comparison — an UNRANKED effect keeps tier 0: socketable, never "better". */
export interface KindEffect {
  family: string
  tier: number
  effect: string
  detail?: string
}

/**
 * The donor's best effect FOR ONE SOCKET TYPE — the effect the gem grants when it sits in that
 * socket (the JOS-452 numbering read forward: a gem in the Proc socket gives its combat line).
 * Null when the corpus row states no effect of that kind, or the corpus does not know the donor.
 */
export function bestEffectFor(row: GearRow | undefined, type: string): KindEffect | null {
  if (row === undefined) return null
  const want = type.toLowerCase()
  let best: KindEffect | null = null
  for (const e of row.effects) {
    if (socketTypeOf(e.kind) !== want) continue
    const k = kindEffectOf(e)
    if (best === null || k.tier > best.tier) best = k
  }
  return best
}

/** One effect line as a comparable: the corpus rank first, the roman fallback, tier 0 last. */
function kindEffectOf(e: GearRow['effects'][number]): KindEffect {
  const ranked =
    e.family !== undefined && e.familyTier !== undefined
      ? { family: e.family.toLowerCase(), tier: e.familyTier }
      : romanRank(e.name)
  return {
    family: ranked?.family ?? e.name.trim().toLowerCase(),
    tier: ranked?.tier ?? 0,
    effect: e.name,
    ...(e.detail === undefined ? {} : { detail: e.detail })
  }
}

function romanRank(name: string): { family: string; tier: number } | null {
  const m = /^(.+?)\s+([IVX]+)$/.exec(name.trim())
  const tier = m ? ROMAN[m[2]] : undefined
  return m && tier !== undefined ? { family: m[1].toLowerCase(), tier } : null
}

/** The audit's own copy shape — the `.map` projection out of the domain type (ruling 4's
 *  sanctioned escape), so every fold below runs on feature-local rows. */
interface ExaltCopy {
  name: string
  key: string
  where: string
  socketed: boolean
}

/** The copies of one key, folded: every place, and how many are socketed. */
interface KeyGroup {
  name: string
  copies: ExaltCopy[]
}

function byKey(owned: readonly ExaltCopy[]): Map<string, KeyGroup> {
  const out = new Map<string, KeyGroup>()
  for (const o of owned) {
    const held = out.get(o.key)
    if (held) held.copies.push(o)
    else out.set(o.key, { name: o.name, copies: [o] })
  }
  return out
}

function duplicateFindings(groups: Map<string, KeyGroup>): DuplicateFinding[] {
  const out: DuplicateFinding[] = []
  for (const g of groups.values()) {
    if (g.copies.length < 2) continue
    out.push({
      name: g.name,
      copies: g.copies.length,
      socketed: g.copies.filter((c) => c.socketed).length,
      wheres: g.copies.map((c) => c.where)
    })
  }
  return out.sort((a, b) => b.copies - a.copies)
}

/** One family's owned holders: rows that carry the family, with the tier each carries. */
interface Holder {
  key: string
  name: string
  tier: number
  effect: string
  usable: boolean
}

function supersededFindings(
  groups: Map<string, KeyGroup>,
  rowByKey: ReadonlyMap<string, GearRow>,
  classes: readonly ClassAbbr[]
): SupersededFinding[] {
  const families = new Map<string, Holder[]>()
  for (const [key, g] of groups) {
    const row = rowByKey.get(key)
    if (!row) continue
    for (const r of rankedEffects(row)) {
      const holder: Holder = { key, name: g.name, tier: r.tier, effect: r.effect, usable: usable(row, classes) }
      const held = families.get(r.family)
      if (held) held.push(holder)
      else families.set(r.family, [holder])
    }
  }
  const out: SupersededFinding[] = []
  for (const holders of families.values()) {
    const best = holders.filter((h) => h.usable).sort((a, b) => b.tier - a.tier)[0]
    if (best === undefined) continue
    for (const h of holders) {
      if (h.tier >= best.tier || h.key === best.key) continue
      const copies = groups.get(h.key)?.copies ?? []
      out.push({
        name: h.name,
        effect: h.effect,
        tier: h.tier,
        betterName: best.name,
        betterEffect: best.effect,
        betterTier: best.tier,
        wheres: copies.map((c) => c.where),
        socketed: copies.some((c) => c.socketed)
      })
    }
  }
  return out.sort((a, b) => b.betterTier - b.tier - (a.betterTier - a.tier))
}

/**
 * The whole audit: the dump's exaltation rows against the gear index, through the class gate.
 * `rows` is the served gear index; a refused or empty index yields only the duplicate half,
 * because tiers are a corpus fact and the corpus is not there to state them.
 */
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
    for (const s of item.sockets) {
      out.push({
        cellId: cell.id,
        cellLabel: cell.label,
        item: item.baseName,
        type: s.type,
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
  type: string,
  accept: (eff: KindEffect) => boolean
): { key: string; row: GearRow; eff: KindEffect } | null {
  let best: { key: string; row: GearRow; eff: KindEffect } | null = null
  for (const key of ctx.pool.keys()) {
    const row = ctx.rowByKey.get(key)
    if (row === undefined || !usable(row, ctx.classes)) continue
    const eff = bestEffectFor(row, type)
    if (eff === null || !accept(eff)) continue
    if (best === null || eff.tier > best.eff.tier) best = { key, row, eff }
  }
  return best
}

function flag(map: Map<string, Set<string>>, cellId: string, key: string): void {
  const held = map.get(cellId)
  if (held) held.add(key)
  else map.set(cellId, new Set([key]))
}

/** One filled host with the effect it will grant AFTER the swap pass — the redundancy board. */
interface EffectiveHost {
  host: SocketHostCell
  eff: KindEffect
  name: string
}

/** Pass 1 — same-family upgrades from the loose pool. Returns each filled host's EFFECTIVE
 *  effect (post-swap), which is what the redundancy pass must judge. */
function swapPass(
  ctx: RecContext,
  hosts: readonly SocketHostCell[],
  out: { swaps: SwapRec[]; flagged: Map<string, Set<string>> }
): EffectiveHost[] {
  const effective: EffectiveHost[] = []
  for (const host of hosts) {
    if (host.currentKey === null) continue
    // A current gem the corpus cannot rank is left alone: "better" would be a guess.
    const cur = bestEffectFor(ctx.rowByKey.get(host.currentKey), host.type)
    if (cur === null) continue
    const better = bestLoose(ctx, host.type, (e) => e.family === cur.family && e.tier > cur.tier)
    const where = better === null ? undefined : ctx.pool.take(better.key)
    if (better === null || where === undefined) {
      effective.push({ host, eff: cur, name: host.currentName ?? host.currentKey })
      continue
    }
    out.swaps.push({
      cellId: host.cellId,
      cellLabel: host.cellLabel,
      item: host.item,
      type: host.type,
      fromName: host.currentName ?? host.currentKey,
      fromEffect: cur.effect,
      toName: better.row.name,
      toEffect: better.eff.effect,
      toWhere: where
    })
    flag(out.flagged, host.cellId, host.currentKey)
    effective.push({ host, eff: better.eff, name: better.row.name })
  }
  return effective
}

/**
 * Pass 2 — DUPLICATE FAMILIES IN FORCE (user ruling, kaltinril 2026-09-09: exaltations do not
 * stack, so we only want a single one of each at the highest level). Same-name effects apply
 * once — the worn-haste precedent, and the classic focus rule — so of every family socketed
 * more than once, only the best copy counts and every other one is a DEAD socket. That is the
 * one place a cross-family suggestion is objective: a duplicate grants nothing, so the best
 * loose gem of any family NOT already in force beats it by construction.
 */
function redundancyPass(
  ctx: RecContext,
  effective: readonly EffectiveHost[],
  out: { redundant: RedundantRec[]; flagged: Map<string, Set<string>> }
): void {
  const kept = new Map<string, EffectiveHost>()
  for (const e of effective) {
    const held = kept.get(e.eff.family)
    if (held === undefined || e.eff.tier > held.eff.tier) kept.set(e.eff.family, e)
  }
  const inForce = new Set(kept.keys())
  for (const e of effective) {
    if (kept.get(e.eff.family) === e) continue
    out.redundant.push(redundantRec(ctx, e, kept.get(e.eff.family), inForce))
    if (e.host.currentKey !== null) flag(out.flagged, e.host.cellId, e.host.currentKey)
  }
}

/** One dead socket's row: the kept copy's place, and a cross-family replacement when one is loose. */
function redundantRec(
  ctx: RecContext,
  e: EffectiveHost,
  keptHost: EffectiveHost | undefined,
  inForce: Set<string>
): RedundantRec {
  const repl = bestLoose(ctx, e.host.type, (x) => !inForce.has(x.family))
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
    const best = bestLoose(ctx, host.type, () => true)
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
 * The three greedy passes over the worn board — swaps, then dead-socket redundancy, then
 * fills. Hosts arrive in sheet order and are answered in it, so the same dump always yields the
 * same advice.
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
  const effective = swapPass(ctx, hosts, { swaps, flagged })
  redundancyPass(ctx, effective, { redundant, flagged })
  fillPass(ctx, hosts, fills)
  return { swaps, fills, redundant, flaggedByCell: flagged }
}

export function auditExaltations(
  owned: readonly OwnedExaltation[],
  rows: readonly GearRow[],
  classes: readonly ClassAbbr[]
): ExaltationAudit {
  // The one projection out of the domain shape (ruling 4): every fold below is feature-local.
  const copies = owned.map(
    (o): ExaltCopy => ({ name: o.name, key: o.key, where: o.where, socketed: o.socketed })
  )
  const groups = byKey(copies)
  const rowByKey = new Map(rows.map((r) => [r.key, r]))
  return {
    duplicates: duplicateFindings(groups),
    superseded: supersededFindings(groups, rowByKey, classes)
  }
}
