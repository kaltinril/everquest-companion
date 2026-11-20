// afterLive.ts - NOTICING THAT THE ENGINE STOPPED READING AFTER IT WAS LIVE (fork #9, phase R4).
//
// The fold wait ends when the engine says `live`, and nothing looked at its status after that. A
// reader that then died (a panic on a line the game wrote later) left `engineLiveOn` set: every
// read was tried, refused and replaced by an empty shape, and the last numbers stood as if current.
//
// NO NEW POLLER. The supervisor already asks `session.health` every 30 s on a fresh connection and
// threw the status away; `supervisor.ts onHealth` now hands it on. That answer comes from another
// connection and can be a beat old (it may have been taken while a re-attach was folding), so it
// is only a reason to ASK: main's own connection is asked once, and only when that answer also
// says not live, in the same turn, is the read over. An ask on main's connection waits behind
// large replies, which is why it is made on a doubt and not on a timer.
//
// A LEAF: the turn, the ask and what an end means are handed in by `engineClientHost.ts`.

/** The supervisor's probe said `probeStatus` while main holds `liveOn` as live (or holds nothing). */
export function afterLiveVerdict(s: { readonly liveOn: string | null; readonly probeStatus: string }): 'confirm' | 'fine' {
  return s.liveOn !== null && s.probeStatus !== 'live' ? 'confirm' : 'fine'
}

export interface AfterLiveDeps {
  /** The log main recorded as live in this turn, or null. */
  readonly liveOn: () => string | null
  /** Which turn this is. An answer that lands in another one is about a world since replaced. */
  readonly turn: () => number
  /** `session.health` on main's OWN connection. */
  readonly ask: () => Promise<{ readonly status: string }>
  /** Both answers said not live: the engine stopped reading. */
  readonly ended: () => void
  /** The dev log. */
  readonly note: (line: string) => void
}

export interface AfterLiveWatch {
  /** One answer to the supervisor's probe. */
  probed(status: string): void
}

export function createAfterLiveWatch(deps: AfterLiveDeps): AfterLiveWatch {
  /** One confirm at a time: a second probe while it is out asks nothing. */
  let asking = false
  return {
    probed(status): void {
      if (asking || afterLiveVerdict({ liveOn: deps.liveOn(), probeStatus: status }) === 'fine') return
      const turn = deps.turn()
      asking = true
      deps.note(`data-server client: the health probe says ${status} on a log held as live; asking again`)
      void deps.ask().then(
        (own) => {
          asking = false
          if (deps.turn() !== turn) return
          if (afterLiveVerdict({ liveOn: deps.liveOn(), probeStatus: own.status }) === 'confirm') deps.ended()
        },
        () => {
          // Nobody answered: not a verdict. The next probe asks again.
          asking = false
        }
      )
    }
  }
}
