// overlayHotkey.ts — the app's system-wide keys: "Bring overlays back" (overlay polish; owner,
// 2026-10-29) and "Cursor overlay on/off" (owner, 2026-11-27). One owner per action, one store key
// per action (main/hotkeys.ts), and no two actions on one key.
// A registered system-wide key (Electron globalShortcut, Windows RegisterHotKey), never a keyboard
// hook. Off until the player sets one, so no default takes a key from the game; Ctrl, Alt or Win is
// required, since a key alone (or with Shift) is the game's. The rules are the ones the removed
// screenshot-capture hotkey used (2026-10-21).

/** The things a hotkey can do. The order is the Hotkeys section's row order. */
export const HOTKEY_ACTIONS = ['recover', 'cursorToggle'] as const
export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number]

/** Each action's name, as the Hotkeys rows and a clash refusal say it. */
export const HOTKEY_LABELS: Readonly<Record<HotkeyAction, string>> = {
  recover: 'Bring overlays back',
  cursorToggle: 'Cursor overlay on/off'
}

export function isHotkeyAction(v: unknown): v is HotkeyAction {
  return typeof v === 'string' && (HOTKEY_ACTIONS as readonly string[]).includes(v)
}

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

const ALIASES: Readonly<Record<string, string>> = {
  control: 'ctrl',
  commandorcontrol: 'ctrl',
  cmdorctrl: 'ctrl',
  meta: 'super',
  command: 'super',
  cmd: 'super'
}

/** Whether two accelerators name one key: the same parts in any order, any case, any alias. */
export function sameAccelerator(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s
      .split('+')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
      .map((p) => ALIASES[p] ?? p)
      .sort()
      .join('+')
  return norm(a) === norm(b)
}

/** What a key's owner needs from the system and the settings store (main/hotkeys.ts). */
export interface HotkeyPorts {
  /** Take the key system-wide; false, or a throw, when it is refused. */
  register: (accel: string) => boolean
  unregister: (accel: string) => void
  /** The key saved last time; anything but a string is none. */
  load: () => unknown
  save: (accel: string) => void
  clear: () => void
  /** Why another of the app's own keys stops this one; undefined when none does. */
  clash?: (accel: string) => string | undefined
}

export interface Hotkey {
  /** Take the saved key again at app start. */
  start: () => void
  set: (accel: string | null) => HotkeyAnswer
  get: () => HotkeyAnswer
}

/**
 * One key's state: which key is in force, and what Preferences is told. A new key is taken before
 * the old one is let go, so a refused key leaves the old one working. A saved key refused at start
 * stays saved and off; `get` says so until a key is set or the key is turned off.
 */
export function makeHotkey(ports: HotkeyPorts): Hotkey {
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
    const clash = ports.clash?.(accel)
    if (clash !== undefined) return refusal(clash)
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
    // A key the rules refuse, or one of the app's own keys holds, never comes back by itself; a key
    // held by another program does.
    const comesBack = hotkeyProblem(saved) === undefined && ports.clash?.(saved) === undefined
    const later = comesBack ? ' It comes back when the app starts with the key free.' : ''
    startNote = `Your saved key is off. ${refused}${later}`
    savedOff = saved
  }
  const get = (): HotkeyAnswer =>
    current === null && startNote !== undefined ? { hotkey: null, message: startNote, savedOff } : { hotkey: current }
  return { start, set, get }
}

/** Every action's key as `get` answers it: what the Preferences pane seeds from. */
export type HotkeyState = Record<HotkeyAction, HotkeyAnswer>

/** Main's answer to a set: that action's answer (a refusal says why) and every key after it. */
export interface HotkeySetReply {
  answer: HotkeyAnswer
  hotkeys: HotkeyState
}

export interface HotkeyBoard {
  /** Take every saved key again at app start, in `HOTKEY_ACTIONS` order. */
  start: () => void
  set: (action: HotkeyAction, accel: string | null) => HotkeySetReply
  get: () => HotkeyState
}

/** Whether an answer holds this key: in force, or saved and off since start. */
function holds(answer: HotkeyAnswer, accel: string): boolean {
  const held = answer.hotkey ?? answer.savedOff
  return held != null && sameAccelerator(held, accel)
}

/**
 * Every action's key, one owner each (`makeHotkey`), over its own ports. A key another action
 * holds, in force or saved and off, is refused before the system is asked, with that action named.
 */
export function makeHotkeyBoard(ports: Record<HotkeyAction, HotkeyPorts>): HotkeyBoard {
  // Filled below before anything can ask: a clash is only checked inside a set or a start.
  const keys = {} as Record<HotkeyAction, Hotkey>
  const clashFor =
    (me: HotkeyAction) =>
    (accel: string): string | undefined => {
      const other = HOTKEY_ACTIONS.find((a) => a !== me && holds(keys[a].get(), accel))
      return other === undefined ? undefined : `${accel} is already the ${HOTKEY_LABELS[other]} key. Pick another key.`
    }
  for (const a of HOTKEY_ACTIONS) keys[a] = makeHotkey({ ...ports[a], clash: clashFor(a) })
  const get = (): HotkeyState => {
    const out = {} as HotkeyState
    for (const a of HOTKEY_ACTIONS) out[a] = keys[a].get()
    return out
  }
  return {
    start: () => {
      for (const a of HOTKEY_ACTIONS) keys[a].start()
    },
    set: (action, accel) => ({ answer: keys[action].set(accel), hotkeys: get() }),
    get
  }
}
