// main/logArchive/history.ts — ARCHIVED HISTORY ON THE READ PATH (step 1.7).
//
// `serveModuleSnapshot` hands every served module snapshot through `mergeHistory`. With the switch
// off, with no character attached, with no merge rule for the module, or with no eligible segment,
// the served state comes back as the same object: nothing is read and nothing is copied. Only with
// the switch on does the archive folder get opened at all.
//
// DECIDED ONCE PER CHARACTER PER LAUNCH. The segment list and the live log's head are read on the
// first merge for a character and kept. That is what keeps the eligibility rule honest: the engine
// folded the log as it was at attach, so a log cleared by hand mid-session must not make its
// sealed segment eligible while the engine's memory still holds the same lines. The cost is the
// safe one: such history appears from the next launch. `forgetHistoryContext` is the reset for
// the steps that change what is on disk (phase 2).
//
// CACHED PER MODULE AND ENGINE SEQ, so a busy surface re-reading the same snapshot does not
// re-merge it.

import { createHash } from 'node:crypto'
import { closeSync, openSync, readSync } from 'node:fs'
import { eligibleSegments, type Held } from '../../shared/logArchive/eligible'
import { hasMergeRule, mergeModule } from '../../shared/logArchive/mergeRules'
import { HEAD_BYTES, logStampKey, type Segment } from '../../shared/logArchive/segment'
import { listSegments, type SkippedFile } from './segmentStore'

export interface HistoryDeps {
  /** The switch. Asked before anything else, on every read. */
  on: () => boolean
  /** The folder segments live in. */
  dir: () => string
  /** The attached character's id (`characterId`) and live log, or null. */
  attached: () => { character: string; logPath: string } | null
  /** Up to `n` bytes from the start of `path`, or null when it cannot be read. */
  readHead: (path: string, n: number) => Buffer | null
  note: (line: string) => void
}

interface Context {
  key: string
  shown: Segment[]
  held: Held[]
  skipped: SkippedFile[]
}

export interface HistoryStatus {
  shown: string[]
  held: Held[]
  skipped: SkippedFile[]
}

function sha256(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex')
}

function firstStamp(head: Buffer): string | null {
  for (const line of head.toString('latin1').split('\n')) {
    const key = logStampKey(line)
    if (key !== null) return key
  }
  return null
}

export interface HistoryMerge {
  mergeHistory: (moduleId: string, seq: number, state: unknown) => unknown
  status: () => HistoryStatus | null
  noteSealedThisAttach: (id: string) => void
  forgetHistoryContext: () => void
}

export function createHistoryMerge(deps: HistoryDeps): HistoryMerge {
  let ctx: Context | null = null
  const sealedThisAttach = new Set<string>()
  const cache = new Map<string, { seq: number; state: unknown }>()

  function build(character: string, logPath: string): Context {
    const listing = listSegments(deps.dir(), character)
    const head = deps.readHead(logPath, HEAD_BYTES)
    // AN UNREADABLE LIVE LOG DECIDES NOTHING. Without its head there is no proof the engine's
    // memory does not already hold a segment's lines, so nothing is shown this launch.
    if (head === null) {
      deps.note('log archive: the live log could not be read; archived history is not shown')
      return { key: `${character}|${logPath}`, shown: [], held: [], skipped: listing.skipped }
    }
    const { shown, held } = eligibleSegments({
      segments: listing.segments,
      character,
      live: {
        headSha256: (n) => (head.length < n ? null : sha256(head.subarray(0, n))),
        firstStamp: firstStamp(head)
      },
      sealedThisAttach
    })
    for (const s of listing.skipped) deps.note(`log archive: skipped ${s.file}: ${s.reason}`)
    for (const h of held) deps.note(`log archive: holding back ${h.id}: ${h.reason}`)
    return { key: `${character}|${logPath}`, shown, held, skipped: listing.skipped }
  }

  function context(): Context | null {
    const a = deps.attached()
    if (a === null) return null
    const key = `${a.character}|${a.logPath}`
    if (ctx?.key !== key) {
      ctx = build(a.character, a.logPath)
      cache.clear()
    }
    return ctx
  }

  function mergeHistory(moduleId: string, seq: number, state: unknown): unknown {
    if (!hasMergeRule(moduleId) || !deps.on()) return state
    const c = context()
    if (c === null || c.shown.length === 0) return state
    const hit = cache.get(moduleId)
    if (hit?.seq === seq) return hit.state
    const archived = c.shown.flatMap((s) => (Object.hasOwn(s.modules, moduleId) ? [s.modules[moduleId].state] : []))
    const merged = mergeModule(moduleId, archived, state).state
    cache.set(moduleId, { seq, state: merged })
    return merged
  }

  return {
    mergeHistory,
    status: () => (ctx === null ? null : { shown: ctx.shown.map((s) => s.id), held: ctx.held, skipped: ctx.skipped }),
    noteSealedThisAttach: (id) => {
      sealedThisAttach.add(id)
      ctx = null
      cache.clear()
    },
    forgetHistoryContext: () => {
      ctx = null
      cache.clear()
    }
  }
}

/** Up to `n` bytes from the start of a file, read without holding it. Null when unreadable. */
export function readHeadBytes(path: string, n: number): Buffer | null {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(n)
    const got = readSync(fd, buf, 0, n, 0)
    return buf.subarray(0, got)
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}
