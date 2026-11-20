// logReadActions.ts - what the status's "Try again" button does (fork #9).
//
// The button carries no payload: main runs the action of THE WAIT IT LAST PUSHED, which is the one
// the player was looking at when they pressed. `shared/logReadWords.ts LOG_READ_ACTION` says which
// action that is, and for most waits it is none (a reply too large has no button on purpose).
//
// A LEAF: the three verbs and the clock are handed in (`main/ipc/engine.ts` binds them), so
// `tests/logReadActions.test.mts` runs every wait against counters.

import type { LogReadWait } from '../shared/logReadReport'
import { LOG_READ_ACTION, type LogReadAction } from '../shared/logReadWords'

/** A second press this soon after one that did something is ignored. */
export const TRY_AGAIN_QUIET_MS = 2_000

export interface TryAgainDeps {
  /** The wait every window was last told. */
  readonly wait: () => LogReadWait
  /** Start the engine again (`engineHost.ts retryEngineSupervisor`). */
  readonly relaunch: () => void
  /** Open main's connection again (`engineClientHost.ts reconnectEngineClient`). */
  readonly reconnect: () => void
  /** Point the engine at the log again (`engineClientHost.ts reattachEngineLog`). */
  readonly reattach: () => void
  readonly now: () => number
}

/**
 * The button's handler. Answers the action it ran, or null when it ran none: the wait has no
 * action, or this press came inside `TRY_AGAIN_QUIET_MS` of one that did. A reattach re-reads the
 * whole log, so a double-click must not start it twice.
 */
export function createTryAgain(deps: TryAgainDeps): () => LogReadAction | null {
  const verbs: Readonly<Record<LogReadAction, () => void>> = {
    relaunch: deps.relaunch,
    reconnect: deps.reconnect,
    reattach: deps.reattach
  }
  let ranAt: number | null = null
  return () => {
    const action = LOG_READ_ACTION[deps.wait()]
    if (action === null) return null
    const now = deps.now()
    if (ranAt !== null && now - ranAt < TRY_AGAIN_QUIET_MS) return null
    ranAt = now
    verbs[action]()
    return action
  }
}
