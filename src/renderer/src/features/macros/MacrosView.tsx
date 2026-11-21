// macros/MacrosView.tsx — the Macros tab (fork #11, proof of concept). Three sections over one
// library the app keeps for itself: Library (every macro), Sets (which macro sits on which
// button) and Characters (what the game holds per character file, and the set chosen for each).
//
// The game's files are only READ here. What a set would change is shown and copied as text; the
// write waits on the in-game tests (docs/community/plans/2026-11-20-macro-editor.md).

import { type JSX, useState } from 'react'
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material'
import { BUTTONS_PER_PAGE, LINES, LINE_MAX } from '@shared/macros/limits'
import type { View } from '../../appViews'
import { formatTime } from '../../lib/formatDate'
import { useRawPref } from '../combat/useCombatPrefs'
import { CharactersSection } from './CharactersSection'
import { LibrarySection } from './LibrarySection'
import { Quiet } from './macroParts'
import { MacroUiProvider } from './macroUi'
import { SetsSection } from './SetsSection'
import { useGameFiles, type GameFilesState } from './useGameFiles'
import { useMacroLibrary, type MacroStore } from './useMacroLibrary'

const SECTION_KEY = 'eq.macros.section'
const SECTIONS = ['library', 'sets', 'characters'] as const
type Section = (typeof SECTIONS)[number]

function asSection(raw: string | null): Section {
  return SECTIONS.find((s) => s === raw) ?? 'library'
}

const LIMITS_NOTE = `Limits shown (${String(LINES)} lines, ${String(LINE_MAX)} characters, ${String(BUTTONS_PER_PAGE)} buttons a page) are not all confirmed in game yet`

function Footer({ game, saveFailed }: { game: GameFilesState; saveFailed: boolean }): JSX.Element {
  return (
    <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" justifyContent="space-between" sx={{ flexShrink: 0, pt: 1 }}>
      <Typography variant="caption" color="text.secondary" data-testid="macros-read-at">
        {game.readAt === null ? 'Game files are read only' : `Game files read ${formatTime(game.readAt)}, read only`}
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

/** The three sections. What is picked in each is kept here, so a section switch does not lose it. */
function Sections({ store, game, section }: { store: MacroStore; game: GameFilesState; section: Section }): JSX.Element {
  const [macroId, setMacroId] = useState<string | null>(null)
  const [setId, setSetId] = useState<string | null>(null)
  const [fileKey, setFileKey] = useState<string | null>(null)
  if (section === 'sets') return <SetsSection store={store} selected={setId} onSelect={setSetId} />
  if (section === 'characters') return <CharactersSection store={store} game={game} selected={fileKey} onSelect={setFileKey} />
  return <LibrarySection store={store} selected={macroId} onSelect={setMacroId} />
}

function MacrosView(): JSX.Element {
  const { library, change, loadFailed, saveFailed } = useMacroLibrary()
  const game = useGameFiles()
  const [rawSection, setRawSection] = useRawPref(SECTION_KEY)
  const section = asSection(rawSection)
  return (
    <Box data-testid="macros-view" sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
      <Stack direction="row" alignItems="baseline" spacing={2} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
        <Typography variant="h6">Macros</Typography>
        <Typography variant="caption" color="text.secondary">
          Keep every macro in one library, then choose which ones each character carries.
        </Typography>
      </Stack>
      <Tabs
        value={section}
        onChange={(_e, next: Section) => {
          setRawSection(next)
          // The game's files are read fresh each time the section is opened.
          if (next === 'characters') game.reload()
        }}
        sx={{ minHeight: 32, flexShrink: 0, mb: 1.5, '& .MuiTab-root': { minHeight: 32, py: 0.5 } }}
      >
        <Tab value="library" label="Library" data-testid="macros-tab-library" />
        <Tab value="sets" label="Sets" data-testid="macros-tab-sets" />
        <Tab value="characters" label="Characters" data-testid="macros-tab-characters" />
      </Tabs>
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
        {loadFailed && <Quiet testid="macros-load-failed">The macro library could not be loaded. Restart the app to try again.</Quiet>}
        {library !== null && (
          <MacroUiProvider>
            <Sections store={{ library, change }} game={game} section={section} />
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
