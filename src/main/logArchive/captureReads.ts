// main/logArchive/captureReads.ts — WHAT A FAILED READ MEANS TO A CAPTURE (fork #9).
//
// A capture asks the engine for every module and for the fight list. Each of those reads can end
// three ways, and the first two used to be told apart from the third by nobody:
//
//   * the engine has NOTHING of that name. Its own answer for that is `notFound` (engined ops.rs).
//     The module is left out of the segment, as it always was.
//   * the engine ANSWERED. The module is kept.
//   * the read FAILED: the reply was too large to read, the engine did not answer in time, the
//     connection dropped. This used to be read as "nothing of that name": the module was left
//     out, the capture came back good, and the log was moved aside without it. Now it refuses the
//     capture, in words the card prints, and nothing is moved.
//
// No Electron and no connection of its own (the request is handed in), so
// tests/logArchiveCaptureReads.test.mts drives every case, the product's two reads included.

import { EngineError, isTooLarge, type ParamsFor, type RequestOp, type ResultFor } from '../../shared/dataServer/ops'
import type { SegmentSummary } from '../../shared/combat'
import { capturedState } from '../../shared/logArchive/capturedShape'
import { ALL_FIGHTS, capturedFights } from '../../shared/logArchive/mergeFights'
import type { SegmentModule } from '../../shared/logArchive/segment'

/** One read of a capture failed: `what` names it for the player, `cause` is the rejection. */
export class CaptureReadError extends Error {
  constructor(
    readonly what: string,
    readonly cause: unknown
  ) {
    super(`the read of ${what} failed`)
    this.name = 'CaptureReadError'
  }
}

/** `engineClientHost.ts engineRequest`, as a capture's reads use it. */
export type CaptureRequest = <O extends RequestOp>(op: O, params: ParamsFor<O>) => Promise<ResultFor<O>>

/** `CaptureDeps.snapshot` and `fights` (capture.ts). */
export interface CaptureReads {
  snapshot: (module: string) => Promise<SegmentModule | null>
  fights: () => Promise<SegmentSummary[] | null>
}

/**
 * A capture's two reads of the app's engine. A READ THAT FAILS REJECTS, and so does an answer
 * about another module: `captureRead` below decides what a rejection means. Both used to swallow
 * every failure into null, which reads as "the engine has none" and let a log be moved aside with
 * a module missing. Never catch here.
 */
export function engineCaptureReads(request: CaptureRequest): CaptureReads {
  /** Another module's state, for a capture's put-back (capturedShape.ts). */
  const stateOf = async (module: string): Promise<unknown> => {
    const r = await request('module.snapshot', { module })
    return r.module === module ? r.state : null
  }
  return {
    snapshot: async (module) => {
      const r = await request('module.snapshot', { module })
      if (r.module !== module) throw new Error(`the engine answered about ${r.module}, not ${module}`)
      // A segment keeps what the engine serves apart (gaps' proof lines, buffs' overlay) in place.
      return { seq: r.seq, state: await capturedState(module, r.state, stateOf) }
    },
    fights: async () => {
      const r = await request('combat.snapshot', { opts: { maxSegments: ALL_FIGHTS } })
      return capturedFights((r.snapshot as { segments?: unknown }).segments)
    }
  }
}

/** The engine's own answer for a module, or an op, it does not carry. */
function engineHasNone(err: unknown): boolean {
  return err instanceof EngineError && err.code === 'notFound'
}

/**
 * One read of a capture: its answer, null when the engine has nothing of that name, and a
 * `CaptureReadError` naming the read for every other rejection.
 */
export async function captureRead<T>(what: string, read: Promise<T | null>): Promise<T | null> {
  try {
    return await read
  } catch (cause) {
    if (engineHasNone(cause)) return null
    throw new CaptureReadError(what, cause)
  }
}

/**
 * The refusal for a failed read, as `captureSegment` returns it. A reply too large to read gets
 * its own words, because trying again cannot help. Anything that is not a failed read is rethrown.
 */
export function readFailure(err: unknown): { ok: false; reason: string } {
  if (!(err instanceof CaptureReadError)) throw err
  if (isTooLarge(err.cause)) return { ok: false, reason: 'this log is too large to summarize in one piece' }
  return { ok: false, reason: `the data engine did not answer for ${err.what}; try again in a minute` }
}

/**
 * For the once-a-run question "which modules does this engine serve" (actions.ts
 * `learnEngineModules`): null only when the engine says it has no such module. A read that FAILED
 * says nothing about what the engine carries, so it counts as served, with no state seen.
 */
export function servedOrUnread(read: Promise<SegmentModule | null>): Promise<SegmentModule | null> {
  return read.catch((err: unknown) => (engineHasNone(err) ? null : { seq: 0, state: null }))
}
