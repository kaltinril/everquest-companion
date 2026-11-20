// lib/useTabLine.ts - what a tab draws where its empty text goes, as a hook (fork #9, phase R3).
//
// The core of `components/LogReadInline.tsx`'s `useTabLine`, with the status handed in: the
// window's status store needs `useSyncExternalStore` and the component needs MUI, and
// `tests/tabLine.test.mts` runs this with neither. The shared imports are RELATIVE for that suite.

import type { LogReadReport } from '../../../shared/logReadReport'
import { LOG_READ_INLINE_AFTER_MS, emptyOrWaiting, inlineDue, type TabLine } from '../../../shared/logReadWords'
import { useHeldFor } from './useHeldFor'

const EMPTY: TabLine = { kind: 'empty' }

/**
 * What a tab draws where its empty text goes: its own words (`empty`) when `served`, the status
 * line (`waiting`) when its module has had no snapshot for a moment, or nothing yet (null).
 * NEVER `empty` for a module that was not served: that is the whole rule.
 */
export function useTabLineOf(report: LogReadReport | null, module: string, served: boolean): TabLine | null {
  const waited = useHeldFor(!served, LOG_READ_INLINE_AFTER_MS)
  // Before this window's first status the tab can only say what it knows itself.
  if (report === null) return served ? EMPTY : null
  const line = emptyOrWaiting(!served, report, module)
  if (line.kind === 'empty') return line
  return inlineDue(report, waited ? LOG_READ_INLINE_AFTER_MS : 0) ? line : null
}
