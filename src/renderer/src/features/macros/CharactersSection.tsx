// macros/CharactersSection.tsx — the Characters section: the character files found in the game
// folder, what the game holds in the picked one, and the set chosen for it with what that set
// would change. The game's files are only read: Copy is the way out until the in-game tests are done.

import type { JSX } from 'react'
import {
  Button,
  Chip,
  List,
  ListItemButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material'
import { importGameMacros } from '@shared/macros/library'
import {
  chooseSet,
  chosenSet,
  diffCounts,
  diffSetAgainstFile,
  setFromGameMacros,
  setToGameMacros,
  type SlotChange,
  type SlotDiff
} from '@shared/macros/sets'
import { characterFileKey, renderSocials } from '@shared/macros/socials'
import type { CharacterFileMacros, GameFilesReason, MacroSet } from '@shared/macros/types'
import { Tooltip } from '../../lib/Tooltip'
import { MONO_SX, Quiet, TwoPane } from './macroParts'
import { useMacroUi } from './macroUi'
import type { GameFilesState } from './useGameFiles'
import type { MacroStore } from './useMacroLibrary'

const NO_FOLDER: Record<GameFilesReason, string> = {
  'no-log': 'No game folder found yet. Set the EverQuest install folder in Preferences, then read again.',
  unreadable: 'The game folder could not be read. Check the EverQuest install folder in Preferences, then read again.'
}

const CHANGE_COLOR: Record<SlotChange, 'success' | 'warning' | 'error' | 'default'> = {
  added: 'success',
  changed: 'warning',
  removed: 'error',
  same: 'default'
}

function slotName(page: number, button: number): string {
  return `Page ${String(page)}, button ${String(button)}`
}

function macroCount(n: number): string {
  return n === 1 ? '1 macro in the game' : `${String(n)} macros in the game`
}

interface CharactersProps {
  store: MacroStore
  game: GameFilesState
  /** The picked file's key (shared `characterFileKey`); the first file when it names none. */
  selected: string | null
  onSelect: (key: string) => void
}

/** Why there is no list: still reading, no folder, or a folder with no character file. */
function listStatus(game: GameFilesState): string | null {
  const { reply } = game
  if (reply === null) return 'Reading the game folder.'
  if (reply.gameFolder === null) return NO_FOLDER[reply.reason ?? 'unreadable']
  if (reply.files.length === 0) return 'No character file in the game folder yet. Log in to a character once, then read again.'
  return null
}

function FileList({ game, picked, onSelect }: { game: GameFilesState; picked: CharacterFileMacros | null; onSelect: (key: string) => void }): JSX.Element {
  const status = listStatus(game)
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">Characters found</Typography>
        <Button size="small" variant="outlined" onClick={game.reload} disabled={game.reading} data-testid="macro-files-reload">
          Read again
        </Button>
      </Stack>
      {status !== null && <Quiet testid="macro-files-status">{status}</Quiet>}
      <List dense disablePadding sx={{ maxHeight: '50vh', overflow: 'auto' }}>
        {(game.reply?.files ?? []).map((f) => (
          <ListItemButton
            key={f.file}
            selected={f === picked}
            data-testid="macro-file-row"
            sx={{ display: 'block', borderRadius: 1 }}
            onClick={() => {
              onSelect(characterFileKey(f))
            }}
          >
            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
              {f.character}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {f.server}, loadout {f.loadout} · {macroCount(f.macros.length)}
            </Typography>
          </ListItemButton>
        ))}
      </List>
      <Quiet>One row per character and loadout: the game keeps a macro file for each.</Quiet>
    </>
  )
}

