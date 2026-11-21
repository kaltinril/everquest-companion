// macros/gameRunningWorker.ts — "is an EverQuest client running", asked ONCE, on its own thread.
// The answer is presenceNative.ts's in-process scan (EnumProcesses + image paths): no process is
// started. A thread, because main never loads koffi (presenceNative.ts: a failure to load must
// not take the app's own thread with it).
//
// It speaks exactly once and ends by itself. Nothing may terminate() it: a terminate that lands
// inside a native call aborts the whole process (tests/presenceWorker.test.mts).

import { parentPort, workerData } from 'node:worker_threads'
import { loadPresenceNative } from '../presenceNative'

export interface GameRunningJob {
  /** The game folder with its trailing separator (presenceProtocol.ts `eqRootPrefix`), or ''. */
  eqRootWithSep: string
}

export interface GameRunningReply {
  /** presenceNative's own answer: 1 a client is running, 0 none is, -1 the scan itself failed. */
  running?: number
  /** The native layer would not load. */
  error?: string
}

const job = workerData as GameRunningJob
let reply: GameRunningReply
try {
  reply = { running: loadPresenceNative().eqRunning(job.eqRootWithSep) }
} catch (err) {
  reply = { error: err instanceof Error ? err.message : String(err) }
}
parentPort?.postMessage(reply)
// Closing the port is what lets the thread end (presenceWorker.ts `stop`); the reply still arrives.
parentPort?.close()
