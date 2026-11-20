// THE TRANSPORT SEAM, PROVEN (JOS-464).
//
// The owner's constraint on this protocol, verbatim: "lets make sure the way this works we could
// change the wire method at a later date and need to just swap an artifact. im thinking over the
// open internet via websockets etc."
//
// The structural answer is that protocol logic talks to a `Transport` and exactly one module below
// it knows what a frame is. A claim like that is cheap to make and easy to break silently, so this
// suite makes it a MEASUREMENT rather than a comment:
//
//   1. ONE CONVERSATION, TWO ADAPTERS. The committed fixtures — the real handshake, a real
//      subscribe, a real reset, real diffs — are replayed over a transport with NO bytes in it at
//      all and over the NDJSON codec, and the two are asserted to deliver identical messages. Code
//      that survives having its framing removed was not depending on the framing.
//   2. THE FRAMING IS WHERE IT SAYS IT IS. Every other file in src/shared/dataServer is read and
//      checked for a newline literal. That is the assertion that keeps the seam honest as the
//      directory grows.
//   3. THE FRAMING CANNOT BE FORGED FROM ABOVE. A message whose payload is full of newlines still
//      travels as exactly one frame, because JSON escapes control characters — a property of the
//      format, not of this app's data, and therefore worth pinning once.
//
// `engine/crates/protocol/tests/transport.rs` is the mirror of this file on the Rust side, over the
// same fixtures, with the same three claims.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FIXTURE_DIR, ROOT, readFixtureNames } from '../scripts/protocolSchema.mjs'
import type { ClientMessage, EngineMessage } from '../src/shared/dataServer/protocol.generated'
import { createMemoryPair } from '../src/shared/dataServer/memoryTransport'
import {
  DELIMITER,
  LARGE_MESSAGE_CHARS,
  LineDecoder,
  MAX_LINE_CHARS,
  MAX_MESSAGE_CHARS,
  createNdjsonTransport,
  decodeLine,
  encodeLine,
  messageIdOf,
  type ByteChannel
} from '../src/shared/dataServer/ndjson'
import { TransportError, type Transport } from '../src/shared/dataServer/transport'

// ---- the conversation, read from the committed fixtures -----------------------------------------

interface Conversation {
  client: ClientMessage[]
  engine: EngineMessage[]
}

function conversation(): Conversation {
  const client: ClientMessage[] = []
  const engine: EngineMessage[] = []
  for (const name of readFixtureNames()) {
    const doc = JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as {
      messages: { dir: 'client' | 'engine'; message: unknown }[]
    }
    for (const frame of doc.messages) {
      if (frame.dir === 'client') client.push(frame.message as ClientMessage)
      else engine.push(frame.message as EngineMessage)
    }
  }
  assert.ok(client.length >= 6 && engine.length >= 6, 'the conversation is too thin to prove anything')
  return { client, engine }
}

/** A byte channel that is just a pair of arrays — the smallest thing NDJSON can sit on. */
function pipe(): { channel: ByteChannel; written: string[]; deliver: (chunk: string) => void; end: () => void } {
  const written: string[] = []
  let onData: ((chunk: string) => void) | undefined
  let onClose: ((error?: unknown) => void) | undefined
  return {
    written,
    deliver: (chunk) => onData?.(chunk),
    end: () => onClose?.(),
    channel: {
      write: (chunk) => {
        written.push(chunk)
      },
      onData: (handler) => {
        onData = handler
      },
      onClose: (handler) => {
        onClose = handler
      },
      close: () => {
        /* the array pipe has nothing to release */
      }
    }
  }
}

function drain<Out, In>(transport: Transport<Out, In>): In[] {
  const heard: In[] = []
  transport.onMessage((message) => heard.push(message))
  transport.onError((error) => {
    throw error
  })
  return heard
}

// ---- 1. one conversation, two adapters ----------------------------------------------------------

