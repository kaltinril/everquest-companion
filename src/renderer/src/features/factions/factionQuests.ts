// factions/factionQuests.ts — faction name → the quests that move it. PURE logic module
// (node-testable, no React/IPC), the gearOwnership.ts arrangement.
//
// THE SOURCE is the committed quest catalog (data/eqlegends/quests.json), whose entries carry the
// faction receipt lines their wiki pages quote (`QuestEntry.factions`, scraped offline from the
// cached corpus — scripts/sources/questPage.ts parseFactionHits). The JOIN KEY is the faction's
// name: the wiki links `[[Kerra Isle]]` and the `/outputfile faction` dump's Name column says
// `Kerra Isle`, so a lowercased name equality is the whole join. Factions the dump tracks but no
// quest page names simply have no work on record; factions quest pages name but the dump does not
// track (Kunark/Velious-era names in a classic dump) are indexed anyway and shown or not by the
// caller.
//
// THE PROJECTION HAPPENS HERE, ONCE (owner ruling 4's shape): quests project into this file's own
// row model as they are indexed, so the view filters and sorts ITS OWN rows, never the catalog's.
//
// ZONE IS A STRING FOR NOW: the app has no zone deep link (appRouting reaches mobs, loot, quests,
// levels — not maps), so the start zone renders as text. The day Maps grows a focus payload, the
// zone here is the string to hand it.

import type { QuestData, QuestEntry } from '@shared/types'
import questsJson from '../../data/eqlegends/quests.json'

/** ONE QUEST as the factions tab draws it — this file's own shape, projected from the catalog. */
export interface FactionQuestRef {
  /** the quest's display name (also its wiki page title) */
  name: string
  /** the wiki page title, for the external link (`wikiPageUrl`) — the item dialog's Source idiom */
  page: string
  /** who takes the turn-in, when the page said */
  giver?: string
  /** where the quest starts, when the page said — text only (no zone deep link exists yet) */
  startZone?: string
  minLevel?: number
  /** the classes the page lists, verbatim wiki tokens — factionFilters.ts owns the reading */
  classes?: string[]
  /** the items to hand in — the "save these" list, each linkable to its Loot drill-down */
  items: string[]
  /** the reward items, linkable the same way */
  rewards: string[]
  /** the signed per-turn-in delta for THIS faction, only when the page stated one */
  amount?: number
}

/** Everything on record for one faction: the quests that raise it, and the ones that cost it. */
export interface FactionWork {
  raise: FactionQuestRef[]
  lower: FactionQuestRef[]
}

function toRef(q: QuestEntry, amount: number | undefined): FactionQuestRef {
  const ref: FactionQuestRef = {
    name: q.name,
    page: q.page,
    items: q.requiredItems ?? [],
    rewards: [],
    ...(q.giver === undefined ? {} : { giver: q.giver }),
    ...(q.startZone === undefined ? {} : { startZone: q.startZone }),
    ...(q.minLevel === undefined ? {} : { minLevel: q.minLevel }),
    ...(q.classes === undefined ? {} : { classes: q.classes }),
    ...(amount === undefined ? {} : { amount })
  }
  for (const r of q.rewards ?? []) ref.rewards.push(r.name)
  return ref
}

/** Biggest known payout first, unknown amounts after, names as the stable tail. */
function byPayout(a: FactionQuestRef, b: FactionQuestRef): number {
  const av = a.amount === undefined ? -1 : Math.abs(a.amount)
  const bv = b.amount === undefined ? -1 : Math.abs(b.amount)
  return bv - av || a.name.localeCompare(b.name)
}

/**
 * The whole index, built once per process from the committed catalog (904 quests is a
 * milliseconds-scale walk) — keyed by LOWERCASED faction name.
 */
export function buildFactionWorkIndex(quests: readonly QuestEntry[]): Map<string, FactionWork> {
  const index = new Map<string, FactionWork>()
  for (const q of quests) {
    for (const hit of q.factions ?? []) {
      const key = hit.name.toLowerCase()
      let work = index.get(key)
      if (work === undefined) {
        work = { raise: [], lower: [] }
        index.set(key, work)
      }
      ;(hit.up ? work.raise : work.lower).push(toRef(q, hit.amount))
    }
  }
  for (const work of index.values()) {
    work.raise.sort(byPayout)
    work.lower.sort(byPayout)
  }
  return index
}

let cached: Map<string, FactionWork> | null = null

/** The committed catalog's index, memoized — the bundle cannot change while the app runs. */
export function factionWorkIndex(): Map<string, FactionWork> {
  cached ??= buildFactionWorkIndex((questsJson as QuestData).quests)
  return cached
}
