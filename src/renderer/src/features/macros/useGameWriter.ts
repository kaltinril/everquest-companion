// macros/useGameWriter.ts — one character file's send and restore: the call to main, whether one
// is under way, and the sentence said back. Main does every check; this only asks and reports.

import { useCallback, useState } from 'react'
import type { GameMacro, GameWriteRefusal, GameWriteRefused, GameWriteResult } from '@shared/macros/types'

type Action = 'send' | 'restore'

export interface GameWriteOutcome {
  action: Action
  ok: boolean
  text: string
}

export interface GameWriter {
  busy: boolean
  /** What the last send or restore said; null before one, and while one is under way. */
  outcome: GameWriteOutcome | null
  send: (macros: GameMacro[], expect: string) => void
  restore: (which: 'original' | 'last') => void
  dismiss: () => void
}

const UNCHANGED = 'Nothing was changed.'

/** The reasons whose sentence depends on the answer; the rest are in REFUSALS. */
type Worded = 'unsavable' | 'game-running' | 'verify-failed'

/** Why it did not happen, and what to do about it. */
const REFUSALS: Record<Exclude<GameWriteRefusal, Worded>, string> = {
  'no-folder': 'No game folder found. Set the EverQuest install folder in Preferences.',
  'bad-request': `The app could not build a safe file. ${UNCHANGED}`,
  'check-failed': `The app could not build a safe file. ${UNCHANGED}`,
  'not-a-character-file': `That file is no longer in the game folder. ${UNCHANGED}`,
  'game-unknown': `The app could not tell whether the game is running. ${UNCHANGED} Close the game, then try again.`,
  'read-failed': `The file could not be read. ${UNCHANGED}`,
  'changed-since-read': `The file changed since it was read. ${UNCHANGED} It was read again: look at the difference.`,
  'no-backup': `That copy is no longer in the game folder. ${UNCHANGED}`,
  'already-same': 'The file already matches that copy.',
  'backup-failed': `A copy of the file could not be made. ${UNCHANGED}`,
  'write-failed': `The file could not be written. ${UNCHANGED} Check it is not read-only.`,
  unexpected: 'Something went wrong. The file was read again: check it.'
}

function refusalText(action: Action, result: GameWriteRefused): string {
  const { reason } = result
  if (reason === 'unsavable') return `${result.problems?.at(0)?.text ?? 'A macro cannot be written as it is.'} ${UNCHANGED}`
  if (reason === 'game-running') return `The game is running. Close it, then ${action} again.`
  if (reason !== 'verify-failed') return REFUSALS[reason]
  if (result.putBack === true) return 'The new file did not read back right. The file was put back as it was.'
  return `The new file did not read back right and could not be put back. The good copy is ${result.backup ?? 'beside it'}.`
}

function outcomeOf(action: Action, result: GameWriteResult): GameWriteOutcome {
  if (!result.ok) return { action, ok: false, text: refusalText(action, result) }
  const done = action === 'send' ? `Sent. The old file is kept as ${result.backup}.` : `Restored. The file before it is kept as ${result.backup}.`
  return { action, ok: true, text: result.note === undefined ? done : `${done} ${result.note}.` }
}

/** `reload` reads the game files again: after every answer, so the screen shows the file as it is. */
export function useGameWriter(file: string, reload: () => void): GameWriter {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<GameWriteOutcome | null>(null)
  const run = useCallback(
    (action: Action, call: () => Promise<GameWriteResult>) => {
      setBusy(true)
      setOutcome(null)
      const failed = (): GameWriteResult => ({ ok: false, reason: 'unexpected' })
      void call()
        .catch(failed)
        .then((result) => {
          setOutcome(outcomeOf(action, result))
          setBusy(false)
          reload()
        })
    },
    [reload]
  )
  const send = useCallback(
    (macros: GameMacro[], expect: string) => {
      run('send', () => window.eq.macrosSend(file, macros, expect))
    },
    [run, file]
  )
  const restore = useCallback(
    (which: 'original' | 'last') => {
      run('restore', () => window.eq.macrosRestore(file, which))
    },
    [run, file]
  )
  const dismiss = useCallback(() => {
    setOutcome(null)
  }, [])
  return { busy, outcome, send, restore, dismiss }
}
