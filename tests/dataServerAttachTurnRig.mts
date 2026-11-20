// A fake engine and a small host around `src/main/dataServer/attachTurn.ts`, for
// `dataServerAttachTurn.test.mts` and `dataServerAttachTurnOrder.test.mts` (fork #9, phase R4).
//
// THE ENGINE takes an attach the moment it is asked (as the real one does: accepted before the
// file is opened) and answers health from what it holds. A case scripts the exceptions: a reply
// that is held back, an attach nobody answers, a health answer about another log.
//
// THE HOST is the part of `engineClientHost.ts` a turn touches: the turn counter, the log main
// believes the engine is on, and the log it recorded as live. That file imports Electron and
// cannot be loaded here.

import { EngineError } from '../src/shared/dataServer/client'
import { runAttachTurn } from '../src/main/dataServer/attachTurn'
import type { FoldHealth } from '../src/main/dataServer/foldWait'

export const LOG_A = 'C:\\EverQuest\\Logs\\eqlog_Alpha_test.txt'
export const LOG_B = 'C:\\EverQuest\\Logs\\eqlog_Bravo_test.txt'

export interface AttachAnswer {
  readonly epoch: number
  readonly accepted: boolean
}

/** A promise the case settles by hand, to put two replies in a chosen order. */
export interface Held<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(err: unknown): void
}

export function held<T>(): Held<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (err: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Let every promise that can settle do so. */
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

export function timedOut(op: string): EngineError {
  return new EngineError('timeout', `the engine did not answer ${op} in time`, 7)
}

/** What one attach does, when a case wants something other than "taken and answered". */
export type AttachScript =
  /** Taken; the reply comes when the case says. */
  | { readonly reply: Held<AttachAnswer> }
  /** Rejected with this. `taken` says whether the engine took the attach all the same. */
  | { readonly fail: unknown; readonly taken: boolean }
  /** Taken, and it lost to a later attach. */
  | { readonly lost: true }

export interface Rig {
  /** The log the fake engine is on, and what it says its status is. */
  engineLog: string | null
  engineStatus: string
  /** Every attach the engine was sent, in order. */
  readonly attaches: { logPath: string; stateDir?: string }[]
  /** Scripts for the next attaches, first in first out. With none, the attach is taken. */
  readonly attachScripts: AttachScript[]
  /** Scripts for the next health asks. With none, the engine answers from what it holds. */
  readonly healthScripts: (FoldHealth | Error | Held<FoldHealth>)[]
  /** When set, the next turn's defines wait on it. */
  definesGate: Held<undefined> | null
  healthAsks: number
  /** The log main believes the engine is on. */
  attached: string | null
  /** The log each live answer was recorded on, in order. */
  readonly liveOn: (string | null)[]
  /** Every health answer the host was handed. */
  readonly saw: FoldHealth[]
  readonly errors: { detail: string; code: string | null }[]
  readonly failed: [string, string][]
  readonly notes: string[]
  readonly rests: number[]
  /** What happened, in order: `defines`, `stateDir`, `attaching`, `attach <log>`, `taken`. */
  readonly order: string[]
  /** The state directory the handover answers, or undefined for a launch that sends none. */
  stateDir: string | undefined
  /** Start a turn for `target`: the host's `bumpGen` and `attachAndProbe`. */
  turn(target: string): Promise<void>
}

function answerFor(r: Rig): FoldHealth {
  const mark = r.engineLog === null ? undefined : { log: r.engineLog, offset: 4_096 }
  return { status: r.engineStatus, epoch: r.attaches.length, events: 40, mark }
}

function takeAttach(r: Rig, logPath: string): void {
  r.engineLog = logPath
  // Read to the end at once, unless a case says otherwise: a wait must be able to finish.
  r.engineStatus = 'live'
}

function attachOf(r: Rig, params: { logPath: string; stateDir?: string }): Promise<AttachAnswer> {
  r.order.push(`attach ${params.logPath}`)
  r.attaches.push(params.stateDir === undefined ? { logPath: params.logPath } : { logPath: params.logPath, stateDir: params.stateDir })
  const script = r.attachScripts.shift()
  const answer = { epoch: r.attaches.length, accepted: true }
  if (script === undefined) {
    takeAttach(r, params.logPath)
    return Promise.resolve(answer)
  }
  if ('fail' in script) {
    if (script.taken) takeAttach(r, params.logPath)
    return Promise.reject(script.fail instanceof Error ? script.fail : new Error(String(script.fail)))
  }
  takeAttach(r, params.logPath)
  if ('lost' in script) return Promise.resolve({ ...answer, accepted: false })
  return script.reply.promise
}

function healthOf(r: Rig): Promise<FoldHealth> {
  r.healthAsks += 1
  const script = r.healthScripts.shift()
  if (script === undefined) return Promise.resolve(answerFor(r))
  if (script instanceof Error) return Promise.reject(script)
  return 'promise' in script ? script.promise : Promise.resolve(script)
}

export function rig(): Rig {
  let gen = 0
  const r: Rig = {
    engineLog: null,
    engineStatus: 'idle',
    attaches: [],
    attachScripts: [],
    healthScripts: [],
    definesGate: null,
    healthAsks: 0,
    attached: null,
    liveOn: [],
    saw: [],
    errors: [],
    failed: [],
    notes: [],
    rests: [],
    order: [],
    stateDir: 'C:\\Users\\tester\\AppData\\Roaming\\app',
    turn(target) {
      gen += 1
      const mine = gen
      const gate = r.definesGate
      r.definesGate = null
      return runAttachTurn({
        target,
        mine: () => gen === mine,
        attach: (params) => attachOf(r, params),
        health: () => healthOf(r),
        defines: async () => {
          r.order.push('defines')
          if (gate !== null) await gate.promise
        },
        getAttached: () => r.attached,
        setAttached: (logPath) => {
          r.attached = logPath
        },
        stateDir: () => {
          r.order.push('stateDir')
          return r.stateDir
        },
        clock: () => ({ utcOffsetMin: 0 }),
        attaching: () => {
          r.order.push('attaching')
          return () => r.order.push('taken')
        },
        rest: (ms) => {
          r.rests.push(ms)
          return Promise.resolve()
        },
        note: (line) => r.notes.push(line),
        noteError: (detail, code) => r.errors.push({ detail, code }),
        saw: (health) => {
          r.saw.push(health)
          // The host's go-live edge: `engineLiveOn = l.attachedTo`.
          if (health.status === 'live') r.liveOn.push(r.attached)
        },
        logSize: () => null,
        failed: (why, detail) => r.failed.push([why, detail])
      })
    }
  }
  return r
}
