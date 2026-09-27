// spells/LoadoutKeep.tsx — THE KEPT SET, BY WHO CASTS IT.
//
// Owner, 2026-09-26: *"different colors for each group member, so that it's easy to see which
// spells are from which member"* and *"grouping by that player in the Keep up section"*.
//
// With nobody else in the group the list is the flat one it always was: every row is yours and a
// heading that said so would say nothing. With a group it is one block per caster, you first, each
// under the caster's name in the caster's colour. The grouping is `keepByCaster`'s
// (`shared/spellParty.ts`); nothing here orders or filters (ruling 4).
//
// THE HEADING NAMES THE CASTER, SO THE ROWS DO NOT (owner, same day). A row wears a chip only for
// somebody ELSE who could cast it too, which is the one thing its heading cannot say.
//
// GEMS ARE PER CASTER. Eight gems is a limit on one person's bar, so with a group the warning sits
// on the block of whoever is over it rather than on the set's total.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import type { LoadoutCandidate } from '@shared/spellLoadout'
import { KeepRow, TINY_CHIP, type CasterMark } from './LoadoutRows'
import { paintOf } from './partyPaint'
import type { LoadoutPool } from './useLoadoutPool'

export interface LoadoutKeepProps {
  keep: readonly LoadoutCandidate[]
  /** `max(observed, simulated)` for one spell - see `KeepRow`. */
  rankOf: (name: string) => number
  pool: LoadoutPool
  /** How many gems one caster has. */
  gems: number
}

/** Everyone but `caster` who can cast this spell, each with the colour they wear. */
export function othersWhoCast(pool: LoadoutPool, spell: string, caster?: string): CasterMark[] {
  return pool
    .castersOf(spell)
    .map((name) => ({ name, paint: paintOf(pool.colorOf(name)) }))
    .filter((m) => m.name !== caster)
}

export default function LoadoutKeep({ keep, rankOf, pool, gems }: LoadoutKeepProps): JSX.Element {
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
    <Stack spacing={1.5}>
      {pool.groupKeep(keep).map((g) => {
        const paint = paintOf(pool.colorOf(g.caster))
        return (
          <Box
            key={g.caster}
            data-testid="loadout-keep-group"
            data-caster={g.caster}
            sx={{ borderLeft: 2, borderColor: paint, pl: 1 }}
          >
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography variant="subtitle2" sx={{ color: paint }}>
                {g.caster} ({String(g.rows.length)})
              </Typography>
              {g.rows.length > gems && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  data-testid="loadout-over-gems"
                  label={`more than ${String(gems)} gems`}
                  title={`One caster has ${String(gems)} gems. This block is not trimmed to fit: which of them to carry is the caster's call.`}
                  sx={TINY_CHIP}
                />
              )}
            </Stack>
            <Stack>
              {g.rows.map((c) => (
                <KeepRow key={c.name} c={c} rank={rankOf(c.name)} also={othersWhoCast(pool, c.name, g.caster)} />
              ))}
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
