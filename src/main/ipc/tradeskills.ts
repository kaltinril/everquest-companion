// IPC: the Tradeskills section's one read, the recipe book.
//
// Built on the first ask from the committed item database and kept for the process: the input is
// compiled into the bundle and cannot change while the app runs. No network, nothing rejects.
// `itemDb()` and `eraDerivations()` are the memos the item lookups and the Gear index already
// hold, so this adds no second copy of items.json and no second era walk.
//
// The two community tradeskill guides ride on the same payload (`guides`): the committed
// `tradeskillGuides.json`, with each item name the guides write looked up once against the item
// database. The file is other players' text: it is served as data and drawn as plain text.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { TradeskillGuidesFile } from '../../shared/guideData'
import { guidePayload } from '../../shared/tradeskillGuide'
import type { TradeskillBookPayload } from '../../shared/tradeskillBook'
import { itemDb, itemDbScrapedAt } from '../itemLookup'
import { eraDerivations } from '../planner/indexCurrent'
import { buildTradeskillBook, wikiItemName } from '../tradeskillBook'
import guidesJson from '../data/tradeskillGuides.json'

let book: TradeskillBookPayload | null = null

function build(): TradeskillBookPayload {
  const index = itemDb()
  // Read through `unknown`: the JSON's inferred type follows the data, the declared one is the pull script's.
  const guides = guidePayload(guidesJson as unknown as TradeskillGuidesFile, wikiItemName(index))
  // The data's own date rides along for the Home screen's sources line.
  return { ...buildTradeskillBook(index, eraDerivations()), guides, scrapedAt: itemDbScrapedAt() }
}

export function registerTradeskillsIpc(): void {
  ipcMain.handle(IPC.tradeskillBook, (): TradeskillBookPayload => {
    book ??= build()
    return book
  })
}
