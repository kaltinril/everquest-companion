// moduleStore, for the one module it reads as append frames (shared/lootFrame.ts). The rest of the
// store's contract is `moduleStore.test.mts`; this file is what the loot path adds to it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createModuleStore, type ModuleBridge } from '../src/renderer/src/lib/moduleStore'
import { MODULE_WORLD_CHANGED, type ModuleChanged, type ModuleSnapshot } from '../src/shared/types'
import { createLootFrames, type LootFrame, type LootMark } from '../src/shared/lootFrame'

type Store = ReturnType<typeof createModuleStore>

interface Spy {
  readonly bridge: ModuleBridge
  /** Every whole-snapshot read, by module id. */
  readonly fetches: string[]
  push(moduleId: string, seq: number): void
  switchCharacter(): void
  schedule(run: () => void): void
  runFrame(): void
}

function spyBridge(): Spy {
  const fetches: string[] = []
  let cursorCbs: ((c: ModuleChanged) => void)[] = []
  let charCbs: (() => void)[] = []
  let armed: (() => void)[] = []
  const bridge: ModuleBridge = {
    getModuleSnapshot: (moduleId) => {
      fetches.push(moduleId)
      return Promise.resolve<ModuleSnapshot | null>({ seq: 1, state: {} })
    },
    onModuleChanged: (cb) => {
      cursorCbs = [...cursorCbs, cb]
      return () => {
        cursorCbs = cursorCbs.filter((x) => x !== cb)
      }
    },
    onCharacter: (cb) => {
      const bare = (): void => {
        cb(null)
      }
      charCbs = [...charCbs, bare]
      return () => {
        charCbs = charCbs.filter((x) => x !== bare)
      }
    }
  }
  return {
    bridge,
    fetches,
    push: (moduleId, seq) => {
      for (const cb of cursorCbs) cb({ moduleId, seq })
    },
    switchCharacter: () => {
      for (const cb of charCbs) cb()
    },
    schedule: (run) => {
      armed = [...armed, run]
    },
    runFrame: () => {
      const due = armed
      armed = []
      for (const run of due) run()
    }
  }
}

/** A store over a main that holds `ledger`, recording the mark of every loot read. */
function lootHarness(initial: unknown[]): {
  spy: Spy
  store: Store
  marks: (LootMark | null)[]
  setLedger: (rows: unknown[]) => void
  answerNone: (none: boolean) => void
} {
  const spy = spyBridge()
  const frames = createLootFrames()
  const marks: (LootMark | null)[] = []
  let ledger = initial
  let none = false
  const getLootFrame = (known: LootMark | null): Promise<LootFrame | null> => {
    marks.push(known)
    const snap = none ? null : { seq: marks.length, state: structuredClone(ledger) }
    return Promise.resolve(structuredClone(frames.answer(snap, known)))
  }
  const store = createModuleStore({ bridge: { ...spy.bridge, getLootFrame }, schedule: spy.schedule })
  return {
    spy,
    store,
    marks,
    setLedger: (rows) => {
      ledger = rows
    },
    answerNone: (v) => {
      none = v
    }
  }
}

const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

test('LOOT IS READ AS FRAMES and every other module as it always was', async () => {
  const h = lootHarness([{ ts: 1, item: 'a' }])
  const off = h.store.subscribe('loot', () => undefined)
  const offOther = h.store.subscribe('character', () => undefined)
  await turn()
  assert.deepEqual(h.store.getSnapshot('loot'), [{ ts: 1, item: 'a' }])
  assert.deepEqual(h.spy.fetches, ['character'], 'loot took the whole-snapshot channel')
  offOther()
  off()
})

test('A PICKUP APPENDS: the old rows keep their objects, the array is new', async () => {
  const h = lootHarness([{ ts: 1, item: 'a' }])
  const off = h.store.subscribe('loot', () => undefined)
  await turn()
  const before = h.store.getSnapshot('loot') as unknown[]
  h.setLedger([{ ts: 1, item: 'a' }, { ts: 2, item: 'b' }])
  h.spy.push('loot', 10)
  h.spy.runFrame()
  await turn()
  const after = h.store.getSnapshot('loot') as unknown[]
  assert.deepEqual(after, [{ ts: 1, item: 'a' }, { ts: 2, item: 'b' }])
  assert.notEqual(after, before, 'a memo keyed on the array must see the change')
  assert.equal(after[0], before[0])
  assert.deepEqual(h.marks[1], { gen: 1, length: 1 })
  off()
})

test('A CURSOR WITH NO NEW LOOT LEAVES THE ARRAY IDENTICAL', async () => {
  const h = lootHarness([{ ts: 1, item: 'a' }])
  const off = h.store.subscribe('loot', () => undefined)
  await turn()
  const before = h.store.getSnapshot('loot')
  h.spy.push('loot', 10)
  h.spy.runFrame()
  await turn()
  assert.equal(h.store.getSnapshot('loot'), before)
  off()
})

for (const [what, happen] of [
  ['a character switch', (spy: Spy) => { spy.switchCharacter() }],
  ['the world changing hands', (spy: Spy) => {
    spy.push(MODULE_WORLD_CHANGED, -1)
    spy.runFrame()
  }]
] as const) {
  test(`AFTER ${what.toUpperCase()} the next loot read carries no mark`, async () => {
    const h = lootHarness([{ ts: 1, item: 'a' }])
    const off = h.store.subscribe('loot', () => undefined)
    await turn()
    happen(h.spy)
    await turn()
    assert.equal(h.marks.length, 2)
    assert.equal(h.marks[1], null)
    off()
  })
}

test('the last reader leaving forgets the copy: the next reader asks for everything', async () => {
  const h = lootHarness([{ ts: 1, item: 'a' }])
  h.store.subscribe('loot', () => undefined)()
  await turn()
  const off = h.store.subscribe('loot', () => undefined)
  await turn()
  assert.equal(h.marks[h.marks.length - 1], null)
  off()
})

test('a loot read with no snapshot reads null, and the one after it carries no mark', async () => {
  const h = lootHarness([{ ts: 1, item: 'a' }])
  const off = h.store.subscribe('loot', () => undefined)
  await turn()
  h.answerNone(true)
  h.spy.push('loot', 10)
  h.spy.runFrame()
  await turn()
  assert.equal(h.store.getSnapshot('loot'), null, 'contract 1: no answer is stored as null')
  h.answerNone(false)
  h.spy.push('loot', 20)
  h.spy.runFrame()
  await turn()
  assert.equal(h.marks[h.marks.length - 1], null)
  assert.deepEqual(h.store.getSnapshot('loot'), [{ ts: 1, item: 'a' }])
  off()
})
