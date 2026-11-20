// heldPull.ts - ONE SHARED PULL, HELD UNTIL ITS SOURCE SAYS IT CHANGED.
//
// The renderer pulls some datasets once per window and keeps them, so a panel and a detector cost
// one IPC between them however often either remounts. That was sound while every such dataset was
// built from compile-time JSON. The unlock dataset is not: main folds the player's own
// spells_us.txt into it, and the EverQuest folder can be set while the app runs. A pull held
// forever then showed the dataset built without the game's file until restart.
//
// So the pull is held until the source's own signal says it changed. The old answer stays in hand
// while the new one is fetched, so nothing on screen empties in between.
//
// Pure: no React, no window. The caller hands in the pull and the signal.

export interface HeldPullSource<T> {
  pull: () => Promise<T>
  /** What a failed pull answers with. It is held like any other answer. */
  empty: T
  /** Subscribe to "the source changed". Called once, on the first pull. */
  staleOn: (cb: () => void) => void
}

export interface HeldPull<T> {
  /** The shared pull: one request however many callers, and a new one after the source changed. */
  get: () => Promise<T>
  /** The last answer that landed, or null before the first. */
  landed: () => T | null
  /** Be told when the held answer went stale, to ask again. Returns the unsubscribe. */
  onStale: (cb: () => void) => () => void
}

export function heldPull<T>(source: HeldPullSource<T>): HeldPull<T> {
  let pending: Promise<T> | null = null
  let landed: T | null = null
  let watching = false
  const readers = new Set<() => void>()
  const forget = (): void => {
    pending = null
    for (const cb of [...readers]) cb()
  }
  const get = (): Promise<T> => {
    if (!watching) {
      watching = true
      source.staleOn(forget)
    }
    if (pending !== null) return pending
    const mine: Promise<T> = source
      .pull()
      .catch(() => source.empty)
      .then((d) => {
        // Overtaken by a change while in flight: the newer pull answers, for every holder of this one.
        if (pending !== mine) return get()
        landed = d
        return d
      })
    pending = mine
    return mine
  }
  return {
    get,
    landed: () => landed,
    onStale: (cb) => {
      readers.add(cb)
      return () => {
        readers.delete(cb)
      }
    }
  }
}
