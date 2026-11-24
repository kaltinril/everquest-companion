// characterFlags.ts — a view switch remembered for each character on its own (owner, 2026-11-23,
// answering the bug hunt's open questions: "LOOT drops? probably per character instead"). The Loot
// tab's Group by item was component state: every character switch remounts the tab, so it came
// back on whatever the player had chosen, and nothing was kept across a restart.
//
// Stored as one JSON object, character id to on or off, under one localStorage key. The id is
// main's `characterId` (`name_server`, lowercased), so two characters of one name on two servers
// are two characters. `*` files the choice made while no character is attached; it never stands in
// for a character that has one of its own, and a character with none of its own reads the default.
// Electron-free and DOM-free, so the read and write rules are node-tested.

/** Each character's choice, by `characterFlagId`. */
export type CharacterFlags = Record<string, boolean>

/** The id a choice is filed under while no character is attached. */
export const NO_CHARACTER = '*'

/** main's `characterId` (log/config.ts): `name_server`, lowercased; `*` with no character. */
export function characterFlagId(c: { name: string; server: string } | null | undefined): string {
  return c === null || c === undefined ? NO_CHARACTER : `${c.name}_${c.server}`.toLowerCase()
}

/** The stored choices out of their text. Unreadable text, or an entry that is not a boolean, is left out, never a throw. */
export function readCharacterFlags(text: string | null): CharacterFlags {
  if (text === null || text === '') return {}
  try {
    const raw = JSON.parse(text) as unknown
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'))
  } catch {
    return {}
  }
}

/** This character's choice, or `dflt` when it has made none. */
export function characterFlag(flags: CharacterFlags, id: string, dflt: boolean): boolean {
  return Object.prototype.hasOwnProperty.call(flags, id) ? flags[id] : dflt
}

/** The choices with this character's set; every other character's left as it was. */
export function withCharacterFlag(flags: CharacterFlags, id: string, on: boolean): CharacterFlags {
  return { ...flags, [id]: on }
}
