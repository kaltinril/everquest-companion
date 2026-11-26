// aaList.ts — what the log's `/alt list` run and its `You activate X.` lines say about the AAs a
// character holds (owner, 2026-11-25: "it needs to use EVERY RESOURCE it has in the logs";
// docs/community/requirements/alt-advancement.md). Pure.
//
// THE LIST (MEASURED.md, "Alternate advancement"): one block per AA the combo can see, the rank's own
// text and cost. Unowned prints rank 1; owned but not maxed prints the current rank then the next;
// maxed prints the top rank once. So a row with more than one rank reads off the text (each slash
// group of the table's text, `1/2/3/5%`, gives one value per rank) or, failing that, the cost. A
// one-rank AA prints the same block owned or not: the list says nothing of it, and it is never
// guessed (`printed` without a rank).
//
// ACTIVATIONS: a name the table has, seen in `You activate <name>.`, is held (at least rank 1). Only
// an exact name counts: `Skull Bash` is a skill and matches no row.

import { aaFold, aaLogMatch, type LogAa } from './aaLogMatch'
import type { AaTableRow } from './aaTable.generated'
// A cycle with aaRanks.ts, which reads this module: both sides call each other only inside functions.
import { aaRankCosts } from './aaRanks'

/** One block of a run, as the engine's leveling fold publishes it. */
export interface AaListBlock {
  id: number
  name: string
  description: string
  cost: number | null
}

/** The character's latest `/alt list` run. */
export interface AaListRun {
  /** The first line's stamp. */
  ts: number
  blocks: AaListBlock[]
}

/** One name the log shows the player activating. */
export interface AaActivation {
  name: string
  first: number
  last: number
}

export interface AaListRead {
  /** When the run was printed. */
  ts: number
  /** By folded row name: the rank the list shows, for rows it can read. */
  ranks: Map<string, number>
  /** By folded row name: every row the list printed, read or not. */
  printed: Set<string>
}

const NUM = String.raw`\d+(?:\.\d+)?`
const GROUP = new RegExp(String.raw`${NUM}%?(?:\s*\/\s*${NUM}%?)+`, 'g')
const ANY_NUM = new RegExp(NUM, 'g')

/** The per-rank value lists the row's text (and a Special row's cells) states, one value a rank. */
function rankGroups(row: AaTableRow): string[][] {
  const groups = [...row.text.matchAll(GROUP)].map((m) => m[0].split('/').map((p) => String(Number(p.replace('%', '').trim()))))
  const cells = row.values?.map((v) => String(Number(v.replace('%', '').trim())))
  return [...groups, ...(cells === undefined ? [] : [cells])].filter((g) => g.length === row.ranks)
}

const oneOf = (c: number[]): number | null => (c.length === 1 ? c[0] : null)

/** The rank (1-based) whose text this block prints; null when the text and cost do not settle it. */
export function aaBlockRank(row: AaTableRow, block: AaListBlock): number | null {
  const all = Array.from({ length: row.ranks }, (_, i) => i + 1)
  const said = new Set([...block.description.matchAll(ANY_NUM)].map((m) => String(Number(m[0]))))
  const groups = rankGroups(row)
  const costs = aaRankCosts(row)
  const costFits = (k: number): boolean => block.cost === null || costs[k - 1] === null || costs[k - 1] === block.cost
  const byText = groups.length === 0 ? [] : all.filter((k) => groups.every((g) => said.has(g[k - 1])))
  if (byText.length === 1) return byText[0]
  if (byText.length > 1) return oneOf(byText.filter(costFits))
  return block.cost === null ? null : oneOf(all.filter((k) => costs[k - 1] === block.cost))
}

/**
 * The rank a row's blocks show: one block of rank 1 is unowned; two are current then next. Three or
 * more is a list the game had not settled (a run taken right after a purchase printed Pottery
 * Mastery's rank 2, rank 3 and an unsold "rank 4"; MEASURED.md), so it says nothing of the row.
 */
export function aaRowListRank(row: AaTableRow, blocks: readonly AaListBlock[]): number | null {
  if (row.ranks <= 1 || blocks.length === 0 || blocks.length > 2) return null
  const read = blocks.map((b) => aaBlockRank(row, b))
  if (blocks.length === 1) return read[0] === null ? null : read[0] === 1 ? 0 : read[0]
  const known = read.filter((k): k is number => k !== null)
  return known.length === 0 ? null : Math.min(...known)
}

/** What a run says of each row of `table`; `keyOf` gives a row's log form (a race row's). */
export function aaListRead(run: AaListRun, table: readonly AaTableRow[], keyOf: (row: AaTableRow) => string): AaListRead {
  const byName = new Map<string, AaListBlock[]>()
  for (const b of run.blocks) byName.set(aaFold(b.name), [...(byName.get(aaFold(b.name)) ?? []), b])
  const log = new Map<string, LogAa>([...byName].map(([f, bs]) => [f, { name: bs[0].name, rank: 0 }]))
  const { byRow } = aaLogMatch(log, table, keyOf)
  const out: AaListRead = { ts: run.ts, ranks: new Map(), printed: new Set() }
  for (const row of table) {
    const f = aaFold(row.name)
    const hit = byRow.get(f)
    if (hit === undefined || out.printed.has(f)) continue
    out.printed.add(f)
    const rank = aaRowListRank(row, byName.get(aaFold(hit.name)) ?? [])
    if (rank !== null) out.ranks.set(f, rank)
  }
  return out
}

/** Folded names of the rows the log shows the player activating (exact names only). */
export function aaActivatedRows(acts: readonly AaActivation[], table: readonly AaTableRow[], keyOf: (row: AaTableRow) => string): Set<string> {
  const seen = new Set(acts.map((a) => aaFold(a.name)))
  return new Set(table.filter((row) => seen.has(aaFold(row.name)) || seen.has(aaFold(keyOf(row)))).map((row) => aaFold(row.name)))
}
