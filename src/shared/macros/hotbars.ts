// macros/hotbars.ts — which macro buttons the game's hotbars point at, and what a send or a move
// would make them fire. MEASURED (2026-11-20, owner's bar against the file): a hotbar button stores
// `E<n>`, n = (page - 1) * 12 + (button - 1), 0 to 119, and no macro name, so it fires whatever sits
// on that button. This only reads and warns; no hotbar section is ever written. Pure.

import { type GameChanges, gameChanges } from './buttons'
import { type GroupAsk, placeGroup } from './groups'
import { BUTTONS_PER_PAGE, PAGES } from './limits'
import { findSet } from './sets'
import { SECTION, slotKey } from './socials'
import type { CharacterFileMacros, HotbarSlots, MacroLibrary } from './types'

const HOT_SECTION = /^hotbuttons\d*$/i
/** `Page10Button4=E13,@-1,...`. Other kinds of hotbar button do not start with E and a number. */
const HOT_KEY = /^Page\d+Button\d+=E(\d+)\s*(?:,.*)?$/i

/** The macro button an `E<n>` names, or null for a value that is something else (120 and up). */
export function hotbarSlot(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n >= PAGES * BUTTONS_PER_PAGE) return null
  return slotKey(Math.floor(n / BUTTONS_PER_PAGE) + 1, (n % BUTTONS_PER_PAGE) + 1)
}

/** How many hotbar buttons point at each `page:button`, from the `[HotButtons*]` sections only. */
export function parseHotbarSlots(iniText: string): HotbarSlots {
  const out: HotbarSlots = {}
  let inHotbar = false
  for (const raw of iniText.split(/\r?\n/)) {
    const line = raw.trim()
    const section = SECTION.exec(line)
    if (section) {
      inHotbar = HOT_SECTION.test(section[1].trim())
      continue
    }
    const m = inHotbar ? HOT_KEY.exec(line) : null
    const slot = m === null ? null : hotbarSlot(Number(m[1]))
    if (slot !== null) out[slot] = (slot in out ? out[slot] : 0) + 1
  }
  return out
}

/** One macro button a hotbar points at that would fire something else. */
export interface HotbarEffect {
  page: number
  button: number
  /** How many hotbar buttons point at it. */
  hotbars: number
  /** The macro's name in the game now; null when the button is empty there. */
  was: string | null
  /** The name it would have; null when it would be empty. */
  now: string | null
}

/** The changed buttons a hotbar uses whose macro name differs. An edit keeping the name is no change to it. */
export function hotbarEffects(changes: Pick<GameChanges, 'changed'>, hotbarSlots: HotbarSlots): HotbarEffect[] {
  const out: HotbarEffect[] = []
  for (const d of changes.changed) {
    const key = slotKey(d.page, d.button)
    const was = d.file?.name ?? null
    const now = d.set?.name ?? null
    if (key in hotbarSlots && was !== now) out.push({ page: d.page, button: d.button, hotbars: hotbarSlots[key], was, now })
  }
  return out
}

/** What a hotbar would do on these buttons of a layout, against the game's file. */
export function hotbarsAfter(library: MacroLibrary, setId: string, file: Pick<CharacterFileMacros, 'macros' | 'hotbars'>, slots: readonly string[]): HotbarEffect[] {
  const set = findSet(library, setId)
  if (set === null) return []
  return hotbarEffects(gameChanges(library, set, file.macros), file.hotbars).filter((e) => slots.includes(slotKey(e.page, e.button)))
}

const MAX_LISTED = 3

function phrase(e: HotbarEffect): string {
  const where = `page ${String(e.page)} button ${String(e.button)}`
  if (e.now === null) return `${where} was ${e.was === '' || e.was === null ? 'unnamed' : e.was} and will be empty`
  const now = e.now === '' ? 'unnamed' : e.now
  if (e.was === null) return `${where} was empty, now ${now}`
  return `${where} was ${e.was === '' ? 'unnamed' : e.was}, now ${now}`
}

/** "2 hotbar buttons will change: page 2 button 3 was language, now Assist."; null when none do. */
export function hotbarText(effects: readonly HotbarEffect[]): string | null {
  if (effects.length === 0) return null
  const count = effects.reduce((sum, e) => sum + e.hotbars, 0)
  const listed = effects.slice(0, MAX_LISTED).map(phrase).join('; ')
  const more = effects.length > MAX_LISTED ? `; and ${String(effects.length - MAX_LISTED)} more` : ''
  return `${count === 1 ? '1 hotbar button' : `${String(count)} hotbar buttons`} will change: ${listed}${more}.`
}

/** What a group Move would do to this character's hotbars; null when nothing, or no target yet. */
export function groupMoveHotbarText(library: MacroLibrary, ask: GroupAsk, file: Pick<CharacterFileMacros, 'macros' | 'hotbars'>): string | null {
  if (!ask.move || findSet(library, ask.toSetId) === null) return null
  return hotbarText(hotbarsAfter(placeGroup(library, ask), ask.fromSetId, file, ask.slots))
}
