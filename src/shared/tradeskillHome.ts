// shared/tradeskillHome.ts — the Tradeskills section's Home, above and below its tiles (owner,
// 2026-11-20, comparing the built section with the mockup he approved): "Pick up where you left
// off", and the line at the foot that names what the section draws on.
//
// Facts only. Every piece is something the log, the inventory dump or the committed data states;
// a piece nothing states is left out, never filled in:
// - The tradeskill is the one the log last showed a combine of (the `crafting` module's item
//   rows; an item no raise named is placed by the recipe book). With no combine it is the
//   highest-level tradeskill, and with no level at all there is nothing to pick up.
// - The next recipe is the ladder's (`tradeskillBook.nextRecipe`), and only when the level is
//   known. How many can be made now is `tradeskillMaterials.onHand`: a count of held materials,
//   never a forecast, and absent when a material's count is unknown.
// - The last run is the newest span of combines (a run ends when five minutes pass with no
//   combine). Its pace is stated only when the run is long enough to state one
//   (`crafting.craftingPace`, the history tab's own rule).

import { craftingPace, itemTradeskill, type CraftSpan } from './crafting'
import type { SkillRow } from './skills'
import { nextRecipe, skillRecipes, tradeskillLevel, type BookIndex, type BookRecipe } from './tradeskillBook'
import { guideCreditOf, type GuideIndex, type GuideStamp } from './tradeskillGuide'
import { rateText, type CraftBook } from './tradeskillHistory'
import { onHand, type HaveLookup } from './tradeskillMaterials'
import { TRADESKILLS, type Tradeskill } from './tradeskills'

// ---- pick up where you left off ---------------------------------------------------------------

/** The newest run of combines, as the log counted it. */
export interface LastRun {
  /** The run's last combine, epoch ms. */
  end: number
  combines: number
  made: number
  failed: number
  /** Raises paired with a combine of the run, every tradeskill together. */
  raises: number
  /** Null when the run is too short to state a pace. */
  combinesPerHour: number | null
}

export interface PickUp {
  tradeskill: Tradeskill
  /** Null: the log has not shown this skill go up. */
  level: number | null
  /** The newest combine of the tradeskill, epoch ms; null when it was picked for its level. */
  lastCombine: number | null
  /** The recipe to make next; null with no level, or with no recipe above it. */
  next: BookRecipe | null
  /** True when the level is known and no listed recipe is above it. */
  topped: boolean
  /** Combines of `next` the held materials cover; null when there is no next or a count is unknown. */
  canMake: number | null
  /** Null when the log shows no run of combines. */
  lastRun: LastRun | null
}

export interface PickUpAsk {
  index: BookIndex
  guides: GuideIndex
  /** The engine's skill rows. */
  rows: readonly SkillRow[]
  craft: CraftBook
  /** Null when nothing says what is held (no inventory dump, no depot line). */
  have: HaveLookup | null
}

/** The tradeskill of the newest combine the log shows, and when; null when it shows none it can place. */
function lastCombined(craft: CraftBook): { tradeskill: Tradeskill; ts: number } | null {
  let best: { tradeskill: Tradeskill; ts: number } | null = null
  for (const row of craft.snap.items) {
    const tradeskill = itemTradeskill(row, craft.skillOf)
    if (tradeskill === undefined || row.made + row.failed === 0) continue
    if (best === null || row.lastTs > best.ts) best = { tradeskill, ts: row.lastTs }
  }
  return best
}

/** The tradeskill with the highest level in the log (the first by name of several); null when it shows none. */
function highestLevel(rows: readonly SkillRow[]): Tradeskill | null {
  let best: { tradeskill: Tradeskill; level: number } | null = null
  for (const tradeskill of TRADESKILLS) {
    const level = tradeskillLevel(rows, tradeskill)
    if (level !== null && (best === null || level > best.level)) best = { tradeskill, level }
  }
  return best?.tradeskill ?? null
}

function runOf(span: CraftSpan | undefined): LastRun | null {
  if (span === undefined) return null
  const raises = Object.values(span.raises).reduce((n, of) => n + of, 0)
  const { combinesPerHour } = craftingPace({ spans: [span] })
  return { end: span.end, combines: span.combines, made: span.made, failed: span.failed, raises, combinesPerHour }
}

