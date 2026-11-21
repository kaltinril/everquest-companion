// macros/gameRunning.ts — "is the game running right now", asked once before a write to a game
// file. The presence watcher cannot answer it: it runs only while a feature needs it and holds a
// value up to 5 s old (presence.ts). So Windows' own process list is read, on the click.

import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { EQ_CLIENT_EXES } from '../presenceProtocol'

const ROW = /^"([^"]*)","(\d+)"/

/**
 * Whether `tasklist /FO CSV /NH` output lists the game. Null when it cannot be trusted: this
 * process is not in it, so the list is cut short, empty, or not a list at all.
 */
export function gameInTaskList(csv: string, ownPid: number): boolean | null {
  let sawSelf = false
  for (const line of csv.split(/\r?\n/)) {
    const row = ROW.exec(line)
    if (row === null) continue
    if (EQ_CLIENT_EXES.has(row[1].toLowerCase())) return true
    if (Number(row[2]) === ownPid) sawSelf = true
  }
  return sawSelf ? false : null
}

const TIMEOUT_MS = 8000

/**
 * True when an EverQuest client is running. REJECTS when it cannot tell (not Windows, the list
 * would not run, timed out, or did not hold this process): the caller refuses the write.
 */
export function isGameRunningNow(timeoutMs = TIMEOUT_MS): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.reject(new Error('the process list is read on Windows only'))
  // The full path: no PATH lookup, no shell, no argument from outside.
  const exe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tasklist.exe')
  return new Promise((resolve, reject) => {
    execFile(exe, ['/FO', 'CSV', '/NH'], { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const seen = err === null ? gameInTaskList(stdout, process.pid) : null
      if (seen === null) reject(err ?? new Error('the process list did not hold this process'))
      else resolve(seen)
    })
  })
}
