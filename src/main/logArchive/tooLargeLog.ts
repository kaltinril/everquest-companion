// main/logArchive/tooLargeLog.ts - remembers that the archive refused a log as too large
// (`shared/logArchive/tooLarge.ts` has the rule).
//
// `known` is what the status report asks, and that report never waits on the disk, so it answers
// from memory and starts a look in the background the first time a log is asked about. The file
// is opened for reading only. No Electron here: `liveTooLarge.ts` binds it to the app.

import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'
import type { ArchiveRefusal } from '../../shared/logArchive/prefs'
import { HEAD_BYTES } from '../../shared/logArchive/segment'
import { refusalHolds, type LogIdentity } from '../../shared/logArchive/tooLarge'

export interface TooLargeLog {
  character: string
  logPath: string
}

export interface TooLargeDeps {
  version: () => string
  refusal: (character: string) => ArchiveRefusal | undefined
  save: (character: string, refusal: ArchiveRefusal) => void
  /** The log's identity, or null when it cannot be read. */
  readLog: (path: string) => Promise<LogIdentity | null>
  /** An answer changed: the status is composed again. */
  changed: () => void
}

export interface TooLargeMemory {
  /** Read the log and answer: is it one the archive has refused? */
  check: (log: TooLargeLog) => Promise<boolean>
  /** The last answer, from memory. The first ask for a log starts a `check` and says no. */
  known: (log: TooLargeLog | null) => boolean
  /** The archive just refused this log as too large. */
  remember: (log: TooLargeLog) => Promise<void>
}

export function createTooLargeMemory(deps: TooLargeDeps): TooLargeMemory {
  const answers = new Map<string, boolean>()
  const answer = (path: string, holds: boolean): void => {
    const was = answers.get(path) ?? false
    answers.set(path, holds)
    if (was !== holds) deps.changed()
  }
  const check = async (log: TooLargeLog): Promise<boolean> => {
    const refusal = deps.refusal(log.character)
    // No record, no read of the file.
    const holds = refusal !== undefined && refusalHolds(refusal, await deps.readLog(log.logPath), deps.version())
    answer(log.logPath, holds)
    return holds
  }
  return {
    check,
    known: (log) => {
      if (log === null) return false
      const said = answers.get(log.logPath)
      if (said !== undefined) return said
      answers.set(log.logPath, false)
      void check(log).catch(() => undefined)
      return false
    },
    remember: async (log) => {
      const identity = await deps.readLog(log.logPath)
      if (identity === null) return
      deps.save(log.character, { ...identity, appVersion: deps.version() })
      answer(log.logPath, true)
    }
  }
}

/** The log's size and the hash of its head. Read only; null when it cannot be opened or read. */
export async function readLogIdentity(path: string): Promise<LogIdentity | null> {
  try {
    const file = await open(path, 'r')
    try {
      const { size } = await file.stat()
      const head = Buffer.alloc(Math.min(HEAD_BYTES, size))
      const { bytesRead } = await file.read(head, 0, head.length, 0)
      return { bytes: size, headSha256: createHash('sha256').update(head.subarray(0, bytesRead)).digest('hex') }
    } finally {
      await file.close()
    }
  } catch {
    return null
  }
}
