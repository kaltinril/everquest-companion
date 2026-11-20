// lib/noLogs.ts - when the no-logs screen shows, and what it says about the folder (fork #9,
// phase R3). Pure, with relative shared imports, so `tests/noLogs.test.mts` can load it.
//
// The gate used to be `characters.length > 0` alone. A list that came back empty (the drive
// dropped out for a moment, or the folder was listed before the log existed) then hid every tab
// behind "No EverQuest logs found yet" while a character was attached and being read, until the
// app was restarted.

import { scrubPaths } from '../../../shared/logReadReport'
import type { CharacterRef, EqConfig } from '../../../shared/types'

/** Does the no-logs screen stand in for the tabs? Only with no character AND nothing to pick. */
export function showsNoLogs(characters: readonly CharacterRef[], character: CharacterRef | null): boolean {
  return character === null && characters.length === 0
}

/** The one event this file listens for, on whatever stands in for the window. */
export interface FocusTarget {
  addEventListener(type: 'focus', listener: () => void): void
  removeEventListener(type: 'focus', listener: () => void): void
}

/**
 * Read the character list again each time the window comes back to the front: the player went to
 * turn logging on, or the drive came back. A read that fails leaves the list as it was. Returns
 * the stop; an answer that lands after it is dropped.
 */
export function relistOnFocus(
  target: FocusTarget,
  list: () => Promise<CharacterRef[]>,
  apply: (characters: CharacterRef[]) => void
): () => void {
  let live = true
  const relist = (): void => {
    void list().then(
      (characters) => {
        if (live) apply(characters)
      },
      () => undefined
    )
  }
  target.addEventListener('focus', relist)
  return () => {
    live = false
    target.removeEventListener('focus', relist)
  }
}

/** What reading the logs folder came to. Three of the four need different advice. */
export type FolderVerdict = 'unreadable' | 'missing' | 'empty' | 'found'

/** The read's outcome first: a count is 0 for a folder that could not be listed at all. */
export function folderVerdict(config: Pick<EqConfig, 'readable' | 'characterCount'>): FolderVerdict {
  if (config.readable !== 'ok') return config.readable
  return config.characterCount > 0 ? 'found' : 'empty'
}

/**
 * A user's own folder at the head of ONE path, as `~`. `scrubPaths` reads free text, where a name
 * ends at a space; here the whole string is a path, so a name with a space in it goes whole.
 */
function withoutUserFolder(dir: string): string {
  return dir.replace(/^(?:[A-Za-z]:)?[\\/]+Users[\\/]+(?!(?:Public|Default|All Users)(?:[\\/]|$))[^\\/]+/i, '~')
}

/** `Looked in <folder>.` with the Windows user name taken out of the folder. */
export function lookedIn(logsDir: string): string {
  return `Looked in ${scrubPaths(withoutUserFolder(logsDir), null, '')}.`
}
