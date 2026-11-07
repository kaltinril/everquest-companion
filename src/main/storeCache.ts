// storeCache.ts — the settings store, read once.
//
// `electron-store` (conf 15) keeps NO copy of the store in memory: every `get` is a `readFileSync`
// plus a `JSON.parse` of the whole file (95 KB on the owner's machine), and every `set` reads it
// again before the atomic write. Those reads sat inside every module read the renderer makes
// (serveShim → history → `logArchiveOn()`), every foreground change (~15 overlay-config reads per
// presence event), every alert fire and every con card — 0.3-0.8 ms of main-thread file IO each
// (docs/community/audits/2026-11-06-whole-app-review.md, item 1).
//
// This wrapper holds the parsed object and hands out a COPY per read, exactly what the file-backed
// read gave: accessors mutate what they get and write it back, and a shared reference would let a
// mutation that was never written back leak into the next read. Writes go through to the file
// and then into the copy. Nothing else writes the file while the app runs: the schema migration
// and the legacy seed both run before `new Store()`.

/** The slice of `electron-store`'s API the accessors use, so a test can hand in a fake. */
export interface StoreBacking<T extends object> {
  /** The whole store, parsed fresh from disk. */
  readonly store: T
  set<K extends keyof T>(key: K, value: T[K]): void
  delete(key: keyof T): void
}

export interface CachedStore<T extends object> {
  get<K extends keyof T>(key: K): T[K]
  get<K extends keyof T>(key: K, defaultValue: Required<T>[K]): Required<T>[K]
  set<K extends keyof T>(key: K, value: T[K]): void
  delete(key: keyof T): void
  /** How many times the file was read — the test's proof, and nothing else reads it. */
  readonly reads: number
}

/** A value as the file-backed `get` returned it: a fresh object per call, `undefined` as absent. */
function copy<V>(value: V): V {
  return value === undefined || value === null || typeof value !== 'object'
    ? value
    : structuredClone(value)
}

export function cachedStore<T extends object>(backing: StoreBacking<T>): CachedStore<T> {
  let snapshot: T | undefined
  let reads = 0
  const loaded = (): T => {
    if (snapshot === undefined) {
      snapshot = backing.store
      reads += 1
    }
    return snapshot
  }
  return {
    get<K extends keyof T>(key: K, defaultValue?: Required<T>[K]) {
      const value = loaded()[key]
      return value === undefined ? defaultValue : copy(value)
    },
    set(key, value) {
      backing.set(key, value)
      loaded()[key] = copy(value)
    },
    delete(key) {
      backing.delete(key)
      Reflect.deleteProperty(loaded(), key)
    },
    get reads() {
      return reads
    }
  }
}
