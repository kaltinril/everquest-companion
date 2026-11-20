// lib/useLiveDot.ts - the title bar's live dot (fork #9, phase R3).
//
// THE DOT MEANS: a line of the log has been taken in since the last rebuild, and the read is fine.
// It used to be lit by ANY module frame. That includes the world-changed frame, which says only
// that who answers reads changed hands, so the dot went green when the engine went live on a
// silent log and when it went away; and nothing ever turned it off while the status said the read
// had stopped. A player looking at a green dot over a dead read is told the wrong thing.
//
// The shared imports are RELATIVE and the hook's core takes its bridge and the status's verdict as
// arguments, so `tests/liveDot.test.mts` runs it with no window.

import { useCallback, useEffect, useState } from 'react'
import type { LogReadReport } from '../../../shared/logReadReport'
import { MODULE_WORLD_CHANGED, type CharacterRef, type ModuleChanged } from '../../../shared/types'
import { useLogReadReport } from './logReadReportHud'

/** The two subscriptions the dot needs. `window.eq` has both. */
export interface LiveDotBridge {
  onModuleChanged(cb: (c: ModuleChanged) => void): () => void
  onCharacter(cb: (c: CharacterRef | null) => void): () => void
}

export interface LiveDot {
  readonly live: boolean
  /** Dark until the next line: the title bar's own character switch was applied. */
  readonly clear: () => void
}

/** Does this frame say the log moved? The world-changed frame carries no cursor: it does not. */
export function lightsDot(moduleId: string): boolean {
  return moduleId !== MODULE_WORLD_CHANGED
}

/** May the dot be lit under this status? Before a window's first answer nothing forbids it. */
export function dotAllowed(report: LogReadReport | null): boolean {
  return report === null || report.wait === 'ok'
}

/** The dot over `bridge`, lit only while `allowed`. */
export function useDotLit(bridge: LiveDotBridge, allowed: boolean): LiveDot {
  const [lit, setLit] = useState(false)
  useEffect(() => {
    const offChanged = bridge.onModuleChanged((c) => {
      if (lightsDot(c.moduleId)) setLit(true)
    })
    // A rebuilt world has proven nothing yet.
    const offCharacter = bridge.onCharacter(() => {
      setLit(false)
    })
    return () => {
      offChanged()
      offCharacter()
    }
  }, [bridge])
  // What was seen before the trouble says nothing about after it: the dot waits for a new line.
  useEffect(() => {
    if (!allowed) setLit(false)
  }, [allowed])
  const clear = useCallback(() => {
    setLit(false)
  }, [])
  return { live: lit && allowed, clear }
}

/** The main window's dot: lit by its module frames, off whenever the log-read status is not ok. */
export function useLiveDot(): LiveDot {
  return useDotLit(window.eq, dotAllowed(useLogReadReport()))
}
