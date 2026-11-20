// THE HEALING HEADLINE: what the healers one meter is showing add up to.
//
// The Combat tab prints its Healing figures with no label, so they have to describe the rows under
// them: the healers the scope kept, or the one healer drilled into. The overlay's crumb figure is
// labelled `all` and states the whole segment on purpose (overlay/meterCrumb.tsx); it does not
// come through here.
//
// IN SHARED, NOT THE RENDERER, because summing domain rows is aggregation, which the renderer may
// not do (eslint.domainMunging.mjs).

import type { HealSourceView, HealingView } from './combat'

/** The figures a healing headline prints, and the split its hover states. */
export type HealHeadline = Pick<HealingView, 'total' | 'hps' | 'restoredTotal' | 'absorbedTotal'>

/** One healer's own figures: the headline over that healer's drill. */
export function healerHeadline(h: HealSourceView): HealHeadline {
  return { total: h.total, hps: h.hps, restoredTotal: h.total - h.absorbedTotal, absorbedTotal: h.absorbedTotal }
}

/**
 * The headline over a ranked healer list. `shown` is the list on screen and `healing` the
 * segment's whole model.
 *
 * When the list IS the model's own (nothing was scoped away) the model's figures come back
 * untouched, so an ungrouped session prints exactly what the engine computed. Otherwise the totals
 * are summed from the rows shown, and `hps` scales by the same share: every healing rate divides
 * by the one segment length, so the ratio is exact.
 */
export function healersHeadline(shown: HealSourceView[], healing: HealingView | undefined): HealHeadline {
  if (!healing) return { total: 0, hps: 0, restoredTotal: 0, absorbedTotal: 0 }
  if (shown === healing.healers) {
    return {
      total: healing.total,
      hps: healing.hps,
      restoredTotal: healing.restoredTotal,
      absorbedTotal: healing.absorbedTotal
    }
  }
  const total = shown.reduce((n, h) => n + h.total, 0)
  const absorbedTotal = shown.reduce((n, h) => n + h.absorbedTotal, 0)
  const hps = healing.total > 0 ? (healing.hps * total) / healing.total : 0
  return { total, hps, restoredTotal: total - absorbedTotal, absorbedTotal }
}
