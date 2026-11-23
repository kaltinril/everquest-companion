// zonePortsPull.ts - the Closest-port card's port table: one shared pull per EverQuest folder.
//
// Every zone reads the same table, so it is pulled once and kept (`heldPull`). Main builds it from
// the corpora AND the player's own spells_us.txt (`portsInClient`), so a folder change can change
// the answer: the held copy is dropped on that signal and a mounted card asks again, keeping what
// it draws until the new answer lands. Its own file so the node suite can run it without the
// `@shared` value imports the hook has.

import { heldPull } from '../../../../shared/heldPull'
import type { ZonePort } from '../../../../shared/zoneTravel'

const held = heldPull<ZonePort[]>({
  pull: () => window.eq.getZonePorts(),
  empty: [],
  staleOn: (cb) => void window.eq.onEqConfigChanged(cb)
})

/** Hand `onRows` the port table now and again after each folder change. Returns the unsubscribe. */
export function watchZonePorts(onRows: (rows: ZonePort[]) => void): () => void {
  let live = true
  const ask = (): void => {
    void held.get().then((rows) => {
      if (live) onRows(rows)
    })
  }
  ask()
  const stop = held.onStale(ask)
  return () => {
    live = false
    stop()
  }
}
