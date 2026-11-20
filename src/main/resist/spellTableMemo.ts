// The spell table's memo, kept apart from Electron so a node test can run it. `spellTable.ts`
// binds it to the real path and the real load.
//
// ONE LOAD PER CLIENT FILE PATH, not one per app run. A player whose EverQuest folder was not found
// at launch, and who then picked it in Preferences or typed /log on, kept "no spells_us.txt" until
// restart: the load had run once, against the folder that was wrong. The memo remembers the path it
// loaded from and loads again when the resolved path has moved. A patch to the SAME file still
// waits for a restart, which is the header's own "once per app run" for an unchanged folder.

import type { SpellTableState } from './spellTable'

/** What one load came back with. */
export interface SpellTableLoad<T> {
  table: T | null
  state: Exclude<SpellTableState, 'loading'>
  /** The source file's mtime, when there was a file. */
  mtimeMs: number | null
}

export interface SpellTableMemo<T> {
  table: () => Promise<T | null>
  status: () => { state: SpellTableState; path: string }
  now: () => T | null
  mtime: () => number | null
  install: (table: T | null, why: SpellTableState) => void
}

/**
 * Has the client file's path moved since this memo settled?
 *
 * Never while a load is in flight (two loads at once would race for the cache file), and never for
 * an installed table, which was loaded from no path at all.
 */
export function spellTableIsStale(state: SpellTableState, loadedFrom: string | null, currentPath: string): boolean {
  return state !== 'loading' && loadedFrom !== null && loadedFrom !== currentPath
}

export function spellTableMemo<T>(
  currentPath: () => string,
  load: (path: string) => Promise<SpellTableLoad<T>>
): SpellTableMemo<T> {
  let pending: Promise<T | null> | null = null
  let loaded: T | null = null
  let sourceMtime: number | null = null
  let state: SpellTableState = 'loading'
  let loadedFrom: string | null = null
  const stale = (): boolean => spellTableIsStale(state, loadedFrom, currentPath())
  return {
    table: () => {
      if (pending && !stale()) return pending
      const path = currentPath()
      state = 'loading'
      loadedFrom = path
      // `loaded` is kept until this settles, so the synchronous readers never see a gap.
      const created = load(path).then((res) => {
        loaded = res.table
        sourceMtime = res.mtimeMs
        state = res.state
        return res.table
      })
      pending = created
      return created
    },
    // A stale verdict is not reported against the new path: "no file at <the folder just picked>"
    // would be false. Every reader of this asks for the table as well, which starts the load.
    status: () => ({ state: stale() ? 'loading' : state, path: currentPath() }),
    now: () => loaded,
    mtime: () => sourceMtime,
    install: (table, why) => {
      loaded = table
      pending = Promise.resolve(table)
      state = table ? 'ok' : why
      loadedFrom = null
    }
  }
}
