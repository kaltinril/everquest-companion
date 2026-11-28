// OverlayRecoverSetting — the hotkey that brings lost overlays back (overlay polish; owner,
// 2026-10-29). Off until the player presses a key with Ctrl, Alt or Win held; the control and its
// state are HotkeyField's, shared with every other app key. It is listed in Preferences → Overlays,
// where it always was, AND in Preferences → Hotkeys (owner, 2026-11-27: "everything should be where
// it is, but also in hotkeys"); both copies show one state. The item names itself here, as
// PerfSetting's does, because PreferencesView.tsx sits at its ceiling.

import type { JSX } from 'react'
import { Button } from '@mui/material'
import { HotkeyField } from './HotkeyField'
import type { PrefItem } from './PreferencesView'

/** The recover key's row. `testid` tells the two copies apart, since search can show both. */
export function OverlayRecoverSetting({ testid }: { testid: string }): JSX.Element {
  return (
    <HotkeyField
      action="recover"
      label="Recover overlays hotkey"
      caption="Brings every open overlay back onto a screen and in front, even from the game."
      testid={testid}
    >
      <Button size="small" onClick={() => void window.eq.recoverOverlays()}>
        Recover now
      </Button>
    </HotkeyField>
  )
}

/** The words that find the recover key, in either section. */
export const RECOVER_KEYWORDS =
  'hotkey shortcut key recover lost missing off screen monitor bring back overlay overlays reset find'

export const overlayRecoverItem: PrefItem = {
  id: 'overlay-recover',
  label: 'Recover lost overlays',
  keywords: RECOVER_KEYWORDS,
  content: <OverlayRecoverSetting testid="pref-overlay-recover" />
}
