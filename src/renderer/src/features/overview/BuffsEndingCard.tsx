// BuffsEndingCard — the buffs running out soonest (plan quick win 1). The same two modules and
// the same allow-list the Buffs overlay reads; `buffsRunningOut` (shared/overviewCards.ts) picks
// the rows. It ticks once a second while anything is running, like the overlay, because a buff
// running out is exactly when the log is quiet.

import type { JSX } from 'react'
import { useMemo } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import type { BuffsSnap } from '@shared/types'
import type { BuffTimersSnap } from '@shared/buffTimers'
import { buffsRunningOut, type BuffEndingRow } from '@shared/overviewCards'
import { useModule } from '../../lib/useModule'
import { useSecondsClock } from '../../lib/useSecondsClock'
import { useBuffAllow } from '../buffs/useBuffAllow'
import { fmtDuration } from '../buffs/format'
import { DashCard, QuietNote } from '../combat/combatShared'
import { OpenTabButton } from './OpenTabButton'

const EMPTY_BUFFS: BuffsSnap = { active: [], stats: {} }
const EMPTY_TIMERS: BuffTimersSnap = { holds: [], ends: [] }
/** Under this, the time left is drawn in the warning colour. */
const SOON_MS = 60_000

function Row({ row }: { row: BuffEndingRow }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} data-testid="overview-buff-row" sx={{ alignItems: 'baseline', minWidth: 0, py: 0.3 }}>
      <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
        {row.name}
      </Typography>
      {row.target !== undefined && (
        <Typography variant="caption" noWrap sx={{ color: 'text.secondary', minWidth: 0, flexShrink: 1 }}>
          on {row.target}
        </Typography>
      )}
      <Box sx={{ flexGrow: 1 }} />
      <Typography
        variant="body2"
        sx={{
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          color: row.remainingMs < SOON_MS ? 'warning.main' : 'text.primary'
        }}
      >
        {row.overdue ? 'ending' : fmtDuration(row.remainingMs)}
      </Typography>
    </Stack>
  )
}

export function BuffsEndingCard({ onOpenBuffs }: { onOpenBuffs: () => void }): JSX.Element {
  const buffs = useModule<BuffsSnap>('buffs') ?? EMPTY_BUFFS
  const timers = useModule<BuffTimersSnap>('buffTimers') ?? EMPTY_TIMERS
  const { prefs: allow } = useBuffAllow(window.eq)
  const nowMs = useSecondsClock(buffs.active.length > 0 || timers.holds.length > 0)
  const rows = useMemo(() => buffsRunningOut({ buffs, timers, allow }, nowMs), [buffs, timers, allow, nowMs])
  return (
    <DashCard
      title="Buffs running out"
      testId="overview-buffs"
      right={<OpenTabButton label="Open Buffs" testId="overview-open-buffs" onOpen={onOpenBuffs} />}
    >
      {rows.length === 0 ? (
        <QuietNote>No buffs running - your timed buffs appear here, soonest to end first.</QuietNote>
      ) : (
        rows.map((row) => <Row key={row.id} row={row} />)
      )}
    </DashCard>
  )
}
