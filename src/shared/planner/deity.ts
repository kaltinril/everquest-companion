// planner/deity.ts — R2's FOURTH CONDITION (owner report, kaltinril 2026-09-11).
//
// His report: *"apparently diety or religion is another condition we missed for the exaltations.
// scalp of the goul lord is an example that looks like it works on my friend Malkil, but it
// doesn't because of his diety"*.
//
// He is right, and the fork player's original statement of the rule had three dimensions where the
// game has four: *"if a target item does not contain at least 1 matching CLASS, RACE, and SLOT,
// then the exaltation can not be put into that item"*. `Scalp of the Ghoul Lord` states
// `Dieties: Bertoxxulous, Cazic-Thule, Innoruuk, Rallos Zek, Veeshan` and nothing in this app was
// reading that line.
//
// ── WHY THIS IS NOT THE RACE SITUATION ────────────────────────────────────────────────────────
//
// `shared/planner/rules.ts` carries a long argument for why RACE is deliberately unchecked: the
// corpus cannot express the rule (17 `NONE` hosts, 6 truncated `['ALL','EXCEPT']` rows, no closed
// race table anywhere in this repo), and a race rule written today would be arithmetic over data
// that cannot state the fact. Deity is the opposite case on every count:
//
//   THE VOCABULARY IS MEASURED AND CLOSED. The game hands it over itself. `/outputfile achievements`
//   writes an `Untapped Potential: Deity` block listing every deity as its own `Deity Unlock - X`
//   achievement — seventeen of them, below, transcribed from the owner's own dump.
//
//   THE PLAYER'S OWN DEITY IS STATED. Exactly one of those rows carries a complete
//   `...confirm your Deity as X` component (`outputs/achievements.confirmedDeity`). The owner's
//   file says Cazic Thule and says it once.
//
//   THE ITEM'S RESTRICTION IS ALREADY COMMITTED. 457 of the 11,618 pages state a deity line, and it
//   is in `statsBlock` verbatim on every one of them. NO RESCRAPE WAS NEEDED for any of this.
//
// ── HOW MUCH IT MATTERS ───────────────────────────────────────────────────────────────────────
//
// Measured on the committed corpus: of 1,726 effect-bearing items — every possible exaltation donor
// — exactly 20 carry a deity line. Small, and Malkil hit one of them, which is the whole argument
// for the honest gate rather than a wide one.

/**
 * EVERY DEITY THE GAME NAMES, from the `Untapped Potential: Deity` block of a real achievements
 * dump — the closed table race never had. `Agnostic` is in the block and is a real answer: a
 * character who follows nobody satisfies no item's deity list.
 *
 * Stored FOLDED (`deityKey`'s output) because both witnesses spell them differently and neither
 * spelling is more correct than the other: the achievements file writes `Tribunal` and
 * `Cazic Thule`, the wiki writes `[[The Tribunal]]` and `Cazic-Thule`.
 */
export const DEITIES: readonly string[] = [
  'AGNOSTIC',
  'BERTOXXULOUS',
  'BRELL SERILIS',
  'BRISTLEBANE',
  'CAZIC THULE',
  'EROLLISI MARR',
  'INNORUUK',
  'KARANA',
  'MITHANIEL MARR',
  'PREXUS',
  'QUELLIOUS',
  'RALLOS ZEK',
  'RODCET NIFE',
  'SOLUSEK RO',
  'TRIBUNAL',
  'TUNARE',
  'VEESHAN'
]

const KNOWN = new Set(DEITIES)

/**
 * ONE SPELLING FOR A DEITY, so the two witnesses can be compared at all.
 *
 * Every transform here is answering a difference MEASURED between the achievements file and the
 * committed corpus, and nothing here is a guess:
 *
 *   `[[The Tribunal]]`  the wiki leaves link markup in the stats block on 2 pages
 *   `The Tribunal`      the wiki writes the article, the achievements file does not
 *   `Cazic-Thule`       the wiki hyphenates, the achievements file spaces
 *
 * It does NOT try to repair an unrecognised token. `deityKey('Xegony')` is `'XEGONY'`, not null and
 * not a nearest match — the caller asks `isDeity` when it needs to know, and a token the game has
 * never named is reported rather than silently folded onto one it has (law 12: no fuzzy joins).
 */
export function deityKey(raw: string): string {
  return fold(raw).replace(/^THE /, '')
}

