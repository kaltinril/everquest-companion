// achievements/useAchievementsController.ts — all of the Achievements tab's state and
// derivation, as one hook. The view is a render shell; the rail, the list and the plan take the
// bundles this returns.
//
// THE PLAN BELONGS TO THE KILL COUNTERS. It is offered when the list is inside a family that
// holds a counter the plan can work on, which today is the Slayer family. Everywhere else the
// list has the width to itself and draws no checkbox, because a pick with no plan beside it is a
// box that does nothing.

import { useCallback, useMemo, useState } from 'react'
import {
  EVERYTHING,
  bookIndex,
  bookTally,
  familyHasCounter,
  mobIndex,
  railFamilies,
  shownCount,
  visibleSections,
  type BookIndex,
  type BookSection,
  type MobIndex,
  type RailFamily,
  type Scope,
  type SortOrder,
  type Tally
} from '@shared/achievements/bookRows'
import type { ZoneShort } from '@shared/maps'
import type { AchievementBook } from '@shared/outputs/achievementBook'
import { MOB_CATALOG } from '../mobs/mobSearch'
import type { MobTarget } from '../mobs/mobTarget'
import { savePref } from '../slayer/slayerRows'
import {
  useSlayerController,
  type PickBundle,
  type SlayerViewProps,
  type ZoneListBundle
} from '../slayer/useSlayerController'
import {
  SCOPE_KEY,
  SHOW_COMPLETE_KEY,
  SHOW_OPEN_KEY,
  SORT_KEY,
  loadScope,
  loadShown,
  loadSort,
  scopeIn
} from './bookPrefs'
import { useAchievementBook } from './useAchievementBook'

/** What a row needs to draw its joins and its checkbox. One object, handed down unchanged. */
export interface RowContext {
  index: BookIndex
  mobs: MobIndex
  picks: PickBundle
  /** the plan is on screen, so a counter draws its checkbox */
  pickable: boolean
  onOpenZone: (zone: ZoneShort) => void
  onOpenMob?: (t: MobTarget) => void
}

export interface RailBundle {
  families: RailFamily[]
  total: Tally
  scope: Scope
  /** the file printed completed achievements, so a tally can say how many are done */
  hasComplete: boolean
  onScope: (scope: Scope) => void
}

export interface ListBundle {
  sections: BookSection[]
  shown: number
  query: string
  open: boolean
  complete: boolean
  sort: SortOrder
  hasComplete: boolean
  onQuery: (q: string) => void
  onOpen: (on: boolean) => void
  onComplete: (on: boolean) => void
  onSort: (sort: SortOrder) => void
  ctx: RowContext
}

export interface AchievementsController {
  ready: boolean
  hasDump: boolean
  readAt: number | null
  rail: RailBundle
  list: ListBundle
  /** null when the list is outside the families the plan can work on */
  plan: { picks: PickBundle; zones: ZoneListBundle } | null
}

let MOBS: MobIndex | null = null

/** Built on first use: the catalog is immutable, and a session that never opens the tab pays nothing. */
function catalogMobs(): MobIndex {
  MOBS ??= mobIndex(MOB_CATALOG)
  return MOBS
}

const NO_INDEX: BookIndex = new Map()

/** The stored choices, each written back on change. */
function useChoices(): Pick<
  ListBundle,
  'query' | 'open' | 'complete' | 'sort' | 'onQuery' | 'onOpen' | 'onComplete' | 'onSort'
> & { scope: Scope; onScope: (scope: Scope) => void } {
  const [scope, setScope] = useState(() => loadScope())
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(() => loadShown(SHOW_OPEN_KEY))
  const [complete, setComplete] = useState(() => loadShown(SHOW_COMPLETE_KEY))
  const [sort, setSort] = useState(() => loadSort())
  return {
    scope,
    query,
    open,
    complete,
    sort,
    onQuery: setQuery,
    onScope: useCallback((next: Scope) => {
      setScope(next)
      savePref(SCOPE_KEY, JSON.stringify(next))
    }, []),
    onOpen: useCallback((on: boolean) => {
      setOpen(on)
      savePref(SHOW_OPEN_KEY, on ? '1' : '0')
    }, []),
    onComplete: useCallback((on: boolean) => {
      setComplete(on)
      savePref(SHOW_COMPLETE_KEY, on ? '1' : '0')
    }, []),
    onSort: useCallback((next: SortOrder) => {
      setSort(next)
      savePref(SORT_KEY, next)
    }, [])
  }
}

function shownIn(book: AchievementBook | null, scope: Scope): Scope {
  return book === null ? EVERYTHING : scopeIn(book, scope)
}

export function useAchievementsController(props: SlayerViewProps): AchievementsController {
  const { book, readAt, ready } = useAchievementBook()
  const slayer = useSlayerController(props)
  const choices = useChoices()
  const { query, open, complete, sort } = choices

  const index = useMemo(() => (book === null ? NO_INDEX : bookIndex(book)), [book])
  const families = useMemo(() => (book === null ? [] : railFamilies(book)), [book])
  const total = useMemo(() => bookTally(index), [index])
  const scope = useMemo(() => shownIn(book, choices.scope), [book, choices.scope])
  const sections = useMemo(
    () => (book === null ? [] : visibleSections(book, index, { scope, query, open, complete, sort })),
    [book, index, scope, query, open, complete, sort]
  )
  const pickable = useMemo(
    () => book !== null && familyHasCounter(book, scope.family),
    [book, scope.family]
  )
  const hasComplete = total.done > 0

  return {
    ready,
    hasDump: book !== null,
    readAt,
    rail: { families, total, scope, hasComplete, onScope: choices.onScope },
    list: {
      ...choices,
      sections,
      shown: shownCount(sections),
      hasComplete,
      ctx: {
        index,
        mobs: catalogMobs(),
        picks: slayer.picks,
        pickable,
        onOpenZone: slayer.plan.onOpenZone,
        ...(props.onOpenMob === undefined ? {} : { onOpenMob: props.onOpenMob })
      }
    },
    plan: pickable ? { picks: slayer.picks, zones: slayer.plan } : null
  }
}
