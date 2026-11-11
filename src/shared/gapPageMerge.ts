// shared/gapPageMerge.ts — Copy on a Mobs or Merchants row, when the wiki already has the page
// (owner, 2026-11-10: "click copy ... give me the updated full wiki to just copy/paste into place";
// "I don't want to be doing surgery on the page if I don't have to"). The live page is kept word
// for word; only a template field that is EMPTY on it takes the draft's value. A field the page
// already fills, and `description` (the page's own words) always, are left alone and handed back
// as "paste by hand" sections, so the player sees why. Nothing outside the template (the era tag,
// the categories, free text) is touched. Pure, so the rule is tested apart from the wiki.

/** A mob's live page on a Copy click (main/mobLookup.ts `readMobPage`): its text to fill, no page, or the wiki out of reach. */
/** The wiki's answer to a Copy click's page read, with the time it was read (a read is kept a while; mobLookup.ts). */
export type MobPageRead = { found: true; title: string; wikitext: string; at: number } | { found: false; at: number } | { offline: true }

/** The merge's answer: the page to paste, what was filled, and what was set aside. */
export interface PageMerge {
  text: string
  /** The fields the draft filled, in the page's order. */
  filled: string[]
  /** Draft fields with content the page did not take, each with the draft's value and the reason. */
  leftover: { field: string; value: string; why: LeftoverWhy }[]
}

export type LeftoverWhy = 'has content' | 'no field' | 'own words'

/** The page's own words: never written over, even when empty (the hail quote is the editor's call). */
const OWN_WORDS = new Set(['description'])

/** `|name =` opening the next field (names may hold spaces: mob pages' `respawn time`). */
const NEXT_FIELD_RE = /^\|+\s*[a-zA-Z_][\w ]*=/

/** Does a field end at `i`? At a line start always, mid-line only outside nested brackets. */
function endsAt(s: string, i: number, top: boolean): boolean {
  if (!top) return false
  return s.startsWith('}}', i) || (s[i] === '|' && NEXT_FIELD_RE.test(s.slice(i, i + 64)))
}

/** Track `{{ }}` / `[[ ]]` nesting; 1 when `two` was a bracket pair to skip past. */
function bracketStep(two: string, depth: { tpl: number; link: number }): number {
  if (two === '{{') depth.tpl++
  else if (two === '}}') depth.tpl = Math.max(0, depth.tpl - 1)
  else if (two === '[[') depth.link++
  else if (two === ']]') depth.link = Math.max(0, depth.link - 1)
  else return 0
  return 1
}

/**
 * Where a field's value ends: the next `|name =` or the template's `}}` (a port of main's
 * itemLookupParse.ts `fieldValueEnd`, the one reader of `{{Itempage}}` and mob fields).
 */
function fieldValueEnd(s: string, from: number): number | null {
  const depth = { tpl: 0, link: 0 }
  let lineStart = false
  for (let i = from; i < s.length; i++) {
    if (endsAt(s, i, lineStart || (depth.tpl === 0 && depth.link === 0))) return i
    if (s[i] === '\n') lineStart = true
    else if (!/\s/.test(s[i])) lineStart = false
    i += bracketStep(s.slice(i, i + 2), depth)
  }
  return null
}

/** One template field as the text holds it: its name and the raw value span after `=`. */
export interface FieldSpan {
  field: string
  start: number
  end: number
}

const FIELD_OPEN_RE = /^\|\s*([a-zA-Z_][\w ]*?)\s*=/gm

/** Every `| field =` of the page's template, in order, each with its raw value span. */
export function templateFieldSpans(text: string): FieldSpan[] {
  const spans: FieldSpan[] = []
  for (const m of text.matchAll(FIELD_OPEN_RE)) {
    const start = m.index + m[0].length
    const end = fieldValueEnd(text, start)
    if (end === null) continue
    spans.push({ field: m[1].trim(), start, end })
  }
  return spans
}

/**
 * The live page with the draft's values in its EMPTY fields, the rest of it as it was. `filled`
 * names the fields taken; `leftover` the draft's other content, with why: the page has content
 * there (`has content`), the page has no such field (`no field`), or it is the page's own words
 * (`own words`: description).
 */
export function mergeMobPage(live: string, draft: string): PageMerge {
  const draftSpans = templateFieldSpans(draft)
  const liveSpans = new Map(templateFieldSpans(live).map((s) => [s.field.toLowerCase(), s]))
  const filled: string[] = []
  const leftover: PageMerge['leftover'] = []
  // Replaced from the end, so earlier spans keep their offsets.
  const edits: { start: number; end: number; raw: string }[] = []
  for (const d of draftSpans) {
    const value = draft.slice(d.start, d.end).trim()
    if (value === '') continue
    const key = d.field.toLowerCase()
    const on = liveSpans.get(key)
    if (OWN_WORDS.has(key)) {
      leftover.push({ field: d.field, value, why: 'own words' })
      continue
    }
    if (on === undefined) {
      leftover.push({ field: d.field, value, why: 'no field' })
      continue
    }
    const theirs = live.slice(on.start, on.end).trim()
    if (theirs === '') {
      filled.push(on.field)
      edits.push({ start: on.start, end: on.end, raw: draft.slice(d.start, d.end) })
    } else if (theirs !== value) {
      leftover.push({ field: d.field, value, why: 'has content' })
    }
  }
  let text = live
  for (const e of edits.sort((a, b) => b.start - a.start)) text = `${text.slice(0, e.start)}${e.raw}${text.slice(e.end)}`
  return { text, filled, leftover }
}

/** The draft's section for a field, as it would be pasted: `| field = ` and its value. */
export function fieldSection(field: string, value: string): string {
  return value.includes('\n') ? `| ${field} = \n\n${value}\n` : `| ${field.padEnd(17)} = ${value}`
}
