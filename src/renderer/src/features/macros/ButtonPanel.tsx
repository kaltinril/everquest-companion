// macros/ButtonPanel.tsx — beside a character's buttons: the picked one. A filled button is its
// macro's editor, with what can be done with it there; an empty one is New macro and the library
// to pick from; nothing picked is one line of help.

import { type JSX, useState } from 'react'
import { Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { type GridButton, type PageTab, alsoOn, moveSlot, ownCopyAt, placeNewMacro } from '@shared/macros/buttons'
import { hotbarText, hotbarsAfter } from '@shared/macros/hotbars'
import { findMacro } from '@shared/macros/library'
import { BUTTONS_PER_PAGE } from '@shared/macros/limits'
import { assignSlot } from '@shared/macros/sets'
import { slotKey } from '@shared/macros/socials'
import { macrosToText } from '@shared/macros/text'
import type { CharacterFileMacros, Macro, MacroSet } from '@shared/macros/types'
import { MacroEditor } from './MacroEditor'
import { MacroPicker } from './MacroPicker'
import { Quiet } from './macroParts'
import { useMacroUi } from './macroUi'
import type { MacroStore } from './useMacroLibrary'

/** What every pane of the panel works on: the character's layout and the picked button of it. */
interface Picked {
  store: MacroStore
  set: MacroSet
  cell: GridButton
  page: number
}

interface MoveProps extends Picked {
  /** The character's game file: which of its buttons a hotbar uses. */
  file: CharacterFileMacros
  pages: PageTab[]
  onMoved: (page: number, slot: string) => void
  onCancel: () => void
}

/** "Move to...": the page and button to move the macro to, for a move without the mouse. */
function MoveForm({ store, file, set, cell, page, pages, onMoved, onCancel }: MoveProps): JSX.Element {
  const [toPage, setToPage] = useState(page)
  const [toButton, setToButton] = useState(cell.button)
  const target = slotKey(toPage, toButton)
  const here = target === cell.slot
  const holder = findMacro(store.library, target in set.slots ? set.slots[target] : null)
  const buttons = Array.from({ length: Math.max(BUTTONS_PER_PAGE, cell.button) }, (_, i) => i + 1)
  const onHotbar = here ? null : hotbarText(hotbarsAfter(moveSlot(store.library, set.id, cell.slot, target), set.id, file, [cell.slot, target]))
  const move = (): void => {
    store.change((current) => moveSlot(current, set.id, cell.slot, target))
    onMoved(toPage, target)
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap data-testid="macro-move-form">
      <TextField
        select
        size="small"
        label="Page"
        value={toPage}
        onChange={(e) => {
          setToPage(Number(e.target.value))
        }}
        sx={{ minWidth: 84 }}
        data-testid="macro-move-page"
      >
        {pages.map((p) => (
          <MenuItem key={p.page} value={p.page}>
            {p.page}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Button"
        value={toButton}
        onChange={(e) => {
          setToButton(Number(e.target.value))
        }}
        sx={{ minWidth: 84 }}
        data-testid="macro-move-button"
      >
        {buttons.map((b) => (
          <MenuItem key={b} value={b}>
            {b}
          </MenuItem>
        ))}
      </TextField>
      <Button size="small" variant="contained" disabled={here} onClick={move} data-testid="macro-move-confirm">
        Move
      </Button>
      <Button size="small" onClick={onCancel} data-testid="macro-move-cancel">
        Cancel
      </Button>
      {holder !== null && !here && <Quiet testid="macro-move-swap">{holder.name === '' ? 'A macro' : holder.name} is there: the two swap.</Quiet>}
      {onHotbar !== null && (
        <Typography variant="body2" sx={{ color: 'warning.main' }} data-testid="macro-move-hotbar">
          {onHotbar}
        </Typography>
      )}
    </Stack>
  )
}

/** Where else the macro sits, and the way to stop an edit reaching those places. */
function AlsoOn({ store, set, cell, macro }: Picked & { macro: Macro }): JSX.Element | null {
  const ui = useMacroUi()
  const elsewhere = alsoOn(store.library, macro.id, set.id, cell.slot)
  if (elsewhere.length === 0) return null
  const ownCopy = (): void => {
    const made = ownCopyAt(store.library, set.id, cell.slot)
    if (made.macro === null) return
    store.change(() => made.library)
    ui.notify('This button has its own copy now')
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
      <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="macro-also-on">
        Also on: {elsewhere.join(', ')}. An edit changes it there too.
      </Typography>
      <Button size="small" variant="outlined" onClick={ownCopy} data-testid="macro-own-copy">
        Change only here
      </Button>
    </Stack>
  )
}

interface FilledProps extends Picked {
  file: CharacterFileMacros
  files: readonly CharacterFileMacros[]
  macro: Macro
  pages: PageTab[]
  focusName: boolean
  onGo: (page: number, slot: string) => void
}

/** A filled button: its macro's editor, under what can be done with the macro on this button. */
function FilledPane({ store, file, files, set, cell, page, macro, pages, focusName, onGo }: FilledProps): JSX.Element {
  const ui = useMacroUi()
  const [mode, setMode] = useState<'edit' | 'replace' | 'move'>('edit')
  const where = `page ${String(page)}, button ${String(cell.button)}`
  const edit = (): void => {
    setMode('edit')
  }
  if (mode === 'replace') {
    return (
      <Stack spacing={1.5} data-testid="macro-panel-replace">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1">Replace {where}</Typography>
          <Button size="small" onClick={edit} data-testid="macro-replace-cancel">
            Cancel
          </Button>
        </Stack>
        <MacroPicker
          store={store}
          files={files}
          onPick={(id) => {
            store.change((current) => assignSlot(current, set.id, cell.slot, id))
            edit()
          }}
        />
      </Stack>
    )
  }
  const top = (
    <Stack spacing={1}>
      <Typography variant="subtitle1" data-testid="macro-panel-where">
        Page {page}, button {cell.button}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-slot-clear"
          onClick={() => {
            store.change((current) => assignSlot(current, set.id, cell.slot, null))
          }}
        >
          Remove from this button
        </Button>
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-slot-replace"
          onClick={() => {
            setMode('replace')
          }}
        >
          Replace...
        </Button>
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-slot-move"
          onClick={() => {
            setMode(mode === 'move' ? 'edit' : 'move')
          }}
        >
          Move to...
        </Button>
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-copy"
          onClick={() => {
            ui.copy(macrosToText([macro]))
          }}
        >
          Copy as text
        </Button>
      </Stack>
      {mode === 'move' && <MoveForm store={store} file={file} set={set} cell={cell} page={page} pages={pages} onMoved={onGo} onCancel={edit} />}
      <AlsoOn store={store} set={set} cell={cell} page={page} macro={macro} />
    </Stack>
  )
  return <MacroEditor key={macro.id} store={store} macro={macro} focusName={focusName} top={top} />
}

/** An empty button: a new macro made right on it, or one of the library's put there. */
function EmptyPane({ store, files, set, cell, page, onFresh }: Picked & { files: readonly CharacterFileMacros[]; onFresh: (macroId: string) => void }): JSX.Element {
  const create = (): void => {
    const made = placeNewMacro(store.library, set.id, cell.slot)
    if (made.macro === null) return
    store.change(() => made.library)
    onFresh(made.macro.id)
  }
  return (
    <Stack spacing={1.5} data-testid="macro-panel-add">
      <Typography variant="subtitle1" data-testid="macro-panel-where">
        Add to page {page}, button {cell.button}
      </Typography>
      {cell.game !== null && <Quiet testid="macro-panel-game">The game still has {cell.game.name} here until you send.</Quiet>}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button size="small" variant="contained" onClick={create} data-testid="macro-slot-new">
          New macro
        </Button>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          or pick one of yours:
        </Typography>
      </Stack>
      <MacroPicker
        store={store}
        files={files}
        onPick={(id) => {
          store.change((current) => assignSlot(current, set.id, cell.slot, id))
        }}
      />
    </Stack>
  )
}

interface PanelProps {
  store: MacroStore
  /** The character's game file. */
  file: CharacterFileMacros
  /** Every character file of the game folder: where the pick list says a macro sits. */
  files: readonly CharacterFileMacros[]
  set: MacroSet
  /** The picked button; null when none is. */
  cell: GridButton | null
  page: number
  pages: PageTab[]
  /** What is said while no button is picked. */
  hint: string
  /** The macro New just made on a button: its name box takes the focus once. */
  fresh: string | null
  onFresh: (macroId: string) => void
  /** Show a page with one of its buttons picked (after a move). */
  onGo: (page: number, slot: string) => void
}

export function ButtonPanel({ store, file, files, set, cell, page, pages, hint, fresh, onFresh, onGo }: PanelProps): JSX.Element {
  let body: JSX.Element
  if (cell === null) body = <Quiet testid="macro-panel-hint">{hint}</Quiet>
  else if (cell.macro === null) body = <EmptyPane key={cell.slot} store={store} files={files} set={set} cell={cell} page={page} onFresh={onFresh} />
  else {
    body = (
      <FilledPane key={cell.slot} store={store} file={file} files={files} set={set} cell={cell} page={page} macro={cell.macro} pages={pages} focusName={cell.macro.id === fresh} onGo={onGo} />
    )
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }} data-testid="macro-panel">
      {body}
    </Paper>
  )
}
