// engineLink.ts - MAIN'S CONNECTION TO ONE ENGINE LAUNCH: opened, taken, heard to end, reopened
// (fork #9).
//
// `linkKeeper.ts` is the retry policy and knows nothing about a client or a transport. This file
// is the three edges that policy needs, joined to the real client:
//
//   * A CONNECT THAT FAILED is told to the host (it is what the "Reading log..." report prints)
//     and left to the keeper to retry. It used to be recorded and never tried again.
//   * A CONNECTION THAT OPENED is taken unless the LAUNCH it was opened for is over. That is the
//     connection guard. The guard used to be the turn, and the turn advances on every world
//     rebuild: a rebuild that landed during the connect closed a good channel and left the client
//     `connecting` for the life of the launch.
//   * A CONNECTION THAT ENDED is reported lost, once, with the best reason there is. The client
//     says `failed` for everything it notices itself. What it cannot notice is a CLEAN hang-up:
//     the transport reports a stream that ends inside a message and says nothing about one that
//     ends between two (`engineHealth.ts watchClose`), so that one is heard here.
//
// A LEAF: the connect, the timer, the clock and what the host does about each edge are handed in,
// so `tests/dataServerEngineLink.test.mts` drives it with a real client over hand-made channels.
// `engineClientHost.ts` cannot be loaded by a unit test at all (it imports Electron), which is why
// this is not written there.

import { EngineError, type EngineClient } from '../../shared/dataServer/client'
import { createNdjsonTransport, type ByteChannel } from '../../shared/dataServer/ndjson'
import type { ClientMessage, EngineMessage } from '../../shared/dataServer/protocol.generated'
import { watchClose } from './engineHealth'
import { createLinkKeeper, type LinkFacts } from './linkKeeper'

export interface EngineLinkDeps {
  /** The one client of this launch. Every connection is attached to it. */
  readonly client: EngineClient
  /** Open one connection to the engine. Rejects when it cannot. */
  readonly connect: () => Promise<ByteChannel>
  /** Is the launch this link belongs to still the one the app is using? */
  readonly current: () => boolean
  /** A connect failed, and why. The keeper retries it; the host only records it. */
  readonly connectFailed: (detail: string) => void
  /** A connection was taken and the hello is on its way: the host starts a fresh turn on it. */
  readonly connected: () => void
  /** The connection was lost: the host tells whoever it was serving. The keeper reopens it. */
  readonly lost: (error: unknown) => void
  /** Call `run` after `ms`; the returned function cancels it. */
  readonly timer: (run: () => void, ms: number) => () => void
  readonly now: () => number
  /** The dev log. */
  readonly note: (line: string) => void
}

export interface EngineLink {
  /** Open the first connection. */
  start(): void
  /** A person asked for the connection to be tried again. */
  tryNow(): void
  /** The launch is over: no more connects, and a connection that opens late is closed. */
  stop(): void
  facts(): LinkFacts
}

function describeErr(err: unknown): string {
  if (err instanceof EngineError) return `${err.code}: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

export function openEngineLink(deps: EngineLinkDeps): EngineLink {
  const { client } = deps
  /** The connection the client is on now. */
  let channel: ByteChannel | null = null

  const lost = (error: unknown): void => {
    if (!deps.current()) return
    deps.note(`data-server client: the connection was lost (${describeErr(error)})`)
    deps.lost(error)
    keeper.lost(error)
  }

  const adopt = (opened: ByteChannel): void => {
    if (!deps.current()) {
      opened.close()
      return
    }
    channel = opened
    const watched = watchClose(opened, () => {
      // One tick later: when the client failed this connection itself, its reason is the better
      // one and it has been reported by then. A connection since replaced is no news.
      queueMicrotask(() => {
        if (channel !== opened || client.state === 'failed') return
        lost(new EngineError('unavailable', 'the engine closed the connection'))
      })
    })
    // The hello rides this call — the client sends it the moment it has a transport, and queues
    // everything else behind the answer, so there is no handshake to sequence here.
    client.attach(createNdjsonTransport<ClientMessage, EngineMessage>(watched))
    deps.connected()
  }

  const keeper = createLinkKeeper<ByteChannel>({
    connect: async () => {
      try {
        return await deps.connect()
      } catch (err) {
        if (deps.current()) deps.connectFailed(describeErr(err))
        throw err
      }
    },
    adopt,
    timer: deps.timer,
    now: deps.now,
    note: deps.note
  })

  // ONCE, for the life of the client: every connection it is given is one of this link's.
  client.onState((state) => {
    if (state === 'failed') lost(client.failure)
  })

  return {
    start: () => {
      keeper.start()
    },
    tryNow: () => {
      keeper.tryNow()
    },
    stop: () => {
      keeper.stop()
    },
    facts: () => keeper.facts()
  }
}
