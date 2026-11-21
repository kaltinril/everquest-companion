// feedback/slice.ts — a read-only, byte-bounded read of the end of the live EverQuest log.
//
// ============================ THE ONE RULE ============================
// THE GAME LOG IS OPENED READ-ONLY AND IS NEVER WRITTEN TO. `open(path, 'r')`, one `read()`
// of the tail, `close()`. Not `'a'`, not `'w'`, not `'r+'`, not ever. The user is PLAYING
// while this runs; the log is the game's file and the app is a guest in it.
// ======================================================================
//
// WHAT IS LEFT HERE (2026-11-20). This module built the scrubbed log slice a feedback report
// attached. Feedback reports are removed (players report through GitHub issues); the tail read
// and the line-timestamp reader stay because the factions evidence reader
// (main/factionsEvidence.ts) uses them. The file keeps its old path so that importer does not
// move.
//
// This module is deliberately Electron-free and takes the log path as a PARAMETER.

import { open } from 'node:fs/promises'
// REUSE, never a second timestamp parser. The log's `[Sat Aug 01 13:00:28 2026]` prefix is
// parsed by exactly one function in this repo, and this is it.
import { parseEqTimestamp } from '../../shared/spellKey'

/** The `[Day Mon DD HH:MM:SS YYYY]` prefix. Same shape the parser's LINE_RE matches. */
const PREFIX_RE = /^\[([^\]]+)\]/

/** Epoch millis for one raw line, or 0 when it carries no parseable prefix. */
export function lineTs(line: string): number {
  const m = PREFIX_RE.exec(line)
  return m === null ? 0 : parseEqTimestamp(m[1])
}

/**
 * Read at most the last `cap` bytes of `path`, READ-ONLY.
 *
 * Returns null when the file is missing or empty. `truncated` says whether we started
 * mid-file, in which case the first line is a fragment and the caller drops it.
 */
export async function readTail(
  path: string,
  cap: number
): Promise<{ text: string; truncated: boolean } | null> {
  // 'r' — READ-ONLY. See the module header. This is the only fs call this module makes.
  const fh = await open(path, 'r')
  try {
    const { size } = await fh.stat()
    if (size <= 0) return null
    const start = size > cap ? size - cap : 0
    const length = size - start
    const buf = Buffer.allocUnsafe(length)
    const { bytesRead } = await fh.read(buf, 0, length, start)
    return { text: buf.subarray(0, bytesRead).toString('utf8'), truncated: start > 0 }
  } finally {
    await fh.close()
  }
}
