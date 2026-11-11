// shared/gapDerive.ts — the Gaps tab's derived snapshot: the engine's rows with the domains the
// renderer checks against the catalog joined in (factions, drops, images, respawns). It was inline in
// useGapsData's `useMemo`, so it reran on every visit: GapsView remounts on each tab switch, and a
// remount starts with an empty memo (perf audit, 2026-10-20: each Gaps visit 400–500 ms, as one
// long task). Pulled out here, it is pure and node-testable, and `lastGapsSnap` keeps the last
// answer across remounts while every input is the same object.
//
// ONE MEMO PER DOMAIN, EACH ON ITS OWN INPUTS (whole-app review 2026-11-06, #18): one memo over
// every input made a single loot line recompute factions, images and respawns too (factions 7,
// drops 38, images 8 ms per push while the tab is mounted). Each domain's rows are now kept while
// the inputs THAT DOMAIN reads are the same objects, and the snapshot is assembled from them in the
// order the chain always joined: factions, drops, forage, images, respawns.

import type { GapDomain, GapRow, GapsSnap } from './gaps'
import type { KillMap } from './kills'
import type { LootEvent } from './types'
import { factionGaps } from './gapFactions'
import { dropGaps, type DropAliases, type DropGroups, type ItemMobs } from './gapDrops'
import { imageGaps, type ConMet } from './gapImages'
import { isProof, withForageRows, withoutProof, type ItemForage } from './gapForage'
import { memoLast } from './gapMemo'
import { respawnGaps, withLearnedRespawn } from './gapRespawns'
import type { MobEntry } from './mobTypes'
import { learnedOf, type LearnedEvidence } from './respawnLearn'

/** What the player did, as the modules serve it: loot lines, the kills ledger, /cons, and the item pages' mobs from main. */
export interface GapsMet {
  loot: readonly LootEvent[]
  kills: KillMap
  cons: readonly ConMet[]
  /** Absent until main has answered (gapItemMobs.ts). */
  itemMobs?: ItemMobs
  /** What each foraged item's own page states of foraging; absent until main has answered (gapForage.ts). */
  itemForage?: ItemForage
  /** The respawn module's snapshot: its learned gaps give the Respawns rows (gapRespawns.ts). */
  respawn?: unknown
}

/** The wiki data, fixed for the session: the mob catalog and dropGroups.json. */
export interface GapsWiki {
  catalog: readonly MobEntry[]
  groups: DropGroups
  aliases: DropAliases
}

type Memo<R> = (key: readonly unknown[], build: () => R) => R

/** One memo per domain: each keyed by the identities of the inputs that domain alone reads. */
interface DomainMemos {
  factions: Memo<GapRow[]>
  drops: Memo<GapRow[]>
  forage: Memo<GapsSnap>
  images: Memo<GapRow[]>
  learned: Memo<LearnedEvidence[]>
  respawns: Memo<GapRow[]>
}

const domainMemos = (): DomainMemos => ({ factions: memoLast(), drops: memoLast(), forage: memoLast(), images: memoLast(), learned: memoLast(), respawns: memoLast() })

/** Each domain's rows, taken from its memo while that domain's inputs are the same objects. */
interface Domains {
  factions?: GapRow[]
  drops?: GapRow[]
  /** `withForageRows` over the engine alone: the engine itself when it has no proof rows. */
  foraged: GapsSnap
  images?: GapRow[]
  learned: readonly LearnedEvidence[]
  respawns?: GapRow[]
}

/** The derivation's inputs, bundled (four positional arguments is the ceiling). */
interface Inputs {
  engine: GapsSnap
  met: GapsMet
  wiki: GapsWiki
  only?: GapDomain
}

function domainsOf({ engine, met, wiki, only }: Inputs, m: DomainMemos): Domains {
  // The Mobs list reads the field domains by mob (gapNeeds.ts), so a Mobs-only copy derives them too.
  const wants = (d: GapDomain): boolean => only === undefined || only === d || (only === 'mob' && (d === 'faction' || d === 'drop' || d === 'image' || d === 'respawn'))
  const learned = m.learned([met.respawn], () => learnedOf(met.respawn))
  return {
    ...(wants('faction') ? { factions: m.factions([engine.killFactions, wiki.catalog, met.kills], () => factionGaps(engine.killFactions ?? [], wiki.catalog, met.kills)) } : {}),
    ...(wants('drop')
      ? { drops: m.drops([met.loot, wiki.catalog, wiki.groups, met.itemMobs, wiki.aliases], () => dropGaps(met.loot, wiki.catalog, wiki.groups, { itemMobs: met.itemMobs, aliases: wiki.aliases })) }
      : {}),
    foraged: m.forage([engine, met.itemForage, wiki.catalog], () => withForageRows(engine, met.itemForage, wiki.catalog)),
    ...(wants('image') ? { images: m.images([met.kills, met.loot, met.cons, wiki.catalog], () => imageGaps(met.kills, met.loot, wiki.catalog, met.cons)) } : {}),
    learned,
    ...(wants('respawn') && learned.length > 0 ? { respawns: m.respawns([learned, wiki.catalog], () => respawnGaps(learned, wiki.catalog)) } : {})
  }
}

