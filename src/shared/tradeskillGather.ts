// shared/tradeskillGather.ts — fishing and forage outcomes as the Tradeskills section draws them
// (fork #6: "Fishing and Foraging also come to mind", "number of combines, successes, failures").
//
// The counts are the engine's `crafting` snapshot (`fishing`, `forage`); the rates and the shares
// are shared/crafting.ts (`fishingRate`, `forageRate`, `gatheredShares`, `unnamedCatches`). This
// file turns them into the figures, lines and rows of two surfaces:
//   - the Fishing workbench's "Your history" tab (GatherPanel.tsx);
//   - the Foraging tile on the section's Home (ForagingTile.tsx). Forage is a skill with no
//     recipe, so it has no workbench: the tile is the whole of it.
//
// RULES THE WORDS KEEP (MEASURED.md, "Fishing and forage outcomes"):
//   - The catch rate is caught over the casts that printed an outcome. A cast that printed none
//     (zoned, interrupted) is in neither side and is counted in a line of its own.
//   - Lost bait, spilled beer and a broken pole each print beside a `You didn't catch anything.`,
//     so they are parts of Nothing, never extra misses. They are drawn apart and say so.
//   - A catch the game did not name is in Caught and in no item row; the shares are over all
//     catches, so the named rows need not add up to 100%.
//   - Nothing here forecasts: every number is a count of lines or a ratio of two such counts.

import {
  fishingRate,
  forageRate,
  gatheredShares,
  unnamedCatches,
  type FishingCounts,
  type FishingSnap,
  type ForageCounts,
  type ForageSnap,
  type GatheredShare
} from './crafting'
import type { AASpendLike } from './aa'
import type { SkillRow } from './skills'
import { forageAaLines, type AaLine } from './tradeskillAa'

/** One labelled number. */
export interface GatherFigure {
  id: string
  label: string
  value: string
  /** What the number is, for the figure's hover; absent on a plain count. */
  tip?: string
}

