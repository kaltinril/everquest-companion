// THE APP'S SIDE OF THE PROTOCOL (JOS-468, phase 0 of the data-server program).
//
// Everything the renderer will eventually read comes through this file: a connection, typed
// requests, and subscriptions that hand a listener a MATERIALIZED WINDOW rather than the frames it
// was assembled from. It sits on `Transport<ClientMessage, EngineMessage>` and therefore cannot
// learn what a frame is even by accident — swapping NDJSON-over-loopback for a WebSocket is a new
// transport adapter and not one line here (owner ruling 15).
//
// THE EPOCH LAW. The epoch is the world's generation and it is CONNECTION-WIDE, so this client
// holds exactly one of them. Any bump — an `EpochMessage` announcing `attach`/`restart`, or a
// stream frame that simply arrives carrying a newer epoch — DROPS ALL WINDOW STATE for EVERY
// subscription, flips them all to `loading`, and waits for the fresh `reset` each one will be sent
// when the new fold lands; a frame from an OLDER epoch is dropped with a debug note, because a
// client that reconciled across a bump would be merging two different worlds. Handing this client a
// new transport is the same event: a reconnect is a character switch as far as state is concerned
// (resume is always re-query, owner ruling 3 of the diff protocol), so `attach` re-hellos, drops
// every window, and re-subscribes everything from scratch under fresh request ids. There is
// deliberately no catch-up arm and no resume token: the only recovery is a re-query.
//
// THE PER-REQUEST DEADLINE (JOS-518). Until it existed, the only thing that could ever settle a
// request was the connection: a reply, an error reply, or a transport that died. An engine that
// ACCEPTED a request and then never answered — the wedged-alive pathology — left its caller's
// promise pending forever, and every caller that had no timeout of its own simply stopped. It is a
// FAILURE MECHANISM AND NOT A LATENCY BUDGET, which is the same sentence `World::module_snapshot`
// writes about its own 5 s `SNAPSHOT_PATIENCE`: the engine's ask door already turns a wedged fold
// into an `unavailable` reply, so this one sits well above it and only ever fires when the engine
// is not answering AT ALL. It is per REQUEST and never touches the connection — a refused poll is
// something the caller retries, not a reason to tear a socket down (`waitForFold` is the caller
// that proves it).
//
// THE PENDING ENTRY GOES WITH IT, which is the half a caller's own `Promise.race` cannot do.
// `readShim.ts` has raced its requests against a clock since JOS-489 and gets its answer that way —
// but the entry it abandoned stayed in this map for the life of the connection, holding its
// resolver. One place settles a request now, and it settles the bookkeeping too.
//
// THE NO-MUNGING LAW. This client NEVER sorts, filters, aggregates, re-keys or derives anything
// from a row (owner ruling 4). Rows arrive render-ready — already formatted, already ordered — and
// the ops are applied POSITIONALLY, exactly as sent: an insert lands immediately before or after
// the anchor row it names, an update merges the cells it carries over the ones it does not mention
// (an ABSENT cell is unchanged; an EXPLICIT null is the engine saying that cell is now null, and it
// is stored as null rather than deleted so a cleared cell and a cell that never existed stay
// distinguishable), and a drop removes one row by key. Where an op cannot be applied as sent — an
// anchor that is not in the window, an update or a drop naming a row this window does not hold, a
// diff for a subscription that has no reset yet, a frame for an id nobody subscribed to — the op is
// DROPPED WITH A DEBUG NOTE and never guessed at, and never thrown: a stream is not a place to
// raise. The next reset is the repair, and the epoch law is what guarantees one is coming.

