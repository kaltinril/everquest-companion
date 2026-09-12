// zoneAdvice.ts — WHERE SHOULD I BE, AND WHERE DO MOTES COME FROM.
//
// Owner ask (kaltinril 2026-09-11): *"somewhere it shows recommendation for where to level, where
// to get motes (should be equal or higher level but not crazy higher)"*.
//
// ── THE TWO ASKS ARE ONE QUESTION, AND THAT IS MEASURED RATHER THAN ASSUMED ───────────────────
//
// It would be easy to build two rankings here. The measurements say one will do, because what
// drives mote drops is the same thing that drives experience: the CON of what you are killing.
// From this project's own logged fights (owner's shadowknight, con bands taken from the bestiary's
// levels against his level at each kill):
//
//     white / yellow / red   7 to 10 motes per 100 kills
//     blue                   4.2
//     green                  3.1
//
// So a zone worth levelling in is a zone worth farming motes in, and "equal or higher but not
// crazy higher" is not a preference - it is where the rate roughly doubles. Two further measured
// facts shape the advice rather than the ranking:
//
//   GRADE FLOOR RISES WITH ZONE DIFFICULTY. Superior and better motes come from harder content,
//   not from luckier kills in easy content - so a harder zone is worth naming even when the raw
//   per-kill rate is level with an easier one.
//
//   YOUR LEVEL CAPS THE GRADE, about one tier per five levels (50 caps at tier 10). A level 20
//   farming a level 45 zone cannot bank what he finds there, which is the other half of why
//   "crazy higher" is the wrong answer even for someone who could survive it.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────
//
// NOT A ROUTE and not an experience-per-hour model. It ranks zones the bestiary can describe, by
// how well their band fits a level; it says nothing about how fast you kill, what you can survive
// with a given group, or what a zone drops. `ZoneAdvice.n` rides on every row for the same reason
// it rides on the band: a zone the catalog knows through four mobs is a weaker claim than one it
// knows through forty, and hiding that would overstate the whole list.

import { zoneFit, type ZoneFit, type ZoneLevelBand } from './zoneLevels'

/**
 * MOTES PER HUNDRED KILLS, by how the zone cons — measured, this project's own log (2026-09-07,
 * the owner's shadowknight). The band figures are the midpoint of the measured 7-to-10 range for
 * the con colours each fit implies.
 *
 * These are RATES PER KILL and the surface must say so: a green zone you clear three times faster
 * is not three times worse, and no number here knows your kill speed.
 */
export const MOTES_PER_100: Readonly<Record<ZoneFit, number>> = {
  green: 3.1,
  even: 8.5,
  hard: 8.5,
  deadly: 8.5
}

/** One zone, judged against one level. */
export interface ZoneAdvice {
  zone: string
  band: ZoneLevelBand
  fit: ZoneFit
  /** the measured per-100-kill mote rate for this fit — a rate, never a total */
  motesPer100: number
  /** how many catalog mobs the band rests on — the weight of the whole row */
  n: number
}

/** Best first: even, then hard, then green. `deadly` is never advice. */
const RANK: Readonly<Record<ZoneFit, number>> = { even: 0, hard: 1, green: 2, deadly: 3 }

/**
 * The zones worth your time at `level`, best first.
 *
 * `deadly` ZONES ARE DROPPED ENTIRELY rather than ranked last. The owner's own words bound this
 * feature — *"not crazy higher"* — and a list that ends in six zones you cannot survive is a list
 * whose tail teaches the reader to stop reading.
 *
 * WITHIN A FIT, THE HARDER BAND LEADS, because the measured grade floor rises with zone difficulty
 * and the per-kill rate does not separate them. Ties break on `n`, so the better-documented zone
 * is named first — that is a statement about our confidence, not about the game.
 */
export function rankZones(
  bands: ReadonlyMap<string, ZoneLevelBand>,
  level: number,
  min = 0
): ZoneAdvice[] {
  const out: ZoneAdvice[] = []
  for (const [zone, band] of bands) {
    if (band.n < min) continue
    const fit = zoneFit(band, level)
    if (fit === 'deadly') continue
    out.push({ zone, band, fit, motesPer100: MOTES_PER_100[fit], n: band.n })
  }
  return out.sort(
    (a, b) =>
      RANK[a.fit] - RANK[b.fit] ||
      b.band.typical[0] - a.band.typical[0] ||
      b.n - a.n ||
      a.zone.localeCompare(b.zone)
  )
}

/**
 * THE GRADE YOUR LEVEL CAN BANK — measured at about one tier per five levels, with 50 reaching
 * tier 10 (`eql-measured-game-facts`). Stated here because it is the half of the mote answer that
 * a zone ranking cannot express: a low character in a high zone is capped by his own level, not by
 * what drops there.
 */
export function moteGradeCap(level: number): number {
  return Math.max(1, Math.min(10, Math.floor(level / 5)))
}
