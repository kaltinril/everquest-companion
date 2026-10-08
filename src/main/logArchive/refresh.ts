// main/logArchive/refresh.ts — BRING AN ARCHIVED SEGMENT'S TOTALS UP TO DATE (step 5.5).
//
// Step 5.4 measured that a second fold of an archive gives the totals its segment stored, given
// the same engine build. So a segment captured by an older build can be refolded by this one, and
// a parser fix since then reaches its history.
//
// THE ORDER: refold, write the new segment beside the old under a `.next` name, read it back and
// check it is what was written, keep a copy of the old file under an `.old` name, and only then
// rename the new one into place. A crash at any point leaves the old segment file in place or the
// new one, never neither. The `.old` copy is the undo until the next launch, which removes it.
//
// ONLY THE TOTALS CHANGE. The log's identity, the archive and the state are kept, and so is the
// path the character module names (the refold read a staged copy). A refold that lacks a module
// the segment held is refused, so a refresh can never lose a module.

import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { compareModules, keepIdentity } from '../../shared/logArchive/refoldCompare'
import { parseSegment, type Segment } from '../../shared/logArchive/segment'
import { writeFileDurable } from '../telemetry/durableWrite'
import type { RefoldResult } from './refold'
import { listSegments, segmentPath } from './segmentStore'

const NEXT = '.next'
const OLD = '.old'
/** The kept copy, the unswapped new file, and the durable writer's scratch file for it. */
const LEFTOVER = /\.segment\.json\.(old|next)(\.tmp)?$/

export interface RefreshDeps {
  refold: (segment: Segment) => Promise<RefoldResult>
  /** The build doing the refold, recorded as the segment's new producer. */
  producedBy: () => { app: string; engine: string }
}

export type RefreshResult =
  | { ok: true; segment: Segment; changed: string[] }
  | { ok: false; reason: string }

/**
 * Why a segment cannot be refreshed, or null when it can. The version that produced it is no reason:
 * a reading can change without the version moving (a dev build; the Bazaar learning who said what),
 * and reading the archive again only replaces the totals.
 */
function refreshProblem(s: Segment | undefined): string | null {
  if (s === undefined) return 'that history was not found'
  if (s.archivePath === null) return 'it has no archive to read again'
  return null
}

/** Write `next` under the `.next` name and read it back. True when it reads back the same. */
function writeChecked(dir: string, next: Segment): boolean {
  const path = `${segmentPath(dir, next.id)}${NEXT}`
  const text = JSON.stringify(next)
  writeFileDurable(dir, path, text)
  let back: string
  try {
    back = readFileSync(path, 'utf8')
  } catch {
    return false
  }
  const parsed = parseSegment(JSON.parse(back))
  return back === text && parsed.ok && parsed.segment.id === next.id
}

/** Refold one segment's archive with this build and swap the new totals in. */
export async function refreshSegment(dir: string, id: string, deps: RefreshDeps): Promise<RefreshResult> {
  const old = listSegments(dir).segments.find((s) => s.id === id)
  const problem = refreshProblem(old)
  if (old === undefined || problem !== null) return { ok: false, reason: problem ?? 'not found' }
  const r = await deps.refold(old)
  if (!r.ok) return { ok: false, reason: r.reason }
  const missing = Object.keys(old.modules).filter((m) => r.fold.modules[m] === undefined)
  if (missing.length > 0) return { ok: false, reason: `the refold did not give back ${missing.join(', ')}` }
  const next: Segment = { ...old, producedBy: deps.producedBy(), modules: keepIdentity(old.modules, r.fold.modules) }
  if (!writeChecked(dir, next)) {
    rmSync(`${segmentPath(dir, id)}${NEXT}`, { force: true })
    return { ok: false, reason: 'the new totals did not read back the same' }
  }
  const live = segmentPath(dir, id)
  copyFileSync(live, `${live}${OLD}`)
  renameSync(`${live}${NEXT}`, live)
  const changed = compareModules(old.modules, next.modules).filter((v) => !v.same).map((v) => v.module)
  return { ok: true, segment: next, changed }
}

/** At launch: drop the copies a refresh kept, and any new file a crash left unswapped. */
export function sweepRefreshLeftovers(dir: string): number {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!LEFTOVER.test(f)) continue
    rmSync(join(dir, f), { force: true })
    n++
  }
  return n
}
