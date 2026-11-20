// listeners.ts - a listener that throws stops nothing but itself (fork #9).
//
// The client calls its listeners from inside its own state changes and its message dispatch. A
// throw there used to escape into the code that called them: a state listener that threw on `ready`
// left the handshake's queued requests unsent, one that threw on `failed` left every pending
// request unsettled, and any other reached the transport as a fault and ended the connection.
// Protocol code is NOT wrapped: a throw in the client's own handling of a message still fails the
// connection, which is then reopened by whoever owns it.

/** Call every listener with `value`. One that throws is noted through `debug` and the rest run. */
export function callEach<T>(
  listeners: Iterable<(value: T) => void>,
  value: T,
  debug: (note: string) => void,
  what: string
): void {
  for (const listener of listeners) {
    try {
      listener(value)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      debug(`a ${what} listener threw (${why}) - the others still ran`)
    }
  }
}
