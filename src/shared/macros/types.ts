// macros/types.ts — the Macros tab's shapes (fork #11). The library is the app's own document; a
// GameMacro is one slot as the game's character file holds it.

/** One macro in the app's library. `lines` is positional (index 0 is Line1), trailing blanks cut. */
export interface Macro {
  id: string
  name: string
  /** The game's colour number, as stored. What each number looks like is not measured. */
  color: number
  lines: string[]
  tags: string[]
  /** The player's own words; the game never sees it. */
  note: string
  updatedAt: number
}

/** What the game itself stores for a macro: the part two macros are compared on. */
export type MacroBody = Pick<Macro, 'name' | 'color' | 'lines'>

/** A named layout: slot key (`page:button`, see slots.ts) to a library macro's id. */
export interface MacroSet {
  id: string
  name: string
  slots: Record<string, string>
}

export interface MacroLibrary {
  version: 1
  macros: Macro[]
  sets: MacroSet[]
  /** Character file key (socials.ts `characterFileKey`) to the set chosen for it. */
  chosen: Record<string, string>
  /** The player's own tags, beside the starter ones. */
  tags: string[]
}

/** One slot of a character file's `[Socials]` section. */
export interface GameMacro extends MacroBody {
  page: number
  button: number
}

/** A character file in the game folder: `<Character>_<server>_LO<loadout>.ini`. */
export interface CharacterFile {
  file: string
  character: string
  server: string
  loadout: number
}

/** A character file as main read it. */
export interface CharacterFileMacros extends CharacterFile {
  macros: GameMacro[]
  mtimeMs: number
}

/** Why no game folder was read: no character log found yet, or the folder would not list. */
export type GameFilesReason = 'no-log' | 'unreadable'

/** The reply of the game-files read. `gameFolder` null: `reason` says why. */
export interface GameMacroFiles {
  gameFolder: string | null
  files: CharacterFileMacros[]
  reason?: GameFilesReason
}

/** Fresh ids and the clock, passed in so every library operation stays pure. */
export interface Mint {
  id: () => string
  now: () => number
}
