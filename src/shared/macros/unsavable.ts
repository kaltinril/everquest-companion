// macros/unsavable.ts — what stops a send: macros the character file could not hold as they are.
// Unlike validate.ts (warnings while typing), any of these blocks the write.

import { BUTTONS_PER_PAGE, FIRST_EDITABLE_PAGE, LINES, PAGES } from './limits'
import { slotKey, trimLines } from './socials'
import type { GameMacro } from './types'

export type UnsavableCode = 'bad-slot' | 'duplicate-slot' | 'name-empty' | 'too-many-lines' | 'bad-color' | 'line-break' | 'bad-character'

export interface Unsavable {
  code: UnsavableCode
  page: number
  button: number
  /** One short sentence for the screen. */
  text: string
}

const TAB = 9
const DELETE = 127
/** The file is latin1: one byte a character. */
const LATIN1_MAX = 255

/** A line break or other control character: it would end the key or corrupt the line. */
function isControl(code: number): boolean {
  return (code < 32 && code !== TAB) || code === DELETE
}

/** The first character of the texts that `bad` names, or null. */
function firstChar(texts: readonly string[], bad: (code: number) => boolean): string | null {
  for (const text of texts) {
    for (const char of text) {
      if (bad(char.codePointAt(0) ?? 0)) return char
    }
  }
  return null
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max
}

/** The problems with one macro's own text, as [code, the rest of the sentence]. */
function bodyProblems(m: GameMacro): [UnsavableCode, string][] {
  const out: [UnsavableCode, string][] = []
  const texts = [m.name, ...m.lines]
  if (m.name.trim() === '') out.push(['name-empty', 'has no name.'])
  if (trimLines(m.lines).length > LINES) out.push(['too-many-lines', `has more than ${String(LINES)} lines.`])
  if (!Number.isInteger(m.color)) out.push(['bad-color', 'has a colour that is not a whole number.'])
  if (firstChar(texts, isControl) !== null) out.push(['line-break', 'has a line break inside its name or a line.'])
  const odd = firstChar(texts, (code) => code > LATIN1_MAX)
  if (odd !== null) out.push(['bad-character', `has a character the game file cannot hold: ${odd}`])
  return out
}

/** Everything about `macros` that cannot be written faithfully; empty when the send may go ahead. */
export function unsavable(macros: readonly GameMacro[]): Unsavable[] {
  const out: Unsavable[] = []
  const seen = new Set<string>()
  for (const m of macros) {
    const where = `Page ${String(m.page)}, button ${String(m.button)}`
    const add = (code: UnsavableCode, rest: string): void => {
      out.push({ code, page: m.page, button: m.button, text: `${where} ${rest}` })
    }
    if (!inRange(m.page, FIRST_EDITABLE_PAGE, PAGES) || !inRange(m.button, 1, BUTTONS_PER_PAGE)) {
      add('bad-slot', `is outside pages ${String(FIRST_EDITABLE_PAGE)} to ${String(PAGES)}, buttons 1 to ${String(BUTTONS_PER_PAGE)}.`)
    }
    const key = slotKey(m.page, m.button)
    if (seen.has(key)) add('duplicate-slot', 'is filled twice.')
    seen.add(key)
    for (const [code, rest] of bodyProblems(m)) add(code, rest)
  }
  return out
}

function isGameMacro(v: unknown): v is GameMacro {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  const numbers = typeof m.page === 'number' && typeof m.button === 'number' && typeof m.color === 'number'
  return numbers && typeof m.name === 'string' && Array.isArray(m.lines) && m.lines.every((line) => typeof line === 'string')
}

/** A value from outside read as game macros (own fields only), or null when it is not a list of them. */
export function readGameMacros(value: unknown): GameMacro[] | null {
  if (!Array.isArray(value) || !value.every(isGameMacro)) return null
  return value.map((m) => ({ page: m.page, button: m.button, name: m.name, color: m.color, lines: [...m.lines] }))
}
