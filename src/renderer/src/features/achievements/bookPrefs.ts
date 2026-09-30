// achievements/bookPrefs.ts — the Achievements tab's stored choices (`eq.achievements.*` in
// localStorage), kept for slayerRows.ts's reason: a view unmounts on every tab switch, and the
// group being looked at and the two Show switches are things the user set on purpose. Every read
// degrades rather than throws.

import type { AchievementBook } from '@shared/outputs/achievementBook'
import { readPref, type PrefStore } from '../slayer/slayerRows'
import { EVERYTHING, inScope, type Scope, type SortOrder } from '@shared/achievements/bookRows'

export const SCOPE_KEY = 'eq.achievements.scope'
export const SHOW_OPEN_KEY = 'eq.achievements.showOpen'
export const SHOW_COMPLETE_KEY = 'eq.achievements.showComplete'
export const SORT_KEY = 'eq.achievements.sort'

/** A switch that is ON until somebody turns it off. */
export function loadShown(key: string, store: PrefStore = localStorage): boolean {
  return readPref(store, key) !== '0'
}

export function loadSort(store: PrefStore = localStorage): SortOrder {
  return readPref(store, SORT_KEY) === 'closest' ? 'closest' : 'game'
}

export function loadScope(store: PrefStore = localStorage): Scope {
  try {
    const parsed: unknown = JSON.parse(readPref(store, SCOPE_KEY) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return EVERYTHING
    const { family, category } = parsed as Record<string, unknown>
    return {
      family: typeof family === 'string' ? family : null,
      category: typeof category === 'string' ? category : null
    }
  } catch {
    return EVERYTHING
  }
}

/** The stored scope, or everything when the newest dump has no such family or group. */
export function scopeIn(book: AchievementBook, scope: Scope): Scope {
  return book.groups.some((g) => inScope(g, scope)) ? scope : EVERYTHING
}
