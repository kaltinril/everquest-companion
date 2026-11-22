// useOverlayModule — the main window's `useModule`, for a window that only has `eqOverlay`.
//
// An overlay is a second renderer entry with a LEANER bridge (preload/overlay.ts): no `window.eq`,
// no MUI, no app context. But the transport it consumes is the same one the app consumes, so this
// is `lib/useModule.ts` re-expressed over the bridge this window actually has, and that file's
// header carries the argument for the shape. The three halves:
//
//   1. HYDRATE — `module:getSnapshot` gives the whole state plus the cursor it is at.
//   2. RE-ASK when `module:changed` reports a cursor ahead of the one being held.
//   3. RE-HYDRATE when the world changed hands or the character switched (JOS-172) — a historical
//      fold announces nothing on its own, so a window created in the same `whenReady` turn that
//      started one would otherwise sit on a random part-way-through slice forever. `onCharacter` is
//      main saying "throw it away and ask again", and `worldRebuilt.ts sendWorldRebuilt` is what
//      delivers it to this window at all.
//
// WHAT IS HELD ACROSS THAT RE-ASK (fork #9). An overlay outlives a character switch, and a re-ask
// that came back with no snapshot used to leave the previous character's rows up. Now: another
// character's log takes the rows down at once; a world that changed hands takes them down if no
// snapshot comes back; a rebuild of the SAME log keeps them, so an ordinary rebuild never flashes
// an empty overlay. An answer to an older ask is dropped. `tests/overlayModuleRows.test.mts`.
//
// THE DELTA ARM IS GONE (JOS-499 item 7), with main's own fold. `lib/useModule.ts` carries the full
// account of what went with it and why none of it is missed; the short version is that a cursor is
// a dirty bit carrying no state, so there is nothing left to fold, dedupe, buffer or call stale.
//
// THE `empty` ARGUMENT STAYS, and it is the difference from the main window's hook. An overlay is a
// small always-visible surface with no room for a loading state — it draws the empty shape until it
// has something, which is what these windows have always done. The main window returns `null` and
// lets each view decide.
//
// MUI-FREE like everything in this bundle.

import { useEffect, useRef, useState } from 'react'
// RELATIVE, so the unit suite (no `@shared/*` alias) can run this hook: tests/overlayModuleRows.
import { MODULE_WORLD_CHANGED, type ModuleChanged, type ModuleSnapshot } from '../../../shared/types'
import { createLootFrameReader, LOOT_MODULE } from '../../../shared/lootFrame'

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/**
 * `enabled` (default on) lets a window stop reading a module it has no row for: off, the hook
 * holds `empty`, subscribes to nothing and hydrates nothing; on again, it hydrates afresh. A hook
 * cannot be called conditionally, so the switch is an argument (the XP overlay's `loot`).
 */
export function useOverlayModule<Snap>(moduleId: string, empty: Snap, enabled = true): Snap {
  const [state, setState] = useState<Snap>(empty)
  // The empty value is a module constant at every call site; a ref keeps it out of the effect's
  // dependency list all the same, so a caller's literal could never resubscribe per render.
  const emptyRef = useRef(empty)

  useEffect(() => {
    if (!enabled) {
      setState(emptyRef.current)
      return
    }
    let cancelled = false
    /** The cursor the held state is at. -1 until the first snapshot lands. */
    let knownSeq = -1
    let hydrated = false
    /** The newest cursor heard while a hydrate was in flight; -1 when there is none. */
    let pendingSeq = -1
    /** How many snapshots have been asked for. Only the answer to the newest one counts. */
    let asked = 0
    /** The world that held these rows changed hands: with no snapshot back, they go. */
    let dropOnNull = false
    /** The log the rows held are of, by base name. Undefined until this window has been told. */
    let heldLog: string | null | undefined
    // The loot ledger arrives as what this window lacks (shared/lootFrame.ts); the copy it is
    // appended to is forgotten at every re-ask below that is not about a moved cursor.
    const lootFrames = moduleId === LOOT_MODULE ? createLootFrameReader(window.eqOverlay.getLootFrame) : null
    const read = (): Promise<ModuleSnapshot<Snap> | null> =>
      lootFrames ? (lootFrames.read() as Promise<ModuleSnapshot<Snap> | null>) : window.eqOverlay.getModuleSnapshot<Snap>(moduleId)

    /** Take the rows down: they are of a world that is gone. */
    const drop = (): void => {
      knownSeq = -1
      setState(emptyRef.current)
    }

    const hydrate = (): void => {
      // Asked because the world changed hands: what is held is no base for an append.
      if (dropOnNull) lootFrames?.forget()
      hydrated = false
      pendingSeq = -1
      asked += 1
      const mine = asked
      void read().then((snap) => {
        // An answer to an older ask may be of the character this window has left (fork #9).
        if (cancelled || mine !== asked) return
        hydrated = true
        const gone = dropOnNull
        dropOnNull = false
        // NO SNAPSHOT: the engine has nothing to say for this module yet. The window keeps what it
        // draws rather than inventing rows — unless the world those rows came from is gone.
        if (!snap) {
          if (gone) drop()
          // A cursor heard during this read is still unanswered: the empty reply says nothing of it.
          if (pendingSeq > knownSeq) hydrate()
          return
        }
        knownSeq = snap.seq
        setState(snap.state)
        // …and the cursor that landed during the fetch — `lib/useModule.ts` states why it cannot be
        // dropped and why the re-fetch terminates.
        if (pendingSeq > knownSeq) hydrate()
      }, () => {
        // A fetch that threw still settles, or every later cursor would only be buffered.
        if (cancelled || mine !== asked) return
        hydrated = true
        if (pendingSeq > knownSeq) hydrate()
      })
    }

    /** Ask again because the world that answers changed hands, not because a cursor moved. */
    const rehydrate = (): void => {
      dropOnNull = true
      hydrate()
    }

    const offChanged = window.eqOverlay.onModuleChanged((c: ModuleChanged) => {
      if (c.moduleId === MODULE_WORLD_CHANGED) {
        rehydrate()
        return
      }
      if (c.moduleId !== moduleId) return
      if (!hydrated) {
        if (c.seq > pendingSeq) pendingSeq = c.seq
        return
      }
      if (c.seq <= knownSeq) return
      hydrate()
    })
    const offChar = window.eqOverlay.onCharacter((c) => {
      const log = c === null ? null : baseName(c.logPath)
      const was = heldLog
      heldLog = log
      // A REBUILD OF THE SAME LOG: the rows are still this character's, and they stay while it is
      // asked again. The engine is "not live" for that instant, and an empty overlay would flash.
      if (was === log) {
        lootFrames?.forget()
        hydrate()
        return
      }
      // ANOTHER CHARACTER'S LOG: its rows come down now, before the answer. A window never told
      // which log was active cannot know, so its rows go only if no snapshot comes back.
      if (was !== undefined) drop()
      rehydrate()
    })
    // Which log is active now, so the first character frame can be told from a switch.
    void window.eqOverlay.logReadReport().then(
      (report) => {
        if (!cancelled && heldLog === undefined) heldLog = report.logFile
      },
      () => undefined
    )
    hydrate()

    return () => {
      cancelled = true
      offChanged()
      offChar()
    }
  }, [moduleId, enabled])

  return state
}
