// jsonChunkRead — a big JSON file, parsed off main and handed back in slices (audit item 2).
//
// THE WORKER RUNS FROM ITS TYPESCRIPT SOURCE under the suite's tsx loader (presenceWorker.test.mts
// does the same): the file the app loads is the electron-vite build's, which a unit test does not
// have. What is under test is the protocol and the pump, which are the same code either way.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { chunkMessages, type JsonChunkMessage } from '../src/main/jsonChunks'
import { readJsonChunked, type JsonChunkWorkerSpec } from '../src/main/jsonChunkRead'

const HERE = dirname(fileURLToPath(import.meta.url))
const SPEC: JsonChunkWorkerSpec = {
  file: join(HERE, '..', 'src', 'main', 'jsonChunkWorker.ts'),
  execArgv: ['--import', 'tsx']
}

function withDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-json-chunks-'))
  return run(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true })
  })
}

/** Read a file through the worker and reassemble what the sink was handed. */
async function readBack(path: string, plan: Parameters<typeof readJsonChunked>[1]) {
  let head: Record<string, unknown> | undefined
  const items = new Map<number, Record<string, unknown>>()
  const object: Record<string, unknown> = {}
  const rows = new Map<number, unknown[]>()
  const res = await readJsonChunked(
    path,
    plan,
    {
      head: (h) => {
        head = h
      },
      item: (i, item) => items.set(i, item),
      chunk: (value, index) => {
        if (index === undefined) Object.assign(object, value as Record<string, unknown>)
        else rows.set(index, [...(rows.get(index) ?? []), ...(value as unknown[])])
      }
    },
    SPEC
  )
  return { res, head, items, object, rows }
}

test('the protocol: head, then the bulk in slices, then done', () => {
  const doc = { version: 3, size: 10, table: { a: 1, b: [2, 3], c: { d: 'e' } } }
  const msgs = [...chunkMessages(doc, { key: 'table', expectHead: { version: 3 } })]
  assert.deepEqual(msgs[0], { kind: 'head', head: { version: 3, size: 10 } })
  const chunks = msgs.filter((m): m is Extract<JsonChunkMessage, { kind: 'chunk' }> => m.kind === 'chunk')
  const merged = Object.assign({}, ...chunks.map((c) => JSON.parse(c.json) as object)) as object
  assert.deepEqual(merged, doc.table)
  assert.deepEqual(msgs.at(-1), { kind: 'done' })
})

test('the protocol: a stale head or the wrong shape is one error and nothing else', () => {
  const stale = [...chunkMessages({ version: 2, table: {} }, { key: 'table', expectHead: { version: 3 } })]
  assert.equal(stale.length, 1)
  assert.equal(stale[0]?.kind, 'error')
  assert.equal((stale[0] as { stage: string }).stage, 'stale')
  const shape = [...chunkMessages({ version: 3, table: [] }, { key: 'table', expectHead: { version: 3 } })]
  assert.equal((shape[0] as { stage: string }).stage, 'shape')
  assert.equal((chunkMessages(null, { key: 'table' }).next().value as { stage: string }).stage, 'shape')
})

test('each mode posts every element without its rows, then its rows in slices', () => {
  const doc = {
    version: 1,
    sources: [{ key: 'a', rows: [1, 2, 3] }, 'not an object', { key: 'b', rows: [] }, { key: 'c' }]
  }
  const msgs = [...chunkMessages(doc, { key: 'sources', each: 'rows' })]
  assert.deepEqual(msgs[0], { kind: 'head', head: { version: 1 } })
  assert.deepEqual(msgs[1], { kind: 'item', index: 0, item: { key: 'a' } })
  assert.deepEqual(msgs[2], { kind: 'chunk', index: 0, json: '[1,2,3]' })
  assert.deepEqual(msgs[3], { kind: 'item', index: 2, item: { key: 'b' } })
  assert.deepEqual(msgs[4], { kind: 'item', index: 3, item: { key: 'c' } })
  assert.deepEqual(msgs[5], { kind: 'done' })
})

