// macros/limits.ts — the game's macro limits, each marked MEASURED (read off the owner's install,
// 2026-11-20) or ASSUMED (not yet checked in game; plan "In-game tests owed", item 5).

/** MEASURED: the game's edit window has five line boxes, and the file has Line1 to Line5. */
export const LINES = 5
/** ASSUMED: twelve buttons a page, from the older game. */
export const BUTTONS_PER_PAGE = 12
/** ASSUMED: ten pages, from the older game. */
export const PAGES = 10
/** ASSUMED: page 1 is the game's built-in set. It is never in the file (that part is measured). */
export const FIRST_EDITABLE_PAGE = 2
/** ASSUMED: from the game's /hotbutton help text ("Up to 255 character macro"). */
export const LINE_MAX = 255
/** MEASURED: the edit window has twenty colour buttons, numbered 0 to 19. */
export const COLOR_MIN = 0
export const COLOR_MAX = 19
/** From public guides for the older game: a pause will not go past about 70 seconds (tenths). */
export const PAUSE_MAX = 700
