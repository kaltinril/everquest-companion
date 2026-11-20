// LogReadBand.tsx - the status band under the title bar: what the app is waiting on, what to try,
// and Try again where the app can act (fork #9).
//
// A player was stuck on "Reading log..." for days with nothing on screen saying why. The reason
// used to be drawn only inside the Overview and Combat panels; this band is on every tab.
// `EngineLaunchBanner` decides when it is drawn (`bannerFor`), main decides every word
// (`shared/logReadWords.ts`), and this file only draws them.
//
// IT SITS IN THE SEAM THE CATCH-UP BAR AND THE FAILURE CARD USE: a `flexShrink: 0` band above the
// scroller, so it takes its own height and covers nothing; a long sentence or a narrow window
// wraps the button under the text. `role="status"` with a polite live region: a screen reader
// says the sentence when it changes and focus stays where it was.

import { type JSX, useState } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import type { LogReadReport } from '../../../shared/logReadReport'
import { LOG_READ_WORDS } from '../../../shared/logReadWords'

/**
 * The status's one button. Disabled for the round trip and nothing longer, like the failure
 * card's retry: `logReadTryAgain` resolves when main has taken the ask, and what happened next
 * arrives as the status changing.
 */
export function LogReadTryAgain({ testId }: { testId: string }): JSX.Element {
  const [asking, setAsking] = useState(false)
  return (
    <Button
      size="small"
      variant="contained"
      disabled={asking}
      data-testid={testId}
      sx={{ flexShrink: 0 }}
      onClick={() => {
        setAsking(true)
        void window.eq
          .logReadTryAgain()
          // No handler, or main threw: the status on screen is still the answer.
          .catch(() => undefined)
          .finally(() => {
            setAsking(false)
          })
      }}
    >
      Try again
    </Button>
  )
}

export interface LogReadBandProps {
  readonly report: LogReadReport
  /** `band`: the wait, its Try line and its button. `notes`: the report's notes alone. */
  readonly kind: 'band' | 'notes'
}

export function LogReadBand({ report, kind }: LogReadBandProps): JSX.Element {
  const theme = useTheme()
  const waiting = kind === 'band'
  return (
    <Box
      role="status"
      aria-live="polite"
      data-testid="log-read-band"
      data-wait={report.wait}
      sx={{
        flexShrink: 0,
        px: 2,
        py: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.background.paper
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Box sx={{ minWidth: 0, flexGrow: 1, flexBasis: 240 }}>
          {waiting && (
            <Typography variant="body2" sx={{ fontWeight: 600 }} data-testid="log-read-band-wait">
              {LOG_READ_WORDS[report.wait]}
            </Typography>
          )}
          {waiting && report.tryLine !== null && (
            <Typography variant="body2" color="text.secondary" data-testid="log-read-band-try">
              {report.tryLine}
            </Typography>
          )}
          {!waiting &&
            report.notes.map((note) => (
              <Box key={note.id} data-testid="log-read-band-note">
                <Typography variant="body2">{note.text}</Typography>
                {note.tryLine !== undefined && (
                  <Typography variant="body2" color="text.secondary">
                    {note.tryLine}
                  </Typography>
                )}
              </Box>
            ))}
        </Box>
        {waiting && report.action !== null && <LogReadTryAgain testId="log-read-band-try-again" />}
      </Stack>
    </Box>
  )
}
