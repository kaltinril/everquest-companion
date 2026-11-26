// aa/useAaBoard.ts — everything the Alt. Advancement tab reads, for the class combo in force: the
// detected classes, or the 1-3 the player picks to plan another combo (shared/aaBoard.ts).
//
// The pick is the Gear tab's shared class control (`useFollowingClasses`), under its own key, so the
// pills, the "detected" offer chip and the per-character pin behave as they do there.

import { useMemo } from 'react'
import { computeAAAccounting } from '@shared/aa'
import { withGranted } from '@shared/aaGranted'
import { aaBoard, aaSameClasses, type AaBoardRow } from '@shared/aaBoard'
import type { ClassAbbr } from '@shared/classCombo'
import type { LevelingSnap } from '@shared/types'
import { useModule } from '../../lib/useModule'
import { useFollowingClasses, type GearClasses } from '../gear/gearData'
import { useAaRanks, type AaRanksState } from './useAaRanks'

export interface AaBoardState extends AaRanksState {
  pick: GearClasses
  /** The classes in force: the pick, else the detected ones. */
  classes: ClassAbbr[]
  /** Another combo than the detected one is in force. */
  planning: boolean
  board: AaBoardRow[]
  /** The detected combo's board: the same as `board` unless planning. */
  ownBoard: AaBoardRow[]
  /** Unspent points from the log's last "You now have"; null before the log states one. */
  unspent: number | null
}

const NONE: ClassAbbr[] = []

export function useAaBoard(): AaBoardState {
  const pick = useFollowingClasses('eq.aa.classes')
  const chosen = pick.classes.length > 0 ? pick.classes : pick.detected
  const planning = pick.detected.length > 0 && !aaSameClasses(chosen, pick.detected)
  const planned = planning ? chosen : null
  const ranks = useAaRanks(planned)
  const { ranked, ungranted, level, detected } = ranks
  const classes = planned ?? detected
  const board = useMemo(() => aaBoard(ranked, { classes, own: !planning }), [ranked, classes, planning])
  const ownBoard = useMemo(
    () => (planning ? aaBoard(withGranted(ungranted, { level, classes: detected }), { classes: detected, own: true }) : board),
    [planning, ungranted, level, detected, board]
  )
  const snap = useModule<LevelingSnap>('leveling')
  const gains = snap?.aaGains
  const spends = snap?.aaSpends
  const unspent = useMemo(() => (gains === undefined || gains.length === 0 ? null : computeAAAccounting(gains, spends ?? []).unspent), [gains, spends])
  return { ...ranks, pick, classes: classes.length > 0 ? classes : NONE, planning, board, ownBoard, unspent }
}
