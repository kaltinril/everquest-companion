// tradeskills/WikiGap.tsx — wiki first, on screen (owner, 2026-11-20: "WIKI is our PRIMARY
// source, and others are secondary. If there are issues with the wiki, the users need to find out
// and fix the wiki, that's the point of a wiki").
//
//   WikiPageLink     a recipe's own wiki page, the app's standard wiki link: an `<a target="_blank">`
//                    that main's open handler turns into the system browser (eqlwiki.com is on its
//                    list; no host is added here).
//   WikiGapLine      what the page lacks (materials, the trivial), with that link, so a player who
//                    knows can add it. Where the recipe guide states a trivial the wiki does not,
//                    it follows as the guide's, credited.
//   GuideDifferences where a guide lists the recipe otherwise than the wiki: one quiet line each,
//                    credited as text. The wiki's is what the panel shows. No guide is linked.
//
// Which recipes, which words and which address are shared/tradeskillWiki.ts.

import type { JSX, MouseEvent } from 'react'
import { Typography } from '@mui/material'
import type { BookRecipe } from '@shared/tradeskillBook'
import { WIKI_LINK_TIP, guideDifferenceText, guideDifferences, guideTrivialText, recipeWikiUrl, wikiGap, wikiGapText, wikiLinkLabel } from '@shared/tradeskillWiki'
import { useFacts } from './benchFacts'

/** A link inside a table line opens the page and leaves the line as it was. */
function keepRow(event: MouseEvent): void {
  event.stopPropagation()
}

/** The recipe's wiki page, opened in the system browser. `label` defaults to "Open <page> on the wiki". */
export function WikiPageLink({ recipe, label, tip }: { recipe: BookRecipe; label?: string; tip?: string }): JSX.Element | null {
  const url = recipeWikiUrl(recipe)
  if (url === undefined) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" title={tip ?? WIKI_LINK_TIP} style={{ color: 'inherit' }} onClick={keepRow} data-testid="tradeskill-wiki-link">
      {label ?? wikiLinkLabel(recipe)}
    </a>
  )
}

/** What the wiki page lacks for a recipe, and the page to add it on. Nothing when the page states both. */
export function WikiGapLine({ recipe }: { recipe: BookRecipe }): JSX.Element | null {
  const { guides } = useFacts()
  const gap = wikiGap(recipe)
  if (gap === null) return null
  const fill = guideTrivialText(guides, recipe)
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} data-testid="tradeskill-wiki-gap">
      {wikiGapText(gap)} <WikiPageLink recipe={recipe} />
      {fill !== '' && ` ${fill}`}
    </Typography>
  )
}

/** One quiet line per guide that lists the recipe otherwise than the wiki does. */
export function GuideDifferences({ recipe }: { recipe: BookRecipe }): JSX.Element | null {
  const { guides } = useFacts()
  const differences = guideDifferences(guides, recipe)
  if (differences.length === 0) return null
  return (
    <>
      {differences.map((difference) => (
        <Typography key={difference.guideId} variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} data-testid="tradeskill-guide-differs">
          {guideDifferenceText(difference)}
        </Typography>
      ))}
    </>
  )
}
