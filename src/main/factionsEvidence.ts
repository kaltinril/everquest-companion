// factionsEvidence.ts — read the LOG's faction receipts since the dump was written, folded.
//
// The RULES all live in shared/factionLog.ts (pure, tested); this file is the fs dozen lines:
// one read-only capped tail read (feedback/slice.ts's own readTail — reuse, never a second one),
// a timestamp window from the dump's mtime, and the fold. It runs on demand (an IPC ask when the
// Factions tab wants it), never on a timer — the engine owns the live tail, and this is a
// bounded second read of a file main already owns the path to, the feedback slice's exact
// arrangement.
//
// THE WINDOW IS THE TAIL'S LAST 32 MB. A log that has grown further than that since the dump
// leaves the unpinned sums incomplete, and the report SAYS so (`complete: false`) rather than
// presenting a partial sum as a total; cap-pinned factions stay exact regardless (the shared
// module's header carries that argument). 32 MB covers weeks of ordinary play — the measured log
// holds its whole 21k faction lines in well under that.

import { lineTs, readTail } from './feedback/slice'
import {
  foldFactionEvidence,
  parseFactionLogLine,
  type FactionEvidenceReport,
  type FactionLogEvent
} from '../shared/factionLog'

const TAIL_CAP_BYTES = 32 * 1024 * 1024

/** The cheap pre-filter: every faction receipt line carries this phrase. */
const MARKER = 'faction standing with'

/**
 * Walk the tail's lines: collect the faction events newer than `sinceMs`, and note the first
 * parseable timestamp (the window's start — what decides completeness). Split out of the reader
 * below at the measured complexity ceiling; this is the loop, that is the fs.
 */
function collectEvents(
  raw: readonly string[],
  from: number,
  sinceMs: number
): { events: FactionLogEvent[]; windowStartTs: number } {
  let windowStartTs = 0
  const events: FactionLogEvent[] = []
  for (let i = from; i < raw.length; i++) {
    const line = raw[i]
    if (windowStartTs === 0) {
      const ts = lineTs(line)
      if (ts > 0) windowStartTs = ts
    }
    if (!line.includes(MARKER) || lineTs(line) <= sinceMs) continue
    const ev = parseFactionLogLine(line)
    if (ev !== null) events.push(ev)
  }
  return { events, windowStartTs }
}

/**
 * Fold the log's faction lines newer than `sinceMs`. Null when the log cannot be read at all —
 * the tab then simply shows the dump as-is, which is what it showed before this existed.
 */
export async function readFactionEvidence(
  logPath: string,
  sinceMs: number
): Promise<FactionEvidenceReport | null> {
  let tail: { text: string; truncated: boolean } | null
  try {
    tail = await readTail(logPath, TAIL_CAP_BYTES)
  } catch {
    return null
  }
  if (tail === null) return null

  const raw = tail.text.split(/\r?\n/)
  // A truncated read starts mid-line; the fragment cannot be trusted to parse.
  const from = tail.truncated && raw.length > 0 ? 1 : 0
  const { events, windowStartTs } = collectEvents(raw, from, sinceMs)
  // Complete when the window reaches back to the dump: an untruncated read always does; a
  // truncated one does only if its first readable line is no newer than the dump.
  const complete = !tail.truncated || (windowStartTs !== 0 && windowStartTs <= sinceMs)
  return { complete, sinceMs, rows: foldFactionEvidence(events) }
}
