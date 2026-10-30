// OverlayFontSetting — Preferences → Overlays: the overlays' typeface, from the fonts installed on
// this PC (overlay polish; owner, 2026-10-29; shared/overlayFont.ts). Default keeps the font the
// overlays have always drawn with. The pick is written to the storage the overlay windows share,
// so open overlays change at once. Each option is drawn in its own font.

import { type JSX, useEffect, useState } from 'react'
import { Autocomplete, Stack, TextField, Typography } from '@mui/material'
import { cleanFontFamily, OVERLAY_DEFAULT_STACK, OVERLAY_FONT_KEY } from '@shared/overlayFont'
import type { PrefItem } from './PreferencesView'

const DEFAULT_LABEL = 'Default'

function storedPick(): string {
  try {
    return cleanFontFamily(localStorage.getItem(OVERLAY_FONT_KEY)) ?? DEFAULT_LABEL
  } catch {
    return DEFAULT_LABEL
  }
}

function savePick(pick: string): void {
  try {
    if (pick === DEFAULT_LABEL) localStorage.removeItem(OVERLAY_FONT_KEY)
    else localStorage.setItem(OVERLAY_FONT_KEY, pick)
  } catch {
    // A blocked store keeps the default font.
  }
}

const face = (option: string): string => (option === DEFAULT_LABEL ? OVERLAY_DEFAULT_STACK : `"${option}", ${OVERLAY_DEFAULT_STACK}`)

function OverlayFontSetting(): JSX.Element {
  const [fonts, setFonts] = useState<string[]>([])
  const [pick, setPick] = useState(storedPick)
  useEffect(() => {
    void window.eq.listFonts().then(setFonts).catch(() => undefined)
  }, [])
  return (
    <Stack spacing={0.5} data-testid="pref-overlay-font">
      <Autocomplete
        size="small"
        disableClearable
        options={[DEFAULT_LABEL, ...fonts]}
        value={pick}
        onChange={(_e, next) => {
          setPick(next)
          savePick(next)
        }}
        renderOption={(props, option) => (
          <li {...props} key={option} style={{ fontFamily: face(option) }}>
            {option}
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Overlay font" />}
        sx={{ maxWidth: 320 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: face(pick) }}>
        The text on every overlay, from the fonts installed on this PC.
      </Typography>
    </Stack>
  )
}

export const overlayFontItem: PrefItem = {
  id: 'overlay-font',
  label: 'Overlay font',
  keywords: 'font fonts typeface type text family installed overlay overlays look style',
  content: <OverlayFontSetting />
}
