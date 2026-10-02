// unlocks/UnlocksView.tsx — THE UNLOCKS TAB (UNRELEASED, 2026-09-29).
//
// WHAT THIS TAB IS FOR. EQ Legends opens races, classes and deities one achievement each, and
// the game's window lists the requirement lines without saying how far along any of them is.
// This tab lists the three families from the committed rulebook, overlays the character's own
// `/outputfile achievements` dump when there is one, and puts beside each line the number that
// answers it: a faction's live standing over its cap, whether a Sky reward is credited and which
// quest hands it out, which deity task exists at all, and the quests a task is made of. It also
// says how each open one opened, because a race created as, a class confirmed and a deity
// confirmed are all `C` in the file for reasons that are not work done - and it names the
// marketplace token that bypasses each family, which is the one way in that is not play.
//
// A RENDER SHELL: state and derivation are useUnlocksController.ts's.

import { type JSX, useEffect } from 'react'
import { Box, Chip, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import { UNLOCK_TOKENS } from '@shared/unlocks/unlockGraph'
import { closedOf, isYours, openText, type Unlock, type UnlockBook, type UnlockKind } from '@shared/unlocks/unlocks'
import OutputKindLine from '../../components/OutputKindLine'
import { unlockRowId } from '../../lib/unlockLink'
import UnlockRow from './UnlockRow'
import { useUnlocksController, type UnlocksController, type UnlocksViewProps } from './useUnlocksController'

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

/** The never-exported state, over the rulebook rather than instead of them. */
function NoDumpNote(): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" data-testid="unlocks-empty" sx={{ display: 'block', pb: 1 }}>
      These are the game&apos;s requirements. Type <code>/outputfile achievements</code> in game and
      the tab marks which of them this character has done and which unlocks are open. The app
      notices the file by itself.
    </Typography>
  )
}

function Section({
  kind,
  title,
  unlocks,
  yours,
  c
}: {
  kind: UnlockKind
  title: string
  unlocks: readonly Unlock[]
  yours: string | null
  c: UnlocksController
}): JSX.Element {
  const shown = c.hideOpen && c.hasDump ? closedOf(unlocks) : unlocks
  const focused = c.focus?.kind === kind ? c.focus.name : null
  return (
    <Box data-testid="unlocks-section" sx={{ pb: 2 }}>
      <Typography variant="subtitle2">
        {title}
        {c.hasDump ? ` - ${openText(unlocks)}` : ''}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pb: 0.5 }} data-testid="unlocks-token">
        Or a {UNLOCK_TOKENS[kind]}, sold in the marketplace.
      </Typography>
      {shown.map((u) => (
        <UnlockRow key={u.name} unlock={u} yours={isYours(u.name, yours)} focused={u.name === focused} c={c} />
      ))}
      {shown.length === 0 && unlocks.length > 0 && unlocks.every((u) => u.open) && (
        <Typography variant="caption" color="text.secondary">
          Every one is open.
        </Typography>
      )}
    </Box>
  )
}

export default function UnlocksView(props: UnlocksViewProps): JSX.Element {
  const c = useUnlocksController(props)
  const { book, focus } = c
  // The row a chip elsewhere asked for, brought into view once it exists.
  useEffect(() => {
    if (focus === null) return
    document.getElementById(unlockRowId(focus))?.scrollIntoView({ block: 'center' })
  }, [focus])
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
      {c.ready && !c.hasDump && <NoDumpNote />}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ pb: 1 }}>
        {c.hasDump && <Yours book={book} />}
        <Box sx={{ flex: 1 }} />
        {c.hasDump && (
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
        )}
      </Stack>
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        <Section kind="race" title="Races" unlocks={book.races} yours={book.createdAs} c={c} />
        <Section kind="class" title="Classes" unlocks={book.classes} yours={book.primaryClass} c={c} />
        <Section kind="deity" title="Deities" unlocks={book.deities} yours={book.deity} c={c} />
      </Box>
    </Box>
  )
}
