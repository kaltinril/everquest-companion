// shared/logArchive/mergeGaps.ts — the `gaps` module across an archive and the live log.
//
// The fold (`gaps.rs`) keeps one row per unknown name and domain, served most mentioned first, at
// most CAP_PER_DOMAIN a domain, each with its details (`gaps_details.rs`): tallies served as their
// LIST_CAP most frequent entries plus the distinct count, two copper sums, the last SAMPLES lines.
// Rows join by domain and case-folded name (the fold keys every domain lowercased); a name on both
// sides adds its counts, tallies and copper and keeps the wider first and last. The row shape is
// restated here rather than imported: shared/gaps.ts lives on the gaps-tab branch, and this file
// must build without it.

import { isRewardChest } from '../rewardChest'
import { dialogueOf, mergeDialogue, type Dialogue } from '../gapDialogue'

interface Tally {
  entries: { name: string; n: number }[]
  distinct: number
  /** The zones, forageZones and cons lists: every name, past the cap (the "this zone" filter, a page's `|foraged` and `|level`). */
  all?: string[]
}

// forageZones and tradeskills (owner, 2026-10-20, gaps-item-facts): where an item was foraged and
// the tradeskill its combines raised, for the copied item page; an archive from before has none.
const LISTS = ['zones', 'forageZones', 'sources', 'dispositions', 'tradeskills', 'drops', 'cons', 'killers', 'casters', 'sales', 'paid'] as const
const COPPER = ['salesCopper', 'paidCopper'] as const

/**
 * A merchant's offer for an item (owner, 2026-10-20, the Gaps tab's merchant offers; engine
 * gaps_offers.rs). Declared here by shape, not imported: this branch sits before the Gaps
 * branches in the recipe, and an archive written before offers existed simply has none.
 */
interface Offer {
  merchant: string
  coin: string
  copper: number
  per?: true
  standing?: string
  zone?: string
  n: number
  last: string
}

type Details = Partial<Record<(typeof LISTS)[number], Tally>> &
  Partial<Record<(typeof COPPER)[number], number>> & { samples: string[]; offers?: Offer[] }

interface Row {
  domain: string
  name: string
  kinds: string[]
  count: number
  first: string
  last: string
  details: Details
  /** a Mobs row's fight numbers per zone tier (gaps_fight.rs) */
  fight?: FightTier[]
  /** served only when true (gaps.rs `serve_row`): a one-word name this log has not shown to be an NPC */
  maybePlayer?: boolean
  /** served only when the wiki data says so (`mergeRow`) */
  suggest?: unknown
  zoneTitled?: true
  viaRedirect?: string
  /** an NPC's whole conversation (gaps_dialogue.rs): every keyword either log heard (`mergeDialogue`) */
  dialogue?: Dialogue
  /** an item's quest facts (gaps_quests.rs, shared/itemQuestFacts.ts), restated by shape */
  questFacts?: QuestFacts
}

/** What `mergeRow` reads of an item's quest facts: who it was turned in to, how often. The rest passes as it is. */
interface QuestFacts {
  turnedInTo?: { npc: string; n: number }[]
  [field: string]: unknown
}

/**
 * How two snapshots join. `oneCharacter` (the archive merge: one character's archive under its
 * live log, every class loadout in the one log) adds its turn-ins up. `acrossCharacters` (the Gaps
 * tab's All characters join) never adds one character's turn-ins to another's: owner, 2026-11-23,
 * "each character shows it's own turn in, because I believe the achivements are not cross
 * server/character. Cross load-out on the same server? yeah it all counts".
 */
export type GapsJoin = 'oneCharacter' | 'acrossCharacters'

/** A kill and a faction its lines moved (gaps_trade.rs), how often, and the zone last seen in. */
interface KillFaction {
  mob: string
  faction: string
  n: number
  zone: string
  /** the amount most lines stated */
  adjust?: number
  /** the amount's direction, or a capped line's (it states no amount): true raised, false lowered */
  raised?: boolean
  /** every amount a line stated with how often, most stated first; absent on a state from before it was served */
  adjusts?: [number, number][]
  /** the proof: the last kills' raw lines, oldest first, each the faction line then the death line */
  samples?: string[]
}

