// macros/CharactersSection.tsx — the Characters section: pick a character, click a button to edit
// it, press Send. Top to bottom: the characters found in the game folder, the pages, the page's
// twelve buttons with the picked one beside them (ButtonPanel.tsx), and the bar that says whether
// the buttons match the game and sends them (GameFileSend.tsx).

import { type JSX, type ReactNode, useState } from 'react'
import { Alert, Box, Button, Stack, Tab, Tabs } from '@mui/material'
import { type PageTab, gameChanges, gridPage, moveSlot, pageTabs } from '@shared/macros/buttons'
import { findMacro } from '@shared/macros/library'
import { FIRST_EDITABLE_PAGE } from '@shared/macros/limits'
import { assignSlot, chosenSet } from '@shared/macros/sets'
import { characterFileKey } from '@shared/macros/socials'
import type { CharacterFileMacros, GameFilesReason, MacroSet } from '@shared/macros/types'
import { ButtonGrid } from './ButtonGrid'
import { ButtonPanel } from './ButtonPanel'
import { CharacterPicker } from './CharacterPicker'
import { GameBar } from './GameFileSend'
import { CopyFromCharacter, LayoutsMenu } from './LayoutsMenu'
import { Quiet, UndoRedo } from './macroParts'
import type { GameFilesState } from './useGameFiles'
import { useGameWriter } from './useGameWriter'
import type { MacroStore } from './useMacroLibrary'

const NO_FOLDER: Record<GameFilesReason, string> = {
  'no-log': 'No game folder found yet. Set the EverQuest install folder in Preferences, then read again.',
  unreadable: 'The game folder could not be read. Check the EverQuest install folder in Preferences, then read again.'
}

/** The page shown and the button picked on it. */
export interface Spot {
  page: number
  slot: string | null
}

export const FIRST_SPOT: Spot = { page: FIRST_EDITABLE_PAGE, slot: null }

interface CharactersProps {
  store: MacroStore
  game: GameFilesState
  /** The picked file's key (shared `characterFileKey`); the first file when it names none. */
  selected: string | null
  onSelect: (key: string) => void
  spot: Spot
  onSpot: (spot: Spot) => void
  /** A library macro waiting to be put on a button ("Put on a button..." in the Library). */
  placing: string | null
  onPlaced: () => void
}

/** Why there is no character to show: still reading, no folder, or a folder with no character file. */
function listStatus(game: GameFilesState): string {
  const { reply } = game
  if (reply === null) return 'Reading the game folder.'
  if (reply.gameFolder === null) return NO_FOLDER[reply.reason ?? 'unreadable']
  return 'No character file in the game folder yet. Log in to a character once, then read again.'
}

function NoCharacters({ game }: { game: GameFilesState }): JSX.Element {
  return (
    <Stack spacing={1} alignItems="flex-start">
      <Quiet testid="macro-files-status">{listStatus(game)}</Quiet>
      {game.reply !== null && (
        <Button size="small" variant="outlined" onClick={game.reload} disabled={game.reading} data-testid="macro-files-reload">
          Read again
        </Button>
      )}
    </Stack>
  )
}

interface PageRowProps {
  tabs: PageTab[]
  page: number
  onPage: (page: number) => void
  /** What stands at the row's right end. */
  children: ReactNode
}

/** "Page 2" to "Page 10", each with how many of its buttons are filled. */
function PageRow({ tabs, page, onPage, children }: PageRowProps): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tabs
        value={page}
        variant="scrollable"
        scrollButtons="auto"
        onChange={(_e, next: number) => {
          onPage(next)
        }}
        sx={{ minHeight: 32, flexGrow: 1, minWidth: 0, '& .MuiTab-root': { minHeight: 32, py: 0.5, minWidth: 0 } }}
      >
        {tabs.map((t) => (
          <Tab key={t.page} value={t.page} label={t.filled > 0 ? `Page ${String(t.page)} (${String(t.filled)})` : `Page ${String(t.page)}`} data-testid="macro-set-page" />
        ))}
      </Tabs>
      {children}
    </Stack>
  )
}

