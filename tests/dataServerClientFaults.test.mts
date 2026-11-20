// THE CLIENT, WHEN A MESSAGE IS TOO LARGE OR A LISTENER THROWS (fork #9).
//
// One reply over the transport's size limit used to end main's one connection for good, and so did
// any listener that threw during dispatch; nothing reconnected, and the app sat on "Reading
// log...". Both now cost only the one request, or nothing at all. `dataServerClient.test.mts` is
// the client against the committed conversation; this file is beside it because that one is at
// the file-size ceiling.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../scripts/protocolSchema.mjs'
import { TransportError, type Transport } from '../src/shared/dataServer/transport'
import { EngineError, createEngineClient } from '../src/shared/dataServer/client'
import { isLinkLost, isTooLarge } from '../src/shared/dataServer/ops'
import { callEach } from '../src/shared/dataServer/listeners'
import { TEST_TOKEN, rowKeys } from './dataServerRig.mjs'
import type { ClientMessage, EngineMessage } from '../src/shared/dataServer/protocol.generated'

interface Sized {
  id: number | null
  size: number
  refused: boolean
}

/** A transport this file drives by hand. A throw out of the message handler is reported as a
 *  transport failure, which is what `ndjson.ts` does with one. */
function handTransport(): {
  transport: Transport<ClientMessage, EngineMessage>
  sent: ClientMessage[]
  deliver: (message: EngineMessage) => void
  fail: (error: TransportError) => void
  sized: (m: Sized) => void
} {
  const sent: ClientMessage[] = []
  let onMessage: (message: EngineMessage) => void = () => undefined
  let onError: (error: TransportError) => void = () => undefined
  let onOversize: (m: Sized) => void = () => undefined
  return {
    sent,
    transport: {
      send: (message) => {
        sent.push(message)
      },
      onMessage: (handler) => {
        onMessage = handler
      },
      onError: (handler) => {
        onError = handler
      },
      onOversize: (handler) => {
        onOversize = handler
      },
      close: () => undefined,
      closed: false
    },
    deliver: (message) => {
      try {
        onMessage(message)
      } catch (e) {
        onError(new TransportError('decode', 'a frame was refused', e))
      }
    },
    fail: (error) => {
      onError(error)
    },
    sized: (m) => {
      onOversize(m)
    }
  }
}

const HELLO_OK: EngineMessage = { kind: 'hello', ok: true, engineVersion: '0.1.0', protocolVersion: 1 }

// ---- 1. a message too large ----------------------------------------------------------------------

test('A REPLY TOO LARGE TO READ FAILS ONLY ITS OWN REQUEST', async () => {
  const wire = handTransport()
  const notes: string[] = []
  const client = createEngineClient({ token: TEST_TOKEN, debug: (note) => notes.push(note) })
  client.attach(wire.transport)
  wire.deliver(HELLO_OK)

  const loot = client.request('module.snapshot', { module: 'loot' })
  const health = client.request('session.health', {})
  wire.sized({ id: 1, size: 70_000_000, refused: true })

  await assert.rejects(loot, (error: unknown) => {
    assert.ok(error instanceof EngineError)
    assert.equal(error.code, 'internal')
    assert.equal(error.message, 'the reply to module.snapshot was too large to read')
    assert.equal(error.requestId, 1)
    assert.ok(error.cause instanceof TransportError)
    assert.equal(error.cause.code, 'frameTooLarge')
    assert.equal(isTooLarge(error), true)
    assert.equal(isLinkLost(error), false)
    return true
  })
  assert.equal(client.state, 'ready', 'size alone must not end the connection')
  assert.equal(client.failure, null)

  // The request beside it, and one made afterwards, are answered as if nothing happened.
  wire.deliver({ kind: 'reply', id: 2, ok: true, result: { status: 'live', epoch: 1, uptimeMs: 5 } })
  assert.deepEqual(await health, { status: 'live', epoch: 1, uptimeMs: 5 })
  const later = client.request('echo', { text: 'still here' })
  wire.deliver({ kind: 'reply', id: 3, ok: true, result: { text: 'still here' } })
  assert.deepEqual(await later, { text: 'still here' })
  assert.ok(notes.some((note) => note.includes('too large to read')))
})

test('a reset too large to read puts the error on that one subscription', () => {
  const wire = handTransport()
  const client = createEngineClient({ token: TEST_TOKEN })
  client.attach(wire.transport)
  wire.deliver(HELLO_OK)
  const big = client.subscribe({ source: 'events.feed' }, () => undefined)
  const small = client.subscribe({ source: 'loot.ledger' }, () => undefined)
  wire.deliver({ kind: 'reply', id: 1, ok: true, result: { subscription: 1, subscribed: true } })
  wire.deliver({ kind: 'reply', id: 2, ok: true, result: { subscription: 2, subscribed: true } })
  wire.deliver({ kind: 'reset', id: 2, epoch: 4, total: 1, rows: [{ key: 'a', cells: {} }] })

  wire.sized({ id: 1, size: 70_000_000, refused: true })

  assert.equal(big.state.loading, false, 'a view that will never load is not loading')
  assert.ok(big.state.error instanceof EngineError)
  assert.equal(big.state.error.message, 'the reply to view.subscribe was too large to read')
  assert.equal(isTooLarge(big.state.error), true)
  assert.deepEqual(rowKeys(small.state), ['a'], 'the other subscription lost its rows')
  assert.equal(small.state.error, null)
  assert.equal(client.state, 'ready')
})

