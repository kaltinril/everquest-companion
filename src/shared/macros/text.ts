// macros/text.ts — macros as text, for the clipboard. Two forms are read: the game's own ini lines
// (`Page2Button3Name=`; the slot numbers are dropped) and the app's slot-less form (`Name=`,
// `Color=`, `Line1=`.., a blank line between macros). One macro is written in the slot-less form;
// a whole set is written by socials.ts `renderSocials`.

import { applyField, bodyLines, isBlank, trimLines } from './socials'
import type { MacroBody } from './types'

const SECTION = /^\[(.*)\]\s*$/
const SLOTTED = /^Page(\d+)Button(\d+)(Name|Color|Line\d+)=(.*)$/i
const SLOTLESS = /^(Name|Color|Line\d+)=(.*)$/i

/** Macros in the slot-less form, a blank line between them, CRLF. */
export function macrosToText(macros: readonly MacroBody[]): string {
  return macros.map((m) => bodyLines('', m).join('\r\n')).join('\r\n\r\n') + '\r\n'
}

function blank(): MacroBody {
  return { name: '', color: 0, lines: [] }
}

/** The macros being read off pasted text, in the order each was first seen. */
class Reader {
  private readonly found: MacroBody[] = []
  private readonly bySlot = new Map<string, MacroBody>()
  private open: MacroBody | null = null
  private section = 0

  /** A `[section]` line: slots after it belong to another file's section. */
  startSection(): void {
    this.section++
    this.open = null
  }

  endSlotless(): void {
    this.open = null
  }

  slotted(slot: string, field: string, value: string): void {
    const key = `${String(this.section)}:${slot}`
    let macro = this.bySlot.get(key)
    if (!macro) {
      macro = blank()
      this.bySlot.set(key, macro)
      this.found.push(macro)
    }
    applyField(macro, field, value)
  }

  slotless(field: string, value: string): void {
    // A second `Name=` with no blank line before it still starts the next macro.
    if (this.open === null || (field.toLowerCase() === 'name' && this.open.name !== '')) {
      this.open = blank()
      this.found.push(this.open)
    }
    applyField(this.open, field, value)
  }

  result(): MacroBody[] {
    return this.found.map((m) => ({ ...m, lines: trimLines(m.lines) })).filter((m) => !isBlank(m))
  }
}

/**
 * Every macro in pasted text, in either form (they may be mixed). In text with section headers
 * only `[Socials]` is read, so a whole character file can be pasted. Nothing recognized gives [].
 */
export function parseMacroText(text: string): MacroBody[] {
  const reader = new Reader()
  let skip = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimStart()
    const section = SECTION.exec(line)
    if (section) {
      skip = section[1].trim().toLowerCase() !== 'socials'
      reader.startSection()
      continue
    }
    if (skip) continue
    if (line.trim() === '') {
      reader.endSlotless()
      continue
    }
    const slotted = SLOTTED.exec(line)
    if (slotted) {
      reader.slotted(`${slotted[1]}:${slotted[2]}`, slotted[3], slotted[4])
      continue
    }
    const slotless = SLOTLESS.exec(line)
    if (slotless) reader.slotless(slotless[1], slotless[2])
  }
  return reader.result()
}
