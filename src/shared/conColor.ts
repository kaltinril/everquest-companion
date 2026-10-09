// ============================================================================
// conColor.ts — THE CON COLOUR A DIFFICULTY CLAUSE MEANS, for the con card (upstream issue #75).
// ============================================================================
//
// THE ASK (issue #75, 2026-10-09): the con card should show the con colour, gray through red, and the
// faction standing, so a player whose main chat window is on /gsay or general still sees what the
// game just said about the mob.
//
// THE LOG CARRIES NO COLOUR. The game colours the con message by relative level and writes only the
// words, so a colour on the card is a reading of the words. `considerFaction.ts` says the same thing
// about its own palette, and its difficulty table refused an ordering because the log it was
// written against never stated the reader's level. This file is the ordering, and it is measured.
//
// THE MEASUREMENT (read-only, 2026-10-08, Drywrought's log: the 2026-08-12..10-06 archive plus the
// live file, 1,869 `-- <clause> (Lvl: N)` lines). Each con is paired with the HIGHEST level the log
// had announced (`Welcome to level N!`) by then: the character multiclasses, and pairing with the
// last ding instead mixes the ladders and smears every phrase across forty levels. With the highest
// level the seven common clauses separate cleanly and in order, and the even con lands exactly on 0:
//
//   clause (stemmed)                        n    diff = mob - own (q1 / median / max)    colour
//   what would you like your tombstone…   300    -13 /  +6 / +69                         red
//   …would wipe the floor with you!       269     +1 /  +2 /  +5                         yellow
//   looks like quite a gamble.            225    -25 /   0 /   0                         white
//   …appears to be quite formidable.      198    -21 /  -5 /  -1                         blue
//   looks kind of dangerous.              241    -10 /  -9 /  -6                         light blue
//   you would probably win… though.        74    -16 / -15 / -12                         green
//   you could probably win this fight.    440    -43 / -35 / -16                         gray
//
// The low first quartiles are the weeks before the highest ladder led; the medians and maxima are
// the ordering. Seven clauses, seven colours, strictly monotonic, white at zero.
//
// WHAT THIS FILE REFUSES. Four rarer clauses occur in the same log, 72 lines in all, every one at a
// paired difference of -21 or below: `looks like a reasonably safe opponent.`, `looks quite risky,
// but might be worth a try.`, `looks kind of risky, but you might win.` and `looks kind of risky...
// you might win.` Several are cons on other players levelling through the teens, which is exactly
// where the multiclass pairing cannot say whose level the game compared. No colour is claimed for
// them: the card prints the clause and no swatch, and a later measurement can add a row here.

/** The game's con colours, lowest to highest. */
export type ConColor = 'gray' | 'green' | 'lightBlue' | 'blue' | 'white' | 'yellow' | 'red'

/** How the card writes a colour. Words as well as a swatch, so no reader has to tell hues apart. */
export const CON_COLOR_LABEL: Record<ConColor, string> = {
  gray: 'gray',
  green: 'green',
  lightBlue: 'light blue',
  blue: 'blue',
  white: 'white',
  yellow: 'yellow',
  red: 'red'
}

/** The swatch for each colour on the overlay's dark card. The app's choice, near the game's own. */
export const CON_COLOR_HEX: Record<ConColor, string> = {
  gray: '#9aa0a6',
  green: '#4ccf5a',
  lightBlue: '#5fd3f3',
  blue: '#4f86f7',
  white: '#f2f2f2',
  yellow: '#f2d14b',
  red: '#f05454'
}

/** The measured table above, keyed by the stemmed clause. */
const CON_COLOR_OF_CLAUSE: Record<string, ConColor> = {
  'what would you like your tombstone to say?': 'red',
  'looks like it would wipe the floor with you!': 'yellow',
  'looks like quite a gamble.': 'white',
  'it appears to be quite formidable.': 'blue',
  'looks kind of dangerous.': 'lightBlue',
  "you would probably win this fight... it's not certain though.": 'green',
  'you could probably win this fight.': 'gray'
}

/**
 * The con colour a difficulty clause means, or undefined for a clause the table has not measured.
 * Stems the way `considerDifficultyShort` does: case, runs of whitespace, and the gendered pronoun
 * of the two clauses EQ genders ("looks like HE would wipe the floor with you!").
 */
export function conColorOf(difficulty: string): ConColor | undefined {
  const key = difficulty
    .trim()
    .toLowerCase()
    .replace(/\b(?:he|she)\b/g, 'it')
    .replace(/\s+/g, ' ')
  return CON_COLOR_OF_CLAUSE[key]
}