interface DetailProps extends Omit<CharactersProps, 'selected' | 'onSelect'> {
  file: CharacterFileMacros
  files: CharacterFileMacros[]
  /** The character's own layout. */
  set: MacroSet
}

/** One character: its pages, the page's buttons, the picked button beside them, and the game bar. */
function CharacterDetail({ store, game, file, files, set, spot, onSpot, placing, onPlaced }: DetailProps): JSX.Element {
  const writer = useGameWriter(file.file, game.reload)
  /** The macro New just made on a button: its name box takes the focus once. */
  const [fresh, setFresh] = useState<string | null>(null)
  const { library } = store
  const tabs = pageTabs(library, set, file.macros)
  const page = tabs.some((t) => t.page === spot.page) ? spot.page : FIRST_EDITABLE_PAGE
  const cells = gridPage(library, set, page, file.macros)
  const changes = gameChanges(library, set, file.macros)
  const toPlace = findMacro(library, placing)
  const go = (nextPage: number, slot: string | null): void => {
    setFresh(null)
    onSpot({ page: nextPage, slot })
  }
  const pick = (slot: string): void => {
    go(page, slot)
    if (toPlace === null) return
    store.change((current) => assignSlot(current, set.id, slot, toPlace.id))
    onPlaced()
  }
  const move = (from: string, to: string): void => {
    store.change((current) => moveSlot(current, set.id, from, to))
    go(page, to)
  }
  const none = changes.macros.length === 0 && file.macros.length === 0
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }} data-testid="macro-file-detail">
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
        <Stack spacing={1.5}>
          <PageRow
            tabs={tabs}
            page={page}
            onPage={(next) => {
              go(next, null)
            }}
          >
            <CopyFromCharacter store={store} game={game} file={file} files={files} set={set} macros={changes.macros} />
            <LayoutsMenu store={store} game={game} file={file} files={files} set={set} macros={changes.macros} />
            <UndoRedo store={store} />
          </PageRow>
          {toPlace !== null && (
            <Alert
              severity="info"
              data-testid="macro-placing"
              action={
                <Button color="inherit" size="small" onClick={onPlaced} data-testid="macro-placing-cancel">
                  Cancel
                </Button>
              }
            >
              Click a button to put {toPlace.name === '' ? 'the macro' : toPlace.name} on it.
            </Alert>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(340px, 440px)' }, gap: 2, alignItems: 'start' }}>
            <ButtonGrid buttons={cells} selected={spot.slot} onPick={pick} onMove={move} />
            <ButtonPanel
              store={store}
              set={set}
              cell={cells.find((c) => c.slot === spot.slot) ?? null}
              page={page}
              pages={tabs}
              hint={none ? 'No macros yet. Click a button to add one, or use Copy from character.' : 'Click a button to edit it.'}
              fresh={fresh}
              onFresh={setFresh}
              onGo={go}
            />
          </Box>
        </Stack>
      </Box>
      <GameBar file={file} changes={changes} writer={writer} game={game} />
    </Box>
  )
}

export function CharactersSection({ store, game, selected, onSelect, ...rest }: CharactersProps): JSX.Element {
  const files = game.reply?.files ?? []
  const picked = files.find((f) => characterFileKey(f) === selected) ?? files.at(0) ?? null
  if (picked === null) return <NoCharacters game={game} />
  const set = chosenSet(store.library, characterFileKey(picked))
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, gap: 1.5 }}>
      <CharacterPicker store={store} files={files} picked={picked} onSelect={onSelect} />
      {set === null ? (
        <Quiet testid="macro-file-loading">Reading this character&apos;s macros.</Quiet>
      ) : (
        <CharacterDetail key={picked.file} store={store} game={game} file={picked} files={files} set={set} {...rest} />
      )}
    </Box>
  )
}
