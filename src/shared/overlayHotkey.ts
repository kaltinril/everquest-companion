// overlayHotkey.ts — the key that brings lost overlays back (overlay polish; owner, 2026-10-29).
// A registered system-wide key (Electron globalShortcut, Windows RegisterHotKey), never a keyboard
// hook. Off until the player sets one, so no default takes a key from the game; Ctrl, Alt or Win is
// required, since a key alone (or with Shift) is the game's. The rules are the ones the removed
// screenshot-capture hotkey used (2026-10-21).

/** What a key press says, as a browser KeyboardEvent carries it. */
export interface KeyPress {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  /** `KeyboardEvent.code`: `KeyS`, `Digit5`, `F9`, `Numpad1`. */
  code: string
}

/** Main's answer to a get or a set: the key in force (null: off) and why a key was refused. */
export interface HotkeyAnswer {
  hotkey: string | null
  message?: string
}

const MODIFIERS = new Set(['Ctrl', 'Control', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Super', 'Meta', 'Command', 'Cmd', 'Shift'])
const REQUIRED = new Set(['Ctrl', 'Control', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Super', 'Meta', 'Command', 'Cmd'])

/** The key part of a press, as Electron's accelerator names it; undefined for a modifier alone or a key it cannot name. */
function keyName(code: string): string | undefined {
  const m = /^(?:Key([A-Z])|Digit(\d)|(F\d{1,2})|Numpad(\d))$/.exec(code)
  if (m === null) return undefined
  return m[1] ?? m[2] ?? m[3] ?? (m[4] === undefined ? undefined : `num${m[4]}`)
}

/** A press as an accelerator (`Ctrl+Alt+O`); undefined until a key beside the modifiers is down. */
export function acceleratorOf(p: KeyPress): string | undefined {
  const key = keyName(p.code)
  if (key === undefined) return undefined
  return [p.ctrlKey ? 'Ctrl' : '', p.altKey ? 'Alt' : '', p.shiftKey ? 'Shift' : '', p.metaKey ? 'Super' : '', key].filter(Boolean).join('+')
}

/** Why an accelerator cannot be the hotkey, in the player's words; undefined when it can. */
export function hotkeyProblem(accel: string): string | undefined {
  const parts = accel.split('+').map((s) => s.trim()).filter(Boolean)
  const keys = parts.filter((p) => !MODIFIERS.has(p))
  if (keys.length !== 1) return 'Press one key with Ctrl, Alt or Win held.'
  if (!parts.some((p) => REQUIRED.has(p))) return "Hold Ctrl, Alt or Win with the key: a key alone (or with Shift) is the game's."
  return undefined
}
