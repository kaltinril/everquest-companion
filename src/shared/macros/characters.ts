// macros/characters.ts — the game folder's character files as a player thinks of them: one
// character, its loadouts under it (owner, 2026-11-20: "not this same character name 4 times in
// 4 panels"). The game keeps one file per loadout and writes no name or class for a loadout in
// any text file read so far, so the name shown is one the player gives it here.

import { characterFileKey } from './socials'
import type { CharacterFile, MacroLibrary } from './types'

export interface CharacterGroup<T extends CharacterFile = CharacterFile> {
  /** Character and server, case folded: one group per pair. */
  key: string
  character: string
  server: string
  /** The character's loadout files, lowest loadout number first. */
  loadouts: T[]
}

/** The files grouped by character and server, in the order the characters first appear. */
export function groupCharacters<T extends CharacterFile>(files: readonly T[]): CharacterGroup<T>[] {
  const groups = new Map<string, CharacterGroup<T>>()
  for (const file of files) {
    const key = `${file.character}_${file.server}`.toLowerCase()
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { key, character: file.character, server: file.server, loadouts: [file] })
    else group.loadouts.push(file)
  }
  const out = [...groups.values()]
  for (const group of out) group.loadouts.sort((a, b) => a.loadout - b.loadout)
  return out
}

/** The loadout whose file changed last: the one the player most likely plays. */
export function newestLoadout<T extends CharacterFile & { mtimeMs: number }>(group: CharacterGroup<T>): T {
  return group.loadouts.reduce((best, file) => (file.mtimeMs > best.mtimeMs ? file : best))
}

export const LOADOUT_LABEL_MAX = 24

/** The name the player gave a loadout, or '' when it has none. */
export function loadoutLabel(library: Pick<MacroLibrary, 'labels'>, file: CharacterFile): string {
  return (library.labels?.[characterFileKey(file)] ?? '').trim()
}

/** Name a loadout. Kept as typed (a trailing space survives while typing); blank removes the name. */
export function setLoadoutLabel(library: MacroLibrary, file: CharacterFile, label: string): MacroLibrary {
  const key = characterFileKey(file)
  const next = label.trimStart().slice(0, LOADOUT_LABEL_MAX)
  const labels = { ...(library.labels ?? {}) }
  if (next.trim() === '') Reflect.deleteProperty(labels, key)
  else labels[key] = next
  return { ...library, labels }
}

/** "Loadout 4", or "Loadout 4: Tank" once the player has named it. */
export function loadoutText(file: CharacterFile, label: string): string {
  const base = `Loadout ${String(file.loadout)}`
  return label === '' ? base : `${base}: ${label}`
}

/** A character panel's small line: its one loadout, or how many it has. */
export function loadoutsCaption(group: CharacterGroup): string {
  const count = group.loadouts.length
  return count === 1 ? `${group.server}, loadout ${String(group.loadouts[0].loadout)}` : `${group.server}, ${String(count)} loadouts`
}
