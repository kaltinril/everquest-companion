// useCrawlMode.ts — the Maps tab's Crawl mode (competitor-quick-wins, 2026-10-29): opt-in, off by
// default, remembered on this machine. While on, the mobs you killed on this visit to the zone on
// screen are dimmed on the map and in the sidebar; the rule is shared/crawlMode.ts.

import { useCallback, useMemo, useState } from 'react'
import { killedSince, stayStart } from '@shared/crawlMode'
import type { KillsSnap } from '@shared/kills'
import type { ProgressionSnap } from '@shared/progressionTypes'
import { useModule } from '../../lib/useModule'

const KEY = 'eq.maps.crawl'
const NONE: ReadonlySet<string> = new Set()

export interface CrawlMode {
  on: boolean
  toggle: () => void
  /** `mobKey`s of the mobs killed this visit; empty while off or while the map is another zone. */
  killed: ReadonlySet<string>
}

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** `zone` is the map on screen (a stem); a zone you are not in dims nothing. */
export function useCrawlMode(zone: string | null): CrawlMode {
  const [on, setOn] = useState(load)
  const toggle = useCallback(() => {
    setOn((prev) => {
      try {
        localStorage.setItem(KEY, prev ? '0' : '1')
      } catch {
        // A blocked store keeps the choice for this session only.
      }
      return !prev
    })
  }, [])
  const kills = useModule<KillsSnap>('kills')
  const prog = useModule<ProgressionSnap>('progression')
  // The visit's start as a number, so an experience line (a new progression snapshot) does not
  // rebuild the set and redraw the memoized sidebar.
  const since = prog == null ? null : stayStart(prog, zone)
  const killed = useMemo(() => (on && kills != null ? killedSince(kills.mobs, since) : NONE), [on, kills, since])
  return useMemo(() => ({ on, toggle, killed }), [on, toggle, killed])
}
