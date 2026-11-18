// keptPictureRead — an item row that holds its window's (or its Lore tab's) picture and no reading
// reads the picture itself (owner, 2026-11-17: "shouldn't it be loading the data from the screenshot it
// already has??"; a row showed the kept item window beside "stats needed" and copied a page of blank
// stat lines). The reading is in this app's own storage (itemShotsStore.ts) and the picture in a
// folder, so another install, or a cleared store, has the file alone.

import { useEffect } from 'react'
import { hasWindowPart, keptAfter, partsToRead, shotKind, type KeptPart } from '@shared/itemShotKeep'
import { keptPictureFile } from '@shared/mobPicture'
import { useFolderPictures } from './folderPicturesStore'
import { itemShotNow, setItemShot, useItemShots } from './itemShotsStore'

/**
 * Files already tried this launch: a picture that reads as nothing is not read on every render, and a
 * part the player cleared stays cleared until the next launch.
 */
const tried = new Set<string>()

/** A `data:image/png;base64,...` URL's bytes. */
const bytesOf = (dataUrl: string): Uint8Array => Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))

/**
 * One after the other, so the reader holds one picture at a time. The file is this row's by where it
 * is kept, so its name is not asked about again; it must still read as the part it is filed as.
 */
async function readParts(name: string, parts: readonly KeptPart[]): Promise<void> {
  for (const part of parts) {
    try {
      const url = await window.eq.shotPictureData(part.path)
      if (url === null) continue
      const reply = await window.eq.shotReadItem(bytesOf(url))
      if (shotKind(reply) === part.kind) setItemShot(name, keptAfter(itemShotNow(name), reply, part.kind))
    } catch {
      // The paste box is still there.
    }
  }
}

/** Reads this item row's kept pictures when their parts have no reading. */
export function useKeptPictureRead(name: string): void {
  const folder = useFolderPictures()
  const kept = useItemShots()[name]
  const windowPath = folder.files[keptPictureFile('item', name)]
  const lorePath = folder.files[keptPictureFile('lore', name)]
  useEffect(() => {
    // A part that has a reading now (a paste this launch) is not read back after the player clears it.
    if (windowPath !== undefined && hasWindowPart(kept)) tried.add(windowPath)
    if (lorePath !== undefined && kept?.lore !== undefined) tried.add(lorePath)
    const fresh: KeptPart[] = []
    for (const part of partsToRead(kept, { window: windowPath, lore: lorePath })) {
      if (tried.has(part.path)) continue
      tried.add(part.path)
      fresh.push(part)
    }
    if (fresh.length > 0) void readParts(name, fresh)
  }, [name, kept, windowPath, lorePath])
}
