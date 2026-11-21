// "Is the game running", asked before a write to a game file (fork #11, P2): the decision made
// from the scan's answer, and the one-shot thread that asks. No process is started anywhere here
// (tests/noChildProcess.test.mts is the guard).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { gameRunningAnswer, isGameRunningNow } from '../src/main/macros/gameRunning'
import type { GameRunningJob } from '../src/main/macros/gameRunningWorker'

const NOT_WINDOWS = process.platform !== 'win32' && 'the scan is user32/kernel32/psapi'
const WORKER_TS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main', 'macros', 'gameRunningWorker.ts')

/** A stand-in thread running the given code, and the job it was started with. */
function standIn(code: string): { start: (job: GameRunningJob) => Worker; jobs: GameRunningJob[]; workers: Worker[] } {
  const jobs: GameRunningJob[] = []
  const workers: Worker[] = []
  const start = (job: GameRunningJob): Worker => {
    jobs.push(job)
    const worker = new Worker(`const { parentPort } = require('node:worker_threads');${code}`, { eval: true })
    workers.push(worker)
    return worker
  }
  return { start, jobs, workers }
}

const ask = (code: string, timeoutMs = 30_000): Promise<boolean> => isGameRunningNow('C:\\Games\\EQ', { platform: 'win32', timeoutMs, start: standIn(code).start })

test('the answer: 1 is running, 0 is not, anything else cannot tell', () => {
  assert.equal(gameRunningAnswer({ running: 1 }), 'running')
  assert.equal(gameRunningAnswer({ running: 0 }), 'not-running')
  for (const reply of [{ running: -1 }, { running: 2 }, { running: '0' }, { running: true }, { error: 'no psapi' }, {}, null, undefined, 0, 1, 'running']) {
    assert.equal(gameRunningAnswer(reply), 'unknown')
  }
})

test('the thread says running or not, and is handed the game folder with its separator', async () => {
  assert.equal(await ask('parentPort.postMessage({ running: 1 })'), true)
  assert.equal(await ask('parentPort.postMessage({ running: 0 })'), false)
  const seen = standIn('parentPort.postMessage({ running: 0 })')
  await isGameRunningNow('C:\\Games\\EQ', { platform: 'win32', start: seen.start })
  assert.deepEqual(seen.jobs, [{ eqRootWithSep: 'C:\\Games\\EQ\\' }])
})

test('cannot tell: a failed scan, a load failure, a thread that throws, ends silent, or will not start', async () => {
  await assert.rejects(ask('parentPort.postMessage({ running: -1 })'), /the process scan failed/)
  await assert.rejects(ask('parentPort.postMessage({ error: "no psapi" })'), /would not load: no psapi/)
  await assert.rejects(ask('parentPort.postMessage("1")'), /the process scan failed/)
  await assert.rejects(ask('throw new Error("boom")'), /thread failed: boom/)
  await assert.rejects(ask(''), /ended without an answer/)
  const refuses = (): Worker => {
    throw new Error('no threads left')
  }
  await assert.rejects(isGameRunningNow('C:\\Games\\EQ', { platform: 'win32', start: refuses }), /no threads left/)
})

test('not Windows: cannot tell, and no thread is started', async () => {
  const seen = standIn('parentPort.postMessage({ running: 0 })')
  await assert.rejects(isGameRunningNow('/games/eq', { platform: 'linux', start: seen.start }), /Windows only/)
  assert.equal(seen.jobs.length, 0)
})

test('a thread that is slow: cannot tell, and it is left to end by itself, never terminated', async () => {
  const seen = standIn('setTimeout(() => parentPort.postMessage({ running: 0 }), 400)')
  await assert.rejects(isGameRunningNow('C:\\Games\\EQ', { platform: 'win32', timeoutMs: 40, start: seen.start }), /no answer in time/)
  // The thread no longer holds the process open, so the wait for its end needs something that does.
  const hold = setInterval(() => undefined, 50)
  // A terminated thread ends with code 1; one that ran to its end, with 0.
  const [code] = (await once(seen.workers[0], 'exit')) as [number]
  clearInterval(hold)
  assert.equal(code, 0)
})

test('the real thread answers on this machine and ends by itself', { skip: NOT_WINDOWS }, async () => {
  const jobs: GameRunningJob[] = []
  const exits: Promise<unknown[]>[] = []
  const start = (job: GameRunningJob): Worker => {
    jobs.push(job)
    // The entry is TypeScript, so the thread needs the loader the suite runs under (presenceWorker.test.mts).
    const worker = new Worker(WORKER_TS, { workerData: job, execArgv: ['--import', 'tsx'] })
    exits.push(once(worker, 'exit'))
    return worker
  }
  assert.equal(typeof (await isGameRunningNow('C:/Games/EQ', { timeoutMs: 60_000, start })), 'boolean')
  // The folder reaches the scan in Windows' own spelling, whichever slashes it was given in.
  assert.deepEqual(jobs, [{ eqRootWithSep: 'C:\\Games\\EQ\\' }])
  assert.deepEqual(await exits[0], [0])
})
