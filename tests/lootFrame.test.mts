// The loot ledger as append frames (shared/lootFrame.ts). The one claim everything here serves: a
// window's array always deep-equals a full read. `lootFrameWalk.test.mts` runs the real store and
// the real overlay hook over one main, with replies held and released out of order.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createLootFrameReader,
  createLootFrames,
  type LootFrame,
  type LootMark,
  type LootRows
} from '../src/shared/lootFrame'
import type { LootEvent } from '../src/shared/types'

type Row = LootEvent
const row = (n: number, over: Partial<Row> = {}): Row => ({ ts: 1000 + n, item: `Item ${String(n)}`, zone: 'Befallen', ...over })
const rows = (from: number, to: number): Row[] => Array.from({ length: to - from }, (_, i) => row(from + i))

/** One main over a ledger, and a wire that clones both ways as IPC does. */
function rig(initial: Row[]) {
  const frames = createLootFrames()
  const world = { ledger: initial, seq: 1 }
  const sent: LootFrame[] = []
  const ask = (known: LootMark | null): Promise<LootFrame | null> => {
    const snap = { seq: world.seq, state: structuredClone(world.ledger), served: true as const }
    const reply = structuredClone(frames.answer(snap, structuredClone(known)))
    if (reply !== null) sent.push(reply)
    return Promise.resolve(reply)
  }
  return { frames, world, sent, ask, lastRows: () => (sent[sent.length - 1] as LootRows).rows.length }
}

async function held(reader: ReturnType<typeof createLootFrameReader>): Promise<unknown> {
  return (await reader.read())?.state
}

test('ONE PICKUP SENDS ONE ROW, and the window equals a full read', async () => {
  const r = rig(rows(0, 3))
  const w = createLootFrameReader(r.ask)
  assert.deepEqual(await held(w), rows(0, 3))
  assert.equal(r.lastRows(), 3, 'the first read is the whole ledger')
  r.world.ledger = rows(0, 4)
  assert.deepEqual(await held(w), rows(0, 4))
  assert.equal(r.lastRows(), 1)
})

test('no new rows keeps the array identity, so no memo downstream re-runs', async () => {
  const r = rig(rows(0, 3))
  const w = createLootFrameReader(r.ask)
  const first = await held(w)
  r.world.seq = 2
  assert.equal(await held(w), first)
  assert.equal(r.lastRows(), 0)
})

test('a rebirth regrown to the SAME LENGTH is not an append', async () => {
  const r = rig(rows(0, 3))
  const w = createLootFrameReader(r.ask)
  await held(w)
  r.world.ledger = rows(10, 13)
  assert.deepEqual(await held(w), rows(10, 13))
  assert.equal(r.lastRows(), 3)
})

test('a clear, then a shorter ledger, is not an append', async () => {
  const r = rig(rows(0, 5))
  const w = createLootFrameReader(r.ask)
  await held(w)
  r.world.ledger = []
  assert.deepEqual(await held(w), [])
  r.world.ledger = rows(20, 22)
  assert.deepEqual(await held(w), rows(20, 22))
})

test('a CHANGED ARCHIVE PREFIX under the same live rows sends everything', async () => {
  const live = rows(100, 102)
  const r = rig([...rows(0, 3), ...live])
  const w = createLootFrameReader(r.ask)
  await held(w)
  r.world.ledger = [...rows(50, 53), ...live, row(102)]
  assert.deepEqual(await held(w), r.world.ledger)
  assert.equal(r.lastRows(), 6)
})

test('one old row changing one field sends everything', async () => {
  const r = rig(rows(0, 3))
  const w = createLootFrameReader(r.ask)
  await held(w)
  r.world.ledger = [row(0), row(1, { disposition: 'sold' }), row(2), row(3)]
  assert.deepEqual(await held(w), r.world.ledger)
  assert.equal(r.lastRows(), 4)
})

test('pickups a window did not read arrive together', async () => {
  const r = rig(rows(0, 2))
  const w = createLootFrameReader(r.ask)
  await held(w)
  r.world.ledger = rows(0, 7)
  assert.deepEqual(await held(w), rows(0, 7))
  assert.equal(r.lastRows(), 5)
})

test('TWO WINDOWS at different marks each get what they lack', async () => {
  const r = rig(rows(0, 2))
  const a = createLootFrameReader(r.ask)
  const b = createLootFrameReader(r.ask)
  await held(a)
  r.world.ledger = rows(0, 4)
  await held(b)
  r.world.ledger = rows(0, 5)
  assert.deepEqual(await held(a), rows(0, 5))
  assert.equal(r.lastRows(), 3)
  assert.deepEqual(await held(b), rows(0, 5))
  assert.equal(r.lastRows(), 1)
})

test('A BAD MARK GETS EVERYTHING: wrong run, past the end, or not a mark', () => {
  const frames = createLootFrames()
  const snap = { seq: 1, state: rows(0, 3) }
  const gen = (frames.answer(snap, null) as LootRows).gen
  const bad: unknown[] = [
    null, undefined, 'x', 7, {}, [], { gen }, { length: 2 },
    { gen: gen + 1, length: 2 }, { gen: gen - 1, length: 2 },
    { gen, length: 4 }, { gen, length: -1 }, { gen, length: 1.5 },
    { gen, length: Number.NaN }, { gen, length: '2' }, { gen: String(gen), length: 2 }
  ]
  for (const mark of bad) {
    const reply = frames.answer(snap, mark) as LootRows
    assert.equal(reply.from, 0, `mark ${JSON.stringify(mark)}`)
    assert.deepEqual(reply.rows, rows(0, 3))
  }
})

