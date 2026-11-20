// NDJSON framing — one JSON message per LF-terminated line.
//
// THIS IS THE ONLY FILE IN src/shared/dataServer THAT KNOWS A NEWLINE EXISTS, and keeping it that
// way is the whole point of the transport seam (see transport.ts). If the wire becomes WebSocket
// frames over the open internet, this file gains a sibling and nothing else in the tree changes.
// `tests/dataServerTransport.test.mts` asserts the absence directly, by reading every other file
// in this directory and failing on a newline literal.
//
// WHY LF IS SAFE AS A DELIMITER, written down so nobody re-derives it nervously: `JSON.stringify`
// escapes every control character inside a string, so a serialized message can never contain a raw
// newline however hostile its contents — a `\n` in a row's text arrives on the wire as the two
// characters `\` and `n`. That is a property of JSON, not of this app's data, so no amount of
// game-log weirdness can smuggle a frame boundary through.
//
// THE DELIMITER IS LF, NEVER CRLF. Windows is the only platform this app ships on and it is
// exactly where a text-mode stream would helpfully translate one into the other; a trailing `\r`
// is stripped on decode rather than trusted, so a peer that framed with CRLF is still read
// correctly.
//
// SIZE ALONE NEVER ENDS A CONNECTION (fork #9). An engine message may be up to `MAX_MESSAGE_CHARS`;
// a longer one is dropped up to its delimiter and reported through `Transport.onOversize`, so only
// the request it answered fails. A line is kept as the chunks it arrived in and joined once, at its
// delimiter: re-joining and re-scanning the partial line on every chunk was quadratic in its length.

import { TransportError, type Transport } from './transport'

/** The frame delimiter. One character, and the only one this protocol treats as structural. */
export const DELIMITER = '\n'

/**
 * The largest single frame this codec will assemble, in characters.
 *
 * A FRAMING guard, not a protocol rule: a peer that never sends a delimiter would otherwise grow
 * the buffer without bound, which is a denial of service a loopback socket makes trivial. Payload
 * budgets — how big a view's window may be — are a protocol concern and live engine-side, nowhere
 * near this number. It matches `MAX_LINE_BYTES` in the Rust codec.
 */
export const MAX_LINE_CHARS = 8 * 1024 * 1024

/**
 * The largest single MESSAGE an engine connection will assemble, in characters.
 *
 * The 8 MiB guard above is about a peer that never sends a delimiter; it was never a budget for a
 * reply, and a whole-log reply grows with the log (measured: about 12.6 KB of largest reply per MB
 * of log, so 8 MiB is a log of roughly 650 MB). V8 holds 2^29 - 24 characters in one string, so
 * 512 MiB is the hard ceiling; this is one eighth of it. The engine checks no size on send.
 */
export const MAX_MESSAGE_CHARS = 64 * 1024 * 1024

/** A delivered message this long or longer is reported (`Transport.onOversize`, refused false). */
export const LARGE_MESSAGE_CHARS = 16 * 1024 * 1024

/** How much of a reported line is kept: enough to read its top-level `id`. */
const HEAD_CHARS = 256

/** Serialize one message into its wire form: the JSON, then the delimiter. */
export function encodeLine(message: unknown): string {
  let json: string
  try {
    json = JSON.stringify(message)
  } catch (cause) {
    throw new TransportError('encode', 'message could not be serialized', cause)
  }
  if (json === undefined) throw new TransportError('encode', 'message serialized to nothing')
  return `${json}${DELIMITER}`
}

/**
 * Parse one wire line back into a message. The line must NOT carry its delimiter.
 *
 * It returns `unknown` rather than a caller-chosen type on purpose: a JSON parse cannot know what
 * arrived, and a generic here would be a cast wearing a type signature. The narrowing belongs to
 * whoever knows which direction the connection runs — see `createNdjsonTransport`.
 */
export function decodeLine(line: string): unknown {
  const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line
  try {
    return JSON.parse(trimmed)
  } catch (cause) {
    throw new TransportError('decode', 'a frame was not a JSON message', cause)
  }
}

/**
 * The stateful half: bytes arrive in whatever chunks the OS felt like, and a message may be split
 * across any number of them. `push` returns the COMPLETE lines it now has, keeping the remainder.
 *
 * It is separate from the transport so it can be tested on its own against adversarial chunking —
 * a codec that only works when each read happens to land on a frame boundary is a codec that works
 * on a test double and fails on a socket.
 */
export class LineDecoder {
  /** The partial line, as the chunks it arrived in. Joined once, at its delimiter. */
  private parts: string[] = []
  /** How many characters `parts` holds. */
  private held = 0
  /** An over-limit line being dropped up to its delimiter (only with `watch`). */
  private skip: { head: string; chars: number } | null = null

