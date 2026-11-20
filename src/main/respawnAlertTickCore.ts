// respawnAlertTickCore.ts - the on/off switch behind respawnAlertTick.ts, with the timer, the
// clock and the send passed in, so tests/respawnAlertTick.test.mts runs it without Electron.

export interface RespawnAlertTickDeps<H> {
  /** Start a repeating timer and return its handle. */
  every: (fn: () => void, ms: number) => H
  clear: (handle: H) => void
  send: (nowMs: number) => void
  now: () => number
}

/**
 * `sync(on)`: one 1 s clock while on, none while off. It is called on every save of the setting,
 * so asking for the state it is already in does nothing: a repeated "on" keeps the one clock.
 */
export function makeRespawnAlertTick<H>(deps: RespawnAlertTickDeps<H>): (on: boolean) => void {
  let timer: { handle: H } | null = null
  return (on) => {
    if (on === (timer !== null)) return
    if (timer !== null) {
      deps.clear(timer.handle)
      timer = null
      return
    }
    timer = { handle: deps.every(() => deps.send(deps.now()), 1000) }
  }
}