test('a refused frame drops the window, so a later diff cannot be applied to it or clear the error', () => {
  const wire = handTransport()
  const notes: string[] = []
  const client = createEngineClient({ token: TEST_TOKEN, debug: (note) => notes.push(note) })
  client.attach(wire.transport)
  wire.deliver(HELLO_OK)
  const held = client.subscribe({ source: 'events.feed' }, () => undefined)
  const empty = client.subscribe({ source: 'loot.ledger' }, () => undefined)
  wire.deliver({ kind: 'reply', id: 1, ok: true, result: { subscription: 1, subscribed: true } })
  wire.deliver({ kind: 'reply', id: 2, ok: true, result: { subscription: 2, subscribed: true } })
  wire.deliver({ kind: 'reset', id: 1, epoch: 4, total: 1, rows: [{ key: 'a', cells: {} }] })
  wire.deliver({ kind: 'reset', id: 2, epoch: 4, total: 0, rows: [] })

  // The engine now builds its diffs against frames this client never read.
  wire.sized({ id: 1, size: 70_000_000, refused: true })
  wire.sized({ id: 2, size: 70_000_000, refused: true })
  assert.equal(held.state.rows, null, 'rows that missed a frame are still held')
  assert.equal(empty.state.rows, null)
  assert.equal(held.state.total, 0)

  const insert = { op: 'insert' as const, row: { key: 'z', cells: {} } }
  wire.deliver({ kind: 'diff', id: 1, epoch: 4, total: 9, ops: [insert] })
  wire.deliver({ kind: 'diff', id: 2, epoch: 4, total: 9, ops: [insert] })

  for (const view of [held, empty]) {
    assert.equal(view.state.rows, null, 'a diff was applied to a window that missed a frame')
    assert.equal(isTooLarge(view.state.error), true, 'the next diff wiped the too-large error')
    assert.equal(view.state.loading, false)
  }
  assert.equal(notes.filter((note) => note.includes('arrived before its reset')).length, 2)

  // The next reset is the repair, exactly as for any other window that could not be reconciled.
  wire.deliver({ kind: 'reset', id: 1, epoch: 5, total: 1, rows: [{ key: 'b', cells: {} }] })
  assert.deepEqual(rowKeys(held.state), ['b'])
  assert.equal(held.state.error, null)
  assert.equal(client.state, 'ready')
})

test('onOversize names the op and params of the request the message was for', () => {
  const wire = handTransport()
  const client = createEngineClient({ token: TEST_TOKEN })
  const seen: unknown[] = []
  const stop = client.onOversize((note) => seen.push(note))
  client.attach(wire.transport)
  wire.deliver(HELLO_OK)
  void client.request('module.snapshot', { module: 'loot' }).catch(() => undefined)
  client.subscribe({ source: 'events.feed' }, () => undefined)

  // Large but delivered: told while the request is still pending, and the request is left alone.
  wire.sized({ id: 1, size: 20_000_000, refused: false })
  wire.sized({ id: 1, size: 70_000_000, refused: true })
  wire.sized({ id: 2, size: 80_000_000, refused: true })
  // A message that names nobody (a broadcast, or a request that already ended) is still reported.
  wire.sized({ id: null, size: 90_000_000, refused: true })
  wire.sized({ id: 41, size: 90_000_001, refused: true })

  assert.deepEqual(seen, [
    { op: 'module.snapshot', params: { module: 'loot' }, size: 20_000_000, refused: false },
    { op: 'module.snapshot', params: { module: 'loot' }, size: 70_000_000, refused: true },
    { op: 'view.subscribe', params: { source: 'events.feed' }, size: 80_000_000, refused: true },
    { op: null, params: null, size: 90_000_000, refused: true },
    { op: null, params: null, size: 90_000_001, refused: true }
  ])
  assert.equal(client.state, 'ready')
  stop()
  wire.sized({ id: null, size: 1, refused: true })
  assert.equal(seen.length, 5, 'a removed listener is still being told things')
})