  /**
   * WITHOUT `watch` a partial line past `maxLineChars` throws `frameTooLarge` (the child's stdout
   * and stderr: `supervisorChild.ts`). WITH it nothing is thrown: an over-limit line is dropped up
   * to its delimiter and reported with `refused` true, and the decoder carries on.
   */
  constructor(
    private readonly maxLineChars = MAX_LINE_CHARS,
    private readonly watch?: LineWatch
  ) {}

  /** Feed a chunk; get back every whole line it completed, in order. */
  push(chunk: string): string[] {
    const lines: string[] = []
    // Only the new chunk is searched: the partial line held from earlier chunks has no delimiter.
    let start = 0
    let at = chunk.indexOf(DELIMITER)
    while (at !== -1) {
      const line = this.finish(chunk.slice(start, at))
      if (line !== null) lines.push(line)
      start = at + 1
      at = chunk.indexOf(DELIMITER, start)
    }
    this.keep(start === 0 ? chunk : chunk.slice(start))
    return lines
  }

  /** A delimiter arrived: the whole line, or null when it was dropped as too long. */
  private finish(tail: string): string | null {
    const watch = this.watch
    if (this.skip !== null) {
      const { head, chars } = dropMore(this.skip, tail)
      this.skip = null
      watch?.onLine({ head, chars, refused: true })
      return null
    }
    const chars = this.held + tail.length
    if (watch !== undefined && chars > this.maxLineChars) {
      const head = this.head(tail)
      this.drop()
      watch.onLine({ head, chars, refused: true })
      return null
    }
    const line = this.parts.length === 0 ? tail : this.parts.join('') + tail
    this.drop()
    if (watch !== undefined && chars >= watch.noticeChars) {
      watch.onLine({ head: line.slice(0, HEAD_CHARS), chars, refused: false })
    }
    return line
  }

  /** What follows the last delimiter of a chunk: held for the next one, counted, or refused. */
  private keep(rest: string): void {
    if (rest === '') return
    if (this.skip !== null) {
      dropMore(this.skip, rest)
      return
    }
    this.parts.push(rest)
    this.held += rest.length
    if (this.held <= this.maxLineChars) return
    const over = { head: this.head(''), chars: this.held }
    this.drop()
    if (this.watch !== undefined) {
      this.skip = over
      return
    }
    throw new TransportError('frameTooLarge', `a frame exceeded ${String(this.maxLineChars)} characters`)
  }

  /** The first `HEAD_CHARS` characters of the held line followed by `tail`. */
  private head(tail: string): string {
    let head = ''
    for (const part of this.parts) {
      if (head.length >= HEAD_CHARS) break
      head += part
    }
    return (head.length >= HEAD_CHARS ? head : head + tail).slice(0, HEAD_CHARS)
  }

  private drop(): void {
    this.parts = []
    this.held = 0
  }

  /**
   * What is still buffered. A non-empty remainder at end of stream is a TRUNCATED FRAME — half a
   * message discarded in silence is how a client ends up rendering a world nobody sent — so the
   * transport reports it rather than dropping it.
   */
  get pending(): string {
    return this.parts.join('')
  }

  /** True while an over-limit line is being dropped: a stream that ends here ended mid-frame too. */
  get midFrame(): boolean {
    return this.skip !== null
  }
}

/** Count `text` into a line that is being dropped, keeping only its first characters. */
function dropMore(skip: { head: string; chars: number }, text: string): { head: string; chars: number } {
  if (skip.head.length < HEAD_CHARS) skip.head = (skip.head + text).slice(0, HEAD_CHARS)
  skip.chars += text.length
  return skip
}

/** What a decoder reports about a line that was too long or merely large. */
export interface LineWatch {
  /** A delivered line of this many characters or more is reported, with `refused` false. */
  readonly noticeChars: number
  /** `head` is the line's first characters; `chars` its whole length, delimiter excluded. */
  onLine(seen: { head: string; chars: number; refused: boolean }): void
}

// ── the id of a message, read off its first characters ──────────────────────────────────────────

/** The index after the JSON string that opens at `at`, or -1 when the head ends inside it. */
function afterString(head: string, at: number): number {
  for (let i = at + 1; i < head.length; i++) {
    if (head[i] === '\\') i++
    else if (head[i] === '"') return i + 1
  }
  return -1
}

function skipSpace(head: string, at: number): number {
  let i = at
  while (head[i] === ' ' || head[i] === '\t' || head[i] === '\r') i++
  return i
}

/** The member key that opens at `at` and where its value starts, or null when the head ends first. */
function keyAt(head: string, at: number): { key: string; value: number } | null {
  if (head[at] !== '"') return null
  const end = afterString(head, at)
  if (end === -1) return null
  const colon = skipSpace(head, end)
  if (head[colon] !== ':') return null
  return { key: head.slice(at + 1, end - 1), value: skipSpace(head, colon + 1) }
}

