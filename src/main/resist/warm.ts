// resist/warm.ts — read the resist table and ledger while the app is idle, not at the first con.
//
// Both loads are lazy and were first asked for by the con card mid-fight (`conCard.ts enrich`),
// which is the worst moment for the ~130 ms the two files cost (audit item 2). The reads run on a
// worker now and reach main in slices, but even sliced work is better done ten seconds after the
// replay, when nothing else is asking, than during the player's first pull.

import { spellTable } from './spellTable'
import { warmResistLedger } from './store'

/** How long after `replayDone` to start; the engine's own post-replay work has settled by then. */
export const RESIST_WARM_DELAY_MS = 10_000

let armed = false

/** Idempotent: one launch, one warm-up. `unref` so it never holds a quitting app open. */
export function scheduleResistWarm(delayMs = RESIST_WARM_DELAY_MS): void {
  if (armed) return
  armed = true
  setTimeout(() => {
    void spellTable()
    void warmResistLedger()
  }, delayMs).unref()
}
