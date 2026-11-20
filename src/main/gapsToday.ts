// main/gapsToday.ts — today's committed catalogs as the saved-row re-check asks them
// (shared/gapsRecheckPages.ts has the why). Electron-free, so a test drives the real mob and quest
// catalogs through it; the item side is handed in, since itemLookup.ts loads electron.

import { questsByGiver, type PageNow, type PagesNow } from '../shared/gapsRecheckPages'
import type { QuestData } from '../shared/types'
import { localMobEntry } from './mobLookupLocal'
import questsJson from '../renderer/src/data/eqlegends/quests.json'

let given: ReadonlyMap<string, readonly string[]> | null = null

/** Built on first ask: a pass over the quest catalog nothing needs until All characters is read. */
function givenBy(giverKey: string): readonly string[] {
  given ??= questsByGiver((questsJson as unknown as QuestData).quests ?? [])
  return given.get(giverKey) ?? []
}

/** Today's mob and quest catalogs, and the item database's record for a name through `itemPage`. */
export function pagesToday(itemPage: (name: string) => PageNow | null): PagesNow {
  return { page: (domain, name) => (domain === 'item' ? itemPage(name) : localMobEntry(name)), givenBy }
}
