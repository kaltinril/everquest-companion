// macros/macroUi.tsx — what every section of the Macros tab says back to the player: one snackbar
// (with Undo after a delete) and Copy. A copy that did not reach the clipboard shows the text in
// a box to copy by hand.

import { type JSX, type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, TextField } from '@mui/material'
import { copyText } from '../../lib/clipboard'

export interface MacroUi {
  /** Say one short thing. With `undo` the snackbar stays longer and carries an Undo button. */
  notify: (message: string, undo?: () => void) => void
  /** Put text on the clipboard and say so. */
  copy: (text: string) => void
}

const MacroUiContext = createContext<MacroUi>({ notify: () => undefined, copy: () => undefined })

export function useMacroUi(): MacroUi {
  return useContext(MacroUiContext)
}

interface Toast {
  id: number
  message: string
  undo?: () => void
}

const UNDO_MS = 7000
const PLAIN_MS = 2500

/** The text a failed copy leaves for the player to take by hand. */
function CopyByHand({ text, onClose }: { text: string | null; onClose: () => void }): JSX.Element {
  return (
    <Dialog open={text !== null} onClose={onClose} fullWidth maxWidth="sm" data-testid="macros-copy-fallback">
      <DialogTitle>Copy this text</DialogTitle>
      <DialogContent>
        <TextField
          multiline
          fullWidth
          minRows={6}
          maxRows={16}
          value={text ?? ''}
          onFocus={(e) => {
            e.target.select()
          }}
          autoFocus
          slotProps={{ htmlInput: { readOnly: true, style: { fontFamily: 'monospace' } } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export function MacroUiProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toast, setToast] = useState<Toast | null>(null)
  const [byHand, setByHand] = useState<string | null>(null)
  const notify = useCallback((message: string, undo?: () => void) => {
    setToast({ id: Date.now(), message, undo })
  }, [])
  const copy = useCallback(
    (text: string) => {
      void copyText(text).then((ok) => {
        if (ok) notify('Copied')
        else setByHand(text)
      })
    },
    [notify]
  )
  const ui = useMemo(() => ({ notify, copy }), [notify, copy])
  const undo = toast?.undo
  return (
    <MacroUiContext.Provider value={ui}>
      {children}
      <Snackbar
        key={toast?.id}
        open={toast !== null}
        autoHideDuration={undo ? UNDO_MS : PLAIN_MS}
        onClose={(_e, reason) => {
          if (reason !== 'clickaway') setToast(null)
        }}
        message={toast?.message ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        data-testid="macros-toast"
        action={
          undo && (
            <Button
              size="small"
              color="inherit"
              data-testid="macros-toast-undo"
              onClick={() => {
                undo()
                setToast(null)
              }}
            >
              Undo
            </Button>
          )
        }
      />
      <CopyByHand
        text={byHand}
        onClose={() => {
          setByHand(null)
        }}
      />
    </MacroUiContext.Provider>
  )
}
