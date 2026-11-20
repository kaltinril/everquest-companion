// clientStreams.ts - THE WINDOWS AND THE EPOCH, split out of client.ts at the file-size ceiling
// (fork #9): a subscription's held window, the epoch law's teeth, and the two stream frames that
// materialize a window. client.ts's header states both laws these functions keep (THE EPOCH LAW,
// THE NO-MUNGING LAW); nothing here sorts, filters or derives anything from a row.
//
// It imports nothing from client.ts: the client's own state satisfies `StreamState` by structure.

import type {
  DiffMessage,
  Epoch,
  RequestId,
  ResetMessage,
  ViewDescriptor
} from './protocol.generated'
import { LOADING, applyDiff, type ViewState } from './viewWindow'

export interface LiveSubscription {
  /** The id of the subscribe request that opened it — which is also the id its frames carry. */
  id: RequestId
  readonly descriptor: ViewDescriptor
  readonly listener: (view: ViewState) => void
  view: ViewState
  closed: boolean
}

/** The slice of the client's state the stream frames read and write. */
export interface StreamState {
  readonly debug: (note: string) => void
  epoch: Epoch | null
  readonly subs: Map<RequestId, LiveSubscription>
}

export function emit(sub: LiveSubscription, view: ViewState): void {
  sub.view = view
  if (!sub.closed) sub.listener(view)
}

/** THE EPOCH LAW's teeth: every window this client holds, gone, all at once. */
export function dropAllWindowState(s: StreamState): void {
  for (const sub of s.subs.values()) emit(sub, LOADING)
}

// ---- the epoch ----------------------------------------------------------------------------------

/**
 * Fold one frame's epoch into the connection's. Returns false when the frame is from an epoch this
 * client has already left, which is the one case a caller must not apply.
 */
export function noteEpoch(s: StreamState, epoch: Epoch): boolean {
  if (s.epoch === null) {
    s.epoch = epoch
    return true
  }
  if (epoch === s.epoch) return true
  if (epoch < s.epoch) {
    s.debug(`a frame from epoch ${epoch} arrived at epoch ${s.epoch} - dropped`)
    return false
  }
  s.epoch = epoch
  dropAllWindowState(s)
  return true
}

// ---- materializing a window ---------------------------------------------------------------------

/** The subscription a stream frame names, or null with a note if this client does not hold it. */
function subscriptionFor(s: StreamState, id: RequestId, kind: string): LiveSubscription | null {
  const sub = s.subs.get(id)
  if (sub === undefined) {
    s.debug(`a ${kind} arrived for subscription ${id}, which is not open here - dropped`)
    return null
  }
  return sub
}

export function onReset(s: StreamState, message: ResetMessage): void {
  // The epoch is read FIRST and from every frame, even one for a subscription this client does not
  // hold: the generation belongs to the CONNECTION, so a bump is a bump whoever the frame was for.
  if (!noteEpoch(s, message.epoch)) return
  const sub = subscriptionFor(s, message.id, 'reset')
  if (sub === null) return
  emit(sub, {
    rows: message.rows.slice(),
    total: message.total,
    epoch: message.epoch,
    loading: false,
    error: null
  })
}

export function onDiff(s: StreamState, message: DiffMessage): void {
  if (!noteEpoch(s, message.epoch)) return
  const sub = subscriptionFor(s, message.id, 'diff')
  if (sub === null) return
  const held = sub.view.rows
  if (held === null) {
    s.debug(`a diff for subscription ${message.id} arrived before its reset - dropped`)
    return
  }
  emit(sub, {
    rows: applyDiff(held, message.ops, s.debug),
    total: message.total ?? sub.view.total,
    epoch: message.epoch,
    loading: false,
    error: null
  })
}
