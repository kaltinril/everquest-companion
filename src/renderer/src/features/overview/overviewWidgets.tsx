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
import { DropMarker, OverviewEditBar, type OverviewEditProps } from './OverviewEditBar'

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

interface OverviewWidgetProps extends WidgetProps {
  id: OverviewWidgetId
  /** Columns it spans on screen: the stored width cut to the columns the page has. */
  span: number
  /** Edit layout's bar and drag state; null outside the mode. */
  edit: OverviewEditProps | null
}

/**
 * One card: the grid item. It spans its columns, and the card inside grows to the row's height
 * (a row is as tall as its tallest card). In Edit layout it wears the edit bar above the card, the
 * card itself takes no clicks (so a drag never opens a tab), and the drop marker shows on the
 * side the dragged card would land.
 */
export function OverviewWidget({ id, span, edit, snap, links }: OverviewWidgetProps): JSX.Element {
  const Card = WIDGETS[id]
  const dragging = edit?.drag.drag
  const marker = dragging?.slot?.id === id ? dragging.slot.side : null
  return (
    <Box
      data-overview-widget={id}
      data-span={span}
      sx={{
        gridColumn: `span ${String(span)}`,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        opacity: dragging?.id === id ? 0.45 : 1,
        '& > [data-card]': { flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
        '& > [data-card] > *': { flexGrow: 1, minWidth: 0 }
      }}
    >
      {edit && <OverviewEditBar id={id} edit={edit} />}
      <Box data-card sx={edit ? { pointerEvents: 'none', userSelect: 'none' } : undefined}>
        <Card snap={snap} links={links} />
      </Box>
      {marker && <DropMarker side={marker} />}
    </Box>
  )
}
