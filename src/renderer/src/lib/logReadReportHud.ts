// lib/logReadReportHud.ts - this window's copy of the log-read status (fork #9).
//
// ONE STORE PER WINDOW, read by the band under the title bar and by the box in the "Reading
// log..." panels, so the two cannot say different things. Main pushes the status when what it says
// changes (`main/logReadStatus.ts`); nothing here polls. It used to: each hydrating panel asked
// every 3 s, and only those two panels knew anything.
//
// SUBSCRIBE FIRST, THEN READ ONCE: `engineLaunchHud.ts`'s order, for its reason. The push carries
// every change; the one read exists because a window that opened after the status stopped
// changing would otherwise never learn it. An answer that lands after a push is dropped: a stale
// read must never overwrite a fresh push.
//
// The shared import is RELATIVE, like engineLaunchHud.ts's, so a unit suite with no `@shared/*`
// alias can import it. The store is a factory with its bridge handed in for the same suite.

import { useSyncExternalStore } from 'react'
import type { LogReadReport } from '../../../shared/logReadReport'

/** The two calls a window's bridge gives for the status. Both preloads carry them. */
export interface LogReadBridge {
  onLogReadReport(cb: (report: LogReadReport) => void): () => void
  logReadReport(): Promise<LogReadReport>
}

export interface LogReadStore {
  /** `useSyncExternalStore`'s subscribe. The first subscriber starts the store. */
  readonly subscribe: (listener: () => void) => () => void
  /** Main's last word, or null before the first one. */
  readonly get: () => LogReadReport | null
  /** Ask main once more. For a reader that draws numbers main is not pushing (`show` false). */
  readonly refresh: () => void
}

export function createLogReadStore(bridge: () => LogReadBridge | null): LogReadStore {
  let report: LogReadReport | null = null
  let source: LogReadBridge | null = null
  /** Pushes heard so far: a read that was asked before the newest one is stale. */
  let pushes = 0
  const listeners = new Set<() => void>()

  const take = (next: LogReadReport): void => {
    report = next
    for (const listener of Array.from(listeners)) listener()
  }

  const read = (from: LogReadBridge): void => {
    const asked = pushes
    void from.logReadReport().then(
      (answer) => {
        if (pushes === asked) take(answer)
      },
      () => {
        // No handler, or main threw: the last answer stands.
      }
    )
  }

  const start = (): void => {
    if (source !== null) return
    source = bridge()
    if (source === null) return
    // Kept for the life of the window: the store is shared, and a status nobody is drawing now
    // must still be right when a tab that draws it mounts.
    source.onLogReadReport((next) => {
      pushes += 1
      take(next)
    })
    read(source)
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      start()
      return () => {
        listeners.delete(listener)
      }
    },
    get: () => report,
    refresh: () => {
      if (source !== null) read(source)
    }
  }
}

/** The main window's bridge, or an overlay's: whichever this window was given. */
function windowBridge(): LogReadBridge | null {
  const w = window as unknown as { eq?: LogReadBridge; eqOverlay?: LogReadBridge }
  return w.eq ?? w.eqOverlay ?? null
}

const store = createLogReadStore(windowBridge)

/** What the app is waiting on, as main last said it. Null before this window's first answer. */
export function useLogReadReport(): LogReadReport | null {
  return useSyncExternalStore(store.subscribe, store.get)
}

/** One more ask of main (`LogReadStore.refresh`). */
export function refreshLogReadReport(): void {
  store.refresh()
}
