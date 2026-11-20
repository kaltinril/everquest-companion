// components/SettingsRecoveryNotice.tsx: "your settings file was damaged", said once per launch.
//
// Main recovers a damaged settings file at startup and builds the words
// (shared/settingsRecovery.ts). This card shows them until the player closes it, so a restore from
// an old copy or a reset to defaults is never mistaken for a fresh install. Self-contained like
// LogSwitchNudge: the shell gains one element and no state. It sits under the title bar because
// the bottom edge belongs to the first-run strips, which a reset brings back.

import { type JSX, useEffect, useState } from 'react'
import { Alert, AlertTitle, Button, Snackbar, Stack } from '@mui/material'
import type { SettingsRecoveryNotice as Notice } from '@shared/settingsRecovery'

export default function SettingsRecoveryNotice(): JSX.Element | null {
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let alive = true
    void window.eq.getSettingsRecoveryNotice().then((found) => {
      if (alive) setNotice(found)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!notice) return null

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: 56 }}
      data-testid="settings-recovery-notice"
    >
      <Alert
        severity={notice.kind === 'recovered' ? 'info' : 'warning'}
        variant="filled"
        sx={{ alignItems: 'flex-start', maxWidth: 520 }}
      >
        <AlertTitle>{notice.title}</AlertTitle>
        <Stack spacing={1} alignItems="flex-start">
          <span data-testid="settings-recovery-notice-text" style={{ overflowWrap: 'anywhere' }}>
            {notice.text}
          </span>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            data-testid="settings-recovery-notice-close"
            onClick={() => {
              setNotice(null)
              window.eq.settingsRecoverySeen()
            }}
          >
            OK
          </Button>
        </Stack>
      </Alert>
    </Snackbar>
  )
}