test('THE SAME CONVERSATION SURVIVES BOTH TRANSPORTS IDENTICALLY', () => {
  const { client, engine } = conversation()

  // --- with no bytes at all
  const pair = createMemoryPair<ClientMessage, EngineMessage>()
  const heardByEngine = drain(pair.b)
  const heardByApp = drain(pair.a)
  for (const message of client) pair.a.send(message)
  for (const message of engine) pair.b.send(message)

  // --- and over a real wire with a real delimiter
  const toEngine = pipe()
  const toApp = pipe()
  const appSide = createNdjsonTransport<ClientMessage, EngineMessage>(toEngine.channel)
  const engineSide = createNdjsonTransport<EngineMessage, ClientMessage>(toApp.channel)
  for (const message of client) appSide.send(message)
  for (const message of engine) engineSide.send(message)

  // …and read back off that wire, by a transport that was handed nothing but bytes.
  const engineInbox = pipe()
  const ndHeardByEngine = drain(createNdjsonTransport<EngineMessage, ClientMessage>(engineInbox.channel))
  for (const chunk of toEngine.written) engineInbox.deliver(chunk)

  const appInbox = pipe()
  const ndHeardByApp = drain(createNdjsonTransport<ClientMessage, EngineMessage>(appInbox.channel))
  for (const chunk of toApp.written) appInbox.deliver(chunk)

  assert.deepEqual(heardByEngine, client, 'the memory transport lost a client turn')
  assert.deepEqual(heardByApp, engine, 'the memory transport lost an engine turn')
  assert.deepEqual(ndHeardByEngine, client, 'ndjson lost a client turn')
  assert.deepEqual(ndHeardByApp, engine, 'ndjson lost an engine turn')
  assert.deepEqual(heardByEngine, ndHeardByEngine, 'the two adapters disagree')
  assert.deepEqual(heardByApp, ndHeardByApp, 'the two adapters disagree')
})

test('the framing is exactly one message per line, and the last one is terminated', () => {
  const { engine } = conversation()
  const wire = pipe()
  const transport = createNdjsonTransport<EngineMessage, ClientMessage>(wire.channel)
  for (const message of engine) transport.send(message)

  const bytes = wire.written.join('')
  assert.equal(
    [...bytes].filter((c) => c === DELIMITER).length,
    engine.length,
    'one delimiter per message, no more and no fewer'
  )
  assert.ok(bytes.endsWith(DELIMITER), 'every frame is terminated')
  for (const line of bytes.split(DELIMITER).filter((l) => l !== '')) {
    JSON.parse(line)
  }
})

// ---- 2. the framing is where it says it is ------------------------------------------------------

