// macros/history.ts — Undo and Redo for the Macros tab: a document's past and future as values.
// Pure: the clock comes in with each change. A send or a restore to the game is not in here.

/** How many steps back are kept. */
export const HISTORY_CAP = 50
/** Changes to the same field this close together are one step (typing a word is one Undo). */
export const COALESCE_MS = 1000

export interface History<T> {
  /** Oldest first. */
  past: T[]
  present: T
  /** The next Redo first. */
  future: T[]
  /** The field the last step changed and when: the next change to it may join that step. */
  last: { field: string; at: number } | null
}

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], last: null }
}

/** When a change was made and, for typing, the field it was typed in (null: always its own step). */
export interface ChangeStamp {
  field: string | null
  at: number
}

/**
 * A change by the player: one Undo step, and Redo is emptied. The same document changes nothing.
 * A change to the field the last step changed, within COALESCE_MS of it, joins that step.
 */
export function record<T>(history: History<T>, next: T, stamp: ChangeStamp): History<T> {
  if (next === history.present) return history
  const { last } = history
  const joins = stamp.field !== null && last !== null && last.field === stamp.field && stamp.at - last.at <= COALESCE_MS
  const stepped = joins ? history.past : [...history.past, history.present].slice(-HISTORY_CAP)
  return { past: stepped, present: next, future: [], last: stamp.field === null ? null : { field: stamp.field, at: stamp.at } }
}

/** A change that is not the player's (the game's macros brought in): the present moves, no step is made. */
export function amend<T>(history: History<T>, next: T): History<T> {
  return next === history.present ? history : { ...history, present: next }
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history
  const past = history.past.slice(0, -1)
  return { past, present: history.past[history.past.length - 1], future: [history.present, ...history.future], last: null }
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history
  return { past: [...history.past, history.present].slice(-HISTORY_CAP), present: history.future[0], future: history.future.slice(1), last: null }
}

/** The part of a key press the shortcut reads. */
export interface KeyPress {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Ctrl+Z is Undo; Ctrl+Y and Ctrl+Shift+Z are Redo (Cmd on a Mac). Anything else: null. */
export function historyKey(press: KeyPress): 'undo' | 'redo' | null {
  if (!(press.ctrlKey || press.metaKey) || press.altKey) return null
  const key = press.key.toLowerCase()
  if (key === 'z') return press.shiftKey ? 'redo' : 'undo'
  return key === 'y' && !press.shiftKey ? 'redo' : null
}
