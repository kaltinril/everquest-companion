// useRecipeRows - the Items rows for pages that state no materials of an item the player combined
// (shared/gapRecipeRows.ts; owner, 2026-11-21: Picnic Basket). Main is asked about the combined
// names once per change of that list: the corpus it reads is fixed for the process.

import { useEffect, useMemo, useState } from 'react'
import { CRAFTING_MODULE, type CraftedItemRow, type CraftingSnap } from '@shared/crafting'
import type { RecipelessPage } from '@shared/gapRecipe'
import { combinedNames, recipeRows } from '@shared/gapRecipeRows'
import type { GapRow } from '@shared/gaps'
import { useModule } from '../../lib/useModule'

const NO_ROWS: readonly GapRow[] = []
const NO_PAGES: readonly RecipelessPage[] = []
const NO_ITEMS: readonly CraftedItemRow[] = []

/** The answer for this list of names, kept across remounts. */
let lastAnswer: { names: string; pages: readonly RecipelessPage[] } | null = null

/** `extra` is the item rows already added beside the snapshot's: an item one of those names gets no second row. */
export function useRecipeRows(rows: readonly GapRow[] | undefined, extra: readonly GapRow[]): readonly GapRow[] {
  const crafted = useModule<CraftingSnap>(CRAFTING_MODULE)?.items ?? NO_ITEMS
  const names = useMemo(() => combinedNames(crafted), [crafted])
  const asked = names.join('\n')
  const [pages, setPages] = useState(() => (lastAnswer?.names === asked ? lastAnswer.pages : NO_PAGES))
  useEffect(() => {
    if (asked === '') {
      setPages(NO_PAGES)
      return undefined
    }
    if (lastAnswer?.names === asked) {
      setPages(lastAnswer.pages)
      return undefined
    }
    let alive = true
    void window.eq
      .gapRecipelessItems(asked.split('\n'))
      .then((got) => {
        lastAnswer = { names: asked, pages: got }
        if (alive) setPages(got)
      })
      .catch(() => {
        // Main could not answer: no recipe rows until the list changes.
      })
    return () => {
      alive = false
    }
  }, [asked])
  return useMemo(() => (pages.length === 0 || rows === undefined ? NO_ROWS : recipeRows(pages, crafted, rows, extra)), [pages, crafted, rows, extra])
}
