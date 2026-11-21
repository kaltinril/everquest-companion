// macros/memSpell.ts — the `/memspellslot <slot>, <id>` command line, in the form the reporter uses
// (fork #11): which spell it names, and putting a found id into a line. No other form is read.

import type { LineHint } from './validate'

const MEM_FULL = /^\s*\/memspellslot\s+(\d+)\s*,\s*(\d+)\s*$/i
const MEM_OPEN = /^\s*\/memspellslot\s+\d+\s*,\s*$/i

/** The gem and spell id a line memorizes, or null when it is not that command. */
export function memSpellOf(line: string): { gem: number; id: number } | null {
  const m = MEM_FULL.exec(line)
  return m ? { gem: Number(m[1]), id: Number(m[2]) } : null
}

/** Every spell id the lines name, each once. */
export function memSpellIds(lines: readonly string[]): number[] {
  const ids = new Set<number>()
  for (const line of lines) {
    const mem = memSpellOf(line)
    if (mem !== null) ids.add(mem.id)
  }
  return [...ids]
}

/** What is known of the ids on screen. */
export interface SpellNames {
  state: 'loading' | 'ready' | 'no-file'
  names: Record<string, string>
}

/** The hint under a `/memspellslot` line; null for any other line. */
export function memSpellHint(line: string, known: SpellNames): LineHint | null {
  const mem = memSpellOf(line)
  if (mem === null) return null
  if (known.state === 'loading') return { warning: false, text: 'Looking up the spell.' }
  if (known.state === 'no-file') return { warning: false, text: 'Spell file not found, so this id is not checked.' }
  const key = String(mem.id)
  if (!(key in known.names)) return { warning: true, text: `No player spell has id ${key}.` }
  return { warning: false, text: `Memorizes ${known.names[key]} in gem ${String(mem.gem)}.` }
}

/**
 * A found id put into a line: an unfinished `/memspellslot N,` is completed, any other line takes
 * it at the cursor, over a selection. `cursor` is where the caret belongs afterwards.
 */
export function insertSpellId(line: string, at: { start: number; end: number }, id: number): { line: string; cursor: number } {
  const text = String(id)
  if (MEM_OPEN.test(line)) {
    const done = `${line.trimEnd()} ${text}`
    return { line: done, cursor: done.length }
  }
  const start = Math.min(at.start, line.length)
  const end = Math.max(start, Math.min(at.end, line.length))
  return { line: `${line.slice(0, start)}${text}${line.slice(end)}`, cursor: start + text.length }
}
