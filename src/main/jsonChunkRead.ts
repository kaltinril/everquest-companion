// jsonChunkRead.ts — the main-thread side of `jsonChunks.ts`: receive a document in slices and
// parse them a few milliseconds at a time.
//
// THE PUMP IS THE POINT. Node drains every message a port has queued in ONE callback cycle, so a
// handler that parsed each chunk as it arrived would still parse them all in one block once the
// worker got ahead of main. Chunks are queued as strings instead (a string deserializes by
// memcpy) and a `setImmediate` loop parses them with a time budget per turn, yielding to IPC,
// timers and the renderer's asks in between. `maxSliceMs` in the result is the longest turn,
// which is what the test pins and what a perf reading would quote.

import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { JsonChunkMessage, JsonChunkPlan } from './jsonChunks'

export interface JsonChunkSink {
  head?: (head: Record<string, unknown>) => void
  /** `each` mode only: one element of the bulk array, without its rows. */
  item?: (index: number, item: Record<string, unknown>) => void
  /** A parsed slice: a partial object, or in `each` mode an array of element `index`'s rows. */
  chunk: (value: unknown, index: number | undefined) => void
}

export type JsonChunkResult =
  | { ok: true; chunks: number; maxSliceMs: number }
  | { ok: false; stage: 'read' | 'parse' | 'stale' | 'shape' | 'worker'; error: string; code?: string }

/** Where the worker entry is and how to start it; the test points it at the TypeScript source. */
export interface JsonChunkWorkerSpec {
  file: string
  execArgv?: string[]
}

/** The longest one pump turn may run before yielding (ms). */
const SLICE_BUDGET_MS = 8

/** Receive one worker's protocol run. Resolves when `done` has been applied or on the first error. */
export function receiveJsonChunks(worker: Worker, sink: JsonChunkSink): Promise<JsonChunkResult> {
  return new Promise((resolve) => {
    const queue: JsonChunkMessage[] = []
    let scheduled = false
    let settled = false
    let exited = false
    let chunks = 0
    let maxSliceMs = 0
    const finish = (result: JsonChunkResult): void => {
      if (settled) return
      settled = true
      resolve(result)
      void worker.terminate()
    }
    const apply = (m: JsonChunkMessage): void => {
      if (m.kind === 'head') sink.head?.(m.head)
      else if (m.kind === 'item') sink.item?.(m.index, m.item)
      else if (m.kind === 'chunk') {
        chunks += 1
        sink.chunk(JSON.parse(m.json), m.index)
      } else if (m.kind === 'done') finish({ ok: true, chunks, maxSliceMs })
      else finish(m.code === undefined ? { ok: false, stage: m.stage, error: m.error } : { ok: false, stage: m.stage, error: m.error, code: m.code })
    }
    const pump = (): void => {
      scheduled = false
      const started = performance.now()
      try {
        while (queue.length > 0 && !settled) {
          const next = queue.shift()
          if (next === undefined) break
          apply(next)
          if (performance.now() - started >= SLICE_BUDGET_MS) break
        }
      } catch (err) {
        finish({ ok: false, stage: 'parse', error: err instanceof Error ? err.message : String(err) })
      }
      maxSliceMs = Math.max(maxSliceMs, performance.now() - started)
      if (settled) return
      if (queue.length > 0) schedule()
      else if (exited) finish({ ok: false, stage: 'worker', error: 'the worker exited before it finished' })
    }
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      setImmediate(pump)
    }
    worker.on('message', (m: JsonChunkMessage) => {
      queue.push(m)
      schedule()
    })
    worker.on('error', (err: unknown) => {
      finish({ ok: false, stage: 'worker', error: err instanceof Error ? err.message : String(err) })
    })
    worker.on('exit', () => {
      // The queue may still hold `done`; the pump reaches it first and calls the exit early only
      // when the queue ran dry without one.
      exited = true
      schedule()
    })
  })
}

/** Read `path` on a worker and hand its bulk to `sink` in slices. Never rejects. */
export function readJsonChunked(
  path: string,
  plan: JsonChunkPlan,
  sink: JsonChunkSink,
  spec: JsonChunkWorkerSpec = { file: join(__dirname, 'jsonChunkWorker.js') }
): Promise<JsonChunkResult> {
  let worker: Worker
  try {
    worker = new Worker(spec.file, { workerData: { path, plan }, ...(spec.execArgv === undefined ? {} : { execArgv: spec.execArgv }) })
  } catch (err) {
    return Promise.resolve({ ok: false, stage: 'worker', error: err instanceof Error ? err.message : String(err) })
  }
  return receiveJsonChunks(worker, sink)
}