// The two halves this file sits on, each of which carries the detail of its own law:
//   * `ops.ts`        — the closed op → result registry, and the one error type a caller sees.
//   * `viewWindow.ts` — the diff ops, applied positionally to one window. Pure.
// …and `clientStreams.ts`, which holds the windows and applies the epoch law to them.
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ConCardMessage,
  type EngineMessage,
  type Epoch,
  type EpochMessage,
  type ErrorReply,
  type FireMessage,
  type FoldProgress,
  type Hello,
  type HelloReply,
  type ModuleChangedMessage,
  type KnowledgeMissMessage,
  type Reply,
  type ReplyResult,
  type RequestId,
  type ViewDescriptor
} from './protocol.generated'
import { createBroadcasts, deliver, listen, type Broadcasts } from './broadcasts'
import { callEach } from './listeners'
// THE PER-REQUEST DEADLINE's timer and its number, in the one module that touches a clock — see
// this file's header for what it is for, and that one's for why it is not written inline.
import { REQUEST_DEADLINE_MS, armDeadline } from './deadline'
import { TransportError, type Transport } from './transport'
import { EngineError, RESULT_GUARDS, type ParamsFor, type RequestOp, type ResultFor } from './ops'
import { LOADING, type ViewState } from './viewWindow'
// The windows and the epoch: split out at the file-size ceiling (see that file's header).
import {
  dropAllWindowState,
  emit,
  noteEpoch,
  onDiff,
  onReset,
  type LiveSubscription
} from './clientStreams'

export { EngineError, OPS_ARE_EXHAUSTIVE } from './ops'
export type { OpsAreExhaustive, ParamsFor, RequestOp, ResultFor } from './ops'
export type { ViewState } from './viewWindow'

// ---- what a caller sees -------------------------------------------------------------------------

/** connecting → ready, then closed (we stopped) or failed (the connection did). */
export type ConnectionState = 'connecting' | 'ready' | 'closed' | 'failed'

export type ViewListener = (view: ViewState) => void

/** A live subscription. `close()` is idempotent and unsubscribes on the wire when connected. */
export interface ViewHandle {
  readonly state: ViewState
  close(): void
}

export interface EngineClientOptions {
  /** The per-launch connection token, minted by main and presented once at hello. */
  token: string
  /**
   * Where dropped frames and refused ops are noted. Defaults to silence: `src/shared` is bundled
   * into the renderer, where `console` is a lint error and a log line is somebody else's decision.
   */
  debug?: (note: string) => void
}

/** A message that was too large: which request (or subscription) it was for. `refused` true means
 *  it was dropped and that request alone failed; false means it is large and was delivered. */
export interface OversizeNote {
  /** Null when the message named no request this client holds. */
  readonly op: RequestOp | null
  readonly params: unknown
  readonly size: number
  readonly refused: boolean
}

export interface EngineClient {
  readonly state: ConnectionState
  /** The world's generation, or null before the first frame that names one. */
  readonly epoch: Epoch | null
  /** Why the connection failed, or null. Set before the `failed` state is announced; cleared by `attach`. */
  readonly failure: EngineError | null
  /** A message was too large (fork #9). The connection stays up; see {@link OversizeNote}. */
  onOversize(listener: (note: OversizeNote) => void): () => void
  /** Take a (new) connection: re-hello, drop every window, re-subscribe everything. */
  attach(transport: Transport<ClientMessage, EngineMessage>): void
  /** `deadlineMs`: how long this one request may go unanswered; `REQUEST_DEADLINE_MS` when omitted. */
  request<O extends RequestOp>(op: O, params: ParamsFor<O>, deadlineMs?: number): Promise<ResultFor<O>>
  subscribe(descriptor: ViewDescriptor, listener: ViewListener): ViewHandle
  onState(listener: (state: ConnectionState) => void): () => void
  /** Fold progress, for the loading UI. Arrives on connection-wide epoch frames. */
  onProgress(listener: (progress: FoldProgress) => void): () => void
  /**
   * ALERT FIRES (JOS-482, owner ruling 22). Connection-wide, like progress, and for the same
   * reason: a fire belongs to the world rather than to any subscription, and every window plays
   * the same sound.
   *
   * IT IS NOT A SUBSCRIPTION AND HAS NO WINDOW. A fire is a thing that happened once — there is
   * nothing to reset, nothing to diff and nothing to re-request — so it does not go through
   * `subscribe`, it does not touch the epoch, and a listener that missed one has missed it. That is
   * the honest shape for a sound: an alert nobody was listening for is not an alert to replay.
   */
  onFire(listener: (fire: FireMessage) => void): () => void

