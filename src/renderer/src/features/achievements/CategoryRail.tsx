// achievements/CategoryRail.tsx — THE GAME'S OWN CATEGORIES, in the game's own order: a family
// (`Slayer`) and the groups under it (`General`, `Conquest`, `Special`, `Skill`). Picking a
// family shows all of its groups together; picking a group shows that one.
//
// A TALLY SAYS WHAT THE FILE CAN SAY. A file that printed completed achievements gives
// `done/total`; one that printed only the open ones gives how many are open, because nothing in
// it says how many were finished (shared/outputs/achievementBook.ts).
//
// ITS OWN SCROLLER (AGENTS.md UI conventions), like the two columns beside it.

import { Fragment, type JSX } from 'react'
import { Box, List, ListItemButton, Typography } from '@mui/material'
import type { Scope, Tally } from '@shared/achievements/bookRows'
import type { RailBundle } from './useAchievementsController'

function tallyText(tally: Tally, hasComplete: boolean): string {
  return hasComplete ? `${String(tally.done)}/${String(tally.total)}` : String(tally.total)
}

function sameScope(a: Scope, b: Scope): boolean {
  return a.family === b.family && a.category === b.category
}

function RailRow({
  label,
  to,
  tally,
  level,
  bundle
}: {
  label: string
  to: Scope
  tally: Tally
  /** 0 for everything and a family, 1 for a group under one */
  level: 0 | 1
  bundle: RailBundle
}): JSX.Element {
  return (
    <ListItemButton
      dense
      data-testid="achievements-rail-row"
      selected={sameScope(bundle.scope, to)}
      onClick={() => {
        bundle.onScope(to)
      }}
      sx={{ pl: 1 + 2 * level, pr: 1, py: 0.25, gap: 1 }}
    >
      <Typography
        variant="body2"
        noWrap
        sx={{ flex: 1, minWidth: 0, fontWeight: level === 0 ? 600 : 400 }}
      >
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {tallyText(tally, bundle.hasComplete)}
      </Typography>
    </ListItemButton>
  )
}

export default function CategoryRail(bundle: RailBundle): JSX.Element {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Typography variant="subtitle2" sx={{ pb: 0.5 }}>
        Categories
      </Typography>
      <List
        disablePadding
        data-testid="achievements-rail"
        sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}
      >
        <RailRow
          label="All achievements"
          to={{ family: null, category: null }}
          tally={bundle.total}
          level={0}
          bundle={bundle}
        />
        {bundle.families.map((family) => (
          <Fragment key={family.name}>
            <RailRow
              label={family.name}
              to={{ family: family.name, category: null }}
              tally={family.tally}
              level={0}
              bundle={bundle}
            />
            {family.groups.map(({ group, tally }) => (
              <RailRow
                key={group.category}
                label={group.name === '' ? group.category : group.name}
                to={{ family: family.name, category: group.category }}
                tally={tally}
                level={1}
                bundle={bundle}
              />
            ))}
          </Fragment>
        ))}
      </List>
    </Box>
  )
}