/** The totals as the chain counted them: each joined domain's count added in its turn, the forage step's recount of items in its place. */
function totalsOf(engine: GapsSnap, d: Domains, foraged: boolean): Record<string, number> {
  let totals: Record<string, number> = { ...engine.totals, ...(d.factions === undefined ? {} : { faction: d.factions.length }), ...(d.drops === undefined ? {} : { drop: d.drops.length }) }
  if (foraged) totals = { ...withoutProof(totals), item: d.foraged.totals.item }
  if (d.images !== undefined) totals = { ...totals, image: d.images.length }
  if (d.respawns !== undefined) totals = { ...totals, respawn: d.respawns.length }
  return totals
}

/** The rows in the chain's order: the engine's (less its proof rows), factions, drops, the forage updates, images; the Mobs rows given their learned respawn when it joins, then the Respawns rows. */
function rowsOf(engine: GapsSnap, d: Domains, foraged: boolean, givesRespawn: boolean): GapRow[] {
  const kept = foraged ? engine.rows.filter((r) => !isProof(r)).length : engine.rows.length
  const joined = [...d.foraged.rows.slice(0, kept), ...(d.factions ?? []), ...(d.drops ?? []), ...d.foraged.rows.slice(kept), ...(d.images ?? [])]
  return givesRespawn ? [...joined.map((r) => withLearnedRespawn(r, d.learned)), ...(d.respawns ?? [])] : joined
}

/**
 * The domains joined as the chain joined them (`rowsOf`, `totalsOf`). The engine itself when
 * nothing joined (the one-domain overlay copy of a domain with nothing to add).
 */
function assemble({ engine, only }: Inputs, d: Domains): GapsSnap {
  const wants = (x: GapDomain): boolean => only === undefined || only === x
  const foraged = d.foraged !== engine
  const givesRespawn = d.learned.length > 0 && (wants('respawn') || wants('mob'))
  if (d.factions === undefined && d.drops === undefined && !foraged && d.images === undefined && !givesRespawn) return engine
  return { ...engine, rows: rowsOf(engine, d, foraged, givesRespawn), totals: totalsOf(engine, d, foraged), ...(foraged ? { seen: d.foraged.seen } : {}) }
}

/**
 * The engine's snapshot with the faction, drop, image and respawn rows joined in and counted. `only`
 * (the Wiki Gaps overlay's background copy, which shows one domain) derives that domain alone; the
 * others are left out, not empty-counted. The forage rows always run: they also remove the
 * engine's hidden `forage` rows. The respawn evidence also gives a new mob page its respawn_time, so
 * Mobs takes it too.
 */
export function deriveGaps(engine: GapsSnap, met: GapsMet, wiki: GapsWiki, only?: GapDomain): GapsSnap {
  const inputs = { engine, met, wiki, only }
  return assemble(inputs, domainsOf(inputs, domainMemos()))
}

/** The inputs' identities, in a fixed order: the cache key. */
const keyOf = (engine: GapsSnap, met: GapsMet, wiki: GapsWiki, only?: GapDomain): readonly unknown[] => [engine, met.loot, met.kills, met.cons, met.itemMobs, met.itemForage, met.respawn, wiki.catalog, wiki.groups, wiki.aliases, only]

/**
 * `deriveGaps` behind a one-entry cache, keyed by the IDENTITY of each input: the engine snapshot,
 * the loot, kills and cons (useModule hands back the same object until the module changes), the
 * item-page answer (the same map until main answers more), and the wiki's three tables. A revisit
 * with nothing new returns the last snapshot itself; a push that changed one input re-derives only
 * the domains that read it (the per-domain memos) and re-joins the rest. A caller must pass stable
 * objects: a fresh `?? []` per render misses every time. An option added to the derivation joins
 * the key.
 */
export function lastGapsSnap(): (engine: GapsSnap, met: GapsMet, wiki: GapsWiki, only?: GapDomain) => GapsSnap {
  const last = memoLast<GapsSnap>()
  const memos = domainMemos()
  return (engine, met, wiki, only) => {
    const inputs = { engine, met, wiki, only }
    return last(keyOf(engine, met, wiki, only), () => assemble(inputs, domainsOf(inputs, memos)))
  }
}
