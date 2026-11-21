// macros/tags.ts — category tags (owner, 2026-11-20): the starter list, the player's own, and how
// many macros carry each. A tag is lower case, so "Quest" and "quest" are one.

import type { Macro, MacroLibrary } from './types'

export const STARTER_TAGS = [
  'tradeskill',
  'quest',
  'language',
  'healing',
  'offense',
  'pet',
  'pull',
  'buff',
  'travel',
  'group',
  'raid',
  'utility'
] as const

const TAG_MAX = 24

/** A tag as it is kept: lower case, single spaces, no commas, at most TAG_MAX long. '' is no tag. */
export function normalizeTag(raw: string): string {
  return raw.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX).trim()
}

/** Tags normalized, the empty and repeated ones dropped, order kept. */
export function cleanTags(tags: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (tag !== '' && !out.includes(tag)) out.push(tag)
  }
  return out
}

/** Remember a tag the player typed. A starter tag, or one already kept, changes nothing. */
export function addOwnTag(library: MacroLibrary, raw: string): MacroLibrary {
  const tag = normalizeTag(raw)
  if (tag === '' || (STARTER_TAGS as readonly string[]).includes(tag) || library.tags.includes(tag)) return library
  return { ...library, tags: [...library.tags, tag] }
}

export interface TagCount {
  tag: string
  /** How many library macros carry it. */
  count: number
  /** False for a starter tag. */
  own: boolean
}

/** Every tag to offer: the starter ones in their order, then the player's own by name. */
export function tagList(library: Pick<MacroLibrary, 'macros' | 'tags'>): TagCount[] {
  const counts = new Map<string, number>()
  for (const m of library.macros) {
    for (const tag of m.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  const starter = STARTER_TAGS as readonly string[]
  const own = cleanTags([...library.tags, ...counts.keys()])
    .filter((tag) => !starter.includes(tag))
    .sort((a, b) => a.localeCompare(b))
  return [
    ...starter.map((tag) => ({ tag, count: counts.get(tag) ?? 0, own: false })),
    ...own.map((tag) => ({ tag, count: counts.get(tag) ?? 0, own: true }))
  ]
}

/** The tags some macro carries, in `tagList` order: the short list a picker offers. */
export function usedTagList(library: Pick<MacroLibrary, 'macros' | 'tags'>): TagCount[] {
  return tagList(library).filter((t) => t.count > 0)
}

/** One tag put on or taken off a macro's tag list. */
export function toggleTag(tags: readonly string[], raw: string): string[] {
  const tag = normalizeTag(raw)
  if (tag === '') return [...tags]
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]
}

function haystack(m: Macro): string {
  return [m.name, ...m.lines, m.note, ...m.tags].join('\n').toLowerCase()
}

/**
 * The library list: macros that carry every tag of `tags` and match every word of `query` in the
 * name, a line, the note or a tag (case folded), in the library's own order. `also` adds words a
 * macro is found by (where it sits).
 */
export function filterMacros(macros: readonly Macro[], query: string, tags: readonly string[], also?: (m: Macro) => string): Macro[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '')
  const wanted = cleanTags(tags)
  return macros.filter((m) => {
    if (!wanted.every((tag) => m.tags.includes(tag))) return false
    const text = also === undefined ? haystack(m) : `${haystack(m)}\n${also(m).toLowerCase()}`
    return words.every((w) => text.includes(w))
  })
}
