// LogReadReport.tsx - the box under "Reading log..." that says what the app is waiting on (fork #9).
//
// Drawn by the Overview and Combat hydrating panels. Nothing shows for a healthy read: the box
// appears once main says something has failed, or the panel has waited LOG_READ_SLOW_MS. Every
// word and every row is decided in shared/logReadReport.ts; this file only draws them, sized to be
// read off a screenshot.

import type { JSX } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { LOG_READ_SLOW_MS, logReadLines } from '../../../shared/logReadReport'
import { useLogReadReport } from '../lib/logReadReportHud'

export function LogReadReport(): JSX.Element | null {
  const { report, mountedMs } = useLogReadReport()
  if (report === null) return null
  if (!report.show && mountedMs < LOG_READ_SLOW_MS) return null
  return (
    <Box
      data-testid="log-read-report"
      sx={{ mb: 1, px: 1, py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1 }}
    >
      {logReadLines(report, Date.now()).map((line) => (
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
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
        Stuck here? Post a screenshot of this box on your report.
      </Typography>
    </Box>
  )
}
