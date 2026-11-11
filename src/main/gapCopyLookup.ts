// gapCopyLookup.ts — the item and mob wiki lookups, on a Gaps row's Copy click and nothing else
// (owner, 2026-10-26: "the app should not be hitting the WIKI ever except (delta refresh before
// build, user clicks COPY on an item and it does the lookup)").
//
// The click asks `lookupItemOnCopy` / `lookupMobOnCopy`, the only doors to the wiki those services
// have; their answer lands in the knowledge cache (read by every later verdict, ipc/gapVerdicts.ts),
// and the row's verdict is drawn from it here by the same rule, so the row learns at once whether
// the wiki already has the page (another spelling, free text) before anyone makes a second one.

import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { GapVerdict } from '../shared/gaps'
import { lookupItemOnCopy } from './itemLookup'
import { lookupMobOnCopy, readMobPage } from './mobLookup'
import type { MobPageRead } from '../shared/gapPageMerge'
import { lookupVerdict } from '../shared/gapExistingPage'

/** One row's lookup and its verdict; a read that could not reach the wiki is no answer (gapVerdictsRead.ts). */
export async function copyLookup(domain: 'item' | 'mob', name: string): Promise<GapVerdict> {
  const answer = domain === 'item' ? await lookupItemOnCopy(name) : await lookupMobOnCopy(name)
  return answer.offline === true ? 'unchecked' : lookupVerdict(name, answer)
}

/** A Mobs or Merchants row's Copy click: the live page, read fresh (owner, 2026-11-10), for the renderer's merge. */
export function copyPageRead(name: string, title?: string): Promise<MobPageRead> {
  return readMobPage(name, title)
}

const aName = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= 200

export function registerGapCopyLookupIpc(): void {
  ipcMain.handle(IPC.gapCopyLookup, (_e, domain: unknown, name: unknown) =>
    (domain === 'item' || domain === 'mob') && aName(name) ? copyLookup(domain, name.trim()) : 'unchecked'
  )
  ipcMain.handle(IPC.gapMobPageRead, (_e, name: unknown, title: unknown): Promise<MobPageRead> =>
    aName(name) ? copyPageRead(name.trim(), aName(title) ? title.trim() : undefined) : Promise.resolve({ offline: true })
  )
}