test('no snapshot ends the run: the next read is whole, even of the same ledger', async () => {
  const r = rig(rows(0, 3))
  let none = false
  const w = createLootFrameReader((k) => (none ? Promise.resolve(r.frames.answer(null, k)) : r.ask(k)))
  await held(w)
  none = true
  assert.equal(await w.read(), null)
  none = false
  assert.deepEqual(await held(w), rows(0, 3))
  assert.equal(r.lastRows(), 3)
})

test('a state that is not a ledger passes through as a full read would', async () => {
  const frames = createLootFrames()
  const w = createLootFrameReader((k) => Promise.resolve(frames.answer({ seq: 4, state: { odd: 1 }, served: true }, k)))
  assert.deepEqual(await w.read(), { seq: 4, state: { odd: 1 }, served: true })
})

test('forget: the next read is whole, and a reply already out is refused', async () => {
  const r = rig(rows(0, 3))
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let hold = false
  const w = createLootFrameReader(async (k) => {
    const reply = await r.ask(k)
    if (hold) await gate
    return reply
  })
  await held(w)
  hold = true
  r.world.ledger = rows(0, 4)
  const out = w.read()
  w.forget()
  release()
  await assert.rejects(out)
  hold = false
  assert.deepEqual(await held(w), rows(0, 4))
  assert.equal(r.lastRows(), 4)
})

test('TWO READS RACING never apply one append twice, in either order', async () => {
  for (const newerFirst of [true, false]) {
    const r = rig(rows(0, 2))
    const held2: (() => void)[] = []
    let hold = false
    const w = createLootFrameReader(async (k) => {
      const reply = await r.ask(k)
      if (hold) await new Promise<void>((resolve) => held2.push(resolve))
      return reply
    })
    await held(w)
    hold = true
    r.world.ledger = rows(0, 3)
    const older = w.read()
    await Promise.resolve()
    r.world.ledger = rows(0, 4)
    const newer = w.read()
    await new Promise((resolve) => setImmediate(resolve))
    hold = false
    for (const go of newerFirst ? [...held2].reverse() : held2) {
      go()
      await new Promise((resolve) => setImmediate(resolve))
    }
    const [a, b] = await Promise.all([older, newer])
    assert.deepEqual(b?.state, rows(0, 4), `newer read, newerFirst=${String(newerFirst)}`)
    if (newerFirst) assert.deepEqual(a?.state, rows(0, 4), 'a slower older reply must not step the ledger back')
    assert.deepEqual(await held(w), rows(0, 4))
  }
})

test('a reply that names a base this window does not hold is thrown away for a whole read', async () => {
  const r = rig(rows(0, 3))
  let lie = true
  const w = createLootFrameReader(async (k) => {
    const reply = await r.ask(k)
    if (k !== null && lie) {
      lie = false
      return { ...(reply as LootRows), from: 1, rows: [row(9)] }
    }
    return reply
  })
  await held(w)
  r.world.ledger = rows(0, 4)
  assert.deepEqual(await held(w), rows(0, 4))
})

test('main: after no snapshot, a mark from before it no longer names anything', () => {
  const frames = createLootFrames()
  const snap = { seq: 1, state: rows(0, 3) }
  const { gen } = frames.answer(snap, null) as LootRows
  assert.equal(frames.answer(null, { gen, length: 3 }), null)
  const after = frames.answer(snap, { gen, length: 3 }) as LootRows
  assert.notEqual(after.gen, gen)
  assert.equal(after.from, 0)
  assert.deepEqual(after.rows, rows(0, 3))
})

test('a reply from another run is no append, even at exactly the length this window holds', async () => {
  const r = rig(rows(0, 3))
  let lie = true
  const w = createLootFrameReader(async (k) => {
    const reply = await r.ask(k)
    if (k !== null && lie) {
      lie = false
      return { seq: 9, gen: k.gen + 1, from: k.length, rows: [row(99)] }
    }
    return reply
  })
  await held(w)
  r.world.ledger = rows(0, 4)
  assert.deepEqual(await held(w), rows(0, 4))
})

test('TWO WHOLE READS RACING: the older one landing last does not step the ledger back', async () => {
  const r = rig(rows(0, 2))
  const out: (() => void)[] = []
  const w = createLootFrameReader(async (k) => {
    const reply = await r.ask(k)
    await new Promise<void>((resolve) => out.push(resolve))
    return reply
  })
  const older = w.read()
  await new Promise((resolve) => setImmediate(resolve))
  r.world.ledger = rows(0, 3)
  const newer = w.read()
  await new Promise((resolve) => setImmediate(resolve))
  out[1]()
  assert.deepEqual((await newer)?.state, rows(0, 3))
  out[0]()
  assert.deepEqual((await older)?.state, rows(0, 3), 'an overtaken reply put the older ledger back')
})

test('a wire that answers a whole read with a part rejects instead of asking forever', async () => {
  let asks = 0
  const w = createLootFrameReader(() => {
    asks += 1
    return Promise.resolve({ seq: 1, gen: 1, from: 2, rows: [] })
  })
  await assert.rejects(w.read())
  assert.equal(asks, 1)
})