/** One item caught or foraged, with its part of the whole. */
export interface GatherItemLine {
  item: string
  count: number
  /** "54%", or "under 1%" for a part that rounds to nothing. */
  share: string
}

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`

/** A ratio as a whole percent; '' when there is nothing to divide by. */
export function gatherPercent(rate: number | null): string {
  return rate === null ? '' : `${String(Math.round(rate * 100))}%`
}

function shareText(share: number): string {
  const percent = Math.round(share * 100)
  return percent === 0 && share > 0 ? 'under 1%' : `${String(percent)}%`
}

function itemLines(rows: readonly GatheredShare[]): GatherItemLine[] {
  return rows.map((r) => ({ item: r.item, count: r.count, share: shareText(r.share) }))
}

const kept = (figures: readonly GatherFigure[]): GatherFigure[] => figures.filter((f) => f.value !== '')

// ---- fishing ---------------------------------------------------------------------------------

export const FISHING_HEADING = 'Fishing in your log'
export const NO_FISHING_TEXT = 'Your log shows no fishing cast or catch yet.'

export const FISHING_RATE_TIP =
  'Caught over the casts that printed an outcome: a catch, or "You didn\'t catch anything." A cast that printed neither is not counted as a miss.'

export const FISHING_REASONS_TIP =
  'Each of these printed beside a "You didn\'t catch anything." They are parts of Nothing, not extra misses.'

/** Whether the log holds any fishing line. */
export function hasFishing(fishing: FishingSnap | undefined): fishing is FishingSnap {
  return fishing !== undefined && fishing.casts + fishing.caught + fishing.nothing > 0
}

/** Casts, caught, nothing and the catch rate. The rate is left out before any outcome. */
export function fishingFigures(counts: FishingCounts): GatherFigure[] {
  return kept([
    { id: 'casts', label: 'Casts', value: String(counts.casts) },
    { id: 'caught', label: 'Caught', value: String(counts.caught) },
    { id: 'nothing', label: 'Nothing', value: String(counts.nothing) },
    { id: 'rate', label: 'Catch rate', value: gatherPercent(fishingRate(counts).successRate), tip: FISHING_RATE_TIP }
  ])
}

/** The reasons the game printed beside a miss, each with its count; only the ones that happened. */
export function fishingReasons(counts: FishingCounts): GatherFigure[] {
  const reasons: GatherFigure[] = [
    { id: 'lost-bait', label: 'Lost bait', value: String(counts.lostBait) },
    { id: 'spilled', label: 'Spilled beer', value: String(counts.spilled) },
    { id: 'pole-broke', label: 'Pole broke', value: String(counts.poleBroke) }
  ]
  return reasons.filter((r) => r.value !== '0')
}

/** The casts no outcome line followed, in a sentence; '' when every cast printed one. */
export function fishingNoOutcomeText(counts: FishingCounts): string {
  const n = fishingRate(counts).noOutcome
  if (n === 0) return ''
  return `${plural(n, 'cast', 'casts')} printed no outcome (zoned or interrupted). ${n === 1 ? 'It is' : 'They are'} in neither side of the catch rate.`
}

/** "This session: 12 casts, 5 caught, 6 nothing, 45% caught". '' when the session has no fishing line. */
export function fishingSessionText(session: FishingCounts): string {
  if (session.casts + session.caught + session.nothing === 0) return ''
  const rate = gatherPercent(fishingRate(session).successRate)
  const parts = [plural(session.casts, 'cast', 'casts'), `${String(session.caught)} caught`, `${String(session.nothing)} nothing`]
  if (rate !== '') parts.push(`${rate} caught`)
  return `This session: ${parts.join(', ')}`
}

/** What was caught, most first, each with its part of ALL catches (the unnamed ones included). */
export function fishingItems(fishing: FishingSnap): GatherItemLine[] {
  return itemLines(gatheredShares(fishing.items, fishing.caught))
}

/** The catches the game did not name, in a sentence; '' when it named every one. */
export function fishingUnnamedText(fishing: FishingSnap): string {
  const n = unnamedCatches(fishing)
  if (n === 0) return ''
  return `${plural(n, 'catch', 'catches')} the game did not name ("You caught something...").`
}

// ---- forage ----------------------------------------------------------------------------------

/** The skill as the client spells it; the tile's own title is the activity. */
export const FORAGE_SKILL = 'Forage'
export const FORAGE_TILE_TITLE = 'Foraging'
export const FORAGE_LEVEL_UNSEEN = 'level not in your log'
export const FORAGE_LEVEL_UNSEEN_TIP = 'Your log has not shown the Forage skill go up yet.'
export const FORAGE_RATE_TIP = 'Found over the forages the game answered. A refused forage (too soon, in combat, sitting) prints neither line and is not counted.'

/** How many items the tile lists before "Show all". */
export const FORAGE_TOP = 5

/** The level the log last stated for Forage, or null when it never showed the skill go up. */
export function forageLevel(skills: readonly SkillRow[]): number | null {
  let best: SkillRow | null = null
  for (const row of skills) {
    if (row.skill.trim().toLowerCase() !== FORAGE_SKILL.toLowerCase()) continue
    if (best === null || row.lastTs > best.lastTs) best = row
  }
  return best === null ? null : best.value
}

/** Whether the log holds any forage line. */
export function hasForage(forage: ForageSnap | undefined): forage is ForageSnap {
  return forage !== undefined && forage.found + forage.failed > 0
}

/** Found, failed and the rate. */
export function forageFigures(counts: ForageCounts): GatherFigure[] {
  return kept([
    { id: 'found', label: 'Found', value: String(counts.found) },
    { id: 'failed', label: 'Failed', value: String(counts.failed) },
    { id: 'rate', label: 'Found rate', value: gatherPercent(forageRate(counts).successRate), tip: FORAGE_RATE_TIP }
  ])
}

/** "This session: 12 found, 9 failed, 57% found". '' when the session has no forage line. */
export function forageSessionText(session: ForageCounts): string {
  if (session.found + session.failed === 0) return ''
  const rate = gatherPercent(forageRate(session).successRate)
  return `This session: ${String(session.found)} found, ${String(session.failed)} failed, ${rate} found`
}

/** What the log has said so far. A null side has not been read yet. */
export interface ForageFacts {
  /** The `crafting` snapshot's `forage`; undefined when the log has no forage line. Null: not read yet. */
  forage: ForageSnap | undefined | null
  skills: readonly SkillRow[] | null
  spends: readonly AASpendLike[] | null
}

/** The Foraging tile, render-ready. */
export interface ForageTile {
  /** The Forage level, or null when the log never showed it go up. */
  level: number | null
  /** Empty when the log has no forage line. */
  figures: GatherFigure[]
  session: string
  /** The most-found items: the top few, or all of them. */
  items: GatherItemLine[]
  /** How many distinct items the log names. */
  itemCount: number
  /** The words of the switch between the top few and all; '' when the top few are all there is. */
  toggle: string
  aas: AaLine[]
}

/**
 * The tile, or null when there is nothing to draw: the log shows no forage line and no Forage
 * level, or neither module has been read yet.
 */
export function forageTile(facts: ForageFacts, all: boolean): ForageTile | null {
  const forage = facts.forage ?? undefined
  const level = facts.skills === null ? null : forageLevel(facts.skills)
  if (!hasForage(forage) && level === null) return null
  const rows = hasForage(forage) ? itemLines(gatheredShares(forage.items)) : []
  const more = rows.length > FORAGE_TOP
  return {
    level,
    figures: hasForage(forage) ? forageFigures(forage) : [],
    session: hasForage(forage) ? forageSessionText(forage.session) : '',
    items: all || !more ? rows : rows.slice(0, FORAGE_TOP),
    itemCount: rows.length,
    toggle: forageToggleText(all, rows.length),
    aas: forageAaLines({ spends: facts.spends, skills: facts.skills })
  }
}

/** "Show all 19" / "Show the top 5"; '' when there are no more than the top few. */
export function forageToggleText(all: boolean, itemCount: number): string {
  if (itemCount <= FORAGE_TOP) return ''
  return all ? `Show the top ${String(FORAGE_TOP)}` : `Show all ${String(itemCount)}`
}

export const FORAGE_NO_LINE_TEXT = 'Your log shows no forage yet.'
export const FORAGE_ITEMS_LABEL = 'Most found'