/** What to pick up, or null when the log shows neither a combine nor a tradeskill level. */
export function pickUp(ask: PickUpAsk): PickUp | null {
  const combined = lastCombined(ask.craft)
  const tradeskill = combined?.tradeskill ?? highestLevel(ask.rows)
  if (tradeskill === null) return null
  const level = tradeskillLevel(ask.rows, tradeskill)
  const next = level === null ? null : nextRecipe(skillRecipes(ask.index, tradeskill), level)
  const hand = next === null || ask.have === null ? null : onHand({ index: ask.index, guides: ask.guides, have: ask.have }, next)
  return {
    tradeskill,
    level,
    lastCombine: combined?.ts ?? null,
    next,
    topped: level !== null && next === null && skillRecipes(ask.index, tradeskill).length > 0,
    canMake: hand?.ready ?? null,
    lastRun: runOf(ask.craft.snap.spans.at(-1))
  }
}

export const PICK_UP_HEADING = 'Pick up where you left off'

/** Why this tradeskill: "You last combined here on Sep 12, 2026." `when` is that date, already formatted. */
export function pickUpWhyText(pick: Pick<PickUp, 'lastCombine'>, when: string): string {
  return pick.lastCombine === null ? 'Your highest tradeskill. Your log shows no combine yet.' : `You last combined here on ${when}.`
}

/** What the held materials cover of the next recipe; '' when that cannot be counted. */
export function pickUpHeldText(pick: Pick<PickUp, 'canMake'>): string {
  if (pick.canMake === null) return ''
  return pick.canMake === 0 ? 'You do not hold every material for it.' : `You hold the materials for ${String(pick.canMake)}.`
}

export const PICK_UP_TOPPED_TEXT = 'No recipe above your level.'

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`

/**
 * "Your last crafting run, on Sep 12, 2026: 563 combines (480 made, 83 failed), 129 raises, at 85
 * combines an hour." `when` is the run's date, already formatted. The pace is left out of a run
 * too short to state one.
 */
export function lastRunText(run: LastRun, when: string): string {
  const raises = run.raises === 0 ? 'no raise' : plural(run.raises, 'raise', 'raises')
  const pace = run.combinesPerHour === null ? '' : `, at ${rateText(run.combinesPerHour)} combines an hour`
  return `Your last crafting run, on ${when}: ${plural(run.combines, 'combine', 'combines')} (${String(run.made)} made, ${String(run.failed)} failed), ${raises}${pace}.`
}

/** The button that opens the workbench. */
export function pickUpOpenLabel(tradeskill: Tradeskill): string {
  return `Open ${tradeskill}`
}

// ---- what the section draws on ----------------------------------------------------------------

/** Under the section's title on Home. */
export const HOME_SUBTITLE = "The wiki's recipes, two community guides and your own log, in one place."

/** The day of an ISO time ("2026-11-20"); '' for anything else. */
function dayOf(iso: string | undefined): string {
  return iso !== undefined && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : ''
}

/** One guide: its title and author (`GUIDE_CREDITS`), then the version it states, else the day its copy was taken. */
function guideSourceText(stamp: GuideStamp): string {
  const credit = guideCreditOf(stamp.id)
  if (credit === '') return ''
  if (stamp.version !== undefined && stamp.version.trim() !== '') return `${credit}, version ${stamp.version.trim()}`
  const day = dayOf(stamp.pulledAt)
  return day === '' ? credit : `${credit}, copy of ${day}`
}

/**
 * The sources line at the foot of Home, one part per source: the wiki data with its date, each
 * guide with its author and its version or the day its copy was taken, and the player's log.
 * Words only: no part carries an address (owner, 2026-11-20: no link to either guide in the app).
 */
export function sourceParts(scrapedAt: string | undefined, stamps: readonly GuideStamp[]): string[] {
  const day = dayOf(scrapedAt)
  const guides = stamps.map(guideSourceText).filter((part) => part !== '')
  return [day === '' ? 'wiki data' : `wiki data of ${day}`, ...guides, 'your own log']
}

export const SOURCES_LABEL = 'Sources:'
