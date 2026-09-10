// character/useSocketAdvice — ONE computation of the socket recommender, shared by the two
// surfaces that draw it: the slot grid (red cards, effect-led chips) and the cleanup panel
// (the swap/fill/scrap lists). Computing it twice would invite the two to disagree about which
// cell is red, which is the exact class of drift the controller pattern exists to prevent.

import { useMemo } from 'react'
import type { ClassAbbr } from '@shared/classCombo'
import { resolvedClasses } from '@shared/classCombo'
import type { CharacterSheet } from '@shared/characterSheet'
import { useComboSnap } from '../profiles/ClassComboData'
import { useGearIndex } from '../gear/gearData'
import type { GearRow } from '@shared/planner/gear'
import type { SocketAdvice } from './SlotGrid'
import {
  auditExaltations,
  bestEffectFor,
  recommendSockets,
  socketHosts,
  type ExaltationAudit,
  type Recommendations
} from './exaltationAudit'

export interface SocketAdviceState {
  /** what the grid wears — undefined until the corpus settles, which draws the pre-advice grid */
  advice?: SocketAdvice
  /** what the panel lists — null on no sheet or an unsettled corpus */
  recs: Recommendations | null
  audit: ExaltationAudit | null
  classes: readonly ClassAbbr[]
  rows: readonly GearRow[]
}

export function useSocketAdvice(sheet: CharacterSheet | null): SocketAdviceState {
  const gear = useGearIndex()
  const combo = useComboSnap()
  // Read once so the memos key on the VALUE (the gearData precedent).
  const current = combo.current
  const classes = useMemo(() => (current === null ? [] : resolvedClasses(current)), [current])
  const rowByKey = useMemo(() => new Map(gear.rows.map((r) => [r.key, r])), [gear.rows])
  const settled = sheet !== null && gear.ready && !gear.refused
  const recs = useMemo(
    () => (settled ? recommendSockets(sheet.exaltations, gear.rows, classes, socketHosts(sheet.cells)) : null),
    [settled, sheet, gear.rows, classes]
  )
  const audit = useMemo(
    () => (settled ? auditExaltations(sheet.exaltations, gear.rows, classes) : null),
    [settled, sheet, gear.rows, classes]
  )
  const advice = useMemo<SocketAdvice | undefined>(
    () =>
      recs === null
        ? undefined
        : { effectOf: (key, type) => bestEffectFor(rowByKey.get(key), type), flaggedByCell: recs.flaggedByCell },
    [recs, rowByKey]
  )
  return { advice, recs, audit, classes, rows: gear.rows }
}
