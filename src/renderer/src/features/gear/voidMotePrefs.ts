// gear/voidMotePrefs.ts — what the Void motes tab remembers, and the words it uses.
//
// PURE AND NODE-TESTED (the `gearPrefs.ts` precedent): relative value imports, no React. Stored
// by `useVoidMotePrefs` (useGearPrefs.ts), validated on every read.

import type { GearStatKey } from '../../../../shared/planner/gear'
import type { GearRole } from '../../../../shared/planner/roleWeights'
import {
  MOTE_ORDERS,
  MOTE_SOURCE_LABEL,
  MOTE_TARGET_STATS,
  type MoteAdvice,
  type MoteOrder,
  type MoteTarget
} from '../../../../shared/planner/voidMotes'
import { ROLE_LABEL } from '../plan/planBlurb'
import { PLAN_ROLES } from './areaMemory'
import { columnLabel, statText } from './gearColumns'

export interface VoidMotePrefs {
  /** what a gain is measured in: a focus, or one stat */
  target: MoteTarget
  order: MoteOrder
}

/** The Gear tab's own BEST column is the balanced focus, so it leads. */
export const DEFAULT_MOTE_PREFS: VoidMotePrefs = { target: 'balanced', order: 'recommended' }

/** The picker's two groups, in the order it draws them. */
export const MOTE_TARGET_ROLES: readonly GearRole[] = PLAN_ROLES
export const MOTE_TARGETS: readonly MoteTarget[] = [...PLAN_ROLES, ...MOTE_TARGET_STATS]

/**
 * A stored choice; each field falls back alone, so one bad value does not reset the rest. A value
 * from the days the list was a panel on the Gear tab carries `open` too: it is ignored.
 */
export function sanitizeMotePrefs(raw: unknown): VoidMotePrefs {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_MOTE_PREFS
  const o = raw as Record<string, unknown>
  return {
    target: MOTE_TARGETS.find((t) => t === o.target) ?? DEFAULT_MOTE_PREFS.target,
    order: MOTE_ORDERS.find((v) => v === o.order) ?? DEFAULT_MOTE_PREFS.order
  }
}

export const MOTE_ORDER_LABEL: Record<MoteOrder, string> = {
  recommended: 'Recommended',
  gain: 'Biggest gain',
  effort: 'Hardest to farm'
}

/** One clause each (the tooltip diet): what the order ranks by. */
export const MOTE_ORDER_HINT: Record<MoteOrder, string> = {
  recommended: 'Gain weighed by how hard the next tier is to farm',
  gain: 'The largest gain for your target, whatever the tier costs',
  effort: 'The dearest next tier first: high tiers and raid drops'
}

const isRole = (target: MoteTarget): target is GearRole => (PLAN_ROLES as readonly string[]).includes(target)

/** `Tank`, `AC`, `SV FIRE` — a focus by the Plan tab's name, a stat by the table's column name. */
export function moteTargetLabel(target: MoteTarget): string {
  return isRole(target) ? ROLE_LABEL[target] : columnLabel(target)
}

/** The gain cell: a focus score to one decimal, a stat in its own points; blank when nothing is gained. */
export function moteGainText(advice: Pick<MoteAdvice, 'gain'>, target: MoteTarget): string {
  if (advice.gain <= 0) return ''
  return `+${isRole(target) ? advice.gain.toFixed(1) : statText(advice.gain, target)}`
}

/** `AC 66→70 · STR 28→30`: every stat the next tier moves; `-` where the worn tier states none. */
export function moteChangesText(advice: Pick<MoteAdvice, 'changes'>): string {
  const one = (key: GearStatKey, from: number | undefined, to: number): string =>
    `${columnLabel(key)} ${from === undefined ? '-' : statText(from, key)}→${statText(to, key)}`
  return advice.changes.map((c) => one(c.key, c.from, c.to)).join(' · ')
}

/** `512 copies`: what the next tier costs without the mote. */
export function moteCopiesText(advice: Pick<MoteAdvice, 'copies'>): string {
  return `${advice.copies.toLocaleString('en-US')} ${advice.copies === 1 ? 'copy' : 'copies'}`
}

/** The source cell's hover: the camp the verdict rests on, or why there is none. */
export function moteSourceTitle(advice: Pick<MoteAdvice, 'source' | 'from'>): string {
  if (advice.from !== undefined) return `${MOTE_SOURCE_LABEL[advice.source]}: ${advice.from}`
  if (advice.source === 'quest') return 'A quest item, and no mob is listed dropping it'
  if (advice.source === 'crafted') return 'Player crafted, and no mob is listed dropping it'
  return 'The item data lists no source for it'
}
