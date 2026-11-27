// macros/GameFileSend.tsx — the bar under a character's buttons: whether they match the game, and
// the two writes into the game folder, each behind a confirm: Review and send (the buttons into
// the file's macros section) and Restore (a kept copy put back whole).

import { type JSX, type ReactNode, useState } from 'react'
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import type { BackupCopy } from '@shared/macros/backups'
import { type GameChanges, changesText, markOf } from '@shared/macros/buttons'
import { type HotbarEffect, hotbarEffects, hotbarText } from '@shared/macros/hotbars'
import type { SlotDiff } from '@shared/macros/sets'
import type { CharacterFileMacros } from '@shared/macros/types'
import { unsavable } from '@shared/macros/unsavable'
import { Tooltip } from '../../lib/Tooltip'
import { GameNow } from './GameNow'
import { MARK_COLOR, MONO_SX, Quiet } from './macroParts'
import type { GameFilesState } from './useGameFiles'
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
  /** The action cannot be taken yet (a read is under way). */
  disabled?: boolean
  wide?: boolean
  children: ReactNode
}

export function Confirm({ open, title, action, testid, onClose, onConfirm, disabled = false, wide = false, children }: ConfirmProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={wide ? 'sm' : 'xs'} data-testid={`${testid}-dialog`}>
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
          disabled={disabled}
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

export function Line({ children }: { children: ReactNode }): JSX.Element {
  return <Typography variant="body2">{children}</Typography>
}

/** What the last send or restore said, over the bar. */
function Outcome({ writer }: { writer: GameWriter }): JSX.Element | null {
  const { outcome } = writer
  if (outcome === null) return null
  return (
    <Alert severity={outcome.ok ? 'success' : 'warning'} onClose={writer.dismiss} data-testid={`macro-${outcome.action}-result`}>
      {outcome.text}
    </Alert>
  )
}

/** Every button a send would change: where, what the game has, what it gets. */
function ReviewTable({ changed, clashes, onBars }: { changed: SlotDiff[]; clashes: readonly string[]; onBars: readonly HotbarEffect[] }): JSX.Element {
  return (
    <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
      <Table size="small" data-testid="macro-diff">
        <TableBody>
          {changed.map((d) => {
            const mark = markOf(d.kind)
            const clash = clashes.includes(`${String(d.page)}:${String(d.button)}`)
            const onBar = onBars.some((e) => e.page === d.page && e.button === d.button)
            return (
              <TableRow key={`${String(d.page)}:${String(d.button)}`} data-testid="macro-diff-row">
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  Page {d.page}, button {d.button}
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  {d.set?.name ?? d.file?.name ?? ''}
                  {clash && (
                    <Typography variant="caption" sx={{ color: 'warning.main' }} component="div" data-testid="macro-diff-clash">
                      Changed in game too{d.file === null ? '' : `: the game has ${d.file.name}`}
                    </Typography>
                  )}
                  {onBar && (
                    <Typography variant="caption" sx={{ color: 'warning.main' }} component="div" data-testid="macro-diff-hotbar">
                      On a hotbar
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">{mark !== null && <Chip size="small" variant="outlined" color={MARK_COLOR[mark]} label={mark} />}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

interface SendProps {
  file: CharacterFileMacros
  /** What the character's buttons would change in the file. */
  changes: GameChanges
  /** The slots changed both in the game and in the app. */
  clashes: readonly string[]
  writer: GameWriter
}

/** The Review and send button, what blocks it, and its confirm. */
function SendToGame({ file, changes, clashes, writer }: SendProps): JSX.Element {
  const [asking, setAsking] = useState(false)
  const blocked = unsavable(changes.macros).at(0) ?? null
  const { counts } = changes
  const onBars = hotbarEffects(changes, file.hotbars)
  const onHotbar = hotbarText(onBars)
  const button = (
    <Button
      size="small"
      variant="contained"
      disabled={blocked !== null || writer.busy}
      data-testid="macro-file-send"
      onClick={() => {
        setAsking(true)
      }}
    >
      {writer.busy ? 'Working' : 'Review and send'}
    </Button>
  )
  return (
    <>
      {blocked === null ? (
        button
      ) : (
        <Tooltip title="A macro on these buttons cannot be written to the game file.">
          <span>{button}</span>
        </Tooltip>
      )}
      {blocked !== null && (
        <Typography variant="body2" sx={{ color: 'warning.main' }} data-testid="macro-send-blocked">
          {blocked.text}
        </Typography>
      )}
      <Confirm
        open={asking}
        wide
        title="Send to the game file?"
        action="Send"
        testid="macro-send"
        onClose={() => {
          setAsking(false)
        }}
        onConfirm={() => {
          writer.send(changes.macros, file.stamp)
        }}
      >
        <Typography variant="body2" sx={MONO_SX}>
          {file.file}
        </Typography>
        <ReviewTable changed={changes.changed} clashes={clashes} onBars={onBars} />
        <Line>
          {counts.added} new, {counts.changed} changed, {counts.removed} removed.
        </Line>
        {clashes.length > 0 && <Line>Send replaces the game&apos;s version of buttons changed in game too.</Line>}
        {onHotbar !== null && (
          <Alert severity="warning" data-testid="macro-send-hotbars">
            {onHotbar}
          </Alert>
        )}
        <Line>Only the macros in this file change.</Line>
        <Line>The game must be closed.</Line>
        <Line>A copy of the current file is kept beside it.</Line>
        <Line>{NOT_PROVEN}</Line>
      </Confirm>
    </>
  )
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
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }} data-testid={`macro-backup-${copy.kind}`}>
      <Typography variant="body2">
        {label}, {copyDate(copy)}
      </Typography>
      <Button
        size="small"
        variant="outlined"
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

/** The Backups button: the copies kept beside the file, each with a Restore behind a confirm. */
function Backups({ file, writer }: { file: CharacterFileMacros; writer: GameWriter }): JSX.Element {
  const [listing, setListing] = useState(false)
  // The copy asked about stays set while the dialog closes, so its words do not change on the way out.
  const [asking, setAsking] = useState<BackupCopy | null>(null)
  const [open, setOpen] = useState(false)
  const ask = (copy: BackupCopy): void => {
    setListing(false)
    setAsking(copy)
    setOpen(true)
  }
  const close = (): void => {
    setListing(false)
  }
  const { original, last } = file.backups
  return (
    <>
      <Button
        size="small"
        data-testid="macro-backups-open"
        onClick={() => {
          setListing(true)
        }}
      >
        Backups
      </Button>
      <Dialog open={listing} onClose={close} fullWidth maxWidth="xs" data-testid="macro-backups">
        <DialogTitle>Backups of the game file</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography variant="body2" sx={MONO_SX}>
              {file.file}
            </Typography>
            {original === null && last === null && <Quiet testid="macro-backups-none">None yet. The first send keeps one.</Quiet>}
            {original !== null && <CopyEntry copy={original} label="Original" writer={writer} onRestore={ask} />}
            {last !== null && <CopyEntry copy={last} label="Last copy" writer={writer} onRestore={ask} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Close</Button>
        </DialogActions>
      </Dialog>
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

interface BarProps extends SendProps {
  game: GameFilesState
}

/** Always under the buttons: do they match the game, the send when they do not, and the backups. */
export function GameBar({ file, changes, clashes, writer, game }: BarProps): JSX.Element {
  const matches = changes.total === 0
  return (
    <Stack spacing={1} sx={{ flexShrink: 0, pt: 1 }} data-testid="macro-game-bar">
      <Outcome writer={writer} />
      <Paper variant="outlined" sx={{ px: 1.5, py: 0.75 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
          <Typography variant="body2" sx={{ color: matches ? 'text.secondary' : 'warning.main', fontWeight: 600 }} data-testid="macro-game-status">
            {matches ? 'Matches the game.' : changesText(changes.total)}
          </Typography>
          {!matches && <SendToGame file={file} changes={changes} clashes={clashes} writer={writer} />}
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Read this character's macros from the game folder again.">
            <span>
              <Button size="small" onClick={game.reload} disabled={game.reading} data-testid="macro-files-reload">
                Read again
              </Button>
            </span>
          </Tooltip>
          <GameNow file={file} />
          <Backups file={file} writer={writer} />
        </Stack>
      </Paper>
    </Stack>
  )
}