/** Where a con or hail beside a `/loc` placed a mob (gaps_locs.rs), each point in `/loc` order. */
interface MobLoc {
  mob: string
  zone: string
  points: number[][]
}

interface MobSpecial {
  mob: string
  specials: string[]
}

/** One mob's corpse coin, `[platinum, gold, silver, copper]` (gaps_coin.rs, 2026-10-19). */
interface MobCoin {
  mob: string
  n: number
  min: number[]
  max: number[]
}

interface Snap {
  rows: Row[]
  totals: Record<string, number>
  seen: Record<string, number>
  killFactions?: KillFaction[]
  mobLocs?: MobLoc[]
  /** What each mob was seen to do on its attack lines (gaps_specials.rs, 2026-10-19). */
  mobSpecials?: MobSpecial[]
  /** What each mob's corpse paid at the player's kills: how many paid, each coin's least and most. */
  mobCoin?: MobCoin[]
  /** The player's own pets by name (gaps.rs `own_pets`): a kill by one is the player's (owner, 2026-10-22). */
  ownPets?: string[]
}

/** The fold's own caps (gaps.rs `CAP_PER_DOMAIN`, gaps_details.rs `LIST_CAP` and `SAMPLES`). */
const CAP_PER_DOMAIN = 500
const LIST_CAP = 8
const SAMPLES = 3
/** gaps_trade.rs `KILL_FACTION_SAMPLES`: three kills, two lines each (owner, 2026-10-20). */
const KILL_FACTION_SAMPLES = 6

/** The fold serves the domains in this order. */
const DOMAINS = ['item', 'mob', 'spell']

const isRecord = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)

function isSnap(x: unknown): x is Snap {
  if (!isRecord(x)) return false
  return Array.isArray(x.rows) && isRecord(x.totals) && isRecord(x.seen)
}

const byCountThenName = (a: { count: number; name: string }, b: { count: number; name: string }): number =>
  b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Every name a side lists: its `all` where it has one, its served entries where it does not. */
const namesOf = (t: Tally): string[] => t.all ?? t.entries.map((e) => e.name)

/**
 * Entries summed by name and re-ranked, the fold's way (n desc, then name), the first LIST_CAP kept.
 * `distinct` is the union of what was served, or either side's own count when that is larger: a
 * capped list can only union the entries it carries, so the true distinct count is at least this.
 * `all`, when either side carries one, is the sorted union of both sides' names.
 */
function mergeTally(a: Tally | undefined, b: Tally | undefined): Tally | undefined {
  if (a === undefined || b === undefined) return a ?? b
  const n = new Map<string, number>()
  for (const e of [...a.entries, ...b.entries]) n.set(e.name, (n.get(e.name) ?? 0) + e.n)
  const entries = [...n].map(([name, count]) => ({ name, count })).sort(byCountThenName)
  const all = a.all || b.all ? [...new Set([...namesOf(a), ...namesOf(b)])].sort() : undefined
  return {
    entries: entries.slice(0, LIST_CAP).map((e) => ({ name: e.name, n: e.count })),
    distinct: Math.max(n.size, a.distinct, b.distinct, all?.length ?? 0),
    ...(all ? { all } : {})
  }
}

function mergeDetails(a: Details, b: Details): Details {
  const out: Details = { samples: [...a.samples, ...b.samples].slice(-SAMPLES) }
  for (const k of LISTS) {
    const t = mergeTally(a[k], b[k])
    if (t !== undefined) out[k] = t
  }
  for (const k of COPPER) {
    const sum = (a[k] ?? 0) + (b[k] ?? 0)
    if (sum > 0) out[k] = sum
  }
  const offers = mergeOffers(a.offers, b.offers)
  if (offers !== undefined) out.offers = offers
  return out
}

