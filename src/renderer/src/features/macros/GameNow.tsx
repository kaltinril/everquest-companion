// macros/GameNow.tsx — "In the game now": the macros a character's game file holds, as read, in
// a dialog off the bar under the buttons. The buttons above show the player's layout; this shows
// the file itself, page 1 included, so what the game has can always be looked up (owner,
// 2026-11-20: the table the three-tab screen had is kept, not dropped).

import { type JSX, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { trimLines } from '@shared/macros/socials'
import type { CharacterFileMacros } from '@shared/macros/types'
import { MONO_SX, Quiet } from './macroParts'

export function GameNow({ file }: { file: CharacterFileMacros }): JSX.Element {
  const [open, setOpen] = useState(false)
  const close = (): void => {
    setOpen(false)
  }
  return (
    <>
      <Button
        size="small"
        data-testid="macro-game-now-open"
        onClick={() => {
          setOpen(true)
        }}
      >
        In the game now
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="md" data-testid="macro-game-now">
        <DialogTitle>In the game now</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ ...MONO_SX, mb: 1 }}>
            {file.file}
          </Typography>
          {file.macros.length === 0 ? (
            <Quiet testid="macro-game-now-none">This character has no macros in the game yet.</Quiet>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Button</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Commands</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {file.macros.map((m) => (
                  <TableRow key={`${String(m.page)}:${String(m.button)}`} data-testid="macro-game-now-row">
                    <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      Page {m.page}, button {m.button}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: 'top', fontWeight: 600 }}>{m.name}</TableCell>
                    <TableCell sx={{ ...MONO_SX, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{trimLines(m.lines).join('\n')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} data-testid="macro-game-now-close">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
