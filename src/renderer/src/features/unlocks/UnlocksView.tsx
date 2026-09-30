// unlocks/UnlocksView.tsx — THE UNLOCKS TAB (UNRELEASED, 2026-09-29).
//
// WHAT THIS TAB IS FOR. EQ Legends opens races, classes and deities one achievement each, and
// the game's window lists the requirement lines without saying how far along any of them is.
// This tab reads the three families out of the `/outputfile achievements` dump and puts beside
// each line the number that answers it: a faction's live standing over its cap, whether a Sky
// reward is credited and which quest hands it out, and which deity task exists at all. It also
// says how each open one opened, because a race created as, a class confirmed and a deity
// confirmed are all `C` in the file for reasons that are not work done.
//
// A RENDER SHELL: state and derivation are useUnlocksController.ts's.

import { type JSX } from 'react'
import { Box, Chip, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import { closedOf, openText, type Unlock, type UnlockBook } from '@shared/unlocks/unlocks'
import OutputKindLine from '../../components/OutputKindLine'
import UnlockRow from './UnlockRow'
import { useUnlocksController, type UnlocksController, type UnlocksViewProps } from './useUnlocksController'

/** The never-run state. It names what the tab is for; the line above it names the command. */
function NoDump(): JSX.Element {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: 6, color: 'text.secondary' }}
    >
      <LockOpenIcon sx={{ fontSize: 44, opacity: 0.6 }} />
      <Typography variant="body2" data-testid="unlocks-empty" sx={{ maxWidth: 480, textAlign: 'center' }}>
        Type <code>/outputfile achievements</code> in game and this becomes the races, classes and
        deities this character has open, and what each closed one still needs: the factions with
        their standing, the Sky rewards with their quests, the deity tasks. The app notices the file
        by itself; type the command again any time to refresh.
      </Typography>
    </Stack>
  )
}

/** What the file says about the character: created as, confirmed class, confirmed deity. */
function Yours({ book }: { book: UnlockBook }): JSX.Element {
  const facts: [string, string | null][] = [
    ['Created as', book.createdAs],
    ['Primary class', book.primaryClass],
    ['Deity', book.deity]
  ]
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      {facts.map(([what, value]) => (
        <Chip
          key={what}
          size="small"
          variant="outlined"
          label={`${what}: ${value ?? 'not stated'}`}
          data-testid="unlocks-yours"
          sx={{ height: 22 }}
        />
      ))}
    </Stack>
  )
}

function Section({
  title,
  unlocks,
  yours,
  c
}: {
  title: string
  unlocks: readonly Unlock[]
  yours: string | null
  c: UnlocksController
}): JSX.Element {
  const shown = c.hideOpen ? closedOf(unlocks) : unlocks
  return (
    <Box data-testid="unlocks-section" sx={{ pb: 2 }}>
      <Typography variant="subtitle2" sx={{ pb: 0.5 }}>
        {title} - {openText(unlocks)}
      </Typography>
      {shown.map((u) => (
        <UnlockRow key={u.name} unlock={u} yours={u.name === yours} c={c} />
      ))}
      {shown.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Every one is open.
        </Typography>
      )}
    </Box>
  )
}

export default function UnlocksView(props: UnlocksViewProps): JSX.Element {
  const c = useUnlocksController(props)
  const { book } = c
  return (
    <Box
      data-testid="unlocks-view"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}
    >
      <OutputKindLine
        kind="achievements"
        why="Type it in game to list which races, classes and deities are open."
        loadedAt={c.readAt}
        testId="unlocks-freshness"
      />
      {c.ready && book === null && <NoDump />}
      {book !== null && (
        <>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ pb: 1 }}>
            <Yours book={book} />
            <Box sx={{ flex: 1 }} />
            <FormControlLabel
              sx={{ mr: 0 }}
              control={
                <Switch
                  size="small"
                  checked={c.hideOpen}
                  onChange={(e) => {
                    c.onHideOpen(e.target.checked)
                  }}
                />
              }
              label={<Typography variant="caption">Hide what is open</Typography>}
            />
          </Stack>
          <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
            <Section title="Races" unlocks={book.races} yours={book.createdAs} c={c} />
            <Section title="Classes" unlocks={book.classes} yours={book.primaryClass} c={c} />
            <Section title="Deities" unlocks={book.deities} yours={book.deity} c={c} />
          </Box>
        </>
      )}
    </Box>
  )
}
