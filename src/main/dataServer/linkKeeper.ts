// linkKeeper.ts - KEEPS MAIN'S ONE CONNECTION TO THE ENGINE OPEN (fork #9).
//
// The supervisor proves an engine healthy and hands over its port; `engineClientHost.ts` then
// opened ONE connection and never another. A connect that failed, or a connection that dropped
// while the engine was fine, left every panel on "Reading log..." for the life of that launch.
//
// This file is the retry, and its caps. It opens the connection, hands it over (`adopt`), and when
// told the connection was lost it opens another, without anybody re-reading the log.
//
// RECOVERY NEVER LOOPS BLINDLY, so every number below is a cap:
//
//   * a retry waits its turn on the ladder (0.5, 1, 2, 5, 15 s) and there are at most 5 in a row;
//   * a connection that stays up 60 s clears that count, so one drop a day never adds up;
//   * at most 20 retries per engine launch, whatever the count in a row says;
//   * a loss that a retry cannot change (the engine speaks another protocol version, or refused
//     the token) is not retried at all;
//   * a person asking (`tryNow`) always gets one attempt, and a fresh count in a row.
//
// A LEAF WITH ITS DEPENDENCIES HANDED IN, like `foldWait.ts` and for its reason: every case that
// matters is a failure nobody can stage against a real socket, so the connect, the timer and the
// clock are arguments and `tests/dataServerLinkKeeper.test.mts` drives all of it in a millisecond.

import type { LogReadLink } from '../../shared/logReadReport'

/** The wait before each retry in a row. Its length is how many retries there are in a row. */
export const LINK_RETRY_DELAYS_MS: readonly number[] = [500, 1_000, 2_000, 5_000, 15_000]
/** A connection that has been up this long clears the count in a row. */
export const LINK_STABLE_MS = 60_000
/** The most retries one engine launch gets, in a row or not. */
export const LINK_MAX_RETRIES = 20

/** The loss codes a retry cannot change: a wrong build, a refused token. */
const FATAL_CODES: readonly string[] = ['protocolMismatch', 'unauthorized']

/** What the report reads (`shared/logReadReport.ts` states each field). */
export type LinkFacts = LogReadLink

export interface LinkKeeperDeps<C extends { close(): void }> {
  /** Open one connection. Rejects when it cannot. */
  readonly connect: () => Promise<C>
  /** Take a connection that opened. */
  readonly adopt: (channel: C) => void
  /** Call `run` after `ms`; the returned function cancels it. */
  readonly timer: (run: () => void, ms: number) => () => void
  readonly now: () => number
  /** The dev log. */
  readonly note: (line: string) => void
}

export interface LinkKeeper {
  /** Open the first connection. Once per keeper. */
  start(): void
  /** The adopted connection failed. `error` is why (the client's `failure`). */
  lost(error: unknown): void
  /** A person asked: connect now, with a fresh count in a row. Nothing while a connection is up. */
  tryNow(): void
  /** Cancel everything. A connection that opens afterwards is closed, not adopted. */
  stop(): void
  facts(): LinkFacts
}

type Phase = 'idle' | 'connecting' | 'up' | 'waiting' | 'gaveUp' | 'stopped'

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? `${code}: ${error.message}` : error.message
  }
  return typeof error === 'string' ? error : 'the connection was lost'
}

function isFatal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && FATAL_CODES.includes(code)
}

interface LinkState {
  phase: Phase
  /** Retries in a row. */
  tries: number
  /** Retries since `start`. */
  total: number
  nextAt: number | null
  lastReason: string | null
  everConnected: boolean
  cancelRetry: (() => void) | null
  cancelStable: (() => void) | null
}

export function createLinkKeeper<C extends { close(): void }>(deps: LinkKeeperDeps<C>): LinkKeeper {
  const s: LinkState = {
    phase: 'idle',
    tries: 0,
    total: 0,
    nextAt: null,
    lastReason: null,
    everConnected: false,
    cancelRetry: null,
    cancelStable: null
  }

  const cancelTimers = (): void => {
    s.cancelRetry?.()
    s.cancelStable?.()
    s.cancelRetry = null
    s.cancelStable = null
    s.nextAt = null
  }

  const giveUp = (why: string): void => {
    s.phase = 'gaveUp'
    deps.note(`data-server link: not reconnecting (${why}): ${s.lastReason ?? 'no reason given'}`)
  }

  /** The connection is not there, for `reason`: wait the next rung and try again, or give up. */
  const retryOrGiveUp = (reason: string): void => {
    s.lastReason = reason
    if (s.tries >= LINK_RETRY_DELAYS_MS.length) {
      giveUp(`gave up after ${String(s.tries)} tries`)
      return
    }
    if (s.total >= LINK_MAX_RETRIES) {
      giveUp(`${String(s.total)} retries since the engine started`)
      return
    }
    const wait = LINK_RETRY_DELAYS_MS[s.tries]
    s.tries += 1
    s.total += 1
    s.phase = 'waiting'
    s.nextAt = deps.now() + wait
    deps.note(
      `data-server link: connecting again in ${String(wait)} ms ` +
        `(try ${String(s.tries)} of ${String(LINK_RETRY_DELAYS_MS.length)}): ${reason}`
    )
    s.cancelRetry = deps.timer(attempt, wait)
  }

  const opened = (channel: C): void => {
    if (s.phase !== 'connecting') {
      channel.close()
      return
    }
    s.phase = 'up'
    s.everConnected = true
    s.cancelStable = deps.timer(() => {
      s.cancelStable = null
      s.tries = 0
    }, LINK_STABLE_MS)
    try {
      deps.adopt(channel)
    } catch (err) {
      // Nobody took it, so nobody will report it lost.
      channel.close()
      cancelTimers()
      retryOrGiveUp(reasonOf(err))
    }
  }

  function attempt(): void {
    cancelTimers()
    s.phase = 'connecting'
    deps.connect().then(opened, (err: unknown) => {
      if (s.phase === 'connecting') retryOrGiveUp(reasonOf(err))
    })
  }

  return {
    start(): void {
      if (s.phase === 'idle') attempt()
    },
    lost(error): void {
      // Only a connection that is up can be lost: with a retry pending, a connect in flight or the
      // keeper stopped, the news is about a connection this file has already replaced.
      if (s.phase !== 'up') return
      cancelTimers()
      if (isFatal(error)) {
        s.lastReason = reasonOf(error)
        giveUp('a retry cannot change this')
        return
      }
      retryOrGiveUp(reasonOf(error))
    },
    tryNow(): void {
      if (s.phase !== 'waiting' && s.phase !== 'gaveUp') return
      s.tries = 0
      attempt()
    },
    stop(): void {
      cancelTimers()
      s.phase = 'stopped'
    },
    facts: (): LinkFacts => ({
      tries: s.tries,
      of: LINK_RETRY_DELAYS_MS.length,
      nextAt: s.nextAt,
      gaveUp: s.phase === 'gaveUp',
      lastReason: s.lastReason,
      everConnected: s.everConnected
    })
  }
}