test('`failure` holds why the connection failed, and a new transport clears it', () => {
  const wire = handTransport()
  const client = createEngineClient({ token: TEST_TOKEN })
  const failures: (string | undefined)[] = []
  // Read from inside the state listener: the reason must be there by the time `failed` is announced.
  client.onState((state) => {
    if (state === 'failed') failures.push(client.failure?.message)
  })
  client.attach(wire.transport)
  assert.equal(client.failure, null)
  wire.deliver(HELLO_OK)
  wire.fail(new TransportError('decode', 'the stream ended mid-frame'))

  assert.equal(client.state, 'failed')
  assert.deepEqual(failures, ['the stream ended mid-frame'])
  assert.equal(client.failure?.code, 'unavailable')
  assert.ok(client.failure.cause instanceof TransportError)
  assert.equal(isLinkLost(client.failure), true)

  client.attach(handTransport().transport)
  assert.equal(client.failure, null)
  assert.equal(client.state, 'connecting')
})

// ---- 2. a listener that throws -------------------------------------------------------------------

test('callEach runs every listener, and notes the one that threw', () => {
  const notes: string[] = []
  const heard: number[] = []
  const listeners = new Set<(n: number) => void>([
    (n) => heard.push(n),
    () => {
      throw new Error('a listener bug')
    },
    () => {
      throw 'not an Error'
    },
    (n) => heard.push(n * 2)
  ])
  callEach(listeners, 21, (note) => notes.push(note), 'state')
  assert.deepEqual(heard, [21, 42])
  assert.deepEqual(notes, [
    'a state listener threw (a listener bug) - the others still ran',
    'a state listener threw (not an Error) - the others still ran'
  ])
})

test('A STATE LISTENER THAT THROWS ON `ready` DOES NOT STRAND THE HANDSHAKE', async () => {
  const wire = handTransport()
  const notes: string[] = []
  const client = createEngineClient({ token: TEST_TOKEN, debug: (note) => notes.push(note) })
  const states: string[] = []
  client.onState(() => {
    throw new Error('a listener bug')
  })
  client.onState((state) => states.push(state))
  client.attach(wire.transport)
  const echo = client.request('echo', { text: 'queued' })
  client.subscribe({ source: 'loot.ledger' }, () => undefined)

  wire.deliver(HELLO_OK)

  assert.equal(client.state, 'ready')
  assert.deepEqual(states, ['ready'], 'the listener after the one that threw was not called')
  assert.deepEqual(
    wire.sent.slice(1).map((m) => m.op),
    ['view.subscribe', 'echo'],
    'the subscription was not reopened, or the queued request was not sent'
  )
  wire.deliver({ kind: 'reply', id: 1, ok: true, result: { text: 'queued' } })
  assert.deepEqual(await echo, { text: 'queued' })
  assert.ok(notes.some((note) => note.includes('a state listener threw (a listener bug)')))
})

test('a state listener that throws on `failed` does not leave requests pending', async () => {
  const wire = handTransport()
  const client = createEngineClient({ token: TEST_TOKEN })
  client.attach(wire.transport)
  wire.deliver(HELLO_OK)
  client.onState((state) => {
    if (state === 'failed') throw new Error('a listener bug')
  })
  const pending = client.request('session.health', {})
  wire.fail(new TransportError('io', 'the transport failed'))
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof EngineError)
    assert.equal(error.code, 'unavailable')
    return true
  })
})

test('a progress, broadcast or view listener that throws does not fail the connection', () => {
  const wire = handTransport()
  const client = createEngineClient({ token: TEST_TOKEN })
  const boom = (): never => {
    throw new Error('a listener bug')
  }
  client.onProgress(boom)
  client.onModuleChanged(boom)
  let moved = 0
  client.onModuleChanged(() => {
    moved += 1
  })
  client.attach(wire.transport)
  wire.deliver(HELLO_OK)
  const view = client.subscribe({ source: 'loot.ledger' }, boom)
  wire.deliver({ kind: 'reply', id: 1, ok: true, result: { subscription: 1, subscribed: true } })

  wire.deliver({
    kind: 'epoch',
    epoch: 2,
    reason: 'attach',
    progress: { offset: 1, logSize: 2, events: 3, pct: 50 }
  })
  wire.deliver({ kind: 'moduleChanged', module: 'loot', seq: 9 })
  wire.deliver({ kind: 'reset', id: 1, epoch: 2, total: 1, rows: [{ key: 'a', cells: {} }] })

  assert.equal(client.state, 'ready')
  assert.equal(client.failure, null)
  assert.equal(moved, 1, 'the listener after the one that threw was not called')
  assert.deepEqual(rowKeys(view.state), ['a'], 'the window is still materialized')
})

// ---- 3. the split kept the law -------------------------------------------------------------------

test('clientStreams.ts cannot sort, filter or aggregate either (owner ruling 4)', () => {
  // The stream frames moved out of client.ts at the file-size ceiling; the no-munging law that
  // `dataServerClient.test.mts` asserts over client.ts has to follow them.
  const source = readFileSync(join(ROOT, 'src', 'shared', 'dataServer', 'clientStreams.ts'), 'utf8')
  assert.ok(source.includes('export function onDiff'), 'the stream frames are not where this test looks')
  assert.doesNotMatch(source, /\.(sort|filter|reduce|reduceRight|flatMap|group)\(/)
})
