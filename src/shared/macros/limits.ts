// macros/limits.ts — the game's macro limits, each MEASURED on the owner's install (2026-11-20),
// except the pause limit, which is from public guides.

/** MEASURED: the game's edit window has five line boxes, and the file has Line1 to Line5. */
export const LINES = 5
/** MEASURED (2026-11-20): the game's list shows Index 1 to 12 a page; its Index is our button number. */
export const BUTTONS_PER_PAGE = 12
/** MEASURED (2026-11-20): the game's list ends at Page 10, Index 12: 120 macros, 108 a player can fill. */
export const PAGES = 10
/** MEASURED (2026-11-20): page 1 holds the game's built-in macros, not in the file unless changed. Left alone. */
export const FIRST_EDITABLE_PAGE = 2
/** MEASURED (2026-11-20): the game's name box stopped at "abcdefghijklmno". */
export const NAME_MAX = 15
/** MEASURED (2026-11-20): typed to the limit, the game stored exactly 255 characters. */
export const LINE_MAX = 255
/** MEASURED: the edit window has twenty colour buttons, numbered 0 to 19. */
export const COLOR_MIN = 0
export const COLOR_MAX = 19
/** From public guides for the older game: a pause will not go past about 70 seconds (tenths). */
export const PAUSE_MAX = 700
