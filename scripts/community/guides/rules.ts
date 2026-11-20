// rules.ts — why a guide pull is refused, and which refusals `--accept` may lift.
//
// Four kinds. `--accept` lifts `change` only (the owner has read the diff). `response`, `content`
// and `layout` are never lifted: a wrong file, a cell that is not short plain text, or a sheet the
// parser no longer understands needs a fix, not a flag.

export type RefusalKind = 'response' | 'content' | 'layout' | 'change'

export interface Refusal {
  kind: RefusalKind
  /** One line: which rule, where, and the figure that tripped it. */
  message: string
}

/** A refusal thrown from deep inside a reader (a zip that is not a zip, a response over its size). */
export class PullRefusal extends Error {
  readonly kind: RefusalKind
  constructor(kind: RefusalKind, message: string) {
    super(message)
    this.name = 'PullRefusal'
    this.kind = kind
  }
}

export const refusalOf = (e: unknown): Refusal | undefined =>
  e instanceof PullRefusal ? { kind: e.kind, message: e.message } : undefined

// ---- thresholds (docs/community/agent/DATA_REFRESH.md, "The two tradeskill guides") --------------

/** A tab may lose this share of its data rows, and a guide this share of its steps or recipes. */
export const MAX_ROW_LOSS = 0.1
export const MAX_TOTAL_LOSS = 0.1
/** A tab may have this share of its rows changed (added, removed or rewritten). */
export const MAX_ROW_CHANGE = 0.3
/** No cell is longer than this. The longest on 2026-11-20 is 227 characters (a Tinkering note). */
export const MAX_CELL_CHARS = 400

// ---- content: every cell is short plain text ------------------------------------------------------

/** C0 and C1 controls (tab and line breaks included), and invisible or direction-changing marks. */
const HIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff]
]
const isHidden = (code: number): boolean => HIDDEN_RANGES.some(([lo, hi]) => code >= lo && code <= hi)

function mapChars(text: string, f: (ch: string, hidden: boolean) => string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) out += f(text[i], isHidden(text.charCodeAt(i)))
  return out
}
const hasHidden = (text: string): boolean => mapChars(text, (_, hidden) => (hidden ? '!' : '')) !== ''
const URL = /http|www\.|:\/\/|\b[a-z0-9-]+\.(?:com|net|org|gg|io)\b/i
const MARKUP = /<\/?[a-z!?][^>]*>|&(?:#\d+|#x[0-9a-f]+|[a-z]{2,8});|\[\[|\]\]|\{\{|\}\}|\]\(/i
/** A leading `=` always; a leading `+`, `-` or `@` unless a number follows (a loc reads `-176, 207, 17`). */
const FORMULA = /^\s*(?:=|[+\-@](?!\s*[\d.]))/
/** Text of the shape RULES.md rule 6 names: addressed to an agent, not to a player. */
const TO_AN_AGENT = /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\b|\bsystem\s+prompt\b|\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:the\s+)?(?:assistant|ai|agent|model|llm)\b|\bas\s+an\s+ai\b|\b(?:chatgpt|claude|copilot|gemini|llm)\b/i

/** What is wrong with one cell's text, in the order checked; undefined when it is short plain text. */
export function cellFault(text: string): string | undefined {
  if (text.length > MAX_CELL_CHARS) return `longer than ${String(MAX_CELL_CHARS)} characters (${String(text.length)})`
  if (hasHidden(text)) return 'a control or invisible character'
  if (FORMULA.test(text)) return 'a spreadsheet formula'
  if (URL.test(text)) return 'a URL'
  if (MARKUP.test(text)) return 'HTML or markup'
  if (TO_AN_AGENT.test(text)) return 'text addressed to an agent'
  return undefined
}

/** Text for a terminal: hidden characters shown as `?`, and cut at `max`. */
export function printable(text: string, max = 200): string {
  const flat = mapChars(text, (ch, hidden) => (hidden ? '?' : ch))
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat
}

/** A cell quoted for a message. */
export const quoteCell = (text: string): string => `"${printable(text, 60)}"`

const COL_A = 65

/** Spreadsheet letter of a 1-based column: `C`, `AA`. */
export function columnLetter(col: number): string {
  let n = col
  let letters = ''
  while (n > 0) {
    letters = String.fromCharCode(COL_A + ((n - 1) % 26)) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

/** Spreadsheet address of a 1-based row and column: `C12`. */
export const cellAddress = (row: number, col: number): string => `${columnLetter(col)}${String(row)}`

/** Every cell of one tab against the content rules. `rows` is the tab as text, row by row. */
export function contentRefusals(where: string, rows: readonly (readonly string[])[]): Refusal[] {
  const out: Refusal[] = []
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const fault = cellFault(cell)
      if (fault !== undefined) out.push({ kind: 'content', message: `${where} ${cellAddress(r + 1, c + 1)}: ${fault}: ${quoteCell(cell)}` })
    })
  })
  return out
}