/** What the game holds in the file now, and the two ways to take it into the app. */
function InGameNow({ store, file }: { store: MacroStore; file: CharacterFileMacros }): JSX.Element {
  const ui = useMacroUi()
  const importAll = (): void => {
    const result = importGameMacros(store.library, file.macros)
    store.change(() => result.library)
    ui.notify(`${String(result.added)} added, ${String(result.skipped)} already in the library`)
  }
  const makeSet = (): void => {
    const made = setFromGameMacros(store.library, `${file.character} today`, file.macros)
    store.change(() => chooseSet(made.library, characterFileKey(file), made.set.id))
    ui.notify(`Made the set "${made.set.name}"`)
  }
  if (file.macros.length === 0) return <Quiet testid="macro-file-empty">This character has no macros of its own yet.</Quiet>
  return (
    <>
      <Table size="small" data-testid="macro-file-macros">
        <TableHead>
          <TableRow>
            <TableCell>Slot</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Commands</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {file.macros.map((m) => (
            <TableRow key={`${String(m.page)}:${String(m.button)}`} data-testid="macro-file-macro">
              <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{slotName(m.page, m.button)}</TableCell>
              <TableCell sx={{ fontWeight: 600, verticalAlign: 'top' }}>{m.name}</TableCell>
              <TableCell sx={{ ...MONO_SX, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.lines.join('\n')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={importAll} data-testid="macro-file-import">
          Import to library
        </Button>
        <Button size="small" variant="outlined" onClick={makeSet} data-testid="macro-file-make-set">
          Make a set from this file
        </Button>
      </Stack>
    </>
  )
}

function DiffTable({ diff }: { diff: SlotDiff[] }): JSX.Element {
  const empty = (
    <Typography variant="body2" color="text.secondary" component="span">
      empty
    </Typography>
  )
  return (
    <Table size="small" data-testid="macro-diff">
      <TableHead>
        <TableRow>
          <TableCell>Slot</TableCell>
          <TableCell>Now in the game</TableCell>
          <TableCell>With this set</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {diff.map((d) => (
          <TableRow key={`${String(d.page)}:${String(d.button)}`} data-testid="macro-diff-row">
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{slotName(d.page, d.button)}</TableCell>
            <TableCell>{d.file === null ? empty : d.file.name}</TableCell>
            <TableCell>{d.set === null ? empty : d.set.name}</TableCell>
            <TableCell align="right">
              <Chip size="small" variant="outlined" color={CHANGE_COLOR[d.kind]} label={d.kind} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** What the chosen set would change in the file, and the text to carry there by hand. */
function SetChanges({ store, file, set }: { store: MacroStore; file: CharacterFileMacros; set: MacroSet }): JSX.Element {
  const ui = useMacroUi()
  const setMacros = setToGameMacros(store.library, set)
  const diff = diffSetAgainstFile(setMacros, file.macros)
  const counts = diffCounts(diff)
  return (
    <>
      <Typography variant="body2" data-testid="macro-diff-counts">
        <Typography component="span" variant="body2" color="success.main">
          {counts.added} added
        </Typography>
        {', '}
        <Typography component="span" variant="body2" color="warning.main">
          {counts.changed} changed
        </Typography>
        {', '}
        <Typography component="span" variant="body2" color="error.main">
          {counts.removed} removed
        </Typography>
        {`, ${String(counts.same)} the same.`}
      </Typography>
      <DiffTable diff={diff} />
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="contained"
          data-testid="macro-file-copy"
          onClick={() => {
            ui.copy(renderSocials(setMacros))
          }}
        >
          Copy [Socials] text
        </Button>
        <Tooltip title="Not built yet: it waits on tests in the game.">
          <span>
            <Button size="small" variant="outlined" disabled data-testid="macro-file-send">
              Send to the game file
            </Button>
          </span>
        </Tooltip>
      </Stack>
      <Quiet testid="macro-file-by-hand">
        Today you paste the copied text into {file.file} with the game closed. Sending it for you waits on tests in the game.
      </Quiet>
    </>
  )
}

function FileDetail({ store, file }: { store: MacroStore; file: CharacterFileMacros }): JSX.Element {
  const key = characterFileKey(file)
  const set = chosenSet(store.library, key)
  return (
    <Stack spacing={1.5} data-testid="macro-file-detail">
      <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between" useFlexGap flexWrap="wrap">
        <Typography variant="subtitle1">
          {file.character}{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            {file.server}, loadout {file.loadout}
          </Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={MONO_SX}>
          {file.file}
        </Typography>
      </Stack>
      <Typography variant="subtitle2">In the game now</Typography>
      <InGameNow store={store} file={file} />
      <Typography variant="subtitle2">Set for this character</Typography>
      <TextField
        select
        size="small"
        value={set?.id ?? ''}
        onChange={(e) => {
          const id = e.target.value
          store.change((current) => chooseSet(current, key, id === '' ? null : id))
        }}
        slotProps={{ select: { displayEmpty: true } }}
        data-testid="macro-file-set"
      >
        <MenuItem value="">No set chosen</MenuItem>
        {store.library.sets.map((s) => (
          <MenuItem key={s.id} value={s.id}>
            {s.name === '' ? 'Unnamed set' : s.name}
          </MenuItem>
        ))}
      </TextField>
      {set === null ? (
        <Quiet testid="macro-file-no-set">Choose a set to see what would change for this character.</Quiet>
      ) : (
        <SetChanges store={store} file={file} set={set} />
      )}
    </Stack>
  )
}

export function CharactersSection({ store, game, selected, onSelect }: CharactersProps): JSX.Element {
  const files = game.reply?.files ?? []
  const picked = files.find((f) => characterFileKey(f) === selected) ?? files.at(0) ?? null
  const right = picked === null ? <Quiet testid="macro-file-none">No character file to show.</Quiet> : <FileDetail key={picked.file} store={store} file={picked} />
  return <TwoPane left={<FileList game={game} picked={picked} onSelect={onSelect} />} right={right} />
}
