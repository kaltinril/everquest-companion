// MotesCard — motes this session, per hour, by tier, and in this zone (plan quick win 5). The XP
// overlay's mote rates (`potentialRates`) over the session slice; `motesCard` (shared/
// overviewCards.ts) does the counting, this file only words it.

import type { JSX } from 'react'
import { useMemo } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { motesCard, type MoteTierRow } from '@shared/overviewCards'
import { formatDropRate } from '../../lib/formatRate'
import { DashCard, QuietNote } from '../combat/combatShared'
import { OpenTabButton } from './OpenTabButton'
import { SessionCaption, SessionHeadline, ZoneLine } from './SessionStat'
import { useOverviewSession } from './useOverviewSession'

const rateText = (n: number | null): string | null => (n === null ? null : formatDropRate(n))

function TierRow({ row }: { row: MoteTierRow }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} data-testid="overview-mote-tier" sx={{ alignItems: 'baseline', minWidth: 0 }}>
      <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
        {row.tier}
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="body2" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {row.drops.toLocaleString()}
      </Typography>
    </Stack>
  )
}

export function MotesCard({ onOpenLoot }: { onOpenLoot: () => void }): JSX.Element {
  const args = useOverviewSession()
  const view = useMemo(() => motesCard(args), [args])
  return (
    <DashCard
      title="Motes"
      testId="overview-motes"
      right={<OpenTabButton label="Open Loot" testId="overview-open-motes" onOpen={onOpenLoot} />}
    >
      {view.session.count === 0 ? (
        <QuietNote>No motes looted this session - each tier you loot is counted here.</QuietNote>
      ) : (
        <>
          <SessionCaption />
          <SessionHeadline amount={view.session.count.toLocaleString()} rate={rateText(view.session.perHour)} testId="overview-motes" />
          <Box sx={{ mt: 0.75 }}>
            {view.tiers.map((t) => (
              <TierRow key={t.item} row={t} />
            ))}
          </Box>
          {view.zone !== null && (
            <ZoneLine
              zone={view.zone.name}
              amount={view.zone.count.toLocaleString()}
              rate={rateText(view.zone.perHour)}
              testId="overview-motes-zone"
            />
          )}
        </>
      )}
    </DashCard>
  )
}
