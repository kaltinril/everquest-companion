// sessionTail.ts - THE TWO HALVES OF TAILING A CHARACTER, in an order a failed save cannot break
// (fork #9, phase R4).
//
// `session.ts tailCharacter` saves what it knows about the character (one batched settings write)
// and then signals that the world was rebuilt, which is what points the engine at the log and
// tells the app whose answers to serve. The write can throw: disk full, config.json read-only, or
// held by antivirus, a backup or cloud sync. It used to reject before the signal. The engine then
// attached through its fallback target, read the whole log and went live, while the app never
// learned its own world had landed: no read was ever served, and the screen said "Still reading
// your log." beside "caught up".
//
// READING THE LOG MUST NOT DEPEND ON SAVING A PREFERENCE. A leaf because `session.ts` imports
// Electron: `tests/sessionTail.test.mts` runs this with both halves handed in.

export interface StoreThenSignal {
  /** The settings writes of the attach. May throw. */
  readonly store: () => void
  /** The world-rebuilt signal. Sent whatever the store did. */
  readonly signal: () => void
  /** The store threw: said, and not passed on. */
  readonly failed: (err: unknown) => void
}

export function storeThenSignal(steps: StoreThenSignal): void {
  try {
    steps.store()
  } catch (err) {
    steps.failed(err)
  }
  steps.signal()
}
