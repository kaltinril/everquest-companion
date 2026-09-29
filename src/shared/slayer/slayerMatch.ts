// slayerMatch.ts — does this mob count toward that requirement line, and on what evidence.
//
// TWO KINDS OF EVIDENCE, AND THE SECOND IS LABELED (world-model law 1):
//   'race'  the mob's wiki page states a race the line's terms claim (slayerKinds.ts);
//   'name'  the page states no race this table knows, and the mob's NAME says the kind
//           (`a gnoll pup`, `a teir'dal rogue`). An estimate; every surface says so.
//
// THE NAME IS NOT CONSULTED WHEN THE PAGE HAS ANSWERED. `A dwarf skeleton` is a Skeleton because
// its page says so, and reading `dwarf` off its name as well would put it under Dwarves. The one
// exception is a term marked `always`, where the log showed the name to be the better witness.
//
// AND A NAME SAYS ONE KIND: THE LAST ONE IN IT. Measured over the catalogued mobs whose page
// states a claimed race, by asking what the name alone would have said: the misses were
// compounds whose last word is the creature (`a dwarf skeleton`, `a kerra lion`, `a vampire
// bat`, `a froglok ghoul`, `a kodiak bear`). Reading the rightmost kind word gets those right.
// What it cannot get right stays wrong and stays labeled: `a froglok dar knight` is a ghoul.

import { SLAYER_TERMS, labelTerms, raceKey, resolveTerm } from './slayerKinds'

export type MatchBasis = 'race' | 'name'

/** One requirement line, compiled: the wiki races it counts and the terms it is made of. */
export interface LabelMatcher {
  races: ReadonlySet<string>
  terms: ReadonlySet<string>
}

/** What one mob offers the join. Computed once per mob, whatever the number of lines. */
export interface MobFacts {
  /** the page's race in `raceKey` form, '' when the index has no page or the page states none */
  race: string
  /** the kind the name states, read when the page has not answered with a claimed race */
  nameTerm: string | null
  /** the `always` terms the name states, read whatever the page says */
  always: readonly string[]
}

/** Every wiki race value some term claims: a page stating one of these has answered. */
export const CLAIMED_RACES: ReadonlySet<string> = new Set(
  [...SLAYER_TERMS.values()].flatMap((t) => t.races ?? [])
)

/** A mob's name as the patterns read it: lower case, one apostrophe glyph, no leading article. */
export function mobNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[`’]/g, "'")
    .replace(/^(?:a|an|the)\s+/, '')
    .trim()
}

interface NamePattern {
  term: string
  re: RegExp
  always: boolean
}

let PATTERNS: NamePattern[] | null = null

/** Whole words only, and a plural `s` is the same word (`orc pawns`). */
function namePatterns(): NamePattern[] {
  if (PATTERNS !== null) return PATTERNS
  PATTERNS = []
  for (const [term, entry] of SLAYER_TERMS) {
    if (entry.names === undefined || entry.names.length === 0) continue
    const re = new RegExp(`(?<![a-z'])(?:${entry.names.join('|')})s?(?![a-z'])`, 'g')
    PATTERNS.push({ term, re, always: entry.always === true })
  }
  return PATTERNS
}

/** Where a pattern's LAST match in the name ends, or -1. */
function lastMatchEnd(re: RegExp, nameKey: string): number {
  let end = -1
  for (const m of nameKey.matchAll(re)) end = Math.max(end, m.index + m[0].length)
  return end
}

/** The kind a name states: the term whose word sits rightmost in it. */
export function nameTerm(name: string): string | null {
  const nameKey = mobNameKey(name)
  let best: string | null = null
  let bestEnd = -1
  for (const p of namePatterns()) {
    const end = lastMatchEnd(p.re, nameKey)
    if (end > bestEnd) {
      best = p.term
      bestEnd = end
    }
  }
  return best
}

export function mobFacts(name: string, race: string | undefined): MobFacts {
  const key = race === undefined ? '' : raceKey(race)
  const nameKey = mobNameKey(name)
  const always = namePatterns()
    .filter((p) => p.always && lastMatchEnd(p.re, nameKey) >= 0)
    .map((p) => p.term)
  return { race: key, nameTerm: CLAIMED_RACES.has(key) ? null : nameTerm(name), always }
}

/** The matcher for a requirement line as the dump prints it. */
export function labelMatcher(label: string): LabelMatcher {
  const terms = new Set(labelTerms(label).flatMap((term) => resolveTerm(term)))
  const races = new Set([...terms].flatMap((term) => SLAYER_TERMS.get(term)?.races ?? []))
  return { races, terms }
}

/**
 * The matcher that counts THE RACE ITSELF and nothing drawn as it: each term's first wiki value,
 * no ghosts, no citizens, no names. `I'm a People Person!` is the one achievement that needs it.
 * MEASURED on the owner's dump of 2026-09-28: its `Dwarves` stood at 0/10 beside the Skill
 * counter's `Dwarves 26/100`, whose kills were ghost dwarves.
 */
export function strictMatcher(label: string): LabelMatcher {
  const own = labelTerms(label).flatMap((term) => SLAYER_TERMS.get(term)?.races?.slice(0, 1) ?? [])
  return { races: new Set(own), terms: new Set() }
}

/** The terms of a line this table has never looked at. Empty for every line seen so far. */
export function unknownTerms(label: string): string[] {
  return labelTerms(label).filter((term) => !SLAYER_TERMS.has(term))
}

/** Whether a mob counts toward a line, and on which evidence; null when it does not. */
export function matchMob(m: LabelMatcher, facts: MobFacts): MatchBasis | null {
  if (facts.race !== '' && m.races.has(facts.race)) return 'race'
  if (facts.always.some((term) => m.terms.has(term))) return 'name'
  return facts.nameTerm !== null && m.terms.has(facts.nameTerm) ? 'name' : null
}
