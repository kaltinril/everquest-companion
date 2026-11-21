// macros/MacrosView.tsx — the Macros tab (fork #11). Two sections over one library the app keeps
// for itself: Characters (pick a character, click a button to edit it, press Send) and Library
// (every macro: search, tag, paste in, delete).
//
// Every character file of the game folder gets its own buttons the first time the tab sees it,
// made from what the game holds. Nothing reaches the game until Send
// (docs/community/plans/2026-11-20-macro-editor.md, "Character-first flow").

import { type JSX, useEffect, useState } from 'react'
import { Alert, Box, Stack, Tab, Tabs, Typography } from '@mui/material'
import { historyKey } from '@shared/macros/history'
import { mergeGameFiles, mergeText } from '@shared/macros/gameMerge'
import { BUTTONS_PER_PAGE, LINES, LINE_MAX } from '@shared/macros/limits'
import type { CharacterFileMacros } from '@shared/macros/types'
import type { View } from '../../appViews'
import { formatTime } from '../../lib/formatDate'
import { useRawPref } from '../combat/useCombatPrefs'
import { CharactersSection, FIRST_SPOT, type Spot } from './CharactersSection'
import { LibrarySection } from './LibrarySection'
import { Quiet } from './macroParts'
import { type MacroSection, macroSection } from './macroSection'
import { MacroUiProvider } from './macroUi'
import { useGameFiles, type GameFilesState } from './useGameFiles'
import { useMacroLibrary, type MacroStore } from './useMacroLibrary'

const SECTION_KEY = 'eq.macros.section'
/** The character last picked (shared `characterFileKey`). */
const CHARACTER_KEY = 'eq.macros.character'

const NO_FILES: readonly CharacterFileMacros[] = []

const LIMITS_NOTE = `Limits shown (${String(LINES)} lines, ${String(LINE_MAX)} characters, ${String(BUTTONS_PER_PAGE)} buttons a page) are not all confirmed in game yet`

function Footer({ game, saveFailed }: { game: GameFilesState; saveFailed: boolean }): JSX.Element {
  return (
    <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" justifyContent="space-between" sx={{ flexShrink: 0, pt: 1 }}>
      <Typography variant="caption" color="text.secondary" data-testid="macros-read-at">
        {game.readAt === null ? 'Game files not read yet' : `Game files read ${formatTime(game.readAt)}`}
      </Typography>
      {saveFailed && (
        <Typography variant="caption" color="warning.main" data-testid="macros-save-failed">
          The last change was not saved.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {LIMITS_NOTE}
      </Typography>
    </Stack>
  )
}

/**
 * The game's macros are simply there: whenever the game files or the library arrive, each read is
 * merged into the characters' buttons (gameMerge.ts). Returns the one line said when something
 * was brought in (null when nothing was, or once dismissed) and its dismiss.
 */
function useGameLayouts(store: MacroStore | null, game: GameFilesState): [string | null, () => void] {
  const [line, setLine] = useState<string | null>(null)
  const library = store?.library ?? null
  const absorb = store?.absorb
  const files = game.reply?.files
  useEffect(() => {
    if (library === null || absorb === undefined || files === undefined) return
    const made = mergeGameFiles(library, files)
    if (made.library === library) return
    // Not an Undo step: it is the game's doing, not the player's.
    absorb(files)
    const text = mergeText(made.report)
    if (text !== null) setLine(text)
  }, [library, absorb, files])
  return [
    line,
    () => {
      setLine(null)
    }
  ]
}

/** A key press that belongs to a text box (its own undo must keep working) or to an open dialog. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.closest('input, textarea, select, [role="dialog"]') !== null
}

/** Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and redo while the tab is open and no text box has the focus. */
function useHistoryKeys(store: MacroStore | null): void {
  const undo = store?.undo
  const redo = store?.redo
  useEffect(() => {
    if (undo === undefined || redo === undefined) return undefined
    const onKey = (e: KeyboardEvent): void => {
      const action = historyKey(e)
      if (action === null || isTyping(e.target)) return
      e.preventDefault()
      if (action === 'undo') undo()
      else redo()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [undo, redo])
}

interface SectionsProps {
  store: MacroStore
  game: GameFilesState
  section: MacroSection
  onSection: (section: MacroSection) => void
}

/** The two sections. What is picked in each is kept here, so a section switch does not lose it. */
function Sections({ store, game, section, onSection }: SectionsProps): JSX.Element {
  const [macroId, setMacroId] = useState<string | null>(null)
  const [fileKey, setFileKey] = useRawPref(CHARACTER_KEY)
  const [spot, setSpot] = useState<Spot>(FIRST_SPOT)
  /** A library macro waiting to be put on a button of a character. */
  const [placing, setPlacing] = useState<string | null>(null)
  if (section === 'library') {
    return (
      <LibrarySection
        store={store}
        files={game.reply?.files ?? NO_FILES}
        selected={macroId}
        onSelect={setMacroId}
        onPlace={(id) => {
          setPlacing(id)
          onSection('characters')
        }}
      />
    )
  }
  return (
    <CharactersSection
      store={store}
      game={game}
      selected={fileKey}
      onSelect={(key) => {
        setFileKey(key)
        setSpot(FIRST_SPOT)
      }}
      spot={spot}
      onSpot={setSpot}
      placing={placing}
      onPlaced={() => {
        setPlacing(null)
      }}
    />
  )
}

function MacrosView(): JSX.Element {
  const { store, loadFailed, saveFailed } = useMacroLibrary()
  const game = useGameFiles()
  const [rawSection, setRawSection] = useRawPref(SECTION_KEY)
  const section = macroSection(rawSection)
  const [broughtIn, dismissBroughtIn] = useGameLayouts(store, game)
  useHistoryKeys(store)
  const open = (next: MacroSection): void => {
    setRawSection(next)
    // The game's files are read fresh each time the section is opened.
    if (next === 'characters') game.reload()
  }
  return (
    <Box data-testid="macros-view" sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
      <Stack direction="row" alignItems="baseline" spacing={2} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
        <Typography variant="h6">Macros</Typography>
        <Typography variant="caption" color="text.secondary">
          Pick a character, click a button to edit it, then send.
        </Typography>
      </Stack>
      <Tabs
        value={section}
        onChange={(_e, next: MacroSection) => {
          open(next)
        }}
        sx={{ minHeight: 32, flexShrink: 0, mb: 1.5, '& .MuiTab-root': { minHeight: 32, py: 0.5 } }}
      >
        <Tab value="characters" label="Characters" data-testid="macros-tab-characters" />
        <Tab value="library" label="Library" data-testid="macros-tab-library" />
      </Tabs>
      {broughtIn !== null && (
        <Alert severity="info" onClose={dismissBroughtIn} sx={{ flexShrink: 0, mb: 1.5 }} data-testid="macros-brought-in">
          {broughtIn}
        </Alert>
      )}
      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {loadFailed && <Quiet testid="macros-load-failed">The macro library could not be loaded. Restart the app to try again.</Quiet>}
        {store !== null && (
          <MacroUiProvider>
            <Sections store={store} game={game} section={section} onSection={open} />
          </MacroUiProvider>
        )}
      </Box>
      <Footer game={game} saveFailed={saveFailed} />
    </Box>
  )
}

/** The Macros tab: nothing on any other view. Not keyed by character: the library is the app's. */
export function MacrosTab({ view }: { view: View }): JSX.Element | null {
  return view === 'macros' ? <MacrosView /> : null
}
