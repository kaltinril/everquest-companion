// spells/LoadoutKeep.tsx — THE KEPT SET, BY WHO CASTS IT.
//
// Owner, 2026-09-26: *"different colors for each group member, so that it's easy to see which
// spells are from which member"* and *"grouping by that player in the Keep up section"*.
//
// With nobody else in the group the list is the flat one it always was: every row is yours and a
// heading that said so would say nothing. With a group it is one block per caster, you first, each
// under the caster's name in the caster's colour. The grouping is `keepByCaster`'s
// (`shared/spellParty.ts`); nothing here orders or filters (ruling 4).

import type { JSX } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import type { LoadoutCandidate } from '@shared/spellLoadout'
import { KeepRow } from './LoadoutRows'
import { paintOf } from './partyPaint'
import type { LoadoutPool } from './useLoadoutPool'

export interface LoadoutKeepProps {
  keep: readonly LoadoutCandidate[]
  /** `max(observed, simulated)` for one spell - see `KeepRow`. */
  rankOf: (name: string) => number
  pool: LoadoutPool
}

export default function LoadoutKeep({ keep, rankOf, pool }: LoadoutKeepProps): JSX.Element {
  if (pool.party.length === 0) {
    return (
      <Stack>
        {keep.map((c) => (
          <KeepRow key={c.name} c={c} rank={rankOf(c.name)} />
        ))}
      </Stack>
    )
  }
  return (
    <Stack spacing={1}>
      {pool.groupKeep(keep).map((g) => {
        const paint = paintOf(pool.colorOf(g.caster))
        return (
          <Box
            key={g.caster}
            data-testid="loadout-keep-group"
            data-caster={g.caster}
            sx={{ borderLeft: 2, borderColor: paint, pl: 1 }}
          >
            <Typography variant="subtitle2" sx={{ color: paint }}>
              {g.caster} ({String(g.rows.length)})
            </Typography>
            <Stack>
              {g.rows.map((c) => (
                <KeepRow
                  key={c.name}
                  c={c}
                  rank={rankOf(c.name)}
                  caster={{ label: pool.castBy(c.name) ?? g.caster, paint }}
                />
              ))}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
