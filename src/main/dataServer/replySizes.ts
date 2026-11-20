// replySizes.ts - WHAT MAIN REMEMBERS ABOUT HOW LARGE A REPLY WAS (fork #9).
//
// A whole-log reply grows with the log. Two sizes matter, and they are different numbers:
//
//   * what main itself may READ: the transport's `MAX_MESSAGE_CHARS` (shared/dataServer/ndjson.ts).
//     Main's own readers, the archive capture among them, work up to it.
//   * what main will hand to a WINDOW: `MAX_FORWARD_CHARS` below, half of it. A forwarded reply is
//     cloned into every window that holds it, so a reply main can read is not yet one it can show.
//
// A reply that was refused, or was too large to show, is not asked for again until the log is
// re-read (`blocked`): within one read the answer only grows, so asking again is a blind retry
// that costs the engine a whole serialization each time. A reply that is large but still shown is
// asked for at most once every `LARGE_REPLY_FLOOR_MS` (`delayFor`), because a poll would otherwise
// have the engine build it again the moment the last one was answered.
//
// Keyed by the question: `<op> <stableKey(params)>`, the key `readShim.ts` joins requests on.
// Pure: no clock of its own and no app import, so `tests/dataServerReplySizes.test.mts` drives it.

import { LARGE_MESSAGE_CHARS } from '../../shared/dataServer/ndjson'

/** The largest engine reply main will hand to a window, in characters. */
export const MAX_FORWARD_CHARS = 32 * 1024 * 1024

/** The least time between two sends of a question whose last reply was large. */
export const LARGE_REPLY_FLOOR_MS = 5_000

export interface ReplySizes {
  /** A reply for `key` was `chars` long. `refused`: it was over the read limit and was dropped. */
  note(key: string, chars: number, refused: boolean): void
  /** A request for `key` was put on the wire. */
  sent(key: string, at: number): void
  /** A reply for `key` could not be shown in this read, so it must not be asked for again. */
  blocked(key: string): boolean
  /** How long the next send of `key` must wait, in ms; 0 for a question that is not large. */
  delayFor(key: string, now: number): number
  /** The log is being read again: nothing known about the last read holds. */
  reset(): void
}

interface KeySize {
  chars: number
  blocked: boolean
}

export function createReplySizes(): ReplySizes {
  const sizes = new Map<string, KeySize>()
  const sentAt = new Map<string, number>()
  return {
    note(key, chars, refused) {
      const was = sizes.get(key)
      const blocked = was?.blocked === true || refused || chars > MAX_FORWARD_CHARS
      sizes.set(key, { chars, blocked })
    },
    sent(key, at) {
      sentAt.set(key, at)
    },
    blocked: (key) => sizes.get(key)?.blocked === true,
    delayFor(key, now) {
      const size = sizes.get(key)
      const last = sentAt.get(key)
      if (size === undefined || last === undefined || size.chars < LARGE_MESSAGE_CHARS) return 0
      return Math.max(0, LARGE_REPLY_FLOOR_MS - (now - last))
    },
    reset() {
      sizes.clear()
      sentAt.clear()
    }
  }
}

/** The app's one instance: fed by main's engine client, read by the read shim. */
export const replySizes: ReplySizes = createReplySizes()
