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
import { ownershipKey } from '@shared/planner/ownership'
import type { SocketAdvice } from './SlotGrid'
import { auditExaltations, bestEffectFor, type ExaltationAudit, type Loadout } from './exaltationAudit'
import { useDeity } from './useDeity'
import { recommendSockets, socketHosts, type Recommendations } from './socketRecommend'
import { planBoard, type BoardPlan } from './socketOptimize'

export interface SocketAdviceState {
  /** what the grid wears — undefined until the corpus settles, which draws the pre-advice grid */
  advice?: SocketAdvice
  /** what the panel lists — null on no sheet or an unsettled corpus */
  recs: Recommendations | null
  /** the whole-board maximum matching (socketOptimize.ts) — the "best layout" the panel leads with */
  plan: BoardPlan | null
  audit: ExaltationAudit | null
  classes: readonly ClassAbbr[]
  /** the FOLDED deity key, or null when no achievements dump has ever been read */
  deity: string | null
  rows: readonly GearRow[]
}

export function useSocketAdvice(sheet: CharacterSheet | null): SocketAdviceState {
  const gear = useGearIndex()
  const combo = useComboSnap()
  // Read once so the memos key on the VALUE (the gearData precedent).
  const current = combo.current
  const classes = useMemo(() => (current === null ? [] : resolvedClasses(current)), [current])
  // R2's fourth condition. Null until an achievements dump has been read, and null filters nothing.
  const deity = useDeity()
  const loadout = useMemo<Loadout>(() => ({ classes, deity }), [classes, deity])
  const rowByKey = useMemo(() => new Map(gear.rows.map((r) => [r.key, r])), [gear.rows])
  const settled = sheet !== null && gear.ready && !gear.refused
  const recs = useMemo(
    () => (settled ? recommendSockets(sheet.exaltations, gear.rows, loadout, socketHosts(sheet.cells)) : null),
    [settled, sheet, gear.rows, loadout]
  )
  const audit = useMemo(
    () => (settled ? auditExaltations(sheet.exaltations, gear.rows, loadout) : null),
    [settled, sheet, gear.rows, loadout]
  )
  const plan = useMemo(
    () => (settled ? planBoard(sheet.exaltations, gear.rows, loadout, socketHosts(sheet.cells)) : null),
    [settled, sheet, gear.rows, loadout]
  )
  const advice = useMemo<SocketAdvice | undefined>(() => {
    if (recs === null) return undefined
    // The chip hovers carry the panel's OWN sentences (user review 2026-09-09: “put the messages
    // on the hover instead of see-the-panel”) — built once per recommendation set, keyed by
    // (cell, gem) for reds and (cell, socket type) for empties, so the two surfaces can never
    // word the same finding two ways.
    const reasons = new Map<string, string>()
    for (const w of recs.swaps) {
      reasons.set(
        `${w.cellId}|${ownershipKey(w.fromName)}`,
        `Swap it: put the loose ${w.toName} gem from ${w.toWhere} into THIS socket - it grants ${w.toEffect}. (Gems are named after their source item; nothing you are wearing is touched.)`
      )
    }
    for (const r of recs.redundant) {
      const repl =
        r.replaceWith === undefined
          ? ''
          : ` Replace it with ${r.replaceWith.name} (${r.replaceWith.effect}) from ${r.replaceWith.where}.`
      reasons.set(
        `${r.cellId}|${ownershipKey(r.name)}`,
        r.keptEffect === r.effect
          ? `Grants nothing - a second ${r.effect} adds nothing on top of the one in ${r.keptIn} (same-name effects do not stack).${repl}`
          : `Grants nothing - ${r.keptEffect} in ${r.keptIn} outranks it, and same-name effects do not stack.${repl}`
      )
    }
    const fillHints = new Map<string, string>()
    for (const f of recs.fills) {
      fillHints.set(`${f.cellId}|${f.type}`, `Suggestion: socket ${f.gemName} (${f.effect}) from ${f.where}.`)
    }
    return {
      effectOf: (key, type) => bestEffectFor(rowByKey.get(key), type),
      flaggedByCell: recs.flaggedByCell,
      reasonOf: (cellId, key) => reasons.get(`${cellId}|${key}`),
      fillHintOf: (cellId, type) => fillHints.get(`${cellId}|${type}`)
    }
  }, [recs, rowByKey])
  return { advice, recs, plan, audit, classes, deity, rows: gear.rows }
}