test('ndjson.ts IS THE ONLY FILE IN src/shared/dataServer THAT KNOWS A NEWLINE EXISTS', () => {
  // The seam's structural claim, asserted directly. The check is over ESCAPE LITERALS rather than
  // over prose: the other files have to be able to EXPLAIN why framing is absent, which is not the
  // same as containing one.
  const dir = join(ROOT, 'src', 'shared', 'dataServer')
  const files = readdirSync(dir).filter((n) => n.endsWith('.ts'))
  assert.ok(files.length >= 4, 'the directory is smaller than expected — is the path right?')

  const literal = /(['"`])\\r?\\n\1|String\.fromCharCode\(\s*10\s*\)|\\u000a/i
  for (const name of files) {
    const source = readFileSync(join(dir, name), 'utf8')
    if (name === 'ndjson.ts') {
      assert.match(source, /DELIMITER = '\\n'/, 'the codec no longer names its own delimiter')
      continue
    }
    assert.doesNotMatch(
      source,
      literal,
      `${name} carries a newline literal — framing belongs in ndjson.ts alone`
    )
  }
})

test('the generated types carry no framing either — the schema never gave them any', () => {
  // Over the CODE, not the prose: a doc comment is allowed to explain that the socket and its
  // framing live elsewhere (the `Token` description does exactly that), and saying so is the
  // opposite of declaring it. What must not exist is a field or a constant.
  const generated = readFileSync(join(ROOT, 'src', 'shared', 'dataServer', 'protocol.generated.ts'), 'utf8')
  const code = generated.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.ok(code.includes('export type ProtocolMessage'), 'the comment stripper ate the code')
  for (const framing of ['DELIMITER', 'MAX_LINE', 'socket', 'Socket', 'port', 'byteLength', 'frame']) {
    assert.equal(
      new RegExp(`\\b${framing}\\b`).test(code),
      false,
      `the generated types declare \`${framing}\` — framing belongs in a transport adapter`
    )
  }
})

// ---- 3. the framing cannot be forged from above -------------------------------------------------

test('a payload full of newlines cannot forge a frame', () => {
  const hostile = 'line one\nline two\r\n{"kind":"epoch"}\n\n'
  const message = {
    kind: 'reset',
    id: 1,
    epoch: 0,
    total: 1,
    rows: [{ key: 'row:1', cells: { text: hostile } }]
  } satisfies EngineMessage

  const line = encodeLine(message)
  assert.equal([...line].filter((c) => c === DELIMITER).length, 1, 'the only newline is the terminator')
  assert.deepEqual(decodeLine(line.slice(0, -1)), message, 'the hostile payload came back intact')
})

test('a message split across arbitrary chunk boundaries still arrives whole', () => {
  // A codec that only works when each read lands on a frame boundary works on a test double and
  // fails on a socket. So the whole wire is fed one CHARACTER at a time.
  const { engine } = conversation()
  const wire = pipe()
  const writer = createNdjsonTransport<EngineMessage, ClientMessage>(wire.channel)
  for (const message of engine) writer.send(message)
  const bytes = wire.written.join('')

  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const heard = drain(transport)
  for (const char of bytes) reader.deliver(char)
  assert.deepEqual(heard, engine, 'character-by-character delivery lost a message')
})

test('a CRLF-framing peer is still understood', () => {
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const heard = drain(transport)
  reader.deliver('{"kind":"epoch","epoch":2,"reason":"restart"}\r\n')
  assert.equal(heard.length, 1)
  assert.equal(heard[0].kind, 'epoch')
})

test('a truncated final frame is an error rather than a quiet nothing', () => {
  // Half a message discarded in silence is how a client ends up rendering a world nobody sent.
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const errors: TransportError[] = []
  transport.onMessage(() => assert.fail('nothing complete arrived'))
  transport.onError((e) => errors.push(e))
  reader.deliver('{"kind":"epoch","epoch":2,"rea')
  reader.end()
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'decode')
  assert.equal(transport.closed, true)
})

test('a frame that is not a message closes the transport instead of being skipped', () => {
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const errors: TransportError[] = []
  transport.onMessage(() => assert.fail('garbage must not be delivered'))
  transport.onError((e) => errors.push(e))
  reader.deliver('not json at all\n')
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'decode')
})

test('an unterminated flood is refused at the framing limit', () => {
  // A peer that never sends a delimiter would otherwise grow the buffer without bound — on
  // loopback, a one-line denial of service. The limit is a FRAMING concern and lives in the codec,
  // not in the protocol.
  const decoder = new LineDecoder(64)
  assert.deepEqual(decoder.push('a'.repeat(32)), [])
  assert.throws(
    () => decoder.push('a'.repeat(64)),
    (e: unknown) => e instanceof TransportError && e.code === 'frameTooLarge'
  )
  assert.ok(MAX_LINE_CHARS > 1_000_000, 'the real limit is far above any legitimate message')
})

test('a blank line between frames is skipped rather than fatal', () => {
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const heard = drain(transport)
  reader.deliver('\n{"kind":"epoch","epoch":1,"reason":"attach"}\n\n')
  assert.equal(heard.length, 1)
})

// ---- 3b. size alone cannot end a connection (fork #9) -------------------------------------------
//
// The largest whole-log reply grows with the log, and the decoder used to close the connection for
// good at 8 MiB. An engine message may now be up to MAX_MESSAGE_CHARS; a longer one is dropped up
// to its delimiter and reported, and the connection carries on.

const MIB = 1024 * 1024

/** One reply whose result is `chars` characters of text, as its wire line (delimiter included). */
function bigReply(id: number, chars: number): string {
  return `{"id":${String(id)},"kind":"reply","ok":true,"result":{"text":"${'x'.repeat(chars)}"}}${DELIMITER}`
}

function feed(deliver: (chunk: string) => void, wire: string, chunkChars: number): void {
  for (let at = 0; at < wire.length; at += chunkChars) deliver(wire.slice(at, at + chunkChars))
}

interface Seen {
  head: string
  chars: number
  refused: boolean
}

function watched(limit: number, noticeChars: number): { decoder: LineDecoder; seen: Seen[] } {
  const seen: Seen[] = []
  return { seen, decoder: new LineDecoder(limit, { noticeChars, onLine: (s) => seen.push(s) }) }
}

