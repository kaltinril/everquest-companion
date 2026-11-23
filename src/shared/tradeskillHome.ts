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
import { nextRecipe, skillRecipes, tradeskillLevel, type BookIndex, type BookRecipe, type TradeskillTile } from './tradeskillBook'
import { guideCreditOf, type GuideIndex, type GuideStamp } from './tradeskillGuide'
import { rateText, type CraftBook } from './tradeskillHistory'
import { skillTop } from './tradeskillLevelBar'
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

// ---- the doors to the workbenches --------------------------------------------------------------

/**
 * Home's doors, split by whether the log has shown the tradeskill go up. Both kinds are full tiles
 * of one grid (owner, 2026-11-22: small buttons read as comments, not as something to click). A
 * tile the log has not shown has no level number and no next recipe: nobody knows its level.
 */
export interface HomeDoors {
  /** Tiles with a level, in `tradeskillTiles`' order: the highest level first. */
  seen: TradeskillTile[]
  /** Tiles the log has not shown, by name. They follow Foraging in the grid. */
  unseen: TradeskillTile[]
}

export function homeDoors(tiles: readonly TradeskillTile[]): HomeDoors {
  return { seen: tiles.filter((tile) => tile.level !== null), unseen: tiles.filter((tile) => tile.level === null) }
}

/**
 * Where a not-in-log tile's level number would go. Never 0: the app knows only that the log has
 * not shown the skill rise, and it may have been raised before the log began. A default awaiting
 * the owner's word (2026-11-22); this line is the one to change.
 */
export const NOT_IN_LOG_TEXT = 'Not in log'

/** A not-in-log tile's hover. */
export const UNSEEN_DOOR_TIP = 'Your log has not shown this skill go up yet. Opens its workbench.'

/** The same hover before the engine has read the skills, when nothing can be said of the log. */
export const UNSEEN_DOOR_WAITING_TIP = "Opens this tradeskill's workbench, with its recipes from the wiki."

/** The words of a tile with no level. */
export interface UnseenFace {
  /** `NOT_IN_LOG_TEXT`; '' until the engine has read the skills. */
  level: string
  /** "of 300"; '' where no top is measured, and until the engine has read the skills. */
  of: string
  tip: string
  /** The empty bar, for a screen reader. */
  label: string
}

/** `served` is whether the engine has read the skills: until then the log is not blamed for a missing level. */
export function unseenFace(tradeskill: Tradeskill, served: boolean): UnseenFace {
  if (!served) return { level: '', of: '', tip: UNSEEN_DOOR_WAITING_TIP, label: tradeskill }
  const top = skillTop(tradeskill)
  const of = top === null ? '' : `of ${String(top)}`
  return { level: NOT_IN_LOG_TEXT, of, tip: UNSEEN_DOOR_TIP, label: `${tradeskill}: ${NOT_IN_LOG_TEXT}${of === '' ? '' : ` ${of}`}` }
}

// A not-in-log tile starts visible, and the player may fold it to one line at the bottom of Home
// (owner, 2026-11-22: "this way it starts out visible and they CHOSE to hide it"). Only such a tile
// folds: a tradeskill that rises in the log becomes an ordinary tile, whatever was stored for it.

export const HIDE_TILE_TEXT = 'Hide'

export const HIDDEN_LINE_LABEL = 'Hidden, click to show:'

export const SHOW_ALL_HIDDEN_TEXT = 'Show all'

export function hideTileTip(tradeskill: Tradeskill): string {
  return `Move ${tradeskill} to one line at the bottom. You can bring it back from there.`
}

export function showTileTip(tradeskill: Tradeskill): string {
  return `Show the ${tradeskill} panel again`
}

/** The stored choice, in the app's tradeskill order. Anything unreadable hides nothing. */
export function parseHiddenTiles(raw: string | null): Tradeskill[] {
  try {
    const stored: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(stored)) return []
    const names = stored as unknown[]
    return TRADESKILLS.filter((tradeskill) => names.includes(tradeskill))
  } catch {
    return []
  }
}

/** The not-in-log tiles the grid draws, and the ones the player folded to the line below it. */
export function splitHidden(
  unseen: readonly TradeskillTile[],
  hidden: readonly Tradeskill[]
): { shown: TradeskillTile[]; folded: TradeskillTile[] } {
  return {
    shown: unseen.filter((tile) => !hidden.includes(tile.tradeskill)),
    folded: unseen.filter((tile) => hidden.includes(tile.tradeskill))
  }
}

/** Every tile's recipe line: "143 wiki recipes" (the wiki's, under the era setting). */
export function tileRecipesText(recipes: number): string {
  return recipes === 1 ? '1 wiki recipe' : `${String(recipes)} wiki recipes`
}

export const DOORS_LINE = 'Pick a tradeskill to open its workbench.'

/** Said in place of `DOORS_LINE` when the log has shown no tradeskill at all, so no tile has a level. */
export const NO_TRADESKILL_SEEN_LINE = 'Your log has not shown any tradeskill go up yet. Pick one below to open its workbench.'

/**
 * The line above the doors. `served` is whether the engine has read the skills yet: until it
 * has, no level is known for a reason that is not the log's, and the line does not blame the log.
 */
export function doorsLine(doors: HomeDoors, served: boolean): string {
  return served && doors.seen.length === 0 ? NO_TRADESKILL_SEEN_LINE : DOORS_LINE
}
