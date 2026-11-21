// macros/gameRunning.ts — "is the game running right now", asked once before a write to a game
// file. The presence watcher cannot answer it: it runs only while a feature needs it and holds a
// value up to 5 s old (presence.ts). So the same in-process scan is run once, on the click, on a
// one-shot worker thread (gameRunningWorker.ts). No process is started.

import { join, normalize } from 'node:path'
import { Worker } from 'node:worker_threads'
import { eqRootPrefix } from '../presenceProtocol'
import type { GameRunningJob } from './gameRunningWorker'

export type GameRunningAnswer = 'running' | 'not-running' | 'unknown'

/**
 * What the worker's reply says. It comes from another thread, so it is read as input: only a
 * plain 1 or 0 is an answer; -1 (the scan failed), an error, or anything else is "cannot tell".
 */
export function gameRunningAnswer(reply: unknown): GameRunningAnswer {
  const running = typeof reply === 'object' && reply !== null ? (reply as { running?: unknown }).running : undefined
  if (running === 1) return 'running'
  return running === 0 ? 'not-running' : 'unknown'
}

const TIMEOUT_MS = 8000

export interface GameRunningOptions {
  timeoutMs?: number
  platform?: string
  /** Starts the one-shot thread; a test passes its own. */
  start?: (job: GameRunningJob) => Worker
}

/** The bundled worker, emitted beside index.js (electron.vite.config.ts, `gameRunningWorker`). */
function startWorker(job: GameRunningJob): Worker {
  return new Worker(join(__dirname, 'gameRunningWorker.js'), { workerData: job })
}

/**
 * True when an EverQuest client is running: any `eqgame.exe`, or any program whose file sits
 * under `gameFolder` (the launcher too). REJECTS when it cannot tell (not Windows, the thread
 * would not start, failed, gave no answer in time, or the scan itself failed): the caller then
 * refuses the write.
 */
export function isGameRunningNow(gameFolder: string, options: GameRunningOptions = {}): Promise<boolean> {
  const { timeoutMs = TIMEOUT_MS, platform = process.platform, start = startWorker } = options
  if (platform !== 'win32') return Promise.reject(new Error('the process scan is Windows only'))
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = start({ eqRootWithSep: eqRootPrefix(normalize(gameFolder)) })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }
    let settled = false
    const finish = (answer: GameRunningAnswer, why: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (answer === 'unknown') reject(new Error(why))
      else resolve(answer === 'running')
    }
    const timer = setTimeout(() => {
      // NEVER terminate(): the thread may be inside a native call, and that aborts the process.
      // It is left to finish and end by itself, without holding the app open.
      worker.unref()
      finish('unknown', 'the process scan gave no answer in time')
    }, timeoutMs)
    worker.on('message', (reply: unknown) => {
      const error = typeof reply === 'object' && reply !== null ? (reply as { error?: unknown }).error : undefined
      finish(gameRunningAnswer(reply), typeof error === 'string' ? `the process scan would not load: ${error}` : 'the process scan failed')
    })
    worker.on('error', (err: unknown) => {
      finish('unknown', `the process scan thread failed: ${err instanceof Error ? err.message : String(err)}`)
    })
    worker.on('exit', () => {
      finish('unknown', 'the process scan thread ended without an answer')
    })
  })
}