test('A 9 MiB MESSAGE IS DELIVERED: the old 8 MiB limit no longer applies to engine messages', () => {
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const heard = drain(transport)
  feed(reader.deliver, bigReply(7, 9 * MIB), 64 * 1024)
  assert.equal(heard.length, 1, 'the message did not arrive as one')
  const reply = heard[0] as { id: number; result: { text: string } }
  assert.equal(reply.id, 7)
  assert.equal(reply.result.text.length, 9 * MIB)
  assert.equal(transport.closed, false)
})

test('a 32 MiB line in 4 KiB chunks is assembled inside 2 s: the partial line is not re-scanned', () => {
  const decoder = new LineDecoder(MAX_MESSAGE_CHARS)
  const chunk = 'y'.repeat(4096)
  const started = performance.now()
  let lines: string[] = []
  for (let i = 0; i < (32 * MIB) / 4096; i++) lines = decoder.push(chunk)
  assert.deepEqual(lines, [], 'nothing is complete before the delimiter')
  lines = decoder.push(DELIMITER)
  const took = performance.now() - started
  assert.equal(lines.length, 1)
  assert.equal(lines[0].length, 32 * MIB)
  assert.ok(took < 2_000, `assembly took ${String(Math.round(took))} ms`)
})

test('WITH A WATCH an over-limit line is skipped and reported, and the next line is delivered', () => {
  const { decoder, seen } = watched(64, 1_000)
  const long = `{"id":41,"kind":"reply",${'z'.repeat(300)}`
  assert.deepEqual(decoder.push(long.slice(0, 50)), [])
  assert.equal(decoder.midFrame, false, 'under the limit nothing is being skipped')
  assert.deepEqual(decoder.push(long.slice(50, 200)), [])
  assert.equal(decoder.midFrame, true)
  assert.equal(decoder.pending, '', 'a skipped line holds nothing')
  assert.deepEqual(decoder.push(`${long.slice(200)}${DELIMITER}{"next":1}${DELIMITER}`), ['{"next":1}'])
  assert.equal(decoder.midFrame, false)
  assert.deepEqual(seen, [{ head: long.slice(0, 256), chars: long.length, refused: true }])
  assert.equal(messageIdOf(seen[0].head), 41)
})

test('the same when the over-limit line and its delimiter arrive in one chunk', () => {
  const { decoder, seen } = watched(64, 1_000)
  const long = 'q'.repeat(65)
  assert.deepEqual(decoder.push(`{"a":1}${DELIMITER}${long}${DELIMITER}{"b":2}${DELIMITER}`), ['{"a":1}', '{"b":2}'])
  assert.deepEqual(seen, [{ head: long, chars: 65, refused: true }])
  // Exactly at the limit is a message, not a refusal.
  assert.deepEqual(decoder.push(`${'q'.repeat(64)}${DELIMITER}`), ['q'.repeat(64)])
  assert.equal(seen.length, 1)
})

test('a line of noticeChars or more is reported with refused false and still delivered', () => {
  const { decoder, seen } = watched(1_000, 32)
  assert.deepEqual(decoder.push(`${'s'.repeat(31)}${DELIMITER}`), ['s'.repeat(31)])
  assert.deepEqual(seen, [], 'a line under the notice size says nothing')
  const large = `{"epoch":3,"id":12,"kind":"reset",${'r'.repeat(300)}`
  assert.deepEqual(decoder.push(large.slice(0, 100)), [])
  assert.deepEqual(decoder.push(`${large.slice(100)}${DELIMITER}`), [large])
  assert.deepEqual(seen, [{ head: large.slice(0, 256), chars: large.length, refused: false }])
})

test('WITHOUT A WATCH the decoder still throws: the child-s stdout and stderr keep their guard', () => {
  const decoder = new LineDecoder(64)
  assert.deepEqual(decoder.push(`ok${DELIMITER}${'a'.repeat(40)}`), ['ok'])
  assert.throws(
    () => decoder.push('a'.repeat(40)),
    (e: unknown) => e instanceof TransportError && e.code === 'frameTooLarge'
  )
  assert.equal(decoder.midFrame, false)
  assert.equal(decoder.pending, '', 'the refused remainder is dropped, as it always was')
})

