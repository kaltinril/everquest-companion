// jsonChunkWorker.ts — read and parse one JSON file off the main thread, hand it back in slices.
//
// A rollup input of its own beside index.js (electron.vite.config.ts), like the other workers.
// It speaks the `jsonChunks.ts` protocol and exits. `workerData` is `{ path, plan }`; a file that
// cannot be read reports its errno `code` so main can tell "never written" (ENOENT) from a failure,
// and a file that is not JSON reports `parse` so main can run its own salvage on the raw bytes.

import { readFileSync } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'
import { chunkMessages, type JsonChunkMessage, type JsonChunkPlan } from './jsonChunks'

export interface JsonChunkWorkerInit {
  path: string
  plan: JsonChunkPlan
}

const init = workerData as JsonChunkWorkerInit
const port = parentPort

const post = (m: JsonChunkMessage): void => port?.postMessage(m)
const text = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function run(): void {
  let raw: string
  try {
    raw = readFileSync(init.path, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    post({ kind: 'error', stage: 'read', error: text(err), ...(code === undefined ? {} : { code }) })
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    post({ kind: 'error', stage: 'parse', error: text(err) })
    return
  }
  for (const m of chunkMessages(parsed, init.plan)) post(m)
}

run()
