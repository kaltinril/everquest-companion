// macros/spellIds.ts — the game's real spell ids by name, for `/memspellslot`, read from the
// player's own spells_us.txt in main (src/main/spellIds.ts). Field 0 is the id, 1 the name, 36..51
// the class levels (resist/spellsUsParse.ts); no game patch has moved those. The resist table is
// not used here: it keeps one row per rank-folded name, so it holds no id for most ranks.

import { foldApostrophes } from '../spellSearch'

/** One spell a class can scribe. `classes` reads "CLR 1, PAL 9". */
export interface SpellIdRow {
  id: number
  name: string
  classes: string
}

/** A row with the name folded once, so a search does not fold 30,000 names a keystroke. */
export interface IndexedSpell extends SpellIdRow {
  fold: string
}

export interface SpellIdAsk {
  /** The search box's text; '' asks for no rows. */
  text: string
  /** Ids to name, for the hint under a `/memspellslot` line. */
  ids: number[]
}

export interface SpellIdReply {
  /** False when the game's spell file could not be read. */
  available: boolean
  rows: SpellIdRow[]
  /** Id to name, for the asked ids a class can scribe. */
  names: Record<string, string>
}

const F_CLASS_FIRST = 36
/** The sixteen class-level fields, in the file's order. */
const CLASS_CODES = ['WAR', 'CLR', 'PAL', 'RNG', 'SHD', 'DRU', 'MNK', 'BRD', 'ROG', 'SHM', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER']
/** 255 is "cannot use"; AA rows carry 254, which no spell gem holds. */
const FIRST_NOT_SCRIBED = 254
const MAX_TEXT = 64
const MAX_IDS = 20
export const SPELL_RESULTS = 30

function foldName(text: string): string {
  return foldApostrophes(text.toLowerCase())
}

/** The classes that can scribe the row, from the field after the name; '' when none can. */
function classesOf(line: string, from: number): string {
  let at = from
  for (let field = 2; field < F_CLASS_FIRST; field++) {
    const next = line.indexOf('^', at)
    if (next < 0) return ''
    at = next + 1
  }
  const out: string[] = []
  line
    .slice(at)
    .split('^', CLASS_CODES.length)
    .forEach((raw, i) => {
      const level = Number(raw)
      if (Number.isInteger(level) && level > 0 && level < FIRST_NOT_SCRIBED) out.push(`${CLASS_CODES[i]} ${String(level)}`)
    })
  return out.join(', ')
}

/** One line of the file as a spell a player can scribe, or null. Fields are found, not all split. */
export function parseSpellLine(line: string): IndexedSpell | null {
  const nameAt = line.indexOf('^') + 1
  const nameEnd = nameAt === 0 ? -1 : line.indexOf('^', nameAt)
  if (nameEnd < 0) return null
  const id = Number(line.slice(0, nameAt - 1))
  const name = line.slice(nameAt, nameEnd)
  if (!Number.isInteger(id) || id <= 0 || name === '') return null
  const classes = classesOf(line, nameEnd + 1)
  return classes === '' ? null : { id, name, classes, fold: foldName(name) }
}

/** Up to `maxLines` lines from an offset, so the caller can yield between runs. `next` null: done. */
export function readSpellRows(text: string, from: number, maxLines: number): { rows: IndexedSpell[]; next: number | null } {
  const rows: IndexedSpell[] = []
  let at = from
  for (let i = 0; i < maxLines && at < text.length; i++) {
    const found = text.indexOf('\n', at)
    const end = found < 0 ? text.length : found
    const row = parseSpellLine(text.slice(at, end))
    if (row !== null) rows.push(row)
    at = end + 1
  }
  return { rows, next: at >= text.length ? null : at }
}

/** 0 an exact name or id, 1 a name that starts with the text, 2 the rest. */
function rank(row: IndexedSpell, folded: string): number {
  if (row.fold === folded || String(row.id) === folded) return 0
  return row.fold.startsWith(folded) ? 1 : 2
}

/** The spells whose name holds every word, or whose id is the text: closest first, then by name and id. */
export function searchSpells(index: readonly IndexedSpell[], text: string, limit: number = SPELL_RESULTS): SpellIdRow[] {
  const folded = foldName(text).trim()
  const words = folded.split(/\s+/).filter((w) => w !== '')
  if (words.length === 0) return []
  const hits = index.filter((r) => String(r.id) === folded || words.every((w) => r.fold.includes(w)))
  hits.sort((a, b) => rank(a, folded) - rank(b, folded) || a.fold.localeCompare(b.fold) || a.id - b.id)
  return hits.slice(0, limit).map(({ id, name, classes }) => ({ id, name, classes }))
}

/** What the renderer sent, bounded; anything else asks for nothing. */
export function readSpellIdAsk(raw: unknown): SpellIdAsk {
  if (typeof raw !== 'object' || raw === null) return { text: '', ids: [] }
  const { text, ids } = raw as { text?: unknown; ids?: unknown }
  const wanted = Array.isArray(ids) ? ids.filter((n): n is number => Number.isInteger(n)) : []
  return { text: typeof text === 'string' ? text.slice(0, MAX_TEXT) : '', ids: wanted.slice(0, MAX_IDS) }
}