/** Comparison form WITHOUT the article strip - that one is per-NAME and belongs to the scan. */
function fold(raw: string): string {
  return raw
    .replace(/\[\[|\]\]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Is this folded token one the game itself names? Unknown tokens are reported, never repaired. */
export function isDeity(key: string): boolean {
  return KNOWN.has(key)
}

/**
 * Every known name found in a run of text, and everything the scan could NOT account for.
 *
 * THE SEPARATOR-LESS PAGES ARE WHY THIS EXISTS. Two pages - `Kejekan Smithy Hammer` and
 * `Soulforge Hammer` - write `Deity: Bertoxxulous Cazic-Thule Innoruuk Rallos Zek` with no commas
 * at all, and the names themselves contain spaces (`Rallos Zek`), so no split on whitespace can
 * read them. Matching the CLOSED VOCABULARY longest-first can, and the RESIDUE is what keeps it
 * honest: a page naming a god the game does not have leaves text behind, and that leftover is
 * reported as unknown rather than quietly dropped.
 */
function scanDeities(folded: string): { found: string[]; residue: string } {
  const longestFirst = [...DEITIES].sort((a, b) => b.length - a.length).join('|')
  const found: string[] = []
  const residue = folded.replace(new RegExp(`(?:THE )?(${longestFirst})`, 'g'), (_m, name: string) => {
    if (!found.includes(name)) found.push(name)
    return ' '
  })
  return { found, residue: residue.replace(/[\s,/]+/g, ' ').trim() }
}

/** One comma- or slash-separated piece of the line, as zero or more deity tokens. */
function piecesOf(piece: string): string[] {
  const key = deityKey(piece)
  if (key === '') return []
  if (isDeity(key)) return [key]
  // Not a name on its own: it may be a whole separator-less list (see `scanDeities`).
  const scan = scanDeities(fold(piece))
  if (scan.found.length > 0 && scan.residue === '') return scan.found
  // Neither. Kept folded and verbatim so `GearBuildStats.unknownDeityTokens` can report it.
  return [key]
}

/**
 * Every deity an item's stats block restricts it to - `[]` when it states no restriction at all,
 * which is the ordinary case (11,161 of the corpus's 11,618 pages).
 *
 * IT READS `statsBlock` AND NOT THE PARSED `flags`, and that is not a preference. The scrape-time
 * parser splits the line on its commas and drops the pieces into `flags` as separate entries, so
 * `Scalp of the Ghoul Lord` parsed to `['Lore Equipped', 'No Trade', 'Charisma: +4',
 * 'Dieties: Bertoxxulous', 'Cazic-Thule', 'Innoruuk', 'Rallos Zek', 'Veeshan']` - the deity list
 * shredded into four bare flags, with only the first god still attached to its label, and the
 * CHARISMA STAT swallowed with it. The raw block beside it is intact and is the honest witness.
 * Fixing the scrape-time parser is worth doing on its own account and would not change this
 * function: reading the line where the line is whole costs nothing.
 *
 * THE WIKI SPELLS IT `Dieties` on most pages and `Deity` on others. Both are its spelling, not a
 * typo of ours, and both are accepted - a page corrected tomorrow must not silently stop
 * restricting anything.
 */
export function deitiesOf(statsBlock: string | undefined): string[] {
  if (statsBlock === undefined) return []
  const line = /^\s*D[ei]{2}t(?:ies|y|ys)\s*:\s*(.+)$/im.exec(statsBlock)
  if (line === null) return []
  const out: string[] = []
  for (const piece of line[1].split(/[,/]/)) {
    for (const key of piecesOf(piece)) if (!out.includes(key)) out.push(key)
  }
  return out
}

/**
 * R2's DEITY HALF: may a character who follows `mine` use an item restricted to `itemDeities`?
 *
 * BOTH UNKNOWNS PASS, and they are different unknowns that happen to share an answer:
 *
 *   AN ITEM THAT STATES NO DEITY is unrestricted. This is the ordinary case and the only honest
 *   reading - a missing line is the absence of a restriction, not a restriction to nobody (law 1).
 *
 *   A CHARACTER WHOSE DEITY WE DO NOT KNOW is our ignorance rather than his. The only witness is
 *   `/outputfile achievements`, which most players have never typed, and filtering on a deity
 *   nobody stated would hide legal advice on no evidence. The surfaces name the command that
 *   lights this up instead of quietly narrowing.
 */
export function deityFits(itemDeities: readonly string[], mine: string | null): boolean {
  if (itemDeities.length === 0 || mine === null) return true
  return itemDeities.includes(mine)
}
