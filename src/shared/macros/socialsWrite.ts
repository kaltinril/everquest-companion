// macros/socialsWrite.ts — a character file's text with its `[Socials]` section replaced, and
// nothing else touched. Pure: the caller does the disk work (main/macros/gameFileSend.ts).

import { FIRST_EDITABLE_PAGE } from './limits'
import { SECTION, SOCIAL_KEY, bodyLines, bySlot, isBlank, parseSocials, trimLines } from './socials'
import type { GameMacro } from './types'

const HEADER = '[Socials]'

/** One line of the text: where it starts, where its text ends, and where the next line starts. */
interface Line {
  start: number
  end: number
  next: number
}

/** A run of lines `[from, to)`: a `[Socials]` header and its keys, trailing blank lines left out. */
interface Range {
  from: number
  to: number
}

/** The text's own line ending; CRLF (the game's) when it has no line break at all. */
export function lineEnding(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') || !text.includes('\n') ? '\r\n' : '\n'
}

/** Split the way parseSocials does (`\r?\n`), keeping every offset. */
function linesOf(text: string): Line[] {
  const out: Line[] = []
  const breaks = /\r?\n/g
  let start = 0
  for (let m = breaks.exec(text); m !== null; m = breaks.exec(text)) {
    out.push({ start, end: m.index, next: m.index + m[0].length })
    start = m.index + m[0].length
  }
  if (start < text.length) out.push({ start, end: text.length, next: text.length })
  return out
}

function lineText(text: string, line: Line): string {
  return text.slice(line.start, line.end)
}

/** Every `[Socials]` section of the text. Blank lines at a section's end stay outside it. */
function socialsRanges(text: string, lines: readonly Line[]): Range[] {
  const out: Range[] = []
  let open: Range | null = null
  lines.forEach((line, i) => {
    const section = SECTION.exec(lineText(text, line).trimStart())
    if (!section) return
    if (open !== null) open.to = i
    open = section[1].trim().toLowerCase() === 'socials' ? { from: i, to: lines.length } : null
    if (open !== null) out.push(open)
  })
  for (const range of out) {
    while (range.to - 1 > range.from && lineText(text, lines[range.to - 1]).trim() === '') range.to--
  }
  return out
}

/**
 * The lines of a section that a send leaves as they are: a page below FIRST_EDITABLE_PAGE (a set
 * cannot hold one) and any line that is not a macro key at all (nothing this app understands).
 */
function keptLines(text: string, lines: readonly Line[], range: Range): string[] {
  const out: string[] = []
  for (let i = range.from + 1; i < range.to; i++) {
    const raw = lineText(text, lines[i])
    if (raw.trim() === '') continue
    const key = SOCIAL_KEY.exec(raw.trimStart())
    if (key === null || Number(key[1]) < FIRST_EDITABLE_PAGE) out.push(raw)
  }
  return out
}

/** The keys for the macros, in slot order, as renderSocials writes them. */
function macroLines(macros: readonly GameMacro[]): string[] {
  const out: string[] = []
  for (const m of [...macros].sort(bySlot)) {
    if (!isBlank(m)) out.push(...bodyLines(`Page${String(m.page)}Button${String(m.button)}`, m))
  }
  return out
}

/**
 * The ini text with the body of `[Socials]` replaced by the keys for `macros`. Everything outside
 * the section comes back character for character, in the file's own line ending. Kept inside it,
 * ahead of the new keys and in their old order: page 1's keys and lines that are not macro keys.
 * No section: one is added at the end. Several sections: the first is rewritten and the later
 * ones are removed (the game reads them as one; their kept lines move into the first).
 */
export function replaceSocials(iniText: string, macros: readonly GameMacro[]): string {
  const eol = lineEnding(iniText)
  const lines = linesOf(iniText)
  const ranges = socialsRanges(iniText, lines)
  const keys = macroLines(macros)
  if (ranges.length === 0) {
    const head = iniText === '' || iniText.endsWith('\n') ? iniText : iniText + eol
    return head + [HEADER, ...keys].join(eol) + eol
  }
  const first = ranges[0]
  const kept = ranges.flatMap((range) => keptLines(iniText, lines, range))
  const lastLine = lines[first.to - 1]
  // The old section's own final line break, so a file that ends without one still does.
  const tail = iniText.slice(lastLine.end, lastLine.next)
  const section = [lineText(iniText, lines[first.from]), ...kept, ...keys].join(eol) + tail
  return iniText.slice(0, lines[first.from].start) + section + cutRanges(iniText, lines, ranges.slice(1), lastLine.next)
}

/** The text from `from` on, without the given ranges. */
function cutRanges(text: string, lines: readonly Line[], ranges: readonly Range[], from: number): string {
  let out = ''
  let at = from
  for (const range of ranges) {
    out += text.slice(at, lines[range.from].start)
    at = lines[range.to - 1].next
  }
  return out + text.slice(at)
}

/** The text with every `[Socials]` section cut out: what a send must leave alone. */
export function outsideSocials(iniText: string): string {
  const lines = linesOf(iniText)
  return cutRanges(iniText, lines, socialsRanges(iniText, lines), 0)
}

/** True when `after` differs from `before` only inside `[Socials]` (or by a section added at the end). */
export function sameOutsideSocials(before: string, after: string): boolean {
  const hadSection = socialsRanges(before, linesOf(before)).length > 0
  // With no section the new one goes at the end, after a line break when the text lacked one.
  const whole = before === '' || before.endsWith('\n') ? before : before + lineEnding(before)
  return outsideSocials(after) === (hadSection ? outsideSocials(before) : whole)
}

/** What parseSocials reads after a send: the file's kept pages, then the macros sent. */
export function socialsAfterSend(iniText: string, macros: readonly GameMacro[]): GameMacro[] {
  const kept = parseSocials(iniText).filter((m) => m.page < FIRST_EDITABLE_PAGE)
  const sent = macros.filter((m) => !isBlank(m)).map((m) => ({ page: m.page, button: m.button, name: m.name, color: m.color, lines: trimLines(m.lines) }))
  return [...kept, ...sent].sort(bySlot)
}