/** Where the scalar value at `at` ends (at its `,` or `}`); -1 for an object, an array, or a head
 *  that ends first. */
function scalarEnd(head: string, at: number): number {
  if (head[at] === '{' || head[at] === '[') return -1
  let end = head[at] === '"' ? afterString(head, at) : at
  if (end === -1) return -1
  while (end < head.length && head[end] !== ',' && head[end] !== '}') end++
  return end < head.length ? end : -1
}

/**
 * The top-level numeric `id` of the message whose first characters are `head`, or null.
 *
 * Only an `id` that appears BEFORE any nested object or array counts, so a row's own `id` inside a
 * payload can never be taken for the request's. The engine writes a reply as
 * `{"id":N,"kind":"reply",...` and a reset as `{"epoch":E,"id":N,...` (the generated Rust structs
 * serialize their fields in declared order: engine/crates/protocol/src/generated.rs).
 */
export function messageIdOf(head: string): number | null {
  let at = skipSpace(head, 0)
  if (head[at] !== '{') return null
  at = skipSpace(head, at + 1)
  for (;;) {
    const member = keyAt(head, at)
    const end = member === null ? -1 : scalarEnd(head, member.value)
    if (member === null || end === -1) return null
    if (member.key === 'id') {
      const text = head.slice(member.value, end).trim()
      const id = text === '' ? Number.NaN : Number(text)
      return Number.isInteger(id) ? id : null
    }
    if (head[end] !== ',') return null
    at = skipSpace(head, end + 1)
  }
}

/** What an NDJSON transport needs from whatever is actually carrying the bytes. */
export interface ByteChannel {
  /** Push bytes at the peer. */
  write(chunk: string): void
  /** Register the one handler for arriving bytes. */
  onData(handler: (chunk: string) => void): void
  /** Register the handler for the stream ending, cleanly or otherwise. */
  onClose(handler: (error?: unknown) => void): void
  /** Stop. Idempotent. */
  close(): void
}

/**
 * A {@link Transport} over any byte channel.
 *
 * It takes a channel rather than a socket because phase 0 has no socket: the suite drives it over
 * an in-memory pipe, and the supervisor will hand it a `net.Socket` adapter without this file
 * changing.
 */
export function createNdjsonTransport<Out, In>(channel: ByteChannel): Transport<Out, In> {
  let onMessage: ((message: In) => void) | undefined
  let onError: ((error: TransportError) => void) | undefined
  let onOversize: Parameters<NonNullable<Transport<Out, In>['onOversize']>>[0] | undefined
  let closed = false
  const decoder = new LineDecoder(MAX_MESSAGE_CHARS, {
    noticeChars: LARGE_MESSAGE_CHARS,
    onLine: (seen) => {
      onOversize?.({ id: messageIdOf(seen.head), size: seen.chars, refused: seen.refused })
    }
  })

  const fail = (error: TransportError): void => {
    if (closed) return
    closed = true
    channel.close()
    onError?.(error)
  }

  channel.onData((chunk) => {
    if (closed) return
    let lines: string[]
    try {
      lines = decoder.push(chunk)
    } catch (e) {
      fail(e instanceof TransportError ? e : new TransportError('io', 'framing failed', e))
      return
    }
    for (const line of lines) {
      if (closed) return
      // A blank line is not a message. Being lenient here costs nothing and makes a peer that
      // ends a batch with an extra newline readable instead of fatal.
      if (line.trim() === '') continue
      try {
        // THE ONE CAST IN THE SEAM, and it is where it belongs: the transport is the only thing
        // that knows which direction this connection runs, so it is the only thing entitled to say
        // what a decoded frame is. Whether the peer actually honoured the contract is the schema's
        // question, not the codec's.
        onMessage?.(decodeLine(line) as In)
      } catch (e) {
        fail(e instanceof TransportError ? e : new TransportError('decode', 'a frame was refused', e))
        return
      }
    }
  })

  channel.onClose((error) => {
    if (closed) return
    if (decoder.midFrame || decoder.pending.trim() !== '') {
      fail(new TransportError('decode', 'the stream ended mid-frame'))
      return
    }
    closed = true
    if (error !== undefined) onError?.(new TransportError('io', 'the transport failed', error))
  })

  return {
    send(message) {
      if (closed) throw new TransportError('closed', 'the transport is closed')
      channel.write(encodeLine(message))
    },
    onMessage(handler) {
      onMessage = handler
    },
    onError(handler) {
      onError = handler
    },
    onOversize(handler) {
      onOversize = handler
    },
    close() {
      if (closed) return
      closed = true
      channel.close()
    },
    get closed() {
      return closed
    }
  }
}
