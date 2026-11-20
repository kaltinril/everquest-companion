// LogReadInline.tsx - the one line a tab draws where its empty text would go, while its module
// has no snapshot (fork #9, phase R3).
//
// A tab used to coalesce a missing snapshot into the empty shape and print "nothing yet, go play"
// while the log had not been read, or its reply had not been served. The rule is SkillsView's: a
// tab prints its own empty text only when its RAW snapshot is non-null. For a null one this file
// draws what the app is waiting on, from the window's one status store, in words main decides
// (`shared/logReadWords.ts emptyOrWaiting`).
//
// THE LINE IS HELD BACK FOR A MOMENT (`inlineDue`), so a healthy launch and a rebuild of the same
// log, which leave a module without a snapshot for an instant, draw nothing new.

import type { JSX, ReactNode } from 'react'
import { Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import {
  LOG_READ_INLINE_AFTER_MS,
  emptyOrWaiting,
  inlineDue,
  tabLineText,
  type TabLine
} from '../../../shared/logReadWords'
import { useHeldFor } from '../lib/useHeldFor'
import { useLogReadReport } from '../lib/logReadReportHud'

const EMPTY: TabLine = { kind: 'empty' }

/**
 * What a tab draws where its empty text goes: its own words (`empty`) when `served`, the status
 * line (`waiting`) when its module has had no snapshot for a moment, or nothing yet (null).
 */
export function useTabLine(module: string, served: boolean): TabLine | null {
  const report = useLogReadReport()
  const waited = useHeldFor(!served, LOG_READ_INLINE_AFTER_MS)
  // Before this window's first status the tab can only say what it knows itself.
  if (report === null) return served ? EMPTY : null
  const line = emptyOrWaiting(!served, report, module)
  if (line.kind === 'empty') return line
  return inlineDue(report, waited ? LOG_READ_INLINE_AFTER_MS : 0) ? line : null
}

export interface LogReadInlineProps {
  /** The module the tab's list is read from. */
  readonly module: string
  /** Is that module's raw snapshot non-null? */
  readonly served: boolean
  /** The tab's own empty text, drawn only when its module is served. */
  readonly children?: ReactNode
  /** The spacing the tab's own empty text has, for the line drawn in its place. */
  readonly sx?: SxProps<Theme>
}

export function LogReadInline({ module, served, children, sx }: LogReadInlineProps): JSX.Element | null {
  const line = useTabLine(module, served)
  if (line === null) return null
  if (line.kind === 'empty') return <>{children}</>
  return (
    <Typography variant="body2" color="text.secondary" data-testid="log-read-inline" sx={sx}>
      {tabLineText(line)}
    </Typography>
  )
}
