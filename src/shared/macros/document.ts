// macros/document.ts — the library as it sits in the app's own `macros.json`: reading a parsed
// value back into a MacroLibrary. Whole or nothing: a value that is not a version 1 library is
// refused (null), so main keeps that file aside instead of saving over it.

import { trimLines } from './socials'
import { cleanTags } from './tags'
import type { Macro, MacroLibrary, MacroSet } from './types'

export const MACRO_LIBRARY_VERSION = 1

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** A record's string values; anything else in it is dropped. */
function stringRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!isObject(v)) return out
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function readMacro(v: unknown): Macro | null {
  if (!isObject(v) || typeof v.id !== 'string' || v.id === '') return null
  return {
    id: v.id,
    name: typeof v.name === 'string' ? v.name : '',
    color: typeof v.color === 'number' && Number.isFinite(v.color) ? v.color : 0,
    lines: trimLines(strings(v.lines)),
    tags: cleanTags(strings(v.tags)),
    note: typeof v.note === 'string' ? v.note : '',
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0
  }
}

function readSet(v: unknown): MacroSet | null {
  if (!isObject(v) || typeof v.id !== 'string' || v.id === '') return null
  return { id: v.id, name: typeof v.name === 'string' ? v.name : '', slots: stringRecord(v.slots) }
}

function readList<T>(v: unknown, read: (item: unknown) => T | null): T[] {
  const out: T[] = []
  if (!Array.isArray(v)) return out
  for (const item of v as unknown[]) {
    const one = read(item)
    if (one !== null) out.push(one)
  }
  return out
}

/** The library a parsed document holds, or null when it is not one this build can read. */
export function readLibrary(raw: unknown): MacroLibrary | null {
  if (!isObject(raw) || raw.version !== MACRO_LIBRARY_VERSION) return null
  if (!Array.isArray(raw.macros) || !Array.isArray(raw.sets)) return null
  return {
    version: 1,
    macros: readList(raw.macros, readMacro),
    sets: readList(raw.sets, readSet),
    chosen: stringRecord(raw.chosen),
    tags: cleanTags(strings(raw.tags))
  }
}
