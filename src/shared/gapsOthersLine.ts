// shared/gapsOthersLine.ts — WHAT THE GAPS TAB SAYS ABOUT THE OTHER CHARACTERS' READ under All
// characters (useOtherCharacters.ts asks main; AllCharactersControls.tsx prints the line).
//
// A READ THAT FAILED IS ITS OWN STATE. It used to become an empty list, and the tab then said "No
// other character saved yet: log each one in here once" and ", every character" over one
// character's rows: a false sentence that sent the player to do work that would not help. A failed
// refresh also replaced a good list with the empty one. Here a failure keeps the list an earlier
// read gave, and the words say which of the two the player is looking at.

import { isStale, type CharacterGaps } from './gapsAllCharacters'

/** The other characters as last read for one ask (`key`: the day window and the attached character). */
export interface OthersAnswer {
  key: string
  value: CharacterGaps[]
  /** The last read failed: `value` is an earlier read's list, or empty when there was none. */
  failed: boolean
}

/** The answer after a read. A failed one keeps the list an earlier read of the same ask gave. */
export function otherAnswer(prev: OthersAnswer | null, key: string, result: { value: CharacterGaps[] } | { failed: true }): OthersAnswer {
  if ('value' in result) return { key, value: result.value, failed: false }
  return { key, value: prev?.key === key ? prev.value : [], failed: true }
}

/**
 * The shown-count line's tail: ", every character, last 60 days" while ticked, else ", last 60 days".
 * Never "every character" over a failed read with no list: those rows are this character's alone.
 */
export function allCharactersCaption(on: boolean, days: number, answer: OthersAnswer | undefined): string {
  const alone = answer?.failed === true && answer.value.length === 0
  return on && !alone ? `, every character, last ${String(days)} days` : `, last ${String(days)} days`
}

/** How the characters line ends after `others` names: the read's own truth, in the warning colour when it failed. */
export function charactersLineEnd(others: number, failed: boolean): { text: string; warn: boolean } {
  if (failed) return { text: others === 0 ? ". Could not read the other characters' saved Gaps." : '. The last read failed, so this is the earlier list.', warn: true }
  return { text: others === 0 ? '. No other character saved yet: log each one in here once.' : '.', warn: false }
}

/** A character's few words on the line, and the one sentence behind them (its date, what to do). */
export function savedWords(c: CharacterGaps, now: Date): { text: string; tip: string; stale: boolean } {
  const archives = `${String(c.archives)} archived log${c.archives === 1 ? '' : 's'}`
  if (c.unreadable === true) return { text: `${c.name} (could not be read)`, tip: `${c.name}'s saved Gaps could not be read, so its rows are left out.`, stale: true }
  if (c.savedAt === null) return { text: `${c.name} (archives only)`, tip: `Not logged in here since this was added: only its ${archives}.`, stale: false }
  const date = c.savedAt.slice(0, 10)
  // Over two months old, or an older build's save that lacks rows this one serves (a known item's forages).
  if (isStale(c.savedAt, now)) return { text: `${c.name} (over 2 months old)`, tip: `Saved ${date}, over two months ago; log in on ${c.name} to refresh it.`, stale: true }
  if (c.olderRows === true) return { text: `${c.name} (needs refresh)`, tip: `Saved ${date} by an older version; log in on ${c.name} to refresh it.`, stale: true }
  return { text: c.name, tip: `${c.name}'s Gaps saved ${date}, plus ${archives}.`, stale: false }
}