  /**
   * ONE LIVE `/con` PRODUCED A CARD (JOS-487, boundary verdict 2).
   *
   * `onFire`'s shape exactly, and for `onFire`'s reasons: connection-wide, no subscription, no
   * epoch, nothing to replay. A card is a thing that happened, and a listener that missed one has
   * missed it — which is the honest shape for a card whose whole purpose is the two seconds before
   * you decide to pull.
   */
  onConCard(listener: (card: ConCardMessage) => void): () => void

  /**
   * A MODULE'S PUBLISHED STATE MOVED — the dirty bit (JOS-487).
   *
   * THE PUSH THAT REPLACES A POLL. It carries a name and a cursor and no state at all, so a holder
   * of a `module.snapshot` compares its own `seq` against this one and refetches only when this one
   * is ahead. The app-side `useModule` refetch shim rides it; until that lands, this is the seam it
   * will ride and nothing subscribes.
   *
   * IT IS COALESCED ENGINE-SIDE to one per module per serve beat, so a busy tail delivers a
   * bounded number of these rather than one per event — but a listener must still be idempotent in
   * the cursor, because "the newest number wins" is the only thing the coalescing promises.
   */
  onModuleChanged(listener: (changed: ModuleChangedMessage) => void): () => void
  /**
   * KNOWLEDGE MISSES (JOS-486, boundary verdict 5). Connection-wide, like fires and progress, and
   * with the same shape for the same reason: a miss belongs to the PROCESS's corpus rather than to
   * any subscription, so it carries no id and no epoch.
   *
   * IT IS A REQUEST FOR WORK, WHICH IS WHAT MAKES IT DIFFERENT FROM A FIRE. The engine ships with no
   * network stack; the app owns the wiki fetch and the scrape etiquette that goes with it (one
   * serialized queue, 150 ms spacing, `Retry-After` honoured across the whole queue), so this frame
   * says "I could not answer this name" and the answer goes back as a `knowledge.define` command.
   * The engine announces each name AT MOST ONCE per process — a listener that misses one will not
   * be told again, which is the same honest shape a fire has.
   *
   * THIS CLIENT ONLY DELIVERS IT. Nothing here fetches anything: the handler belongs to whoever owns
   * main's `itemLookup`/`mobLookup` queues, and putting a fetch in a shared transport module would
   * put a network call in the renderer's copy of it.
   */
  onKnowledgeMiss(listener: (miss: KnowledgeMissMessage) => void): () => void
  /** The connection ended in a way the transport does not report (a clean hang-up, fork #9):
   *  `failed` is announced and everything in flight is rejected. A no-op once failed or closed. */
  fail(error: EngineError): void
  close(): void
}

// ---- internals ----------------------------------------------------------------------------------

interface PendingRequest {
  readonly op: RequestOp
  readonly params: unknown
  readonly resolve: (result: ReplyResult) => void
  readonly reject: (error: EngineError) => void
  /** The deadline armed for this request. Cleared by whichever settlement gets there first. */
  readonly deadline: ReturnType<typeof setTimeout>
}

interface ClientState {
  readonly token: string
  readonly debug: (note: string) => void
  transport: Transport<ClientMessage, EngineMessage> | null
  state: ConnectionState
  nextId: RequestId
  epoch: Epoch | null
  readonly pending: Map<RequestId, PendingRequest>
  /** Requests made before the handshake landed. Sent, in order, the moment it does. */
  readonly outbox: ClientMessage[]
  readonly subs: Map<RequestId, LiveSubscription>
  readonly stateListeners: Set<(state: ConnectionState) => void>
  readonly progressListeners: Set<(progress: FoldProgress) => void>
  readonly oversizeListeners: Set<(note: OversizeNote) => void>
  failure: EngineError | null
  /** The four connection-wide fan-outs, held together because they are one family — see
   *  `broadcasts.ts` for what makes them one. */
  readonly broadcasts: Broadcasts
}

