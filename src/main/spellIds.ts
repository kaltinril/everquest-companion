// spellIds.ts — the macro editor's spell lookup: the game's real spell ids by name and name by id,
// from the player's own spells_us.txt (or another language's table, resist/spellFiles.ts), read when first asked and kept until the file changes. The
// 38 MB read is off-thread and the scan yields, so the thread tailing the log is not held up.

import { readFile, stat } from 'node:fs/promises'
import { type IndexedSpell, type SpellIdReply, readSpellIdAsk, readSpellRows, searchSpells } from '../shared/macros/spellIds'
import { spellTablePath } from './resist/spellTable'

const LINES_A_TURN = 2000

interface Held {
  stamp: string
  rows: IndexedSpell[]
  names: Map<number, string>
}

let held: Held | null = null
let loading: { stamp: string; done: Promise<Held> } | null = null

async function parse(path: string, stamp: string): Promise<Held> {
  const text = await readFile(path, 'latin1')
  const rows: IndexedSpell[] = []
  let at: number | null = 0
  while (at !== null) {
    const run = readSpellRows(text, at, LINES_A_TURN)
    rows.push(...run.rows)
    at = run.next
    await new Promise((resolve) => setImmediate(resolve))
  }
  return { stamp, rows, names: new Map(rows.map((r) => [r.id, r.name])) }
}

/** The index for the file as it is now; one load at a time. */
async function index(): Promise<Held> {
  const path = spellTablePath()
  const info = await stat(path)
  const stamp = `${path}|${String(info.size)}|${String(info.mtimeMs)}`
  if (held?.stamp === stamp) return held
  if (loading?.stamp !== stamp) {
    const done: Promise<Held> = parse(path, stamp).finally(() => {
      if (loading?.done === done) loading = null
    })
    loading = { stamp, done }
  }
  held = await loading.done
  return held
}

/** Never rejects: an install with no spell file answers `available: false`. */
export async function spellIdLookup(raw: unknown): Promise<SpellIdReply> {
  const ask = readSpellIdAsk(raw)
  try {
    const { rows, names } = await index()
    const found: Record<string, string> = {}
    for (const id of ask.ids) {
      const name = names.get(id)
      if (name !== undefined) found[String(id)] = name
    }
    return { available: true, rows: searchSpells(rows, ask.text), names: found }
  } catch {
    return { available: false, rows: [], names: {} }
  }
}
