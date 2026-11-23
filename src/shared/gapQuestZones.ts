// shared/gapQuestZones.ts — a quest line is not offered for an NPC page that does not stand where the
// quest starts (owner, 2026-11-21, of `Cabilis Pale Ale (Firiona Vie)` on Lenka Stoutheart in East
// Freeport: "where did the app get this info").
//
// THE ENGINE PAIRS A QUEST WITH A PAGE BY NAME ALONE (gap_index.rs `mob_quest_gaps_of`). The quest's
// `giver` is a name, and a name can be two pages: the wiki has a Lenka Stoutheart in East Freeport and
// `Lenka Stoutheart (Firiona Vie)`, and the row named the first. So the check reads the ZONES OF THE
// PAGE THE ROW WOULD EDIT, never of every page under the name: the twin in Firiona Vie is exactly why
// the East Freeport page must not get the line. For the same reason the log's zones do not count: a
// player hailing the Firiona Vie Lenka would otherwise bring the line back onto the East Freeport page.
//
// ONLY POSITIVE EVIDENCE REMOVES A LINE. Both places must resolve through the zone table
// (`zoneEntryFromCatalog`, which already joins the log's, the wiki's and the catalog's spellings). A
// missing zone, or one the table refuses (`Freeport`, `Various`, `Kelethin`, a hedge like `West
// Cabilis?`), says nothing, and the line stays as it was.
//
// HERE, NOT IN THE ENGINE: the zone table lives in TypeScript only, and one call in useGapsData covers
// the live rows, the day window and every other character's saved rows.

import type { GapRow, GapsSnap } from './gaps'
import { questTitleKey } from './gapQuests'
import { lowered } from './gapsRecheck'
import { zoneEntryFromCatalog } from './zones'

/** Whether this quest provably starts somewhere this NPC page does not stand. */
export type QuestElsewhere = (page: string, quest: string) => boolean

const placeOf = (zone: string | undefined): string | null => zoneEntryFromCatalog(zone)?.short ?? null

/** True only when the start zone and every zone the NPC stands in are known, and none is the start. */
export function startsElsewhere(start: string | undefined, standsIn: readonly string[] | undefined): boolean {
  const from = placeOf(start)
  if (from === null || standsIn === undefined || standsIn.length === 0) return false
  const places = standsIn.map(placeOf)
  return !places.includes(null) && !places.includes(from)
}

/**
 * The check over the catalogs. A mob is found by its exact page title, since two pages can share a
 * name. Two quest pages folding to one title with different start zones are no evidence.
 */
export function questZoneCheck(
  mobs: readonly { page: string; zones?: readonly string[] }[],
  quests: readonly { name?: string; page?: string; startZone?: string }[]
): QuestElsewhere {
  const zonesOf = new Map(mobs.map((m) => [m.page, m.zones]))
  const startOf = new Map<string, string | undefined>()
  for (const q of quests) {
    const key = questTitleKey(q.page ?? q.name ?? '')
    startOf.set(key, startOf.has(key) && startOf.get(key) !== q.startZone ? undefined : q.startZone)
  }
  return (page, quest) => startsElsewhere(startOf.get(questTitleKey(quest)), zonesOf.get(page))
}

/** The row less the lines that start elsewhere; null when they were all it had to say. */
function rowHere(r: GapRow, elsewhere: QuestElsewhere): GapRow | null {
  const gaps = r.questGaps
  if (gaps === undefined) return r
  const quests = gaps.quests.filter((q) => !elsewhere(gaps.page, q))
  if (quests.length === gaps.quests.length) return r
  if (quests.length > 0) return { ...r, questGaps: { page: gaps.page, quests } }
  if (r.viaRedirect === undefined) return null
  // A redirect is a job of its own: the row stays for it.
  const { questGaps: _lines, ...rest } = r
  return rest
}

/** The snapshot less those lines, totals lowered by the rows that went. The same object when none did. */
export function withoutForeignQuests(snap: GapsSnap, elsewhere: QuestElsewhere): GapsSnap {
  const dropped: Record<string, number> = {}
  const rows: GapRow[] = []
  let same = true
  for (const r of snap.rows) {
    const now = rowHere(r, elsewhere)
    same &&= now === r
    if (now !== null) rows.push(now)
    else dropped[r.domain] = (dropped[r.domain] ?? 0) + 1
  }
  return same ? snap : { ...snap, rows, totals: lowered(snap.totals, dropped) as GapsSnap['totals'] }
}
