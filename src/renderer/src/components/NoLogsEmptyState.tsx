// NoLogsEmptyState — the fresh-machine answer, lifted out of App.tsx (JOS-43).
//
// It moved for the reason appRouting.ts moved: App.tsx is a COMPOSITION (title bar, nav, content,
// toasts, dialogs) sitting on the measured 400-code-line ceiling, and a self-contained leaf
// component with no app state in it is the cheapest thing in that file to stop owning.
//
// WHAT IT SAYS AND WHY (fork #9). There is no character to read and no `eqlog_*.txt` to pick in
// the (auto-detected or Settings-overridden) EQ folder. It used to give one piece of advice for
// every cause: turn logging on, or point the app at the install. Told that while their folder
// could not be listed, or did not exist, a player was sent the wrong way. So it now names the
// folder it looked in and prints the verdict Preferences prints for that folder (`EqFolderCheck`,
// one decision in `lib/noLogs.ts`), and hands over a button to the place that fixes it. Showing
// empty or erroring feature views instead would make a solvable setup problem look like a broken
// app. `App.tsx` decides WHEN it shows (`showsNoLogs`): never over an attached character.

import { type JSX, useEffect, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import type { EqConfig } from '@shared/types'
import { EqFolderCheck } from '../features/preferences/EqFolderSetting'
import { folderVerdict, lookedIn } from '../lib/noLogs'

/**
 * The folder main resolved and how reading it went. Asked on mount and whenever the window comes
 * back to the front (the player went to turn logging on, or to plug the drive in), and pushed by
 * main when the folder setting changes. Null until the first answer: nothing is claimed before it.
 */
function useEqConfig(): EqConfig | null {
  const [config, setConfig] = useState<EqConfig | null>(null)
  useEffect(() => {
    let alive = true
    const ask = (): void => {
      void window.eq.getEqConfig().then(
        (next) => {
          if (alive) setConfig(next)
        },
        () => undefined
      )
    }
    ask()
    const off = window.eq.onEqConfigChanged(setConfig)
    window.addEventListener('focus', ask)
    return () => {
      alive = false
      off()
      window.removeEventListener('focus', ask)
    }
  }, [])
  return config
}

export default function NoLogsEmptyState({
  onOpenPreferences
}: {
  onOpenPreferences: () => void
}): JSX.Element {
  const config = useEqConfig()
  return (
    <Box
      data-testid="no-logs"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 1.5,
        color: 'text.secondary'
      }}
    >
      <TravelExploreIcon sx={{ fontSize: 48, opacity: 0.6 }} />
      <Typography variant="h6" color="text.primary">
        No EverQuest logs found yet
      </Typography>
      {config !== null && (
        <Typography variant="body2" data-testid="no-logs-folder" sx={{ maxWidth: 440, wordBreak: 'break-word' }}>
          {lookedIn(config.logsDir)}
        </Typography>
      )}
      {/* The list and this count are read a moment apart: a folder that has logs after all says
          nothing here, and the list catches up on the next look. */}
      {config !== null && folderVerdict(config) !== 'found' && (
        <Box sx={{ maxWidth: 440, textAlign: 'left' }}>
          <EqFolderCheck config={config} />
        </Box>
      )}
      <Button variant="contained" startIcon={<SettingsIcon />} onClick={onOpenPreferences} sx={{ mt: 1 }}>
        Open preferences
      </Button>
    </Box>
  )
}
