// MapPinsCrawl.tsx — Crawl mode on the Map pins overlay (owner, 2026-10-29: "try it out and we'll
// see"): the named-mob marks you killed on this visit to the zone are drawn faint, under the Maps
// tab's own switch (`eq.maps.crawl`, read through the storage this window shares; no chip here).
//
// The kills and progression modules are subscribed ONLY while the switch is on: `CrawlFeed` is
// mounted then and not otherwise, so an overlay left up all evening refetches nothing for a mode
// nobody turned on. The rule is shared/crawlMode.ts, the same one the Maps tab uses.

import { useEffect, useState, type JSX } from 'react'
import { killedSince, stayStart, type ZoneStays } from '@shared/crawlMode'
import type { KillsSnap } from '@shared/kills'
import { useOverlayModule } from './useOverlayModule'
import { useCrawlSetting } from './useMapPinsData'

const NONE: ReadonlySet<string> = new Set()
const NO_KILLS: KillsSnap = { v: 0, mobs: {} }
/** Only the zone intervals are read off the progression snapshot. */
const NO_STAYS: ZoneStays = { zoneStart: [], zoneName: [] }

function CrawlFeed({ zone, onKilled }: { zone: string | null; onKilled: (killed: ReadonlySet<string>) => void }): null {
  const kills = useOverlayModule<KillsSnap>('kills', NO_KILLS)
  const prog = useOverlayModule<ZoneStays>('progression', NO_STAYS)
  const since = stayStart(prog, zone)
  useEffect(() => {
    onKilled(killedSince(kills.mobs, since))
  }, [kills, since, onKilled])
  useEffect(
    () => () => {
      onKilled(NONE)
    },
    [onKilled]
  )
  return null
}

/** The killed-this-visit set (`mobKey`s) for `zone`, and the feed to mount while Crawl mode is on. */
export function useOverlayCrawl(zone: string | null): { killed: ReadonlySet<string>; feed: JSX.Element | null } {
  const on = useCrawlSetting()
  const [killed, setKilled] = useState<ReadonlySet<string>>(NONE)
  return { killed, feed: on ? <CrawlFeed zone={zone} onKilled={setKilled} /> : null }
}
