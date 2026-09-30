// achievements/useAchievementBook.ts — the dump as the tree the game draws, asked of main.
//
// ASKED AGAIN WHEN THE DUMP IS RE-READ, WITHOUT A CHANNEL OF ITS OWN. Main re-reads the
// achievements dump when the file changes, writes `achievementsSource` and pushes `onProgress`
// (OutputKindLine's header argues that push). `readAt` moving is therefore the whole signal:
// typing `/outputfile achievements` in game refreshes an open tab by itself, and so does
// switching characters, whose progress carries another dump's instant or none.

import { useEffect, useState } from 'react'
import type { AchievementBook } from '@shared/outputs/achievementBook'
import type { ProgressState } from '@shared/types'

export interface BookData {
  /** null until the first read settles, and after it when there is no dump */
  book: AchievementBook | null
  /** when this app last read the dump, for the freshness line */
  readAt: number | null
  /** the first read has settled, so "no dump" can be told from "not yet" */
  ready: boolean
}

const NOT_YET: BookData = { book: null, readAt: null, ready: false }

export function useAchievementBook(): BookData {
  const [data, setData] = useState<BookData>(NOT_YET)
  useEffect(() => {
    let alive = true
    let asked: number | null | undefined
    const ask = (readAt: number | null): void => {
      void window.eq
        .achievementsBook()
        .catch(() => null)
        .then((book) => {
          if (alive && asked === readAt) setData({ book, readAt, ready: true })
        })
    }
    const onProgress = (p: ProgressState): void => {
      const readAt = p.achievementsSource?.readAt ?? null
      if (!alive || readAt === asked) return
      asked = readAt
      ask(readAt)
    }
    void window.eq.getProgress().then(onProgress)
    const off = window.eq.onProgress(onProgress)
    return () => {
      alive = false
      off()
    }
  }, [])
  return data
}
