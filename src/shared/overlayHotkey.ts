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
  /** The saved key that is off since start: still stored, and Preferences can forget it. */
  savedOff?: string
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

/** What the key's owner needs from the system and the settings store (main/overlayRecover.ts). */
export interface HotkeyPorts {
  /** Take the key system-wide; false, or a throw, when it is refused. */
  register: (accel: string) => boolean
  unregister: (accel: string) => void
  /** The key saved last time; anything but a string is none. */
  load: () => unknown
  save: (accel: string) => void
  clear: () => void
}

export interface RecoverHotkey {
  /** Take the saved key again at app start. */
  start: () => void
  set: (accel: string | null) => HotkeyAnswer
  get: () => HotkeyAnswer
}

/**
 * The key's state: which key is in force, and what Preferences is told. A new key is taken before
 * the old one is let go, so a refused key leaves the old one working. A saved key refused at start
 * stays saved and off; `get` says so until a key is set or the key is turned off.
 */
export function makeRecoverHotkey(ports: HotkeyPorts): RecoverHotkey {
  let current: string | null = null
  // Why the saved key is off since start; dropped once a key is set or the key is turned off.
  let startNote: string | undefined
  // The saved key that note is about; it stays in the store until a key is set or it is forgotten.
  let savedOff: string | undefined
  const refusal = (message: string): HotkeyAnswer =>
    savedOff === undefined ? { hotkey: current, message } : { hotkey: current, message, savedOff }
  const set = (accel: string | null): HotkeyAnswer => {
    if (accel === null) {
      if (current !== null) ports.unregister(current)
      current = null
      startNote = undefined
      savedOff = undefined
      ports.clear()
      return { hotkey: null }
    }
    const problem = hotkeyProblem(accel)
    if (problem !== undefined) return refusal(problem)
    if (accel === current) return { hotkey: current }
    let ok = false
    try {
      ok = ports.register(accel)
    } catch {
      ok = false
    }
    if (!ok) return refusal(`${accel} is taken by Windows or another program.`)
    if (current !== null) ports.unregister(current)
    current = accel
    startNote = undefined
    savedOff = undefined
    ports.save(accel)
    return { hotkey: current }
  }
  const start = (): void => {
    const saved = ports.load()
    if (typeof saved !== 'string') return
    const refused = set(saved).message
    if (refused === undefined) return
    // A key the rules refuse never comes back by itself; a key held elsewhere does.
    const later = hotkeyProblem(saved) === undefined ? ' It comes back when the app starts with the key free.' : ''
    startNote = `Your saved key is off. ${refused}${later}`
    savedOff = saved
  }
  const get = (): HotkeyAnswer =>
    current === null && startNote !== undefined ? { hotkey: null, message: startNote, savedOff } : { hotkey: current }
  return { start, set, get }
}
