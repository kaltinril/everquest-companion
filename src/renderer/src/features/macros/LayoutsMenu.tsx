// macros/LayoutsMenu.tsx — the Layouts menu on a character's page: keep its buttons as a named
// layout, load one, copy another character's, or go back to what the game has. Each action that
// replaces the buttons says so first, and Undo brings them back.

import { type JSX, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, List, ListItemButton, ListItemText, Menu, MenuItem, Stack, TextField, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  type LayoutChoice,
  copyButtons,
  gameButtonCount,
  otherCharacterChoices,
  resetToGame,
  saveLayout,
  savedLayoutChoices,
  savedLayoutNamed,
  savedLayouts
} from '@shared/macros/layouts'
import { filledCount, removeSet, renameSet, restoreSet } from '@shared/macros/sets'
import { characterFileKey, renderSocials } from '@shared/macros/socials'
import type { CharacterFileMacros, GameMacro, MacroSet } from '@shared/macros/types'
import { Tooltip } from '../../lib/Tooltip'
import { Confirm, Line } from './GameFileSend'
import { Quiet } from './macroParts'
import { TagGroupsDialog } from './TagGroups'
import { useMacroUi } from './macroUi'
import type { GameFilesState } from './useGameFiles'
import type { MacroStore } from './useMacroLibrary'

const UNDO_NOTE = 'Undo brings the old buttons back.'

function buttonCount(n: number): string {
  return n === 1 ? '1 button' : `${String(n)} buttons`
}

interface SaveProps {
  store: MacroStore
  fileKey: string
  /** The character whose buttons are saved. */
  owner: string
  onClose: () => void
}