function setConnectionState(s: ClientState, next: ConnectionState): void {
  if (s.state === next) return
  s.state = next
  // Guarded (listeners.ts): a state listener that throws must not strand the code after it.
  callEach(s.stateListeners, next, s.debug, 'state')
}

function nextRequestId(s: ClientState): RequestId {
  const id = s.nextId
  s.nextId += 1
  return id
}

function sendNow(s: ClientState, message: ClientMessage): void {
  const transport = s.transport
  if (transport === null || transport.closed) {
    failConnection(s, new EngineError('unavailable', 'there is no open connection'))
    return
  }
  try {
    transport.send(message)
  } catch (error) {
    failConnection(
      s,
      new EngineError('unavailable', 'the transport refused a message', undefined, error)
    )
  }
}

/** Ready ⇒ straight out; connecting ⇒ queued behind the handshake; otherwise there is no wire. */
function send(s: ClientState, message: ClientMessage): void {
  if (s.state === 'ready') sendNow(s, message)
  else if (s.state === 'connecting') s.outbox.push(message)
}

/**
 * TAKE A REQUEST OFF THE BOOKS, and disarm its deadline in the same breath.
 *
 * ONE PLACE, so a settlement path cannot be written that forgets the timer: a reply, an error reply
 * and a connection failure all come through here or through `rejectAllPending` below, and the
 * deadline itself is the only settlement that has already fired.
 */
function takePending(s: ClientState, id: RequestId): PendingRequest | undefined {
  const pending = s.pending.get(id)
  if (pending === undefined) return undefined
  s.pending.delete(id)
  clearTimeout(pending.deadline)
  return pending
}

function rejectAllPending(s: ClientState, error: EngineError): void {
  const inFlight = Array.from(s.pending.values())
  s.pending.clear()
  s.outbox.length = 0
  for (const request of inFlight) {
    clearTimeout(request.deadline)
    request.reject(error)
  }
}

function failConnection(s: ClientState, error: EngineError): void {
  if (s.state === 'failed' || s.state === 'closed') return
  s.failure = error
  setConnectionState(s, 'failed')
  s.transport?.close()
  rejectAllPending(s, error)
  // The rows stay: they were true as of the last frame, and a user reading a table should not have
  // it blanked by a socket. The DROP happens on the reconnect (`attach`), which is where the epoch
  // law says it belongs — the fresh reset is what replaces them.
  for (const sub of s.subs.values()) emit(sub, { ...sub.view, error })
}

// ---- the handshake ------------------------------------------------------------------------------

function attach(s: ClientState, transport: Transport<ClientMessage, EngineMessage>): void {
  const reconnect = s.transport !== null
  if (reconnect) {
    s.transport?.close()
    // Anything in flight belonged to the connection that is gone; a request is never resumed.
    rejectAllPending(s, new EngineError('unavailable', 'the connection was replaced'))
  }
  s.transport = transport
  s.epoch = null
  s.failure = null
  setConnectionState(s, 'connecting')
  if (reconnect) dropAllWindowState(s)
  transport.onMessage((message) => {
    receive(s, message)
  })
  transport.onOversize?.((sized) => {
    onSized(s, sized)
  })
  transport.onError((error: TransportError) => {
    failConnection(s, new EngineError('unavailable', error.message, undefined, error))
  })
  const hello: Hello = { op: 'hello', token: s.token, protocolVersion: PROTOCOL_VERSION }
  sendNow(s, hello)
}

