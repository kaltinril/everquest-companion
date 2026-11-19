// lib/logReadReportHud.ts - a "Reading log..." panel asking main what it is waiting on (fork #9).
//
// Mounted only inside a hydrating panel, so nothing is asked on a healthy launch: the first ask is
// 5 s after mount and a panel that hydrated sooner has already unmounted. The shared import is
// RELATIVE, like engineLaunchHud.ts's, so a unit suite with no `@shared/*` alias can import it.

import { useEffect, useState } from 'react'
import type { LogReadReport } from '../../../shared/logReadReport'

const FIRST_ASK_MS = 5_000
const ASK_EVERY_MS = 3_000

export interface LogReadReportView {
  /** Main's last answer, or null before the first one. */
  readonly report: LogReadReport | null
  /** How long this panel had been mounted at the last ask. */
  readonly mountedMs: number
}

const NOTHING_YET: LogReadReportView = { report: null, mountedMs: 0 }

export function useLogReadReport(): LogReadReportView {
  const [view, setView] = useState<LogReadReportView>(NOTHING_YET)

  useEffect(() => {
    const mountedAt = Date.now()
    let timer: ReturnType<typeof setTimeout> | null = null
    let gone = false
    const ask = (): void => {
      void window.eq
        .logReadReport()
        // A rejected ask keeps the last answer: no handler, or main threw.
        .catch(() => null)
        .then((report) => {
          if (gone) return
          setView((was) => ({ report: report ?? was.report, mountedMs: Date.now() - mountedAt }))
          timer = setTimeout(ask, ASK_EVERY_MS)
        })
    }
    timer = setTimeout(ask, FIRST_ASK_MS)
    return () => {
      gone = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [])

  return view
}
