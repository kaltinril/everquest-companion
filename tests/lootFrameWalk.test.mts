// The loot ledger's append frames, walked (shared/lootFrame.ts). One seeded life of a ledger, with
// pickups, clears, rebirths, archive swaps, character switches and empty reads, through the real
// store and the real overlay hook over one main. Each request is two steps (the engine's read, then
// the answer) that the walk interleaves, so replies land late and out of order. After every step,
// each window's array must deep-equal a full read.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { createLootFrames, type LootFrame, type LootMark } from '../src/shared/lootFrame'
import { mergeLoot } from '../src/shared/logArchive/mergeLoot'
import { createModuleStore, type ModuleBridge } from '../src/renderer/src/lib/moduleStore'
import { useOverlayModule } from '../src/renderer/src/overlay/useOverlayModule'
import { MODULE_WORLD_CHANGED, type CharacterRef, type LootEvent, type ModuleChanged } from '../src/shared/types'

type Row = LootEvent
const row = (n: number): Row => ({ ts: 1000 + n, item: `Item ${String(n)}`, zone: 'Befallen' })

function mulberry(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
const LOGS = ['C:\\EQ\\Logs\\eqlog_Aye_freeport.txt', 'C:\\EQ\\Logs\\eqlog_Bee_freeport.txt']
const who = (logPath: string): CharacterRef => ({ name: 'x', server: 'freeport', logPath })
const NO_ROWS: readonly Row[] = []

interface Job {
  known: LootMark | null
  read?: { seq: number; state: Row[]; served: true } | null
  resolve: (f: LootFrame | null) => void
}

/** Main, with each request in two steps (the engine's read, then the answer) a walk can interleave. */
function walkMain(random: () => number) {
  const frames = createLootFrames()
  const world = { archive: [] as Row[], live: [] as Row[], seq: 1, next: 0, blips: 0 }
  const jobs: Job[] = []
  const full = (): Row[] => mergeLoot(world.archive, world.live) ?? []
  const ask = (known: LootMark | null): Promise<LootFrame | null> =>
    new Promise((resolve) => jobs.push({ known: structuredClone(known), resolve }))
  const step = (): void => {
    if (jobs.length === 0) return
    const i = Math.floor(random() * jobs.length)
    const job = jobs[i]
    if (job.read === undefined) {
      if (world.blips > 0) {
        world.blips -= 1
        job.read = null
      } else job.read = { seq: world.seq, state: structuredClone(full()), served: true }
      return
    }
    jobs.splice(i, 1)
    job.resolve(structuredClone(frames.answer(job.read, job.known)))
  }
  const fresh = (n: number): Row[] => Array.from({ length: n }, () => row((world.next += 1)))
  return { world, jobs, full, ask, step, fresh }
}

function storeWindow(ask: (k: LootMark | null) => Promise<LootFrame | null>) {
  let cursor: (c: ModuleChanged) => void = () => undefined
  let character: (c: CharacterRef | null) => void = () => undefined
  let armed: (() => void)[] = []
  const bridge: ModuleBridge = {
    getModuleSnapshot: () => Promise.reject(new Error('loot must be read through its frames')),
    getLootFrame: ask,
    onModuleChanged: (cb) => {
      cursor = cb
      return () => undefined
    },
    onCharacter: (cb) => {
      character = cb
      return () => undefined
    }
  }
  const store = createModuleStore({ bridge, schedule: (run) => armed.push(run) })
  const off = store.subscribe('loot', () => undefined)
  return {
    changed: (c: ModuleChanged) => {
      cursor(c)
    },
    character: (c: CharacterRef) => {
      character(c)
    },
    frame: (): boolean => {
      const due = armed
      armed = []
      for (const run of due) run()
      return due.length > 0
    },
    rows: () => store.getSnapshot('loot'),
    close: off
  }
}

function overlayWindow(ask: (k: LootMark | null) => Promise<LootFrame | null>, logFile: string) {
  let cursor: (c: ModuleChanged) => void = () => undefined
  let character: (c: CharacterRef | null) => void = () => undefined
  const eqOverlay = {
    getModuleSnapshot: () => Promise.reject(new Error('loot must be read through its frames')),
    getLootFrame: ask,
    onModuleChanged: (cb: (c: ModuleChanged) => void) => {
      cursor = cb
      return () => undefined
    },
    onCharacter: (cb: (c: CharacterRef | null) => void) => {
      character = cb
      return () => undefined
    },
    logReadReport: () => Promise.resolve({ logFile })
  }
  ;(globalThis as { window?: unknown }).window = { eqOverlay }
  const host = mountHook(() => useOverlayModule<readonly Row[]>('loot', NO_ROWS))
  return {
    changed: (c: ModuleChanged) => {
      cursor(c)
    },
    character: (c: CharacterRef) => {
      character(c)
    },
    rows: () => host.render(),
    close: () => {
      host.unmount()
    }
  }
}

/** One seeded life of a ledger. After every step, each window equals a full read. */
async function walk(seed: number, steps: number): Promise<void> {
  const random = mulberry(seed)
  const pick = (n: number): number => Math.floor(random() * n)
  const main = walkMain(random)
  const { world } = main
  let log = 0
  let blipped = false
  const store = storeWindow(main.ask)
  const overlay = overlayWindow(main.ask, 'eqlog_Aye_freeport.txt')
  const both = (c: ModuleChanged): void => {
    store.changed(c)
    overlay.changed(c)
  }
  const cursor = (): void => {
    world.seq += 1
    both({ moduleId: 'loot', seq: world.seq })
  }
  const told = (): void => {
    store.character(who(LOGS[log]))
    overlay.character(who(LOGS[log]))
  }
  const events: (() => void)[] = [
    () => { world.live = [...world.live, ...main.fresh(1 + pick(3))]; cursor() },
    () => { world.live = [...world.live, ...main.fresh(1)]; cursor() },
    cursor, // the cursor follows every event, loot or not
    () => { world.live = []; cursor() }, // a clear
    () => { world.live = main.fresh(world.live.length); cursor() }, // regrown to the same length
    () => { world.live = world.live.slice(0, pick(world.live.length + 1)); cursor() },
    () => {
      if (world.live.length === 0) return
      const at = pick(world.live.length)
      world.live = world.live.map((r, i) => (i === at ? { ...r, disposition: 'sold' as const } : r))
      cursor()
    },
    () => { world.archive = main.fresh(pick(4)); cursor() }, // an archive swap, told by a cursor alone
    () => { world.archive = main.fresh(1 + pick(3)); both({ moduleId: MODULE_WORLD_CHANGED, seq: -1 }) },
    () => { world.live = [...world.live, ...main.fresh(1)]; told() }, // a rebuild of the same log
    () => { // another character
      log = 1 - log
      world.archive = []
      world.live = main.fresh(pick(5))
      world.seq = 1
      told()
    },
    () => { world.blips = 1 + pick(2); blipped = true; cursor() } // reads that come back with no snapshot
  ]
  const quiesce = async (): Promise<void> => {
    for (let i = 0; i < 2000; i++) {
      await settle()
      const framed = store.frame()
      if (main.jobs.length > 0) main.step()
      else if (!framed) {
        await settle()
        if (main.jobs.length === 0 && !store.frame()) return
      }
    }
    assert.fail(`seed ${String(seed)}: the windows never settled`)
  }
  await quiesce()
  for (let s = 0; s < steps; s++) {
    for (let n = 1 + pick(3); n > 0; n--) {
      events[pick(events.length)]()
      store.frame()
      for (let p = pick(4); p > 0; p--) main.step()
      await settle()
    }
    await quiesce()
    // A read that came back with no snapshot is not asked again until the next cursor, on either
    // window and with or without frames (each keeps or clears what it held): send that cursor.
    if (blipped) {
      blipped = false
      world.blips = 0
      cursor()
      await quiesce()
    }
    const full = main.full()
    assert.deepEqual(store.rows(), full, `seed ${String(seed)} step ${String(s)}: the main window`)
    assert.deepEqual(overlay.rows(), full, `seed ${String(seed)} step ${String(s)}: the overlay`)
  }
  store.close()
  overlay.close()
}

test('A SEEDED WALK: each window equals a full read after every step', async () => {
  for (let seed = 1; seed <= 12; seed++) await walk(seed, 120)
})
