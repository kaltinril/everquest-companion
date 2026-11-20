// IPC: the Tradeskills section's one read, the recipe book.
//
// Built on the first ask from the committed item database and kept for the process: the input is
// compiled into the bundle and cannot change while the app runs. No network, nothing rejects.
// `itemDb()` and `eraDerivations()` are the memos the item lookups and the Gear index already
// hold, so this adds no second copy of items.json and no second era walk.

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { TradeskillBookPayload } from '../../shared/tradeskillBook'
import { itemDb } from '../itemLookup'
import { eraDerivations } from '../planner/indexCurrent'
import { buildTradeskillBook } from '../tradeskillBook'

let book: TradeskillBookPayload | null = null

export function registerTradeskillsIpc(): void {
  ipcMain.handle(IPC.tradeskillBook, (): TradeskillBookPayload => {
    book ??= buildTradeskillBook(itemDb(), eraDerivations())
    return book
  })
}
