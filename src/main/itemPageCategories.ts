// itemPageCategories.ts — the page's own markers outside the {{Itempage}} template.
//
// The two categories an item page files itself under that the Gaps tab checks against the log
// (shared/gapForage.ts): `[[Category:Foraged]]` for a forage, and `[[Category:Tradeskill
// Ingredient]]` for a loot line that stored the item in the tradeskill depot (owner, 2026-10-21).
// Both sit after the template; a comment is never read. Measured on the cached item pages: Foraged
// on 137 (2026-10-21), Tradeskill Ingredient on 870, one spelling (2026-10-27).
//
// And the `{{:Does Not Exist}}` banner (a transclusion of the main-namespace page "Does Not Exist",
// written above the template): the page says no player can have the item (owner, 2026-11-25:
// "Oakwynd is not obtainable in EverQuest Legends"). Measured on the cached item pages, 2026-11-25:
// 28 pages, spelled `{{:Does Not Exist}}` (27) and `{{: Does Not Exist}}` (1). Not the same template
// as `{{DNE}}` ("non-Legends content"), which `shared/pageNotices.ts` reads.

import type { ItemKnowledge } from '../shared/types'

/** `<!-- … -->`, an unclosed one running to the end, as MediaWiki reads it. */
const HTML_COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g
const FORAGED_CATEGORY_RE = /\[\[\s*Category\s*:\s*Foraged\s*(\|[^\]]*)?\]\]/i
const INGREDIENT_CATEGORY_RE = /\[\[\s*Category\s*:\s*Tradeskill[ _]Ingredient\s*(\|[^\]]*)?\]\]/i
/** `{{:Does Not Exist}}`, also as a template (`{{Does Not Exist}}`), any case, spaces or underscores. */
const DOES_NOT_EXIST_RE = /\{\{\s*:?\s*Does[ _]+Not[ _]+Exist\s*\}\}/i

/** Each category as `true` when the page files itself under it, else `undefined`. */
export function itemPageCategories(wikitext: string): Pick<ItemKnowledge, 'foragedCategory' | 'ingredientCategory'> {
  const page = wikitext.replace(HTML_COMMENT_RE, '')
  return {
    foragedCategory: FORAGED_CATEGORY_RE.test(page) ? true : undefined,
    ingredientCategory: INGREDIENT_CATEGORY_RE.test(page) ? true : undefined
  }
}

/** The categories above plus the Does Not Exist banner; each `true` when stated, else `undefined` (law 1). */
export function itemPageMarkers(wikitext: string): Pick<ItemKnowledge, 'foragedCategory' | 'ingredientCategory' | 'doesNotExist'> {
  const page = wikitext.replace(HTML_COMMENT_RE, '')
  return { ...itemPageCategories(page), doesNotExist: DOES_NOT_EXIST_RE.test(page) ? true : undefined }
}
