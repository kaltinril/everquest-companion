// RespawnsHereCard — the watched mobs where you stand that are UP or due soonest (plan quick win
// 2). The `respawn` module the Timers tab and the Respawn overlay read, and the Timers tab's own
// clock words (`respawnClockLabel`); `respawnsHere` (shared/overviewCards.ts) picks the rows.

import type { JSX } from 'react'
import { useMemo } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { EMPTY_RESPAWN_SNAP, type RespawnSnap } from '@shared/respawn'
import { respawnsHere, type RespawnHereRow } from '@shared/overviewCards'
import { useModule } from '../../lib/useModule'
import { useSecondsClock } from '../../lib/useSecondsClock'
import { fmtDuration } from '../buffs/format'
import { DashCard, QuietNote } from '../combat/combatShared'
import { OpenTabButton } from './OpenTabButton'

function clockColor(row: RespawnHereRow): string {
  if (row.seen) return 'success.main'
  return row.due ? 'warning.main' : 'text.primary'
}

function Row({ row }: { row: RespawnHereRow }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} data-testid="overview-respawn-row" sx={{ alignItems: 'baseline', minWidth: 0, py: 0.3 }}>
      <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
        {row.display}
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      <Typography
        variant="body2"
        sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: row.seen ? 700 : 400, color: clockColor(row) }}
      >
        {row.label}
      </Typography>
    </Stack>
  )
}

export function RespawnsHereCard({ onOpenTimers }: { onOpenTimers: () => void }): JSX.Element {
  const snap = useModule<RespawnSnap>('respawn') ?? EMPTY_RESPAWN_SNAP
  const nowMs = useSecondsClock(snap.rows.length > 0)
  const view = useMemo(() => respawnsHere(snap, nowMs, fmtDuration), [snap, nowMs])
  return (
    <DashCard
      title="Respawns here"
      testId="overview-respawns"
      right={<OpenTabButton label="Open Timers" testId="overview-open-timers" onOpen={onOpenTimers} />}
    >
      {view.rows.length === 0 ? (
        <QuietNote>
          {view.tracked === 0
            ? 'No respawn clocks - watch a mob on the Timers tab to time it here.'
            : 'No respawn clocks running in this zone right now.'}
        </QuietNote>
      ) : (
        view.rows.map((row) => <Row key={row.id} row={row} />)
      )}
    </DashCard>
  )
}