function onHelloReply(s: ClientState, reply: HelloReply): void {
  if (s.state !== 'connecting') {
    s.debug('a second hello reply arrived on an established connection - dropped')
    return
  }
  if (reply.protocolVersion !== PROTOCOL_VERSION) {
    failConnection(
      s,
      new EngineError(
        'protocolMismatch',
        `the engine speaks protocol ${reply.protocolVersion}, this build speaks ${PROTOCOL_VERSION}`
      )
    )
    return
  }
  if (!reply.ok) {
    failConnection(s, new EngineError('unauthorized', 'the engine refused the handshake'))
    return
  }
  setConnectionState(s, 'ready')
  resubscribeAll(s)
  const queued = s.outbox.splice(0, s.outbox.length)
  for (const message of queued) sendNow(s, message)
}

// ---- requests -----------------------------------------------------------------------------------

async function request<O extends RequestOp>(
  s: ClientState,
  op: O,
  params: ParamsFor<O>,
  deadlineMs: number = REQUEST_DEADLINE_MS
): Promise<ResultFor<O>> {
  if (s.state === 'closed' || s.state === 'failed') {
    throw new EngineError('unavailable', `the connection is ${s.state}`)
  }
  const result = await sendRequest(s, nextRequestId(s), { op, params, deadlineMs })
  // Narrowed by the registry: `onReply` refused anything the op does not own before resolving.
  return result as ResultFor<O>
}

/**
 * The one place a request envelope is built, and the one place its id is registered. `deadlineMs`
 * is how long it may go unanswered, `REQUEST_DEADLINE_MS` when omitted.
 */
function sendRequest<O extends RequestOp>(
  s: ClientState,
  id: RequestId,
  { op, params, deadlineMs = REQUEST_DEADLINE_MS }: { op: O; params: ParamsFor<O>; deadlineMs?: number }
): Promise<ReplyResult> {
  return new Promise<ReplyResult>((resolve, reject) => {
    const deadline = armDeadline(() => {
      onDeadline(s, id, op, deadlineMs)
    }, deadlineMs)
    s.pending.set(id, { op, params, resolve, reject, deadline })
    // The registry above is what makes this cast true: `op` and `params` are drawn from the same
    // wire union this is asserting into, and TypeScript simply cannot see that through a generic.
    send(s, { id, op, params } as unknown as ClientMessage)
  })
}

/**
 * NOBODY ANSWERED. Reject the one request and leave the connection exactly as it was.
 *
 * THE CONNECTION IS NOT FAILED HERE, and that is the whole difference between this and every other
 * rejection in this file. A dead transport is a fact about the socket and takes every request with
 * it (`failConnection`); a request nobody answered is a fact about ONE ask, and the engine on the
 * other end may be perfectly healthy and merely busy in a way this app has not met before. The
 * caller decides what that means — `foldWait.ts` retries a bounded few times and keeps waiting,
 * because a folding engine is never given up on.
 */
function onDeadline(s: ClientState, id: RequestId, op: RequestOp, deadlineMs: number): void {
  // THROUGH THE SAME DOOR as a reply and an error reply, even though this one's timer has already
  // fired and clearing it is a no-op: one settlement path is what makes "the map and the timer go
  // together" a property of the code rather than a thing three functions have to remember.
  const pending = takePending(s, id)
  if (pending === undefined) return
  s.debug(`${op} (request ${id}) went unanswered for ${deadlineMs} ms - given up on`)
  pending.reject(new EngineError('timeout', `the engine did not answer ${op} in time`, id))
}

function onReply(s: ClientState, reply: Reply): void {
  const pending = takePending(s, reply.id)
  if (pending === undefined) {
    s.debug(`a reply arrived for request ${reply.id}, which nobody is waiting for - dropped`)
    return
  }
  if (!RESULT_GUARDS[pending.op](reply.result)) {
    pending.reject(
      new EngineError('internal', `the reply to ${pending.op} carries another op's result`, reply.id)
    )
    return
  }
  pending.resolve(reply.result)
}