test('a file read on the worker comes back whole, in both modes', async () => {
  await withDir(async (dir) => {
    const table = Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [`spell ${i}`, { id: i, slots: [i, i + 1] }]))
    const cache = join(dir, 'cache.json')
    writeFileSync(cache, JSON.stringify({ version: 9, size: 1, mtimeMs: 2, table }))
    const got = await readBack(cache, { key: 'table', expectHead: { version: 9, size: 1, mtimeMs: 2 } })
    assert.equal(got.res.ok, true)
    assert.deepEqual(got.head, { version: 9, size: 1, mtimeMs: 2 })
    assert.deepEqual(got.object, table)

    const sources = [
      { key: 'Ayla@green', rows: Array.from({ length: 3_000 }, (_, i) => ({ i, dmg: { n: i } })) },
      { key: 'Bryn@green', rows: [] }
    ]
    const ledger = join(dir, 'ledger.json')
    writeFileSync(ledger, JSON.stringify({ version: 3, sources }))
    const back = await readBack(ledger, { key: 'sources', each: 'rows', expectHead: { version: 3 } })
    assert.equal(back.res.ok, true)
    assert.deepEqual([...back.items.entries()], [[0, { key: 'Ayla@green' }], [1, { key: 'Bryn@green' }]])
    assert.deepEqual(back.rows.get(0), sources[0]?.rows)
    assert.equal(back.rows.has(1), false, 'an empty rows array posts no chunk')
  })
})

test('a missing file names its errno, a torn one its stage, a stale one too', async () => {
  await withDir(async (dir) => {
    const missing = await readBack(join(dir, 'nope.json'), { key: 'table' })
    assert.deepEqual(missing.res, { ok: false, stage: 'read', error: (missing.res as { error: string }).error, code: 'ENOENT' })
    const torn = join(dir, 'torn.json')
    writeFileSync(torn, '{"version":9,"table":{"a":')
    assert.equal((await readBack(torn, { key: 'table' })).res.ok, false)
    assert.equal(((await readBack(torn, { key: 'table' })).res as { stage: string }).stage, 'parse')
    const stale = join(dir, 'stale.json')
    writeFileSync(stale, '{"version":8,"table":{}}')
    assert.equal(((await readBack(stale, { key: 'table', expectHead: { version: 9 } })).res as { stage: string }).stage, 'stale')
  })
})

test('a cache-sized document never holds the main thread for more than one slice', async () => {
  await withDir(async (dir) => {
    // ~18 MB, in the resist cache's shape: 48k spells with slots. The sync parse is the figure the
    // audit measured at the first con; the pump's longest turn is what replaces it.
    const table: Record<string, unknown> = {}
    for (let i = 0; i < 48_000; i++) {
      table[`spell number ${i}`] = {
        id: i, hp: i % 7, mana: i * 3, recastMs: 1500, aeMaxTargets: 4,
        slots: Array.from({ length: 6 }, (_, s) => ({ effect: s * 11, base: i + s, max: 0, calc: 100 })),
        name: `Spell Number ${i} Rank ${i % 3}`
      }
    }
    const text = JSON.stringify({ version: 9, size: 1, mtimeMs: 2, table })
    const path = join(dir, 'big.json')
    writeFileSync(path, text)
    const t0 = performance.now()
    JSON.parse(text)
    const syncMs = performance.now() - t0

    let keys = 0
    const res = await readJsonChunked(path, { key: 'table', expectHead: { version: 9 } }, {
      chunk: (value) => {
        keys += Object.keys(value as object).length
      }
    }, SPEC)
    assert.equal(res.ok, true)
    if (!res.ok) return
    assert.equal(keys, 48_000)
    assert.ok(res.chunks >= 10, `sliced into ${res.chunks} chunks`)
    console.log(
      `  ${(text.length / 1e6).toFixed(1)} MB: sync JSON.parse ${syncMs.toFixed(0)} ms on this thread; ` +
        `chunked: ${res.chunks} chunks, longest main-thread turn ${res.maxSliceMs.toFixed(1)} ms`
    )
    // The budget is 8 ms plus one chunk's parse; 60 leaves room for a loaded CI box.
    assert.ok(res.maxSliceMs < 60, `longest turn ${res.maxSliceMs.toFixed(1)} ms`)
    assert.ok(res.maxSliceMs < syncMs / 2, 'the longest turn is well under the sync parse')
  })
})
