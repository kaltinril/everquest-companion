// factions/useFactionRows.ts — everything the Factions tab reads, joined into its row model.
//
// THREE SOURCES, ONE ROW. The dump's standings arrive through `ProgressState` (session.ts loads
// and follows the file; `onProgress` is the delivery). The LOG's receipts since that dump arrive
// through `factions:evidence` (main/factionsEvidence.ts) and are applied here per row — the
// numeric `adjusted by N` lines sum onto the dump's number, and a cap line PINS the value at the
// faction's own ceiling or the scale floor whatever the old file said (shared/factionLog.ts
// carries the algebra and its exactness rules). The quest work joins by name (factionQuests.ts).
//
// So the STANDING THE TAB SHOWS IS LIVE: dump + log, not dump alone — with `drift` and `exact`
// carried on the row so the view can say what was corrected and how confidently. Split out of
// FactionsView.tsx at the 400-code-line file ceiling (split, never ratchet).

import { useEffect, useMemo, useState } from 'react'
import type { FactionStanding } from '@shared/outputs/factions'
import type { RaceUnlockClaim } from '@shared/outputs/achievements'
import type { HeldCounts, ProgressState } from '@shared/types'
import { applyEvidence, type FactionEvidence, type FactionEvidenceReport } from '@shared/factionLog'
import { CONSIDER_FACTION_COLOR, CONSIDER_FACTION_LABEL } from '@shared/considerFaction'
import { factionTier } from './factionTiers'
import { factionWorkIndex, type FactionWork } from './factionQuests'

/** The dump's floor — the far end every bar is measured from (measured ±2000, factions.ts). */
const SCALE_FLOOR = -2000

export interface FactionRowVm {
  id: number
  name: string
  /** the LIVE standing: the dump's number corrected by the log's receipts since the dump */
  standing: number
  /** what the file itself said — the hover's "dump said N" half */
  dumpStanding: number
  /** standing − dumpStanding: what the log moved since the file was written */
  drift: number
  /** false when the log window could not reach back to the dump AND nothing pinned this row */
  exact: boolean
  /** the faction's own ceiling (`dump standing + toMax` — the file's fact, never hardcoded) */
  cap: number
  /** distance from the LIVE standing to the cap — what the maxed filter reads */
  toMax: number
  label: string
  color: string
  /** the bar, 0–100 from the scale floor to this faction's cap */
  pct: number
  /** the quests on record that move this faction (factionQuests.ts), null when none name it */
  work: FactionWork | null
  raiseCount: number
}

function toRowVm(
  r: FactionStanding,
  work: Map<string, FactionWork>,
  ev: FactionEvidence | undefined,
  windowComplete: boolean
): FactionRowVm {
  const cap = r.standing + r.toMax
  const live =
    ev === undefined
      ? { value: r.standing, drift: 0, exact: true }
      : applyEvidence(r.standing, cap, ev, windowComplete)
  const tier = factionTier(live.value)
  const w = work.get(r.name.toLowerCase()) ?? null
  return {
    id: r.id,
    name: r.name,
    standing: live.value,
    dumpStanding: r.standing,
    drift: live.drift,
    exact: live.exact,
    cap,
    toMax: cap - live.value,
    label: CONSIDER_FACTION_LABEL[tier],
    color: CONSIDER_FACTION_COLOR[tier],
    pct: Math.max(0, Math.min(100, ((live.value - SCALE_FLOOR) / (cap - SCALE_FLOOR)) * 100)),
    work: w,
    raiseCount: w?.raise.length ?? 0
  }
}

export interface FactionsData {
  /** null until the first read lands AND while no dump has ever been loaded for this character */
  rows: FactionRowVm[] | null
  /** when this app last read the dump — `OutputKindLine`'s second slot */
  readAt: number | null
  /** the dump's held counts, for the work panel's "you have N" beside each turn-in item */
  held: HeldCounts
  /** the achievements dump's race unlocks, for the race panel; undefined until one is loaded */
  raceUnlocks?: RaceUnlockClaim[]
}

/** The log-evidence report, re-asked whenever progress moves (a dump reload resets the window). */
function useFactionEvidence(progress: ProgressState | null): FactionEvidenceReport | null {
  const [report, setReport] = useState<FactionEvidenceReport | null>(null)
  const loadedAt = progress?.factionsSource?.loadedAt
  useEffect(() => {
    let alive = true
    window.eq
      .factionsEvidence()
      .then((r) => {
        if (alive) setReport(r)
      })
      .catch(() => {
        // A build whose handler is absent (packaged: the gate) or a read that failed — the dump
        // alone is the honest fallback, which is what a null report renders.
        if (alive) setReport(null)
      })
    return () => {
      alive = false
    }
  }, [loadedAt])
  return report
}

/** Everything the tab draws, live on the same push every progress consumer rides. */
export function useFactionData(): FactionsData {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  useEffect(() => {
    let alive = true
    void window.eq.getProgress().then((p) => {
      if (alive) setProgress(p)
    })
    const off = window.eq.onProgress((p) => {
      setProgress(p)
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  const evidence = useFactionEvidence(progress)
  const standings = progress?.factionStandings
  const rows = useMemo(() => {
    if (standings === undefined) return null
    const work = factionWorkIndex()
    const byName = new Map<string, FactionEvidence>()
    for (const ev of evidence?.rows ?? []) byName.set(ev.name.toLowerCase(), ev)
    return standings.map((r) =>
      toRowVm(r, work, byName.get(r.name.toLowerCase()), evidence?.complete ?? false)
    )
  }, [standings, evidence])
  return {
    rows,
    readAt: progress?.factionsSource?.readAt ?? null,
    held: progress?.inventory ?? {},
    ...(progress?.raceUnlocks === undefined ? {} : { raceUnlocks: progress.raceUnlocks })
  }
}
