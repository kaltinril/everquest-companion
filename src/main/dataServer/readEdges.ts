// readEdges.ts - THE EDGES OF A LOG READ, said by the files that see them (fork #9, phase R4).
//
// `engineClientHost.ts` knows when a read ends, lands or is replaced. `main/logReadRecovery.ts`
// acts on that, and what it does is call back into the host (a re-attach). One slot here keeps
// the two from importing each other, as `worldRebuilt.ts` does for the pipeline.

export type ReadEdge =
  /** A new engine launch is connected to. */
  | 'launch'
  /** A new turn replaced the world: nothing armed for the last one may fire. */
  | 'turn'
  /** The read of `logPath` went live. */
  | 'live'
  /** The read of `logPath` ended before it went live. */
  | 'ended'
  /** The engine stopped reading `logPath` after it was live. */
  | 'endedAfterLive'
  /** A person pressed Try again. */
  | 'manual'

let listener: ((edge: ReadEdge, logPath: string | null) => void) | null = null

/** The one listener (`main/logReadReport.ts` binds the recovery to it). */
export function onReadEdge(cb: ((edge: ReadEdge, logPath: string | null) => void) | null): void {
  listener = cb
}

export function noteReadEdge(edge: ReadEdge, logPath: string | null): void {
  listener?.(edge, logPath)
}
