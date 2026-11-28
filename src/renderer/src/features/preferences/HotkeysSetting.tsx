// HotkeysSetting — Preferences → Hotkeys: every app hotkey in one place (owner, 2026-11-27: "add a
// toggle button to turn the mouse overlay features on/off ... Should go in a hotkeys area"). Two
// rows: "Bring overlays back" (also still in Overlays, the same control and state) and "Cursor
// overlay on/off", which flips the Cursor overlay tab's master switch from anywhere, the game
// included. Both are off until the player sets one (shared/overlayHotkey.ts, main/hotkeys.ts).
//
// The descriptor lives beside its card, as PerfSetting's does: PreferencesView.tsx is at its ceiling.

import type { JSX } from 'react'
import KeyboardIcon from '@mui/icons-material/Keyboard'
import { HOTKEY_LABELS } from '@shared/overlayHotkey'
import { HotkeyField } from './HotkeyField'
import { OverlayRecoverSetting, RECOVER_KEYWORDS } from './OverlayRecoverSetting'
import type { PrefSection } from './PreferencesView'

/** The cursor overlay's on/off row. */
function CursorToggleSetting(): JSX.Element {
  return (
    <HotkeyField
      action="cursorToggle"
      label="Cursor overlay on/off hotkey"
      caption="Turns the whole cursor overlay on or off, even while you play."
      testid="pref-hotkey-cursorToggle"
    />
  )
}

export function hotkeysSection(): PrefSection {
  return {
    id: 'hotkeys',
    label: 'Hotkeys',
    icon: <KeyboardIcon fontSize="small" />,
    items: [
      {
        id: 'hotkey-recover',
        label: HOTKEY_LABELS.recover,
        keywords: `${RECOVER_KEYWORDS} keyboard`,
        content: <OverlayRecoverSetting testid="pref-hotkey-recover" />
      },
      {
        id: 'hotkey-cursor-toggle',
        label: HOTKEY_LABELS.cursorToggle,
        keywords: 'hotkey shortcut key keyboard toggle on off cursor mouse pointer overlay ring crosshair trail',
        content: <CursorToggleSetting />
      }
    ]
  }
}
