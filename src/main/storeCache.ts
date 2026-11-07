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
  /** Several keys in ONE file write (conf's object form); what `batch` flushes through. */
  set(patch: Partial<T>): void
  delete(key: keyof T): void
}

export interface CachedStore<T extends object> {
  get<K extends keyof T>(key: K): T[K]
  get<K extends keyof T>(key: K, defaultValue: Required<T>[K]): Required<T>[K]
  set<K extends keyof T>(key: K, value: T[K]): void
  delete(key: keyof T): void
  /**
   * Run `fn` with every `set` landing in the copy only; the keys it touched reach the file in ONE
   * write when the outermost batch ends (a nested batch joins the outer one). The attach path
   * wrote the 141 KB store six times back to back, 11 ms of fsync each (audit item 1).
   */
  batch<R>(fn: () => R): R
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
  let batchDepth = 0
  // Keys set inside the open batch, flushed together when it closes.
  const dirty = new Set<keyof T>()
  const loaded = (): T => {
    if (snapshot === undefined) {
      snapshot = backing.store
      reads += 1
    }
    return snapshot
  }
  const flush = (): void => {
    if (dirty.size === 0) return
    const patch: Partial<T> = {}
    for (const key of dirty) patch[key] = loaded()[key]
    dirty.clear()
    backing.set(patch)
  }
  return {
    get<K extends keyof T>(key: K, defaultValue?: Required<T>[K]) {
      const value = loaded()[key]
      return value === undefined ? defaultValue : copy(value)
    },
    set(key, value) {
      if (batchDepth > 0) {
        loaded()[key] = copy(value)
        dirty.add(key)
        return
      }
      backing.set(key, value)
      loaded()[key] = copy(value)
    },
    delete(key) {
      // A delete mid-batch flushes the pending sets first, so the file never sees them reordered.
      flush()
      backing.delete(key)
      Reflect.deleteProperty(loaded(), key)
    },
    batch(fn) {
      batchDepth += 1
      try {
        return fn()
      } finally {
        batchDepth -= 1
        if (batchDepth === 0) flush()
      }
    },
    get reads() {
      return reads
    }
  }
}
