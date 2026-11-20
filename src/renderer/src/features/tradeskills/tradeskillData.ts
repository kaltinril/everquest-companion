// tradeskills/tradeskillData.ts — what the Tradeskills section reads: the recipe book (one fetch
// per window: it is committed data), its index under the era setting, the player's levels, and
// what the inventory dump holds.
//
// No fold lives here: order, filter and the marks are shared/tradeskillBook.ts.

import { useEffect, useMemo, useState } from 'react'
import { ownershipIndexFrom, type OwnershipIndex } from '@shared/planner/ownership'
import { SKILLS_MODULE, type SkillRow, type SkillsSnap } from '@shared/skills'
import {
  EMPTY_BOOK,
  TRADESKILL_BOOK_VERSION,
  indexBook,
  type BookIndex,
  type TradeskillBookPayload
} from '@shared/tradeskillBook'
import { useMetVersion } from '../../lib/useMetInLog'
import { useModule } from '../../lib/useModule'
import { eraHides } from '../planner/plannerData'

let asked: Promise<TradeskillBookPayload> | null = null
let got: TradeskillBookPayload | null = null

function fetchBook(): Promise<TradeskillBookPayload> {
  asked ??= window.eq.tradeskillBook().then(
    (book) => {
      // A payload from a version this build does not know is refused, as the Gear index's is.
      got = book.version === TRADESKILL_BOOK_VERSION ? book : EMPTY_BOOK
      return got
    },
    () => {
      asked = null
      return EMPTY_BOOK
    }
  )
  return asked
}

/** The book, or null until main has answered. Kept for the window: a remount paints at once. */
function useTradeskillBook(): TradeskillBookPayload | null {
  const [book, setBook] = useState<TradeskillBookPayload | null>(got)
  useEffect(() => {
    if (book !== null) return
    let alive = true
    void fetchBook().then((next) => {
      if (alive) setBook(next)
    })
    return () => {
      alive = false
    }
  }, [book])
  return book
}

/**
 * The book as the screens read it, or null while it loads. `eraOnly` is the shared Current era
 * setting: the verdict is `plannerData.eraHides`, the one the Gear tab injects into its filter.
 */
export function useBookIndex(eraOnly: boolean): BookIndex | null {
  const book = useTradeskillBook()
  // The player's own log outranks the wiki's era (lib/useMetInLog): rebuild when it meets more.
  const met = useMetVersion()
  return useMemo(() => {
    void met
    if (book === null) return null
    return indexBook(book, eraOnly ? (recipe) => eraHides(recipe, true) : undefined)
  }, [book, eraOnly, met])
}

const NO_ROWS: readonly SkillRow[] = []

export interface SkillLevels {
  rows: readonly SkillRow[]
  /** False until the engine has served the skills module. */
  served: boolean
}

/** The engine's skill rows: the level each tradeskill was last stated at. */
export function useSkillLevels(): SkillLevels {
  const snap = useModule<SkillsSnap>(SKILLS_MODULE)
  return useMemo(() => ({ rows: snap?.rows ?? NO_ROWS, served: snap !== null }), [snap])
}

export interface HeldState {
  /** What the newest inventory dump lists, or null when this character has written none. */
  index: OwnershipIndex | null
  /** When the player wrote the dump (the file's own time), epoch ms. */
  dumpedAt: number | null
  /** When this window last read it, for the dump line; null before the first read settles. */
  readAt: number | null
}

const NO_HELD: HeldState = { index: null, dumpedAt: null, readAt: null }

/**
 * The inventory dump's counts, through the Gear tab's own read (`gearOwnership`: main keeps it by
 * the file's path and time). Asked on mount and again whenever main picks up a rewritten dump.
 */
export function useHeld(): HeldState {
  const [held, setHeld] = useState<HeldState>(NO_HELD)
  useEffect(() => {
    let alive = true
    const read = (): void => {
      void window.eq.gearOwnership().then(
        (payload) => {
          if (!alive) return
          const dumped = payload.loadedAt === null ? NaN : Date.parse(payload.loadedAt)
          setHeld({
            index: payload.path === null ? null : ownershipIndexFrom(payload.entries),
            dumpedAt: Number.isFinite(dumped) ? dumped : null,
            readAt: Date.now()
          })
        },
        () => {
          if (alive) setHeld({ ...NO_HELD, readAt: Date.now() })
        }
      )
    }
    read()
    const off = window.eq.onInventoryReload(read)
    return () => {
      alive = false
      off()
    }
  }, [])
  return held
}
