// overviewWidgets — every Overview card as a widget: its id (shared/overviewLayout.ts) to the
// component that draws it. Each widget owns its hook, so a card the player turned off subscribes
// to nothing. The combat snapshot is the one input passed down: the page already holds it for
// the hydration gate, and three cards describe the same fight with it.

import type { JSX } from 'react'
import { Box } from '@mui/material'
import type { CombatSnapshot } from '@shared/combat'
import type { OverviewWidgetId } from '@shared/overviewLayout'
import type { CombatFocus } from '../combat/combatFocus'
import type { MobTarget } from '../mobs/mobTarget'
import type { View } from '../../appViews'
import { DpsCard } from './DpsCard'
import { DpsCurveCard } from './DpsCurveCard'
import { CurrentMobCard } from './CurrentMobCard'
import { LevelingCard } from './LevelingCard'
import { RecentDropsCard } from './RecentDropsCard'
import { RecentKillsCard } from './RecentKillsCard'
import { BuffsEndingCard } from './BuffsEndingCard'
import { RespawnsHereCard } from './RespawnsHereCard'
import { MotesCard } from './MotesCard'
import { CoinCard } from './CoinCard'
import { useCurrentMob } from './useCurrentMob'
import { useOverviewLeveling } from './useOverviewLeveling'
import { useRecentDrops } from './useRecentDrops'
import { useRecentKills } from './useRecentKills'

/** Every destination a card links to. They arrive from App.tsx: a card routes, it never navigates. */
export interface OverviewLinks {
  onOpenCombat: (f: CombatFocus) => void
  onOpenMob: (t: MobTarget) => void
  onOpenLoot: (item?: string) => void
  onOpenLeveling: () => void
  /** A plain tab switch, for the cards whose tab takes no payload (Buffs, Timers). */
  onOpenView: (v: View) => void
}

interface WidgetProps {
  snap: CombatSnapshot | null
  links: OverviewLinks
}

function TargetWidget({ snap, links }: WidgetProps): JSX.Element {
  return <CurrentMobCard state={useCurrentMob(snap)} onOpenMob={links.onOpenMob} />
}

function LevelingWidget({ links }: WidgetProps): JSX.Element {
  return <LevelingCard state={useOverviewLeveling()} onOpenLeveling={links.onOpenLeveling} />
}

function DropsWidget({ links }: WidgetProps): JSX.Element {
  return <RecentDropsCard rows={useRecentDrops()} onOpenLoot={links.onOpenLoot} />
}

function KillsWidget({ links }: WidgetProps): JSX.Element {
  return <RecentKillsCard rows={useRecentKills()} onOpenLeveling={links.onOpenLeveling} onOpenMob={links.onOpenMob} />
}

const WIDGETS: Readonly<Record<OverviewWidgetId, (p: WidgetProps) => JSX.Element>> = {
  dps: ({ snap, links }) => <DpsCard snap={snap} onOpenCombat={links.onOpenCombat} />,
  leveling: LevelingWidget,
  target: TargetWidget,
  dpsCurve: ({ snap }) => <DpsCurveCard snap={snap} />,
  drops: DropsWidget,
  kills: KillsWidget,
  buffs: ({ links }) => <BuffsEndingCard onOpenBuffs={() => links.onOpenView('buffs')} />,
  respawns: ({ links }) => <RespawnsHereCard onOpenTimers={() => links.onOpenView('timers')} />,
  motes: ({ links }) => <MotesCard onOpenLoot={() => links.onOpenLoot()} />,
  coin: ({ links }) => <CoinCard onOpenLeveling={links.onOpenLeveling} />
}

/**
 * One card. The wrapper is `display: contents`: it carries the widget id for tests and tools but
 * draws no box, so the card itself stays the grid item and the region's rules apply to it as
 * they did before widgets existed.
 */
export function OverviewWidget({ id, snap, links }: WidgetProps & { id: OverviewWidgetId }): JSX.Element {
  const Card = WIDGETS[id]
  return (
    <Box data-overview-widget={id} sx={{ display: 'contents' }}>
      <Card snap={snap} links={links} />
    </Box>
  )
}
