import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { cachedStore, type StoreBacking } from '../src/main/storeCache'

interface Shape extends Record<string, unknown> {
  overlays?: Record<string, { open: boolean }>
  count?: number
  gone?: string
}

/** A backing that counts its file reads, as conf's `store` getter is one. */
function fake(initial: Shape): StoreBacking<Shape> & { reads: number; writes: string[] } {
  const file: Shape = structuredClone(initial)
  const backing = {
    reads: 0,
    writes: [] as string[],
    get store(): Shape {
      backing.reads += 1
      return structuredClone(file)
    },
    set<K extends keyof Shape>(key: K, value: Shape[K]): void {
      backing.writes.push(String(key))
      file[key] = structuredClone(value)
    },
    delete(key: keyof Shape): void {
      backing.writes.push('-' + String(key))
      Reflect.deleteProperty(file, key)
    }
  }
  return backing
}

describe('storeCache', () => {
  it('reads the file once however many times it is asked', () => {
    const backing = fake({ overlays: { toast: { open: true } }, count: 2 })
    const store = cachedStore(backing)
    assert.equal(store.get('count'), 2)
    assert.deepEqual(store.get('overlays'), { toast: { open: true } })
    assert.equal(store.get('count'), 2)
    assert.equal(backing.reads, 1)
    assert.equal(store.reads, 1)
  })

  it('hands out a copy per read, as the file-backed read did', () => {
    const store = cachedStore(fake({ overlays: { toast: { open: true } } }))
    const a = store.get('overlays')
    a!.toast.open = false
    assert.deepEqual(store.get('overlays'), { toast: { open: true } }, 'a mutation never written back stays private')
  })

  it('a write reaches the file and the next read', () => {
    const backing = fake({ count: 1 })
    const store = cachedStore(backing)
    store.set('count', 5)
    assert.equal(store.get('count'), 5)
    assert.deepEqual(backing.writes, ['count'])
    assert.equal(backing.store.count, 5)
    assert.equal(backing.reads, 2, 'the test itself read the file; the cache did not')
  })

  it('the default applies to an absent key and not to a present one', () => {
    const store = cachedStore(fake({ count: 0 }))
    assert.deepEqual(store.get('overlays', {}), {})
    assert.equal(store.get('count', 9), 0)
  })

  it('delete reaches the file and the next read', () => {
    const backing = fake({ gone: 'x' })
    const store = cachedStore(backing)
    store.delete('gone')
    assert.equal(store.get('gone'), undefined)
    assert.deepEqual(backing.writes, ['-gone'])
    assert.equal(backing.store.gone, undefined)
  })
})
