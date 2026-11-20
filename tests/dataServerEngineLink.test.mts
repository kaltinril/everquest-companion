// MAIN'S CONNECTION TO ONE ENGINE LAUNCH (fork #9): `src/main/dataServer/engineLink.ts`.
//
// `tests/dataServerLinkKeeper.test.mts` is the retry policy alone. This file is that policy joined
// to the REAL client and the REAL line transport, over channels made by hand: what happens when a
// connect fails, when a connection opens for a launch that is over, when the engine hangs up
// cleanly, and when the stream ends in the middle of a message. Each of those used to leave the
// app on "Reading log..." until the engine was relaunched.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EngineError, createEngineClient, type EngineClient } from '../src/shared/dataServer/client'
import { encodeLine, type ByteChannel } from '../src/shared/dataServer/ndjson'
import { isLinkLost } from '../src/shared/dataServer/ops'
import type { ClientMessage, EngineMessage } from '../src/shared/dataServer/protocol.generated'
import { openEngineLink, type EngineLink } from '../src/main/dataServer/engineLink'
import { LINK_STABLE_MS } from '../src/main/dataServer/linkKeeper'
import { TEST_TOKEN } from './dataServerRig.mjs'

const HELLO_OK: EngineMessage = { kind: 'hello', ok: true, engineVersion: '0.1.0', protocolVersion: 1 }

interface Wire {
  readonly channel: ByteChannel
  /** Every message the client wrote, decoded. */
  readonly written: ClientMessage[]
  closed: boolean
  say(message: EngineMessage): void
  raw(text: string): void
  /** The stream ended: cleanly, or with an error. */
  end(error?: unknown): void
}

function wire(): Wire {
  let onData: (chunk: string) => void = () => undefined
  let onClose: (error?: unknown) => void = () => undefined
  const w: Wire = {
    written: [],
    closed: false,
    channel: {
      write: (chunk) => {
        w.written.push(JSON.parse(chunk) as ClientMessage)
      },
      onData: (handler) => {
        onData = handler
      },
      onClose: (handler) => {
        onClose = handler
      },
      close: () => {
        w.closed = true
      }
    },
    say: (message) => {
      onData(encodeLine(message))
    },
    raw: (text) => {
      onData(text)
    },
    end: (error) => {
      onClose(error)
    }
  }
  return w
}

/** Let the microtasks run: a hang-up is reported one tick after the stream ends. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

interface Rig {
  readonly link: EngineLink
  readonly client: EngineClient
  /** Is this launch still the app's? */
  current: boolean
  connects: number
  readonly failures: string[]
  connected: number
  readonly losses: unknown[]
  readonly timers: { run: () => void; ms: number; cancelled: boolean }[]
  /** Settle the connect in flight with a new channel. */
  open(): Promise<Wire>
  refuse(error: Error): Promise<void>
  /** Run the one waiting retry timer. */
  retry(): void
}

