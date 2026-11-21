// macros/validate.ts — what the editor says about a macro while it is typed. Warnings only: the
// limits are partly assumed (limits.ts), so nothing here stops a save.

import { COLOR_MAX, COLOR_MIN, LINES, LINE_MAX, NAME_MAX, PAUSE_MAX } from './limits'
import { trimLines } from './socials'
import type { MacroBody } from './types'

export type WarningCode = 'name-empty' | 'name-long' | 'too-many-lines' | 'line-too-long' | 'color-range' | 'pause-form' | 'pause-long'

export interface Warning {
  code: WarningCode
  /** The field the warning sits beside. */
  field: 'name' | 'color' | 'lines' | 'line'
  /** The line's index (0 is Line1) when `field` is `line`, else null. */
  line: number | null
  text: string
}

/** `/pause <whole number>`, then nothing or `, /command`. */
const PAUSE = /^\/pause\s+(\d+)\s*(,\s*\/.*)?$/i
const STARTS_WITH_PAUSE = /^\/pause(?![a-z])/i

/** What a line's `/pause` is: not one (null), badly written, or its length and whether a command follows. */
function pauseOf(text: string): { bad: true } | { bad: false; tenths: number; command: boolean } | null {
  const trimmed = text.trim()
  if (!STARTS_WITH_PAUSE.test(trimmed)) return null
  const m = PAUSE.exec(trimmed)
  if (!m) return { bad: true }
  return { bad: false, tenths: Number(m[1]), command: trimmed.includes(',') }
}

function lineWarnings(text: string, line: number): Warning[] {
  const out: Warning[] = []
  if (text.length > LINE_MAX) {
    out.push({ code: 'line-too-long', field: 'line', line, text: `Longer than ${String(LINE_MAX)} characters.` })
  }
  const pause = pauseOf(text)
  if (pause === null) return out
  if (pause.bad) {
    out.push({ code: 'pause-form', field: 'line', line, text: 'Write it as /pause 20, /command.' })
  } else if (pause.tenths > PAUSE_MAX) {
    out.push({ code: 'pause-long', field: 'line', line, text: 'The game stops a pause near 70 seconds.' })
  }
  return out
}

/** The one thing said under a command field: its first warning, else what its pause does, else ''. */
export interface LineHint {
  warning: boolean
  text: string
}

/**
 * A line's hint. A pause is in tenths of a second and runs AFTER the line's command although it is
 * typed first (public guides for the older game; not checked in EQL).
 */
export function lineHint(text: string): LineHint {
  const warnings = lineWarnings(text, 0)
  if (warnings.length > 0) return { warning: true, text: warnings[0].text }
  const pause = pauseOf(text)
  if (pause === null || pause.bad) return { warning: false, text: '' }
  const seconds = `${(pause.tenths / 10).toFixed(1)} s`
  return { warning: false, text: pause.command ? `Runs the command, then waits about ${seconds}.` : `Waits about ${seconds}.` }
}

/** Every warning for a macro, in field order: name, colour, the line count, then each line. */
export function validateMacro(macro: MacroBody): Warning[] {
  const out: Warning[] = []
  if (macro.name.trim() === '') {
    out.push({ code: 'name-empty', field: 'name', line: null, text: 'Give the macro a name.' })
  } else if (macro.name.length > NAME_MAX) {
    out.push({ code: 'name-long', field: 'name', line: null, text: `The game keeps ${String(NAME_MAX)} characters of a name.` })
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
