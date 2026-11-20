// pull.ts — one guide pull from start to finish: fetch, check, compare with the last good copy,
// and write only when nothing refuses it. The command line around it is ../guides-pull.mts.

import { existsSync, readFileSync } from 'node:fs'
import type { GuideMaterial, TradeskillGuidesFile } from '../../../src/shared/guideData'
import { parsePull, type Parsed, type RawPull } from './build'
import { changeRefusals, dataRows, diffRows, formatDiff } from './rowDiff'
import { MAX_TOTAL_LOSS, type Refusal } from './rules'
import { manifestOf, readSnapshot, writeData, writeSnapshot, type Manifest } from './snapshot'
import { collect, type GuideSource } from './source'

export interface PullOptions {
  source: GuideSource
  /** The last good pull's folder (scripts/sources/cache/guides). */
  snapshotDir: string
  /** src/main/data/tradeskillGuides.json. */
  dataPath: string
  /** src/main/data/items.json, for the name report; left out, no names are checked. */
  itemsPath?: string
  /** The owner has read the diff: take a pull the "changed too much" rules refused. */
  accept: boolean
  /** Fetch, check and report; write nothing. */
  dryRun: boolean
  /** The time of the pull, ISO 8601. */
  now: string
}

export interface UnknownNames {
  leveling: string[]
  recipes: string[]
}

export interface PullResult {
  /** No refusal stands (those `--accept` lifted are in `accepted`). */
  ok: boolean
  written: boolean
  /** Every fetched byte equals the last good copy's: there is nothing to write or commit. */
  identical: boolean
  refusals: Refusal[]
  accepted: Refusal[]
  /** The diff against the last good copy, for a person to read. */
  report: string[]
  changed: boolean
  unknown: UnknownNames
  parsed: Parsed
}

// ---- against the last good copy -----------------------------------------------------------------------

function totalRefusal(what: string, before: number, after: number): Refusal[] {
  if (before === 0 || (before - after) / before <= MAX_TOTAL_LOSS) return []
  return [{ kind: 'change', message: `${what}: ${String(after)} now against ${String(before)} in the last good copy, a drop over ${String(MAX_TOTAL_LOSS * 100)}%` }]
}

/** Tabs gone or new, each tab's row changes, and the totals. */
export function compare(last: Parsed, next: Parsed): { refusals: Refusal[]; report: string[]; changed: boolean } {
  const refusals: Refusal[] = []
  const report: string[] = []
  for (const [key, grid] of last.grids) {
    if (next.grids.has(key)) continue
    refusals.push({ kind: 'change', message: `${key}: in the last good copy (${String(dataRows(grid).length)} rows), missing from this pull` })
  }
  for (const [key, grid] of next.grids) {
    const before = last.grids.get(key)
    if (before === undefined) {
      const rows = dataRows(grid)
      refusals.push({ kind: 'change', message: `${key}: a new tab (${String(rows.length)} rows), not in the last good copy` })
      report.push(...formatDiff(key, diffRows([], grid)))
      continue
    }
    const d = diffRows(before, grid)
    refusals.push(...changeRefusals(key, d))
    report.push(...formatDiff(key, d))
  }
  refusals.push(...totalRefusal('leveling steps in all tabs', last.steps, next.steps), ...totalRefusal('recipes in all tables', last.recipes, next.recipes))
  return { refusals, report, changed: report.length > 0 || refusals.length > 0 }
}

// ---- names against items.json -----------------------------------------------------------------------

const fold = (name: string): string => name.toLowerCase().replace(/\s+/g, ' ').trim()

/** Every item name and other name in items.json, folded. */
export function knownItemNames(itemsPath: string): Set<string> {
  const doc = JSON.parse(readFileSync(itemsPath, 'utf8')) as { items: Record<string, { page?: string; otherNames?: string[] }> }
  const names = new Set<string>()
  for (const [key, item] of Object.entries(doc.items)) {
    names.add(fold(key))
    if (item.page !== undefined) names.add(fold(item.page))
    for (const other of item.otherNames ?? []) names.add(fold(other))
  }
  return names
}

function materialNames(materials: readonly GuideMaterial[], out: string[]): void {
  for (const m of materials) {
    out.push(m.name)
    materialNames(m.materials ?? [], out)
  }
}

/** The guides' item and material names that items.json does not hold, each once, in guide order. */
export function unknownNames(file: TradeskillGuidesFile, known: ReadonlySet<string>): UnknownNames {
  const leveling: string[] = []
  for (const ladder of Object.values(file.leveling.tradeskills)) {
    for (const step of [...ladder.steps, ...ladder.alternates]) {
      leveling.push(step.item)
      materialNames(step.materials, leveling)
    }
  }
  const recipes: string[] = []
  for (const list of Object.values(file.recipes.tradeskills)) {
    for (const r of list.recipes) recipes.push(r.item, ...r.materials.map((m) => m.name))
  }
  const missing = (names: string[]): string[] => {
    const seen = new Set<string>()
    return names.filter((n) => {
      const f = fold(n)
      if (known.has(f) || seen.has(f)) return false
      seen.add(f)
      return true
    })
  }
  return { leveling: missing(leveling), recipes: missing(recipes) }
}

// ---- the pull ---------------------------------------------------------------------------------------

/** The same tabs, title and bytes as the last good copy: its manifest would be rewritten as it is. */
function sameBytes(last: Manifest, raw: RawPull): boolean {
  return raw.ods !== undefined && JSON.stringify(manifestOf(raw, last.pulledAt)) === JSON.stringify(last)
}

/**
 * Fetch both guides, check them, compare with the last good copy and, when nothing refuses the
 * pull, write the bytes, their manifest and the data file. A refused pull writes nothing, and so
 * does a pull whose every byte is the last good copy's (the copy keeps the date it was fetched).
 */
export async function runPull(o: PullOptions): Promise<PullResult> {
  const raw = await collect(o.source)
  const parsed = parsePull(raw, o.now)
  const last = readSnapshot(o.snapshotDir)
  const against = last === undefined
    ? { refusals: [{ kind: 'change' as const, message: 'no last good copy to compare with: everything in this pull is new' }], report: [], changed: true }
    : compare(parsePull(last.raw, last.manifest.pulledAt), parsed)
  const refusals = [...parsed.refusals, ...(o.accept ? [] : against.refusals)]
  const ok = refusals.length === 0
  const identical = ok && last !== undefined && sameBytes(last.manifest, raw)
  const known = o.itemsPath !== undefined && existsSync(o.itemsPath) ? knownItemNames(o.itemsPath) : undefined
  const unknown = known === undefined ? { leveling: [], recipes: [] } : unknownNames(parsed.file, known)
  const written = ok && !identical && !o.dryRun
  if (written) {
    writeSnapshot(o.snapshotDir, raw, o.now)
    writeData(o.dataPath, parsed.file)
  }
  return { ok, written, identical, refusals, accepted: o.accept ? against.refusals : [], report: against.report, changed: against.changed, unknown, parsed }
}

/** The data file again from the last good copy's bytes, with no request: after a parser change. */
export function rederive(snapshotDir: string, dataPath: string): { ok: boolean; refusals: Refusal[]; parsed?: Parsed } {
  const last = readSnapshot(snapshotDir)
  if (last === undefined) return { ok: false, refusals: [{ kind: 'response', message: `no last good copy in ${snapshotDir}` }] }
  const parsed = parsePull(last.raw, last.manifest.pulledAt)
  if (parsed.refusals.length > 0) return { ok: false, refusals: parsed.refusals, parsed }
  writeData(dataPath, parsed.file)
  return { ok: true, refusals: [], parsed }
}
