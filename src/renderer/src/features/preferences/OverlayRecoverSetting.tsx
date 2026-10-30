// OverlayRecoverSetting — Preferences → Overlays: the hotkey that brings lost overlays back
// (overlay polish; owner, 2026-10-29). Off until the player presses a key with Ctrl, Alt or Win
// held (shared/overlayHotkey.ts); main takes it system-wide (main/overlayRecover.ts). The item names
// itself here, as PerfSetting's does, because PreferencesView.tsx sits at its ceiling.

import { type JSX, useEffect, useState } from 'react'
import { Button, Stack, TextField, Typography } from '@mui/material'
import { acceleratorOf } from '@shared/overlayHotkey'
import type { PrefItem } from './PreferencesView'

function OverlayRecoverSetting(): JSX.Element {
  // undefined while main's answer is on its way.
  const [hotkey, setHotkey] = useState<string | null | undefined>(undefined)
  const [listening, setListening] = useState(false)
  const [note, setNote] = useState<string | undefined>(undefined)
  useEffect(() => {
    void window.eq.overlayRecoverHotkey('get').then((r) => setHotkey(r.hotkey)).catch(() => undefined)
  }, [])
  const set = (accel: string | null): void => {
    void window.eq
      .overlayRecoverHotkey('set', accel)
      .then((r) => {
        setHotkey(r.hotkey)
        setNote(r.message)
      })
      .catch(() => setNote('The hotkey could not be set.'))
  }
  const shown = listening ? 'Press a key with Ctrl, Alt or Win…' : hotkey === undefined ? '' : (hotkey ?? 'Off')
  return (
    <Stack spacing={0.5} data-testid="pref-overlay-recover">
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          label="Recover overlays hotkey"
          value={shown}
          onFocus={() => setListening(true)}
          onBlur={() => setListening(false)}
          onKeyDown={(e) => {
            e.preventDefault()
            const accel = acceleratorOf(e)
            if (accel === undefined) return
            setListening(false)
            set(accel)
          }}
          slotProps={{ htmlInput: { readOnly: true, 'data-testid': 'pref-overlay-recover-key' } }}
          sx={{ minWidth: 260 }}
        />
        {hotkey != null && (
          <Button size="small" onClick={() => set(null)}>
            Turn off
          </Button>
        )}
        <Button size="small" onClick={() => void window.eq.recoverOverlays()}>
          Recover now
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {note ?? 'Brings every open overlay back onto a screen and in front, even from the game.'}
      </Typography>
    </Stack>
  )
}

export const overlayRecoverItem: PrefItem = {
  id: 'overlay-recover',
  label: 'Recover lost overlays',
  keywords: 'hotkey shortcut key recover lost missing off screen monitor bring back overlay overlays reset find',
  content: <OverlayRecoverSetting />
}