/** The fold's own cap on a row's offers (gaps_offers.rs `OFFERS_KEPT`). */
const OFFERS_KEPT = 8

/**
 * Two rows' offers as one, by the fold's own rule (gaps_offers.rs `Offers::add`): an offer is the
 * same when its merchant, price, form (`per`) and standing are; the same offer's counts add, and
 * the newer one's stamp and zone stand. Newest last, the OFFERS_KEPT newest kept. Without this the
 * archive merge, which keeps the detail lists it names, dropped every offer of a row it joined.
 */
function mergeOffers(a: Offer[] | undefined, b: Offer[] | undefined): Offer[] | undefined {
  if (a === undefined && b === undefined) return undefined
  const keyOf = (o: Offer): string => [o.merchant, o.copper, o.per === true, o.standing ?? ''].join('|')
  const byKey = new Map<string, Offer>()
  for (const o of [...(a ?? []), ...(b ?? [])]) {
    const had = byKey.get(keyOf(o))
    if (had === undefined) byKey.set(keyOf(o), { ...o })
    else byKey.set(keyOf(o), { ...(o.last >= had.last ? o : had), n: had.n + o.n })
  }
  return [...byKey.values()].sort((x, y) => (x.last < y.last ? -1 : x.last > y.last ? 1 : 0)).slice(-OFFERS_KEPT)
}

/** The earlier of two stamps, an empty one (a line without a stamp) losing to the other. */
const earliest = (a: string, b: string): string => (a === '' ? b : b === '' ? a : a < b ? a : b)

/** The fold's spelling rule for a mob: the lowercase (loot line) spelling wins over a /con's sentence case. */
function nameOf(had: Row, r: Row): string {
  const lowerInitial = (s: string): boolean => /^[a-z]/.test(s)
  return had.domain === 'mob' && lowerInitial(r.name) && !lowerInitial(had.name) ? r.name : had.name
}

/** One zone tier of a mob's fights (gaps_fight.rs, shared/gapFight.ts `FightTier`). */
interface FightTier {
  tier: number
  kills: number
  fights: number
  hp?: number
  hits?: number
  hitMin?: number
  hitMax?: number
  attacks: string[]
  swings?: number
}

