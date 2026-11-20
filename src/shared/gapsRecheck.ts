// shared/gapsRecheck.ts — another character's saved Gaps rows, checked again against TODAY's wiki
// data (owner, 2026-10-20: "Bull Alligator Tooth" listed under Items after the day's delta scrape
// added its page, "after a scrape it's supposed to reset").
//
// WHY A SAVED LIST GOES STALE. The attached character's rows are the engine's live answer, so a
// data refresh reaches them at the next launch. Another character's rows are a SNAPSHOT of what the
// engine said when that character was last played (main/gapsCharacters.ts saves it); nothing asks
// again until that character is attached. So a page the wiki gained since stayed "unknown" in the
// All characters list, sometimes for days.
//
// SO THE SAVED ROWS ARE RE-ASKED HERE, at serve time, for the two domains the app can answer from
// its committed data without the engine: an Items row whose name the committed item database now
// holds, and a Mobs row the committed mob catalog now holds, is dropped and its domain's total
// lowered to match. Only an exact hit on the app's own lookup key drops a row: a name the data
// still does not hold, or a domain this cannot check (spells, merchants, the derived ones, which
// the renderer re-derives from today's catalog anyway), stays exactly as saved.
//
// A ROW ABOUT A PAGE THE WIKI HAS (a quest giver, a redirect, a zone-titled mob) is known by name
// by design, so the name test is never asked of it: it has its own check (gapsRecheckPages.ts).

import { aboutKnownPage, knownPageRowNow, type PagesNow } from './gapsRecheckPages'

/** Whether today's committed data knows `name` in `domain`. */
export type KnownNow = (domain: 'item' | 'mob', name: string) => boolean

interface SavedRow {
  domain?: unknown
  name?: unknown
}

function isRecheckable(domain: unknown): domain is 'item' | 'mob' {
  return domain === 'item' || domain === 'mob'
}

/** The saved row as today's data still has it, or null when today's data closes it. */
function rowNow(r: SavedRow, known: KnownNow, pages: PagesNow): SavedRow | null {
  if (!isRecheckable(r.domain) || typeof r.name !== 'string') return r
  if (aboutKnownPage(r)) return knownPageRowNow(r, pages)
  return known(r.domain, r.name) ? null : r
}

/**
 * The saved `gaps` snapshot less the rows today's data now knows, totals lowered by what went.
 * Anything that is not the snapshot's shape is handed back untouched: the join reads it as it did.
 */
export function withoutNowKnown(gaps: unknown, known: KnownNow, pages: PagesNow): unknown {
  if (typeof gaps !== 'object' || gaps === null) return gaps
  const snap = gaps as { rows?: unknown; totals?: unknown }
  if (!Array.isArray(snap.rows)) return gaps
  const dropped: Record<string, number> = {}
  const rows: SavedRow[] = []
  let same = true
  for (const r of snap.rows as SavedRow[]) {
    const now = rowNow(r, known, pages)
    same &&= now === r
    if (now !== null) rows.push(now)
    else if (typeof r.domain === 'string') dropped[r.domain] = (dropped[r.domain] ?? 0) + 1
  }
  if (same) return gaps
  return { ...snap, rows, totals: lowered(snap.totals, dropped) }
}

/** `totals` with each dropped domain's count taken off, never below zero. */
function lowered(totals: unknown, dropped: Record<string, number>): unknown {
  if (typeof totals !== 'object' || totals === null) return totals
  const out: Record<string, unknown> = { ...(totals as Record<string, unknown>) }
  for (const [domain, n] of Object.entries(dropped)) {
    const was = out[domain]
    if (typeof was === 'number') out[domain] = Math.max(0, was - n)
  }
  return out
}