test('A MESSAGE OVER THE LIMIT IS REPORTED BY ID AND THE TRANSPORT STAYS OPEN', () => {
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const heard = drain(transport)
  const sized: { id: number | null; size: number; refused: boolean }[] = []
  transport.onOversize?.((m) => sized.push(m))
  const wire = bigReply(9, MAX_MESSAGE_CHARS)
  feed(reader.deliver, wire, 64 * 1024)
  reader.deliver(`{"kind":"epoch","epoch":2,"reason":"restart"}${DELIMITER}`)
  assert.deepEqual(sized, [{ id: 9, size: wire.length - 1, refused: true }])
  assert.equal(heard.length, 1, 'the message after the refused one was not delivered')
  assert.equal(heard[0].kind, 'epoch')
  assert.equal(transport.closed, false)
})

test('a large message under the limit is reported and then delivered', () => {
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const order: string[] = []
  transport.onMessage((m) => order.push(`message ${m.kind}`))
  transport.onError((e) => {
    throw e
  })
  transport.onOversize?.((m) => order.push(`sized ${String(m.id)} ${String(m.refused)}`))
  feed(reader.deliver, bigReply(3, LARGE_MESSAGE_CHARS), 64 * 1024)
  assert.deepEqual(order, ['sized 3 false', 'message reply'])
})

test('a stream that ends inside a skipped message is a truncated frame', () => {
  const reader = pipe()
  const transport = createNdjsonTransport<EngineMessage, EngineMessage>(reader.channel)
  const errors: TransportError[] = []
  transport.onMessage(() => assert.fail('nothing complete arrived'))
  transport.onError((e) => errors.push(e))
  feed(reader.deliver, bigReply(5, MAX_MESSAGE_CHARS).slice(0, -1), 64 * 1024)
  assert.equal(transport.closed, false, 'passing the limit alone closes nothing')
  reader.end()
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'decode')
  assert.equal(transport.closed, true)
})

test('messageIdOf takes an id only from the top level, before any nested value', () => {
  // The four shapes the engine writes (generated.rs: fields in declared order).
  assert.equal(messageIdOf('{"id":17,"kind":"reply","ok":true,"result":{"module":"loot","seq":4,"sta'), 17)
  assert.equal(messageIdOf('{"epoch":3,"id":12,"kind":"reset","rows":[{"key":"loot:1","cells":{"id":99'), 12)
  assert.equal(messageIdOf('{"error":{"code":"notFound","message":"no"},"id":7,"kind":"error","ok":false}'), null)
  assert.equal(messageIdOf('{"kind":"moduleChanged","module":"loot","seq":88}'), null)
  // A row-s own id, a string id and a cut-off number are never taken for a request-s.
  assert.equal(messageIdOf('{"rows":[{"id":5}],"id":6}'), null)
  assert.equal(messageIdOf('{"at":1,"chips":[],"id":"con:1","kind":"conCard"}'), null)
  assert.equal(messageIdOf('{"kind":"fire","id":"abc"}'), null)
  assert.equal(messageIdOf('{"text":"a \\" quoted , } {\\"id\\":3","id":4}'), 4)
  assert.equal(messageIdOf('{"id":12'), null, 'the head ends inside the number')
  assert.equal(messageIdOf('{"id":8}'), 8)
  assert.equal(messageIdOf('not json'), null)
  assert.equal(messageIdOf(''), null)
})

// ---- 4. the memory transport is a real transport, not a stub ------------------------------------

test('the memory transport still enforces what the wire would', () => {
  const pair = createMemoryPair<{ when: unknown }, unknown>()
  drain(pair.b)
  // A value that cannot survive JSON cannot survive this transport either — which is the whole
  // reason it clones through JSON instead of passing a reference.
  assert.throws(() => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    pair.a.send({ when: cyclic })
  }, TransportError)

  pair.a.close()
  assert.equal(pair.a.closed, true)
  assert.throws(() => pair.a.send({ when: 1 }), TransportError)
  pair.a.close() // idempotent
})

test('sending into a closed peer is refused, not dropped', () => {
  const pair = createMemoryPair<number, number>()
  drain(pair.b)
  pair.b.close()
  assert.throws(
    () => pair.a.send(1),
    (e: unknown) => e instanceof TransportError && e.code === 'closed'
  )
})
