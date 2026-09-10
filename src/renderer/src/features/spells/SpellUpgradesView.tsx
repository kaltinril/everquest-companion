// spells/SpellUpgradesView.tsx — WHAT TO SPEND MOTES ON. Wave 5's surface; an honest shell today.
//
// THE WISH LIST'S PRECEDENT (JOS-324): a tab that ships before its content ships a panel SAYING SO,
// not an empty box. A blank tab reads as a defect and gets reported as one; a tab that names the
// three panels it is going to hold reads as a plan, and the reader can tell which of the two he is
// looking at.
//
// The model underneath is already built and tested (`shared/spellUpgrade.ts`,
// `shared/spellbook.ts`): the rate table, the mote curve, `upgradePayoff` and `nextTierReturn` are
// all standing. What this tab still needs is the join to YOUR ladder - the observed-rank module's
// per-line reading of what rank you actually hold - which is wave 5.

import type { JSX } from 'react'
import { Alert, Stack, Typography } from '@mui/material'

export default function SpellUpgradesView(): JSX.Element {
  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }} data-testid="spell-upgrades-view">
      <Typography variant="h6">Upgrades</Typography>
      <Alert severity="info" data-testid="spell-upgrades-placeholder">
        Not built yet. This tab will answer where your next motes should go: your own ladder (what
        rank you hold on every line the log has watched you cast), the spells whose numbers a tier
        never improves, and a what-if for any single spell.
      </Alert>
      <Typography variant="body2" color="text.secondary">
        The Spellbook tab already carries the per-spell verdict - the Upgrade column, and the
        &quot;Worth upgrading&quot; filter beside it.
      </Typography>
    </Stack>
  )
}
