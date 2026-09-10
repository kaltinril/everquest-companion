// spells/SpellLoadoutView.tsx — WHAT TO HAVE UP. Wave 6's surface; an honest shell today.
//
// The wish list's precedent again (see `SpellUpgradesView`): a tab that ships before its content
// says so rather than drawing an empty box.
//
// THIS IS THE ONE THAT NEEDS THE CLIENT FILE. A recommended buff set is a maximum-weight selection
// under STACKING CONFLICTS, and an exact conflict verdict needs the twelve effect slots out of the
// player's own `spells_us.txt` (docs/plans/spell-upgrades-and-loadout.md §3.3, wave 4). Until that
// lands this tab could only guess, and a guessed conflict is worse than no answer: it would tell a
// player his two best buffs collide when the game is perfectly happy to run both.

import type { JSX } from 'react'
import { Alert, Stack, Typography } from '@mui/material'

export default function SpellLoadoutView(): JSX.Element {
  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }} data-testid="spell-loadout-view">
      <Typography variant="h6">Loadout</Typography>
      <Alert severity="info" data-testid="spell-loadout-placeholder">
        Not built yet. This tab will recommend a buff set and a combat set for your class trio,
        scored through the same table the Gear area scores an item with - and it will say which of
        your buffs cannot both stand, and what the loser was carrying that the winner is not.
      </Alert>
      <Typography variant="body2" color="text.secondary">
        The stacking half needs your EverQuest spell file to be exact, so it is built after the
        client-table work rather than guessed at.
      </Typography>
    </Stack>
  )
}
