// LogReadReport.tsx - the box under "Reading log..." that says what the app is waiting on (fork #9).
//
// Drawn by the Overview and Combat hydrating panels. It reads the window's one copy of the status
// (`lib/logReadReportHud.ts`), the same one the band under the title bar reads, so the two cannot
// disagree. Nothing shows for a healthy read: the box appears once main says something has failed,
// or the panel has itself waited LOG_READ_SLOW_MS. Every word and every row is decided in
// shared/logReadReport.ts; this file only draws them, sized to be read off a screenshot.

import { type JSX, useEffect, useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { LOG_READ_SLOW_MS, boxShows, logReadLines } from '../../../shared/logReadReport'
import { refreshLogReadReport, useLogReadReport } from '../lib/logReadReportHud'
import { LogReadTryAgain } from './LogReadBand'

/** This panel's own clock, moved once a second: when it mounted, and now (for the Waiting row). */
function usePanelClock(): { readonly mountedAt: number; readonly now: number } {
  const [clock, setClock] = useState(() => {
    const at = Date.now()
    return { mountedAt: at, now: at }
  })
  useEffect(() => {
    const timer = setInterval(() => {
      setClock((was) => ({ mountedAt: was.mountedAt, now: Date.now() }))
    }, 1_000)
    return () => {
      clearInterval(timer)
    }
  }, [])
  return clock
}

export function LogReadReport(): JSX.Element | null {
  const report = useLogReadReport()
  const { mountedAt, now } = usePanelClock()
  const mountedMs = now - mountedAt
  // Main pushes numbers only while it says to show the status. A box drawn on this panel's own
  // clock asks once, so its rows are not the ones of the last push.
  const ownClock = report !== null && !report.show && mountedMs >= LOG_READ_SLOW_MS
  useEffect(() => {
    if (ownClock) refreshLogReadReport()
  }, [ownClock])
  if (report === null || !boxShows(report, mountedMs)) return null
  return (
    <Box
      data-testid="log-read-report"
      sx={{ mb: 1, px: 1, py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1 }}
    >
      {logReadLines(report, now).map((line) => (
        <Stack key={line.label} direction="row" spacing={1}>
          <Typography variant="caption" color="text.secondary" sx={{ width: 76, flexShrink: 0 }}>
            {line.label}
          </Typography>
          <Typography variant="caption" sx={{ minWidth: 0, wordBreak: 'break-word' }}>
            {line.value}
          </Typography>
        </Stack>
      ))}
      {report.engineSaid.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="div">
          Engine said
        </Typography>
      )}
      {report.engineSaid.map((line, i) => (
        <Typography
          key={`${String(i)}:${line}`}
          variant="caption"
          component="div"
          sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
        >
          {line}
        </Typography>
      ))}
      {report.action !== null && (
        <Box sx={{ mt: 0.75 }}>
          <LogReadTryAgain testId="log-read-report-try-again" />
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
        Stuck here? Post a screenshot of this box on your report.
      </Typography>
    </Box>
  )
}
