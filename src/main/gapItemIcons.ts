// gapItemIcons.ts - the item pages the wiki data holds with no icon id, for the Gaps tab's icon
// rows (owner, 2026-11-20; shared/gapIcons.ts). Read off the committed corpus, the same module
// instance itemLookup.ts imports; never fetched.
//
// ELECTRON-FREE, as gapItemForage.ts is: tests/gapIcons.test.mts drives it under the node runner.

import type { ItemDbEntry, ItemDbFile } from './itemsDb'
import type { IconlessPage } from '../shared/gapIcons'
import itemsJson from './data/items.json'

let held: IconlessPage[] | null = null

/**
 * Every page that states no `|lucy_img_ID`, once per PAGE (the corpus keys an `|itemname` alias
 * page twice), by the name the page gives the item. The corpus is fixed for the process.
 */
export function iconlessPages(corpus: Readonly<Record<string, ItemDbEntry>>): IconlessPage[] {
  const seen = new Set<string>()
  const out: IconlessPage[] = []
  for (const entry of Object.values(corpus)) {
    if (entry.iconId !== undefined || seen.has(entry.page)) continue
    seen.add(entry.page)
    out.push({ name: entry.name ?? entry.page, page: entry.page })
  }
  return out.sort((a, b) => a.page.localeCompare(b.page))
}

/** The committed corpus's, built on first ask. */
export function iconlessItems(): IconlessPage[] {
  held ??= iconlessPages((itemsJson as unknown as ItemDbFile).items ?? {})
  return held
}
