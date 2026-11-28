// CoinCard — coin this session, per hour, and in this zone (plan quick win 9). The same coin
// `rangeStats` gives the Leveling tab and the XP overlay, merchant sales credited to where their
// items dropped; `coinCard` (shared/overviewCards.ts) does the counting, this file only words it.

import type { JSX } from 'react'
import { useMemo } from 'react'
import { coinCard } from '@shared/overviewCards'
import { formatPlatRate } from '../../lib/formatRate'
import { coinText } from '../leveling/rangeStatsRows'
import { DashCard, QuietNote } from '../combat/combatShared'
import { OpenTabButton } from './OpenTabButton'
import { SessionCaption, SessionHeadline, ZoneLine } from './SessionStat'
import { useOverviewSession } from './useOverviewSession'

/** Copper per hour as platinum per hour, or null for the dash. */
const rateText = (copperPerHour: number | null): string | null =>
  copperPerHour === null ? null : formatPlatRate(copperPerHour / 1000)

export function CoinCard({ onOpenLeveling }: { onOpenLeveling: () => void }): JSX.Element {
  const args = useOverviewSession()
  const view = useMemo(() => coinCard(args), [args])
  return (
    <DashCard
      title="Coin"
      testId="overview-coin"
      right={<OpenTabButton label="Open Leveling" testId="overview-open-coin" onOpen={onOpenLeveling} />}
    >
      {view.session.count === 0 ? (
        <QuietNote>No coin this session - corpse coin and sales are counted here.</QuietNote>
      ) : (
        <>
          <SessionCaption />
          <SessionHeadline amount={coinText(view.session.count)} rate={rateText(view.session.perHour)} testId="overview-coin" />
          {view.zone !== null && (
            <ZoneLine
              zone={view.zone.name}
              amount={coinText(view.zone.count)}
              rate={rateText(view.zone.perHour)}
              testId="overview-coin-zone"
            />
          )}
        </>
      )}
    </DashCard>
  )
}