function rig(): Rig {
  let settle: { resolve: (c: ByteChannel) => void; reject: (e: Error) => void } | null = null
  const client = createEngineClient({ token: TEST_TOKEN })
  const r: Rig = {
    client,
    current: true,
    connects: 0,
    failures: [],
    connected: 0,
    losses: [],
    timers: [],
    link: undefined as unknown as EngineLink,
    open: async () => {
      const w = wire()
      settle?.resolve(w.channel)
      settle = null
      await tick()
      return w
    },
    refuse: async (error) => {
      settle?.reject(error)
      settle = null
      await tick()
    },
    retry: () => {
      const due = r.timers.filter((t) => !t.cancelled && t.ms !== LINK_STABLE_MS)
      assert.equal(due.length, 1, `expected one waiting retry, found ${String(due.length)}`)
      due[0].cancelled = true
      due[0].run()
    }
  }
  ;(r as { link: EngineLink }).link = openEngineLink({
    client,
    connect: () => {
      r.connects += 1
      return new Promise<ByteChannel>((resolve, reject) => {
        settle = { resolve, reject }
      })
    },
    current: () => r.current,
    connectFailed: (detail) => r.failures.push(detail),
    connected: () => {
      r.connected += 1
    },
    lost: (error) => r.losses.push(error),
    timer: (run, ms) => {
      const timer = { run, ms, cancelled: false }
      r.timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
    now: () => 1_000_000,
    note: () => undefined
  })
  return r
}

function retriesWaiting(r: Rig): number[] {
  return r.timers.filter((t) => !t.cancelled && t.ms !== LINK_STABLE_MS).map((t) => t.ms)
}

test('A CONNECT THAT FAILS IS RECORDED AND TRIED AGAIN; the connection that opens is taken', async () => {
  const r = rig()
  r.link.start()
  await r.refuse(new Error('connect ECONNREFUSED 127.0.0.1:50123'))
  assert.deepEqual(r.failures, ['connect ECONNREFUSED 127.0.0.1:50123'])
  assert.deepEqual(retriesWaiting(r), [500], 'it used to be recorded and never tried again')
  assert.equal(r.link.facts().tries, 1)
  assert.equal(r.connected, 0)

  r.retry()
  const w = await r.open()
  assert.equal(r.connects, 2)
  assert.equal(r.connected, 1)
  assert.equal(w.written[0].op, 'hello', 'the client was handed the connection and said hello on it')
  w.say(HELLO_OK)
  assert.equal(r.client.state, 'ready')
  assert.equal(r.link.facts().everConnected, true)
  assert.deepEqual(r.losses, [])
})

test('A CONNECTION THAT OPENS FOR A LAUNCH THAT IS OVER IS CLOSED, NOT TAKEN', async () => {
  const r = rig()
  r.link.start()
  r.current = false
  const w = await r.open()
  assert.equal(w.closed, true)
  assert.deepEqual(w.written, [], 'a client was attached to a connection nobody wants')
  assert.equal(r.connected, 0)

  // …and its failures are not this launch's to record either.
  const late = rig()
  late.link.start()
  late.current = false
  await late.refuse(new Error('ECONNREFUSED'))
  assert.deepEqual(late.failures, [])
})

test('A CLEAN HANG-UP IS A LOSS, and the connection is reopened under the same client', async () => {
  const r = rig()
  r.link.start()
  const first = await r.open()
  first.say(HELLO_OK)
  const view = r.client.subscribe({ source: 'loot.ledger' }, () => undefined)
  assert.equal(view.state.loading, true)

  // The engine closes the socket between two messages: the transport reports nothing.
  const asked = r.client.request('session.health', {}).then(
    () => null,
    (error: unknown) => error
  )
  first.end()
  assert.deepEqual(r.losses, [], 'reported one tick later, so the client-s own reason can win')
  await tick()
  assert.equal(r.losses.length, 1)
  const loss = r.losses[0]
  assert.ok(loss instanceof EngineError)
  assert.equal(loss.message, 'the engine closed the connection')
  assert.deepEqual(retriesWaiting(r), [500])
  // The client is told: `ready` over a closed socket is what the "Reading log..." box reads.
  assert.equal(r.client.state, 'failed', 'the client still says ready on a connection that ended')
  assert.equal(r.client.failure, loss)
  assert.equal(isLinkLost(loss), true)
  assert.equal(await asked, loss, 'a request in flight was left to wait out its deadline')

  r.retry()
  const second = await r.open()
  assert.equal(r.connected, 2)
  assert.equal(second.written[0].op, 'hello', 'the same client re-hellos on the new connection')
  second.say(HELLO_OK)
  assert.equal(r.client.state, 'ready')
  assert.equal(second.written[1].op, 'view.subscribe', 'and reopens what was subscribed')

  // The old connection ending again is no news: the link has replaced it.
  first.end()
  await tick()
  assert.equal(r.losses.length, 1)
})

test('a hang-up before the hello is answered fails the client too, and is retried', async () => {
  const r = rig()
  r.link.start()
  const w = await r.open()
  assert.equal(r.client.state, 'connecting')
  w.end()
  await tick()
  assert.equal(r.client.state, 'failed', 'the client waits for a hello on a connection that ended')
  assert.equal(r.losses.length, 1)
  assert.equal(r.link.facts().lastReason, 'unavailable: the engine closed the connection')
  assert.deepEqual(retriesWaiting(r), [500])
})

test('a stream that ends inside a message is lost ONCE, with the reason the client gives', async () => {
  const r = rig()
  r.link.start()
  const w = await r.open()
  w.say(HELLO_OK)
  w.raw('{"kind":"epoch","epo')
  w.end()
  await tick()
  assert.equal(r.client.state, 'failed')
  assert.equal(r.losses.length, 1, 'the hang-up and the failure were reported as two losses')
  const loss = r.losses[0]
  assert.ok(loss instanceof EngineError)
  assert.equal(loss.message, 'the stream ended mid-frame')
  assert.equal(r.link.facts().lastReason, 'unavailable: the stream ended mid-frame')
  assert.deepEqual(retriesWaiting(r), [500])
})

test('a socket error is a loss too, and a request made meanwhile is rejected as a lost link', async () => {
  const r = rig()
  r.link.start()
  const w = await r.open()
  w.say(HELLO_OK)
  const pending = r.client.request('session.health', {})
  w.end(new Error('read ECONNRESET'))
  await assert.rejects(pending, (error: unknown) => error instanceof EngineError && error.code === 'unavailable')
  await tick()
  assert.equal(r.losses.length, 1)
  assert.deepEqual(retriesWaiting(r), [500])
})

test('AN ENGINE THAT SPEAKS ANOTHER PROTOCOL VERSION IS NOT RECONNECTED TO', async () => {
  const r = rig()
  r.link.start()
  const w = await r.open()
  w.say({ kind: 'hello', ok: true, engineVersion: '0.1.0', protocolVersion: 99 })
  assert.equal(r.client.state, 'failed')
  assert.equal(r.losses.length, 1)
  assert.deepEqual(retriesWaiting(r), [], 'a retry cannot change the engine-s build')
  assert.equal(r.link.facts().gaveUp, true)
  assert.match(r.link.facts().lastReason ?? '', /^protocolMismatch: /)
})

test('tryNow asks again after the link gave up; stop ends it', async () => {
  const r = rig()
  r.link.start()
  const w = await r.open()
  w.say({ kind: 'hello', ok: false, engineVersion: '0.1.0', protocolVersion: 1 })
  assert.equal(r.link.facts().gaveUp, true)
  assert.equal(r.connects, 1)

  r.link.tryNow()
  assert.equal(r.connects, 2)
  const again = await r.open()
  again.say(HELLO_OK)
  assert.equal(r.client.state, 'ready', 'a failed client takes a new connection')
  assert.equal(r.link.facts().gaveUp, false)

  r.link.stop()
  r.current = false
  again.end()
  await tick()
  assert.equal(r.losses.length, 1, 'a launch that is over reports no loss')
  assert.deepEqual(retriesWaiting(r), [])
  assert.equal(r.timers.every((t) => t.cancelled), true, 'stop left a timer running')
})

// ── a new connection, asked for by a person (fork #9, phase R2) ─────────────────────────────────

test('REOPEN DROPS A CONNECTION THAT IS UP AND NOT ANSWERING, and opens another at once', async () => {
  const r = rig()
  r.link.start()
  const first = await r.open()
  first.say(HELLO_OK)
  const asked = r.client.request('session.health', {}).then(
    () => null,
    (error: unknown) => error
  )

  r.link.reopen()
  assert.equal(first.closed, true, 'the connection that was not answering is still open')
  assert.equal(r.losses.length, 1, 'the host is told once, so the windows it served re-hydrate')
  assert.equal(r.connects, 2, 'the new connect waited on the retry ladder')
  assert.deepEqual(retriesWaiting(r), [], 'and a retry is still scheduled behind it')
  assert.equal(isLinkLost(await asked), true, 'what was in flight is rejected as a lost link, not left to time out')

  const second = await r.open()
  second.say(HELLO_OK)
  assert.equal(r.client.state, 'ready')
  assert.equal(r.connected, 2)
  assert.equal(r.link.facts().tries, 0, 'a person asking is not a failed try')
  // The dropped connection ending for real afterwards is no news.
  first.end()
  await tick()
  assert.equal(r.losses.length, 1)
})

test('reopen with the connection down is tryNow; with the first connect in flight it does nothing', async () => {
  const early = rig()
  early.link.start()
  early.link.reopen()
  assert.equal(early.connects, 1, 'a second connect was started beside the first')
  assert.deepEqual(early.losses, [])

  const r = rig()
  r.link.start()
  const w = await r.open()
  w.say({ kind: 'hello', ok: false, engineVersion: '0.1.0', protocolVersion: 1 })
  assert.equal(r.link.facts().gaveUp, true)
  const lost = r.losses.length
  r.link.reopen()
  assert.equal(r.connects, 2)
  assert.equal(r.losses.length, lost, 'a connection that is already down is not lost a second time')
})

test('reopen drops a connection whose hello was never answered', async () => {
  const r = rig()
  r.link.start()
  const first = await r.open()
  assert.equal(r.client.state, 'connecting')
  r.link.reopen()
  assert.equal(first.closed, true)
  assert.equal(r.connects, 2)
})

