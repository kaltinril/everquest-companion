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
import { DRAWER_WIDTH } from './NavDrawer'

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
      // WHERE THE CARD SITS. 56 from the top: the 40 px title bar (TitleBar BAR_HEIGHT) plus a 16 px
      // gap. From the right of the left menu to the window's right edge, less a 16 px gutter each
      // side, so it is centred over the content and never over the menu. Above the first-run strip,
      // which a reset brings back and which otherwise covered this card's OK in a small window.
      //
      // `&&` because MUI's own rule for a top-centre Snackbar (top 24, left 50%, a translate) sits
      // in a min-width media query and beats plain sx at every window size the app allows.
      sx={{
        '&&': {
          top: 56,
          left: DRAWER_WIDTH + 16,
          right: 16,
          transform: 'none',
          zIndex: (theme) => theme.zIndex.snackbar + 1
        }
      }}
      data-testid="settings-recovery-notice"
    >
      <Alert
        severity={notice.kind === 'recovered' ? 'info' : 'warning'}
        variant="filled"
        // Never taller than the window under the title bar: a long path at large text scrolls
        // inside the card and OK stays reachable.
        sx={{ alignItems: 'flex-start', maxWidth: 520, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto' }}
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
