// latestReply — which of several overlapping store replies may still land. Each write takes a
// ticket; a reply is applied only while its ticket is the newest, so an answer to an earlier write
// arriving after a later edit cannot put the older list back. The first load is ticket 0: it lands
// only if nothing was written while it was out.

export interface ReplyGate {
  /** A new write's ticket. */
  next: () => number
  /** Whether the reply to `ticket` is still the newest word (the first load is ticket 0). */
  isLatest: (ticket: number) => boolean
}

export function replyGate(): ReplyGate {
  let latest = 0
  return {
    next: () => ++latest,
    isLatest: (ticket) => ticket === latest
  }
}
