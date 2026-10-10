// slayer/slayerData.ts — the Slayer plan's two inputs: the catalog joined to the wiki's races, and
// the character's open counters.
//
// THE CATALOG INDEX IS BUILT ONCE, ON FIRST USE (the mobSearch posture): reading a race and a name
// for 7,900 mobs costs about 100 ms, the catalog is immutable, and a session that never opens the
// tab pays nothing.
//
// THE COUNTERS RIDE `ProgressState`, on the push every dump-fed surface rides: main re-reads the
// achievements dump when the file changes and sends `onProgress`, so typing `/outputfile
// achievements` in game updates an open tab by itself.

import { useEffect, useState } from 'react'
import type { SlayerRecord } from '@shared/outputs/slayer'
import { slayerMobs, type SlayerMob } from '@shared/slayer/slayerPlan'
import type { ProgressState } from '@shared/types'
import factionsJson from '../../data/eqlegends/mobFactions.json'
import racesJson from '../../data/eqlegends/mobRaces.json'
import { MOB_CATALOG } from '../mobs/mobSearch'

let MOBS: SlayerMob[] | null = null

export function slayerCatalog(): SlayerMob[] {
  if (MOBS !== null) return MOBS
  const raceOf = new Map<string, string>()
  const races: Record<string, string[]> = racesJson.races
  for (const [race, pages] of Object.entries(races)) {
    for (const page of pages) raceOf.set(page, race)
  }
  const hit = new Set<string>(factionsJson.hit)
  MOBS = slayerMobs(
    MOB_CATALOG,
    (page) => raceOf.get(page),
    (page) => hit.has(page)
  )
  return MOBS
}

export interface SlayerData {
  /** null until the first read settles, and after it when there is no dump */
  record: SlayerRecord | null
  /** when this app last read the dump, for the freshness line */
  readAt: number | null
  /** the first read has settled, so "no dump" can be told from "not yet" */
  ready: boolean
}

export function useSlayerData(): SlayerData {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  useEffect(() => {
    let alive = true
    // The first reply can be read before a dump push and land after it, so it only fills an
    // empty state.
    void window.eq.getProgress().then(
      (p) => {
        if (alive) setProgress((prev) => prev ?? p)
      },
      () => {
        /* a failed read leaves what is shown alone */
      }
    )
    const off = window.eq.onProgress((p) => {
      setProgress(p)
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  return {
    record: progress?.slayer ?? null,
    readAt: progress?.achievementsSource?.readAt ?? null,
    ready: progress !== null
  }
}
