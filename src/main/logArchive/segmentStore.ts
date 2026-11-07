// main/logArchive/segmentStore.ts — segment files on disk (step 1.1).
//
// One JSON file per segment, `<id>.segment.json`, in a folder the caller passes in (the app's data
// folder in production, ruling 0.2; a temp folder in tests). Writes go through the durable writer,
// so a crash leaves the old file or the new one and never half of either.
//
// AN UNREADABLE FILE IS SKIPPED AND REPORTED, never repaired or deleted: it may be a newer build's
// segment, and an older build has no business touching it.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parseSegment, type Segment } from '../../shared/logArchive/segment'
import { writeFileDurable } from '../telemetry/durableWrite'

const SUFFIX = '.segment.json'

/** Ids are file names: letters, digits, `_`, `-` and `.` only, so no id can leave the folder. */
const SAFE_ID = /^[A-Za-z0-9_.-]+$/

export interface SkippedFile {
  file: string
  reason: string
}

export interface SegmentListing {
  segments: Segment[]
  skipped: SkippedFile[]
}

export function segmentPath(dir: string, id: string): string {
  if (!SAFE_ID.test(id) || id.startsWith('.')) throw new Error(`unsafe segment id: ${id}`)
  return join(dir, `${id}${SUFFIX}`)
}

/**
 * PARSED ONCE PER (file, mtime, size) (audit item 14). Every attach rebuilt the history context by
 * reading and parsing every segment synchronously; a listing now stats each file and re-reads only
 * one that moved, and `prewarmSegments` fills the same cache off the main thread ahead of the
 * attach, so the synchronous listing finds the files already parsed. Entries for files no longer
 * in the folder are dropped by the next listing.
 */
interface ParsedFile {
  mtimeMs: number
  size: number
  one: Segment | SkippedFile
}
const parsedFiles = new Map<string, ParsedFile>()

const unreadable = (file: string, err: unknown): SkippedFile => ({ file, reason: `unreadable: ${(err as Error).message}` })

function parseOne(file: string, text: string): Segment | SkippedFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return unreadable(file, err)
  }
  const parsed = parseSegment(raw)
  if (!parsed.ok) return { file, reason: parsed.reason }
  if (`${parsed.segment.id}${SUFFIX}` !== file) return { file, reason: 'id does not match file name' }
  return parsed.segment
}

function readOne(dir: string, file: string): Segment | SkippedFile {
  const path = join(dir, file)
  let st: { mtimeMs: number; size: number }
  try {
    st = statSync(path)
  } catch (err) {
    return unreadable(file, err)
  }
  const hit = parsedFiles.get(path)
  if (hit?.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.one
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    return unreadable(file, err)
  }
  const one = parseOne(file, text)
  parsedFiles.set(path, { mtimeMs: st.mtimeMs, size: st.size, one })
  return one
}

/** Read and parse every segment in `dir` that the cache does not already hold, off the main thread. */
export async function prewarmSegments(dir: string): Promise<void> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return
  }
  for (const file of files) {
    if (!file.endsWith(SUFFIX)) continue
    const path = join(dir, file)
    try {
      const st = await stat(path)
      const hit = parsedFiles.get(path)
      if (hit?.mtimeMs === st.mtimeMs && hit.size === st.size) continue
      const text = await readFile(path, 'utf8')
      parsedFiles.set(path, { mtimeMs: st.mtimeMs, size: st.size, one: parseOne(file, text) })
    } catch {
      // The listing's own read reports a file that cannot be read; the prewarm only fills.
    }
  }
}

/** Every readable segment in `dir`, optionally only one character's. A missing folder is empty. */
export function listSegments(dir: string, character?: string): SegmentListing {
  const out: SegmentListing = { segments: [], skipped: [] }
  if (!existsSync(dir)) return out
  const seen = new Set<string>()
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(SUFFIX)) continue
    seen.add(join(dir, file))
    const one = readOne(dir, file)
    if ('reason' in one) out.skipped.push(one)
    else if (character === undefined || one.character === character) out.segments.push(one)
  }
  for (const path of parsedFiles.keys()) if (path.startsWith(dir) && !seen.has(path)) parsedFiles.delete(path)
  return out
}

/** Write (or replace) one segment, durably. */
export function writeSegment(dir: string, segment: Segment): void {
  writeFileDurable(dir, segmentPath(dir, segment.id), JSON.stringify(segment))
}
