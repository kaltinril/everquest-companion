// slayer/SlayerView.tsx — THE SLAYER TAB (UNRELEASED, 2026-09-28).
//
// WHAT THIS TAB IS FOR. The Slayer achievements count kills by kind of creature, several hundred
// to several thousand each, and the game says what is left but not where to find it. This tab
// reads what is left out of the `/outputfile achievements` dump, joins each requirement to the
// mobs that count toward it (shared/slayer/), and ranks the zones where the picked achievements
// can be worked on together.
//
// A RENDER SHELL: every piece of state and derivation is useSlayerController.ts's, and the two
// columns take their props pre-bundled.
//
// BOTH COLUMNS ARE THEIR OWN SCROLLERS (AGENTS.md UI conventions): the view fills its height and
// each list scrolls in a bounded box rather than growing the page.

import { type JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import { requiredLeft, type SlayerGoal } from '@shared/outputs/slayer'
import OutputKindLine from '../../components/OutputKindLine'
import CounterList from './CounterList'
import ZoneList from './ZoneList'
import { useSlayerController, type SlayerViewProps } from './useSlayerController'

/** The never-run state. It names what the tab is for; the line above it names the command. */
function NoDump(): JSX.Element {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: 6, color: 'text.secondary' }}
    >
      <MilitaryTechIcon sx={{ fontSize: 44, opacity: 0.6 }} />
      <Typography variant="body2" data-testid="slayer-empty" sx={{ maxWidth: 460, textAlign: 'center' }}>
        Type <code>/outputfile achievements</code> in game and this becomes the list of Slayer
        achievements you have left, with the zones where you can work on several at once. The app
        notices the file by itself; type the command again any time to refresh the counts.
      </Typography>
    </Stack>
  )
}

/** The four General achievements and how many achievements each still requires. */
function Goals({ goals }: { goals: readonly SlayerGoal[] }): JSX.Element | null {
  if (goals.length === 0) return null
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap data-testid="slayer-goals" sx={{ pb: 1 }}>
      {goals.map((goal) => (
        <Chip
          key={goal.achievement}
          size="small"
          variant="outlined"
          label={`${goal.achievement} - ${String(requiredLeft(goal))} to go`}
        />
      ))}
    </Stack>
  )
}

export default function SlayerView(props: SlayerViewProps): JSX.Element {
  const c = useSlayerController(props)
  return (
    <Box
      data-testid="slayer-view"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}
    >
      <OutputKindLine
        kind="achievements"
        why="Type it in game to list the Slayer achievements you have left."
        loadedAt={c.readAt}
        testId="slayer-freshness"
      />
      {c.ready && !c.hasDump && <NoDump />}
      {c.hasDump && (
        <>
          <Goals goals={c.goals} />
          <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', gap: 2 }}>
            <Box sx={{ flex: '0 0 40%', minWidth: 0, minHeight: 0 }}>
              <CounterList {...c.list} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <ZoneList {...c.plan} />
            </Box>
          </Box>
        </>
      )}
    </Box>
  )
}