function onErrorReply(s: ClientState, reply: ErrorReply): void {
  const pending = takePending(s, reply.id)
  if (pending === undefined) {
    s.debug(`an error arrived for request ${reply.id}, which nobody is waiting for - dropped`)
    return
  }
  pending.reject(new EngineError(reply.error.code, reply.error.message, reply.id))
}

/**
 * A MESSAGE WAS TOO LARGE (fork #9). Refused: it was dropped below this client, so the one request
 * or subscription it was for is failed here, by name, and the connection is left exactly as it was.
 * Not refused: it is large and arrives next; listeners are told while its request is still pending.
 */
function onSized(s: ClientState, m: { id: number | null; size: number; refused: boolean }): void {
  const pending = m.id === null ? undefined : s.pending.get(m.id)
  const sub = m.id === null ? undefined : s.subs.get(m.id)
  const op = pending?.op ?? (sub === undefined ? null : 'view.subscribe')
  if (m.refused && m.id !== null) failTooLarge(s, m.id, m.size, op)
  const params: unknown = pending?.params ?? sub?.descriptor ?? null
  callEach(s.oversizeListeners, { op, params, size: m.size, refused: m.refused }, s.debug, 'oversize')
}

function failTooLarge(s: ClientState, id: RequestId, size: number, op: RequestOp | null): void {
  s.debug(`a message of ${size} characters for request ${id} was too large to read - dropped`)
  const cause = new TransportError('frameTooLarge', `a message of ${size} characters was refused`)
  const what = op ?? 'a request'
  const error = new EngineError('internal', `the reply to ${what} was too large to read`, id, cause)
  const pending = takePending(s, id)
  if (pending !== undefined) {
    pending.reject(error)
    return
  }
  const sub = s.subs.get(id)
  // The window goes too: the engine builds its next diff against the frame this client never read,
  // so `onDiff` must drop diffs (rows null) until a reset, and the error stays until then.
  if (sub !== undefined) emit(sub, { ...LOADING, loading: false, error })
}

// ---- subscriptions ------------------------------------------------------------------------------

function subscribe(
  s: ClientState,
  descriptor: ViewDescriptor,
  listener: ViewListener
): ViewHandle {
  const sub: LiveSubscription = {
    id: nextRequestId(s),
    descriptor,
    // Guarded (listeners.ts): a view listener that throws must not fail the connection.
    listener: (view): void => {
      callEach([listener], view, s.debug, 'view')
    },
    view: LOADING,
    closed: false
  }
  s.subs.set(sub.id, sub)
  if (s.state === 'ready') openOnWire(s, sub)
  return {
    get state() {
      return sub.view
    },
    close() {
      if (sub.closed) return
      sub.closed = true
      s.subs.delete(sub.id)
      if (s.state !== 'ready') return
      const id = nextRequestId(s)
      sendRequest(s, id, { op: 'view.unsubscribe', params: { subscription: sub.id } }).catch((error: unknown) => {
        s.debug(`unsubscribing ${sub.id} was refused: ${String(error)}`)
      })
    }
  }
}

function openOnWire(s: ClientState, sub: LiveSubscription): void {
  sendRequest(s, sub.id, { op: 'view.subscribe', params: sub.descriptor }).catch((error: unknown) => {
    // A refused subscription is the view's own error — a bad source, a bad filter — and it belongs
    // where the view will read it rather than taking the connection down. It arrives one microtask
    // late, because it arrives on a promise.
    //
    // WHAT IS NOT DONE HERE: clearing the window. The same rejection fires when the CONNECTION
    // failed under a subscription that was still being acknowledged, and rows a user is reading are
    // not blanked by a socket (see `failConnection`) — the drop belongs to the reconnect.
    if (sub.closed) return
    const failure = error instanceof EngineError ? error : new EngineError('internal', String(error))
    emit(sub, { ...sub.view, loading: false, error: failure })
  })
}

