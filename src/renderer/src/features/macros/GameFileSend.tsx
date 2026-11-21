// macros/GameFileSend.tsx — the Characters section's two writes into the game folder, each behind
// a confirm: Send (a set into the file's macros section) and Restore (a kept copy put back whole).

import { type JSX, type ReactNode, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import type { BackupCopy } from '@shared/macros/backups'
import type { SlotChange } from '@shared/macros/sets'
import type { CharacterFileMacros, GameMacro } from '@shared/macros/types'
import { unsavable } from '@shared/macros/unsavable'
import { Tooltip } from '../../lib/Tooltip'
import { MONO_SX, Quiet } from './macroParts'
import type { GameWriter } from './useGameWriter'

/** The in-game tests are still owed (plan, "In-game tests owed"): the dialog says so until they are done. */
const NOT_PROVEN = 'Not proven in game yet. Log in and check your macros after.'

interface ConfirmProps {
  open: boolean
  title: string
  action: string
  testid: string
  onClose: () => void
  onConfirm: () => void
  children: ReactNode
}

function Confirm({ open, title, action, testid, onClose, onConfirm, children }: ConfirmProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" data-testid={`${testid}-dialog`}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>{children}</Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid={`${testid}-cancel`}>
          Cancel
        </Button>
        <Button
          variant="contained"
          data-testid={`${testid}-confirm`}
          onClick={() => {
            onClose()
            onConfirm()
          }}
        >
          {action}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Line({ children }: { children: ReactNode }): JSX.Element {
  return <Typography variant="body2">{children}</Typography>
}

/** What the last send or restore said, where its button is. */
function Outcome({ writer, action }: { writer: GameWriter; action: 'send' | 'restore' }): JSX.Element | null {
  const { outcome } = writer
  if (outcome?.action !== action) return null
  return (
    <Alert severity={outcome.ok ? 'success' : 'warning'} onClose={writer.dismiss} data-testid={`macro-${action}-result`}>
      {outcome.text}
    </Alert>
  )
}

interface SendProps {
  file: CharacterFileMacros
  /** The chosen set as the game would hold it. */
  macros: GameMacro[]
  counts: Record<SlotChange, number>
  writer: GameWriter
}

/** Why Send is off, as its tooltip: null when it may be pressed. */
function sendOffReason(blocked: boolean, changes: number): string | null {
  if (blocked) return 'A macro in this set cannot be written to the game file.'
  if (changes === 0) return 'The game file already matches this set, nothing to send.'
  return null
}

/** The Send button, what blocks it, its confirm and its answer. */
export function SendToGame({ file, macros, counts, writer }: SendProps): JSX.Element {
  const [asking, setAsking] = useState(false)
  const blocked = unsavable(macros).at(0) ?? null
  const off = sendOffReason(blocked !== null, counts.added + counts.changed + counts.removed)
  const button = (
    <Button
      size="small"
      variant="outlined"
      disabled={off !== null || writer.busy}
      data-testid="macro-file-send"
      onClick={() => {
        setAsking(true)
      }}
    >
      {writer.busy ? 'Working' : 'Send to the game file'}
    </Button>
  )
  return (
    <>
      {off === null ? (
        button
      ) : (
        <Tooltip title={off}>
          <span>{button}</span>
        </Tooltip>
      )}
      {blocked !== null && (
        <Typography variant="body2" color="warning.main" sx={{ alignSelf: 'center' }} data-testid="macro-send-blocked">
          {blocked.text}
        </Typography>
      )}
      <Confirm
        open={asking}
        title="Send to the game file?"
        action="Send"
        testid="macro-send"
        onClose={() => {
          setAsking(false)
        }}
        onConfirm={() => {
          writer.send(macros, file.stamp)
        }}
      >
        <Typography variant="body2" sx={MONO_SX}>
          {file.file}
        </Typography>
        <Line>
          {counts.added} added, {counts.changed} changed, {counts.removed} removed.
        </Line>
        <Line>The game must be closed.</Line>
        <Line>A copy of the current file is kept beside it.</Line>
        <Line>{NOT_PROVEN}</Line>
      </Confirm>
    </>
  )
}

/** The answer to a send, on its own row under the buttons. */
export function SendOutcome({ writer }: { writer: GameWriter }): JSX.Element | null {
  return <Outcome writer={writer} action="send" />
}

function copyDate(copy: BackupCopy): string {
  return copy.time === null ? copy.date : `${copy.date} ${copy.time.slice(0, 5)}`
}

interface CopyProps {
  copy: BackupCopy
  label: string
  writer: GameWriter
  onRestore: (copy: BackupCopy) => void
}

function CopyEntry({ copy, label, writer, onRestore }: CopyProps): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" data-testid={`macro-backup-${copy.kind}`}>
      <Typography variant="body2" color="text.secondary">
        {label} {copyDate(copy)}
      </Typography>
      <Button
        size="small"
        disabled={writer.busy}
        data-testid={`macro-restore-${copy.kind}`}
        onClick={() => {
          onRestore(copy)
        }}
      >
        Restore
      </Button>
    </Stack>
  )
}

/** The copies kept beside the file, each with a Restore behind a confirm. */
export function BackupsLine({ file, writer }: { file: CharacterFileMacros; writer: GameWriter }): JSX.Element {
  // The copy asked about stays set while the dialog closes, so its words do not change on the way out.
  const [asking, setAsking] = useState<BackupCopy | null>(null)
  const [open, setOpen] = useState(false)
  const ask = (copy: BackupCopy): void => {
    setAsking(copy)
    setOpen(true)
  }
  const { original, last } = file.backups
  return (
    <>
      <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" data-testid="macro-backups">
        <Typography variant="body2" color="text.secondary">
          Backups:
        </Typography>
        {original === null && last === null && <Quiet testid="macro-backups-none">none yet. The first send keeps one.</Quiet>}
        {original !== null && <CopyEntry copy={original} label="original" writer={writer} onRestore={ask} />}
        {last !== null && <CopyEntry copy={last} label="last copy" writer={writer} onRestore={ask} />}
      </Stack>
      <Outcome writer={writer} action="restore" />
      <Confirm
        open={open}
        title={asking?.kind === 'original' ? 'Restore the original copy?' : 'Restore the last copy?'}
        action="Restore"
        testid="macro-restore"
        onClose={() => {
          setOpen(false)
        }}
        onConfirm={() => {
          if (asking !== null) writer.restore(asking.kind)
        }}
      >
        <Typography variant="body2" sx={MONO_SX}>
          {file.file}
        </Typography>
        <Line>The WHOLE file goes back to the copy of {asking === null ? '' : copyDate(asking)}, hotbars included.</Line>
        <Line>The current file is kept as the last copy.</Line>
        <Line>The game must be closed.</Line>
      </Confirm>
    </>
  )
}