/** "Save these buttons as a layout...": asks the name. A name already saved replaces that layout. */
function SaveDialog({ store, fileKey, owner, onClose }: SaveProps): JSX.Element {
  const ui = useMacroUi()
  const [name, setName] = useState('')
  const blank = name.trim() === ''
  const existing = blank ? null : savedLayoutNamed(store.library, name)
  const save = (): void => {
    const made = saveLayout(store.library, fileKey, name)
    if (made.set === null) return
    store.change(() => made.library)
    ui.notify(`Saved the layout "${made.set.name}"`)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid="macro-layout-save-dialog">
      <DialogTitle>Save these buttons as a layout</DialogTitle>
      <DialogContent>
        <TextField
          size="small"
          fullWidth
          autoFocus
          label="Layout name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          helperText={existing === null ? `A copy of ${owner}'s buttons, to load on any character.` : `This replaces the saved layout ${existing.name}.`}
          sx={{ mt: 1 }}
          data-testid="macro-layout-name"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={blank} onClick={save} data-testid="macro-layout-save-confirm">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface PickProps {
  title: string
  action: string
  testid: string
  choices: LayoutChoice[]
  /** What is said when there is nothing to pick. */
  none: string
  /** What picking this one would replace, said before the action is taken. */
  describe: (choice: LayoutChoice) => string
  onConfirm: (choice: LayoutChoice) => void
  onClose: () => void
}

/** A list of layouts to take the buttons from: pick one, read what it replaces, then confirm. */
function PickDialog({ title, action, testid, choices, none, describe, onConfirm, onClose }: PickProps): JSX.Element {
  const [picked, setPicked] = useState<string | null>(null)
  const choice = choices.find((c) => c.id === picked) ?? null
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid={`${testid}-dialog`}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {choices.length === 0 && <Quiet testid={`${testid}-none`}>{none}</Quiet>}
          <List dense disablePadding sx={{ maxHeight: 280, overflow: 'auto' }}>
            {choices.map((c) => (
              <ListItemButton
                key={c.id}
                selected={c.id === picked}
                data-testid={`${testid}-choice`}
                sx={{ borderRadius: 1 }}
                onClick={() => {
                  setPicked(c.id)
                }}
              >
                <ListItemText primary={c.name} secondary={buttonCount(c.filled)} />
              </ListItemButton>
            ))}
          </List>
          {choice !== null && (
            <>
              <Line>{describe(choice)}</Line>
              <Line>{UNDO_NOTE}</Line>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid={`${testid}-cancel`}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={choice === null}
          data-testid={`${testid}-confirm`}
          onClick={() => {
            if (choice === null) return
            onConfirm(choice)
            onClose()
          }}
        >
          {action}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** "Manage layouts...": the saved layouts, each renamed in place or deleted. */
function ManageDialog({ store, onClose }: { store: MacroStore; onClose: () => void }): JSX.Element {
  const ui = useMacroUi()
  const layouts = savedLayouts(store.library)
  const remove = (set: MacroSet): void => {
    const { library, undo } = removeSet(store.library, set.id)
    if (undo === null) return
    store.change(() => library)
    ui.notify(`Deleted the layout "${set.name}"`, () => {
      store.change((current) => restoreSet(current, undo))
    })
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" data-testid="macro-layout-manage-dialog">
      <DialogTitle>Manage layouts</DialogTitle>
      <DialogContent>
        <Stack spacing={1}>
          {layouts.length === 0 && <Quiet testid="macro-layout-manage-none">No saved layouts yet. Save a character&apos;s buttons as one first.</Quiet>}
          {layouts.map((set) => (
            <Stack key={set.id} direction="row" spacing={1} sx={{ alignItems: 'center' }} data-testid="macro-layout-row">
              <TextField
                size="small"
                value={set.name}
                onChange={(e) => {
                  const name = e.target.value
                  store.change((current) => renameSet(current, set.id, name), `layout:${set.id}`)
                }}
                sx={{ flexGrow: 1 }}
                slotProps={{ htmlInput: { 'aria-label': 'Layout name', 'data-testid': 'macro-layout-rename' } }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                {buttonCount(filledCount(store.library, set))}
              </Typography>
              <Button
                size="small"
                color="error"
                data-testid="macro-layout-delete"
                onClick={() => {
                  remove(set)
                }}
              >
                Delete
              </Button>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} data-testid="macro-layout-manage-close">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface LayoutsProps {
  store: MacroStore
  game: GameFilesState
  file: CharacterFileMacros
  /** Every character file of the game folder: the ones to copy from. */
  files: CharacterFileMacros[]
  /** The character's own layout. */
  set: MacroSet
  /** The character's buttons as the game would hold them. */
  macros: GameMacro[]
}

type Asking = 'save' | 'load' | 'copy' | 'reset' | 'manage' | 'tags'

interface DialogsProps extends LayoutsProps {
  asking: Asking | null
  onClose: () => void
}

/** The dialog of the menu item that was picked. */
function LayoutDialogs({ store, game, file, files, set, asking, onClose }: DialogsProps): JSX.Element {
  const fileKey = characterFileKey(file)
  const owner = set.name
  const mine = `${owner}'s ${buttonCount(filledCount(store.library, set))}`
  const take = (choice: LayoutChoice): void => {
    store.change((current) => copyButtons(current, fileKey, choice.id))
  }
  if (asking === 'save') return <SaveDialog store={store} fileKey={fileKey} owner={owner} onClose={onClose} />
  if (asking === 'manage') return <ManageDialog store={store} onClose={onClose} />
  if (asking === 'tags') return <TagGroupsDialog store={store} set={set} onClose={onClose} />
  if (asking === 'load') {
    return (
      <PickDialog
        title="Load a layout"
        action="Load"
        testid="macro-layout-load"
        choices={savedLayoutChoices(store.library)}
        none="No saved layouts yet. Save these buttons as one first."
        describe={(c) => `This replaces ${mine} with the ${buttonCount(c.filled)} of the layout ${c.name}.`}
        onConfirm={take}
        onClose={onClose}
      />
    )
  }
  if (asking === 'copy') {
    return (
      <PickDialog
        title="Copy from another character"
        action="Copy"
        testid="macro-layout-copy"
        choices={otherCharacterChoices(store.library, files, fileKey)}
        none="No other character in the game folder."
        describe={(c) => `This replaces ${mine} with ${c.name}'s ${buttonCount(c.filled)}.`}
        onConfirm={take}
        onClose={onClose}
      />
    )
  }
  return (
    <Confirm
      open={asking === 'reset'}
      title="Reset to what the game has?"
      action="Reset"
      testid="macro-layout-reset"
      disabled={game.reading}
      onClose={onClose}
      onConfirm={() => {
        store.change((current) => resetToGame(current, fileKey, file.macros))
      }}
    >
      <Line>
        This replaces {mine} with the {buttonCount(gameButtonCount(file.macros))} the game has.
      </Line>
      <Line>{UNDO_NOTE}</Line>
    </Confirm>
  )
}

/**
 * "Copy from character", on the page row itself: the way a new character (another server, another
 * loadout) is given an existing one's buttons, so it is not left inside the Layouts menu.
 */
export function CopyFromCharacter(props: LayoutsProps): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip title="Give this character the buttons another character has.">
        <Button
          size="small"
          variant="outlined"
          data-testid="macro-copy-from-character"
          onClick={() => {
            setOpen(true)
          }}
        >
          Copy from character
        </Button>
      </Tooltip>
      <LayoutDialogs
        {...props}
        asking={open ? 'copy' : null}
        onClose={() => {
          setOpen(false)
        }}
      />
    </>
  )
}

export function LayoutsMenu(props: LayoutsProps): JSX.Element {
  const ui = useMacroUi()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [asking, setAsking] = useState<Asking | null>(null)
  const ask = (next: Asking): void => {
    setAnchor(null)
    // The reset shows what the game has now, so the file is read again as the question is put.
    if (next === 'reset') props.game.reload()
    setAsking(next)
  }
  const item = (next: Asking, label: string): JSX.Element => (
    <MenuItem
      data-testid={`macro-layout-${next}`}
      onClick={() => {
        ask(next)
      }}
    >
      {label}
    </MenuItem>
  )
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        endIcon={<ExpandMoreIcon />}
        data-testid="macro-layouts"
        onClick={(e) => {
          setAnchor(e.currentTarget)
        }}
      >
        Layouts
      </Button>
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => {
          setAnchor(null)
        }}
      >
        {item('save', 'Save these buttons as a layout...')}
        {item('load', 'Load a layout...')}
        {item('copy', 'Copy from another character...')}
        {item('reset', 'Reset to what the game has')}
        {item('manage', 'Manage layouts...')}
        {item('tags', 'Tag groups...')}
        <Divider />
        <MenuItem
          data-testid="macro-layout-copy-text"
          onClick={() => {
            setAnchor(null)
            ui.copy(renderSocials(props.macros))
          }}
        >
          Copy these buttons as text
        </MenuItem>
      </Menu>
      <LayoutDialogs
        {...props}
        asking={asking}
        onClose={() => {
          setAsking(null)
        }}
      />
    </>
  )
}