/**
 * RESUME IS RE-QUERY. Every open subscription is re-opened under a FRESH request id, so any frame
 * still in flight for the old one is an unknown id and gets dropped rather than folded into a
 * window it no longer describes.
 */
function resubscribeAll(s: ClientState): void {
  const open = Array.from(s.subs.values())
  s.subs.clear()
  for (const sub of open) {
    sub.id = nextRequestId(s)
    s.subs.set(sub.id, sub)
    openOnWire(s, sub)
  }
}

// ---- the epoch (`noteEpoch` and the stream frames live in clientStreams.ts) -----------------------

function onEpochMessage(s: ClientState, message: EpochMessage): void {
  noteEpoch(s, message.epoch)
  if (message.progress === undefined) return
  callEach(s.progressListeners, message.progress, s.debug, 'progress')
}

// ---- the front door -----------------------------------------------------------------------------

function receive(s: ClientState, message: EngineMessage): void {
  if (message.kind === 'hello') onHelloReply(s, message)
  else if (message.kind === 'reply') onReply(s, message)
  else if (message.kind === 'error') onErrorReply(s, message)
  else if (message.kind === 'epoch') onEpochMessage(s, message)
  else if (message.kind === 'reset') onReset(s, message)
  // THE FOUR CONNECTION-WIDE FRAMES, IN ONE BRANCH. None of them carries an id or an epoch, so none
  // of them passes through `noteEpoch` — the one place this client is entitled to drop state — and
  // `broadcasts.ts` is where that property became structural rather than repeated four times.
  else if (deliver(s.broadcasts, message, s.debug)) {
    // Handled there. The predicate is what narrows the remaining frame to a diff below.
  } else onDiff(s, message)
}

export function createEngineClient(options: EngineClientOptions): EngineClient {
  const s: ClientState = {
    token: options.token,
    debug: options.debug ?? ((): void => undefined),
    transport: null,
    state: 'connecting',
    nextId: 1,
    epoch: null,
    pending: new Map(),
    outbox: [],
    subs: new Map(),
    stateListeners: new Set(),
    progressListeners: new Set(),
    oversizeListeners: new Set(),
    failure: null,
    broadcasts: createBroadcasts()
  }
  return {
    get state() {
      return s.state
    },
    get epoch() {
      return s.epoch
    },
    get failure() {
      return s.failure
    },
    onOversize: (listener): (() => void) => listen(s.oversizeListeners, listener),
    attach: (transport): void => {
      attach(s, transport)
    },
    request: <O extends RequestOp>(op: O, params: ParamsFor<O>, deadlineMs?: number): Promise<ResultFor<O>> =>
      request(s, op, params, deadlineMs),
    subscribe: (descriptor, listener): ViewHandle => subscribe(s, descriptor, listener),
    onState: (listener): (() => void) => {
      s.stateListeners.add(listener)
      return (): void => {
        s.stateListeners.delete(listener)
      }
    },
    onProgress: (listener): (() => void) => {
      s.progressListeners.add(listener)
      return (): void => {
        s.progressListeners.delete(listener)
      }
    },
    // FOUR ONE-LINERS OVER ONE HELPER. What these methods ever had in common was the
    // add-and-return-a-delete, and four copies of it were four chances to write a listener that
    // could not be removed.
    onFire: (listener): (() => void) => listen(s.broadcasts.fire, listener),
    onConCard: (listener): (() => void) => listen(s.broadcasts.conCard, listener),
    onModuleChanged: (listener): (() => void) => listen(s.broadcasts.moduleChanged, listener),
    onKnowledgeMiss: (listener): (() => void) => listen(s.broadcasts.knowledgeMiss, listener),
    fail: (error): void => {
      failConnection(s, error)
    },
    close: (): void => {
      if (s.state === 'closed') return
      setConnectionState(s, 'closed')
      s.transport?.close()
      rejectAllPending(s, new EngineError('unavailable', 'the client was closed'))
    }
  }
}
