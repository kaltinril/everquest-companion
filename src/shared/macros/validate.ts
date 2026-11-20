// macros/validate.ts — what the editor says about a macro while it is typed. Warnings only: the
// limits are partly assumed (limits.ts), so nothing here stops a save.

import { COLOR_MAX, COLOR_MIN, LINES, LINE_MAX, PAUSE_MAX } from './limits'
import { trimLines } from './socials'
import type { MacroBody } from './types'

export type WarningCode = 'name-empty' | 'too-many-lines' | 'line-too-long' | 'color-range' | 'pause-form' | 'pause-long'

export interface Warning {
  code: WarningCode
  /** The field the warning sits beside. */
  field: 'name' | 'color' | 'lines' | 'line'
  /** The line's index (0 is Line1) when `field` is `line`, else null. */
  line: number | null
  text: string
}

/** `/pause <whole number>`, then nothing or `, /command`. */
const PAUSE = /^\/pause\s+(\d+)\s*(?:,\s*\/.*)?$/i
const STARTS_WITH_PAUSE = /^\/pause(?![a-z])/i

function lineWarnings(text: string, line: number): Warning[] {
  const out: Warning[] = []
  if (text.length > LINE_MAX) {
    out.push({ code: 'line-too-long', field: 'line', line, text: `Over ${String(LINE_MAX)} characters.` })
  }
  const trimmed = text.trim()
  if (!STARTS_WITH_PAUSE.test(trimmed)) return out
  const m = PAUSE.exec(trimmed)
  if (!m) {
    out.push({ code: 'pause-form', field: 'line', line, text: 'Write a pause as /pause 30 or /pause 30, /command.' })
  } else if (Number(m[1]) > PAUSE_MAX) {
    out.push({ code: 'pause-long', field: 'line', line, text: `A pause stops at about 70 seconds (${String(PAUSE_MAX)}).` })
  }
  return out
}

/** Every warning for a macro, in field order: name, colour, the line count, then each line. */
export function validateMacro(macro: MacroBody): Warning[] {
  const out: Warning[] = []
  if (macro.name.trim() === '') {
    out.push({ code: 'name-empty', field: 'name', line: null, text: 'Give the macro a name.' })
  }
  if (!Number.isInteger(macro.color) || macro.color < COLOR_MIN || macro.color > COLOR_MAX) {
    const range = `${String(COLOR_MIN)} to ${String(COLOR_MAX)}`
    out.push({ code: 'color-range', field: 'color', line: null, text: `The colour is a number from ${range}.` })
  }
  if (trimLines(macro.lines).length > LINES) {
    out.push({ code: 'too-many-lines', field: 'lines', line: null, text: `The game has room for ${String(LINES)} lines.` })
  }
  macro.lines.forEach((text, i) => {
    out.push(...lineWarnings(text, i))
  })
  return out
}