const pick = (f: (a: number, b: number) => number, a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined ? b : b === undefined ? a : f(a, b)

/**
 * Two characters' fights at one tier: kills, fights and hits added, the hit range widened, the verbs
 * joined; the median HP and the swings from the side that saw more whole fights (a median does not
 * add). The owner's "All characters" view, 2026-10-23.
 */
function joinFight(a: FightTier, b: FightTier): FightTier {
  const more = b.fights > a.fights ? b : a
  const hits = pick((x, y) => x + y, a.hits, b.hits)
  const hitMin = pick(Math.min, a.hitMin, b.hitMin)
  const hitMax = pick(Math.max, a.hitMax, b.hitMax)
  return {
    tier: a.tier,
    kills: a.kills + b.kills,
    fights: a.fights + b.fights,
    ...(more.hp === undefined ? {} : { hp: more.hp }),
    ...(hits === undefined ? {} : { hits }),
    ...(hitMin === undefined ? {} : { hitMin }),
    ...(hitMax === undefined ? {} : { hitMax }),
    attacks: [...new Set([...a.attacks, ...b.attacks])].sort(),
    ...(more.swings === undefined ? {} : { swings: more.swings })
  }
}

/** Both rows' fight tiers, tier by tier; undefined when neither has any. */
function mergeFight(a: FightTier[] | undefined, b: FightTier[] | undefined): FightTier[] | undefined {
  if (a === undefined || b === undefined) return a ?? b
  const byTier = new Map(a.map((t) => [t.tier, t]))
  for (const t of b) {
    const had = byTier.get(t.tier)
    byTier.set(t.tier, had === undefined ? t : joinFight(had, t))
  }
  return [...byTier.values()].sort((x, y) => x.tier - y.tier)
}

/**
 * One character's turn-ins to each NPC over both sides, added (the archive and the live log hold
 * different trades); one entry per case-folded NPC, its first spelling kept, in the fold's order
 * (gaps_quests.rs serves a BTreeMap, so by name). Undefined when neither side names one.
 */
function joinTurnIns(a: QuestFacts['turnedInTo'], b: QuestFacts['turnedInTo']): QuestFacts['turnedInTo'] {
  if (a === undefined && b === undefined) return undefined
  const byNpc = new Map<string, { npc: string; n: number }>()
  for (const t of [...(a ?? []), ...(b ?? [])]) {
    const had = byNpc.get(t.npc.toLowerCase())
    byNpc.set(t.npc.toLowerCase(), { npc: had?.npc ?? t.npc, n: (had?.n ?? 0) + t.n })
  }
  return [...byNpc.values()].sort((x, y) => (x.npc < y.npc ? -1 : x.npc > y.npc ? 1 : 0))
}

/**
 * Both sides' quest facts for one character: the newer side's, as for every served field, with the
 * turn-ins of both added (`joinTurnIns`), so a turn-in made before the archive was cut still counts.
 * Undefined when a side has none: the row's spread already keeps the one that does.
 */
function joinQuestFacts(a: QuestFacts | undefined, b: QuestFacts | undefined): QuestFacts | undefined {
  if (a === undefined || b === undefined) return undefined
  const turnedInTo = joinTurnIns(a.turnedInTo, b.turnedInTo)
  return { ...b, ...(turnedInTo === undefined ? {} : { turnedInTo }) }
}

/**
 * One name on both sides. The tallied fields join; every other field the fold serves on a row (a
 * merchant's `itemsSold`, `greeting` and `role`, an NPC's `questFacts`, a `suggest`, `maybePlayer`)
 * takes the NEWER side, which is the live fold's current reading. The older side used to win them
 * (owner, 2026-11-05: a merchant met once in an archived log copied as a page with no items sold,
 * though the live row carried every quote: `...had` kept the archive row's fields and never saw the
 * live row's).
 *
 * Two kinds of flag are served only when set, so the spread alone let the older side's stand after
 * the newer side had dropped it. What the fold reads off the wiki data alone (`suggest`, `zoneTitled`,
 * `viaRedirect`) follows the newer side, absent or not. `maybePlayer` stands only when BOTH sides say
 * it: a side's row without it is that log's proof of an NPC (an answered hail, a kill), whichever
 * side holds the proof.
 *
 * An item's turn-ins are the exception to "newer side": within one character they add up
 * (`joinQuestFacts`); across characters (`join` is `acrossCharacters`) the newer side's stand.
 */
function mergeRow(had: Row, r: Row, join: GapsJoin): Row {
  const fight = mergeFight(had.fight, r.fight)
  const dialogue = mergeDialogue(dialogueOf(had), dialogueOf(r))
  const questFacts = join === 'oneCharacter' ? joinQuestFacts(had.questFacts, r.questFacts) : undefined
  const out: Row = {
    ...had,
    ...r,
    ...(fight === undefined ? {} : { fight }),
    ...(dialogue === undefined ? {} : { dialogue }),
    ...(questFacts === undefined ? {} : { questFacts }),
    name: nameOf(had, r),
    kinds: [...had.kinds, ...r.kinds.filter((k) => !had.kinds.includes(k))],
    count: had.count + r.count,
    first: earliest(had.first, r.first),
    last: had.last > r.last ? had.last : r.last,
    details: mergeDetails(had.details, r.details)
  }
  if (r.suggest === undefined) delete out.suggest
  if (r.zoneTitled === undefined) delete out.zoneTitled
  if (r.viaRedirect === undefined) delete out.viaRedirect
  if (had.maybePlayer !== true || r.maybePlayer !== true) delete out.maybePlayer
  return out
}

/** Each domain's rows re-ranked and re-capped as the fold serves them, the domains in its order. */
function served(rows: Iterable<Row>): { rows: Row[]; counted: Map<string, number> } {
  const groups = new Map<string, Row[]>(DOMAINS.map((d) => [d, []]))
  for (const r of rows) {
    const g = groups.get(r.domain)
    if (g === undefined) groups.set(r.domain, [r])
    else g.push(r)
  }
  const counted = new Map([...groups].map(([d, g]) => [d, g.length]))
  return { rows: [...groups.values()].flatMap((g) => g.sort(byCountThenName).slice(0, CAP_PER_DOMAIN)), counted }
}

/**
 * Per domain: `totals` recounted from the joined rows (a name on both sides is one name), or either
 * side's own total when that is larger (names past a side's cap were never served, so cannot be
 * joined); `seen` the larger side's, since the true union of two distinct counts is unknowable.
 */
function perDomain(older: Snap, newer: Snap, counted: Map<string, number>): Pick<Snap, 'totals' | 'seen'> {
  const totals: Record<string, number> = {}
  const seen: Record<string, number> = {}
  for (const d of new Set([...DOMAINS, ...Object.keys(older.totals), ...Object.keys(newer.totals), ...counted.keys()])) {
    totals[d] = Math.max(counted.get(d) ?? 0, older.totals[d] ?? 0, newer.totals[d] ?? 0)
  }
  for (const d of new Set([...DOMAINS, ...Object.keys(older.seen), ...Object.keys(newer.seen)])) {
    seen[d] = Math.max(older.seen[d] ?? 0, newer.seen[d] ?? 0)
  }
  return { totals, seen }
}

/** A side's stated amounts: its `adjusts`, or its one `adjust` weighed by its kills (a state from before the counts were served). */
const statedOf = (p: KillFaction): [number, number][] => p.adjusts ?? (p.adjust === undefined ? [] : [[p.adjust, p.n]])

/** Both sides' stated amounts added, most stated first, a tie to the larger hit (gaps_trade.rs `Pair::stated`). */
function joinAdjusts(a: KillFaction, b: KillFaction): [number, number][] {
  const n = new Map<number, number>()
  for (const [amount, count] of [...statedOf(a), ...statedOf(b)]) n.set(amount, (n.get(amount) ?? 0) + count)
  return [...n].sort((x, y) => y[1] - x[1] || Math.abs(y[0]) - Math.abs(x[0]) || y[0] - x[0])
}

/**
 * One pair on both sides: counts added, the newer zone kept, the proof lines joined newer last. The
 * amount is the one most lines stated over BOTH sides, as the fold picks it within one log: the newer
 * side's amount used to win outright, so one hit clipped at the faction floor (-4) replaced the -5
 * that hundreds of archived kills stated. With no amount on either side the newer direction stands.
 */
function joinKillFaction(had: KillFaction, p: KillFaction): KillFaction {
  const samples = [...(had.samples ?? []), ...(p.samples ?? [])].slice(-KILL_FACTION_SAMPLES)
  const adjusts = joinAdjusts(had, p)
  const stated = adjusts.length > 0 ? { adjusts, adjust: adjusts[0][0], raised: adjusts[0][0] > 0 } : { raised: p.raised ?? had.raised }
  return { ...had, n: had.n + p.n, zone: p.zone || had.zone, ...stated, ...(samples.length > 0 ? { samples } : {}) }
}

/** Both sides' kill-faction pairs, one per case-folded (mob, faction) (`joinKillFaction`). */
function mergeKillFactions(older: Snap, newer: Snap): KillFaction[] {
  const out = new Map<string, KillFaction>()
  for (const p of [...(older.killFactions ?? []), ...(newer.killFactions ?? [])]) {
    const k = `${p.mob.toLowerCase()}|${p.faction.toLowerCase()}`
    const had = out.get(k)
    out.set(k, had === undefined ? { ...p } : joinKillFaction(had, p))
  }
  return [...out.values()]
}

/** Both sides' mob specials, one entry per case-folded mob, each special once. */
function mergeMobSpecials(older: Snap, newer: Snap): MobSpecial[] {
  const out = new Map<string, MobSpecial>()
  for (const m of [...(older.mobSpecials ?? []), ...(newer.mobSpecials ?? [])]) {
    const had = out.get(m.mob.toLowerCase())
    out.set(m.mob.toLowerCase(), { mob: had?.mob ?? m.mob, specials: [...new Set([...(had?.specials ?? []), ...m.specials])].sort() })
  }
  return [...out.values()]
}

/** Both sides' corpse coin, one entry per case-folded mob: the paying kills added, each coin's least and most widened. */
function mergeMobCoin(older: Snap, newer: Snap): MobCoin[] {
  const out = new Map<string, MobCoin>()
  for (const m of [...(older.mobCoin ?? []), ...(newer.mobCoin ?? [])]) {
    const had = out.get(m.mob.toLowerCase())
    out.set(
      m.mob.toLowerCase(),
      had === undefined
        ? { ...m, min: [...m.min], max: [...m.max] }
        : { mob: had.mob, n: had.n + m.n, min: had.min.map((v, i) => Math.min(v, m.min[i] ?? v)), max: had.max.map((v, i) => Math.max(v, m.max[i] ?? v)) }
    )
  }
  return [...out.values()]
}

/** Both sides' mob points, one entry per case-folded mob, each point once (gaps_locs.rs keeps them rounded). */
function mergeMobLocs(older: Snap, newer: Snap): MobLoc[] {
  const out = new Map<string, MobLoc>()
  for (const m of [...(older.mobLocs ?? []), ...(newer.mobLocs ?? [])]) {
    const had = out.get(m.mob.toLowerCase())
    const points = [...(had?.points ?? []), ...m.points]
    const unique = [...new Map(points.map((p) => [p.join(','), p])).values()]
    out.set(m.mob.toLowerCase(), { mob: had?.mob ?? m.mob, zone: m.zone || (had?.zone ?? ''), points: unique })
  }
  return [...out.values()]
}

/**
 * The row without a Reward Chest among its sources (shared/rewardChest.ts, owner 2026-10-21: the
 * chest is no mob): a state folded before gaps_details.rs left it out still names it. A row with no
 * details (a state from before them) passes as it is, as it did before this ran on every row.
 */
function withoutChest(r: Row): Row {
  const t = (r.details as Details | undefined)?.sources
  if (!t?.entries.some((e) => isRewardChest(e.name))) return r
  const entries = t.entries.filter((e) => !isRewardChest(e.name))
  const details: Details = { ...r.details }
  if (entries.length === 0) delete details.sources
  else details.sources = { ...t, entries, distinct: Math.max(entries.length, t.distinct - 1) }
  return { ...r, details }
}

/**
 * `older` then `newer`, a row on both sides added together; null when either is not a gaps state.
 * `join` says whether the two are one character's (the archive merge, the default) or two
 * characters' (`GapsJoin`).
 */
export function mergeGaps(older: unknown, newer: unknown, join: GapsJoin = 'oneCharacter'): Snap | null {
  if (!isSnap(older) || !isSnap(newer)) return null
  const out = new Map<string, Row>()
  for (const r of [...older.rows, ...newer.rows].map(withoutChest)) {
    const k = `${r.domain}|${r.name.toLowerCase()}`
    const had = out.get(k)
    out.set(k, had === undefined ? { ...r } : mergeRow(had, r, join))
  }
  const { rows, counted } = served(out.values())
  return { rows, ...perDomain(older, newer, counted), killFactions: mergeKillFactions(older, newer), mobLocs: mergeMobLocs(older, newer), mobSpecials: mergeMobSpecials(older, newer), mobCoin: mergeMobCoin(older, newer), ownPets: [...new Set([...(older.ownPets ?? []), ...(newer.ownPets ?? [])])].sort() }
}
