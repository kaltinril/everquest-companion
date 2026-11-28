// HotkeyField — the key-capture control for every app hotkey (shared/overlayHotkey.ts): press a key
// with Ctrl, Alt or Win held and main takes it system-wide (main/hotkeys.ts). One control and one
// state for every place a key is shown: the recover key sits in Overlays AND in Hotkeys (owner,
// 2026-11-27: "everything should be where it is, but also in hotkeys"), and the Cursor overlay tab
// shows the on/off key, so a change in one copy reaches every mounted copy and the pane's snapshot.

import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Button, Stack, TextField, Typography } from '@mui/material'
import { type HotkeyAction, type HotkeyAnswer, type HotkeyState, acceleratorOf } from '@shared/overlayHotkey'
import { recordPref, usePrefsSeed } from './prefsHydration'

/** One set's outcome: every key after it (absent when the call failed) and that action's note. */
interface HotkeyEvent {
  action: HotkeyAction
  message?: string
  hotkeys?: HotkeyState
}

const listeners = new Set<(e: HotkeyEvent) => void>()

function publish(e: HotkeyEvent): void {
  if (e.hotkeys) recordPref('hotkeys', e.hotkeys)
  for (const l of listeners) l(e)
}

/** Ask main to set one action's key (null: off), then tell every mounted copy what it answered. */
function setHotkey(action: HotkeyAction, accel: string | null): void {
  void window.eq.setHotkey(action, accel).then(
    (r) => publish({ action, message: r.answer.message, hotkeys: r.hotkeys }),
    () => publish({ action, message: 'The hotkey could not be set.' })
  )
}

/**
 * One action's key as main holds it, seeded from the pane's snapshot (JOS-340) and kept current by
 * every copy's sets. `note` is why a key was refused or a saved key is off; undefined when none.
 */
export function useHotkey(action: HotkeyAction): {
  answer: HotkeyAnswer
  note: string | undefined
  set: (accel: string | null) => void
} {
  const seed = usePrefsSeed().hotkeys[action]
  const [answer, setAnswer] = useState(seed)
  const [note, setNote] = useState(seed.message)
  useEffect(() => {
    const listener = (e: HotkeyEvent): void => {
      if (e.hotkeys) setAnswer(e.hotkeys[action])
      if (e.action === action) setNote(e.message)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [action])
  const set = useCallback((accel: string | null) => setHotkey(action, accel), [action])
  return { answer, note, set }
}

/** The capture field, Turn off or Forget, any extra buttons, and the caption or the refusal. */
export function HotkeyField({
  action,
  label,
  caption,
  testid,
  children
}: {
  action: HotkeyAction
  label: string
  /** What the key does, shown while there is nothing to say about the key itself. */
  caption: string
  testid: string
  children?: ReactNode
}): JSX.Element {
  const { answer, note, set } = useHotkey(action)
  const [listening, setListening] = useState(false)
  // A saved key that is off since start: the field reads Off, so "Turn off" would say nothing.
  const { hotkey, savedOff } = answer
  const shown = listening ? 'Press a key with Ctrl, Alt or Win…' : (hotkey ?? 'Off')
  return (
    <Stack spacing={0.5} data-testid={testid}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
        <TextField
          size="small"
          label={label}
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
          slotProps={{ htmlInput: { readOnly: true, 'data-testid': `${testid}-key` } }}
          sx={{ minWidth: 260 }}
        />
        {hotkey !== null && (
          <Button size="small" onClick={() => set(null)}>
            Turn off
          </Button>
        )}
        {hotkey === null && savedOff !== undefined && (
          <Button size="small" onClick={() => set(null)} data-testid={`${testid}-forget`}>
            {`Forget ${savedOff}`}
          </Button>
        )}
        {children}
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {note ?? caption}
      </Typography>
    </Stack>
  )
}
