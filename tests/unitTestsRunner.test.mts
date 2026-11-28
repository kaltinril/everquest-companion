// THE UNIT RUNNER'S SPLIT (scripts/unitTests.mts): most test files share a pooled process, and a
// file with a shared-process hazard must run alone. A rule that stops matching would pool a file
// that leaks into its neighbours, and a pool that drops a file would drop its tests silently.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classify, deal, ISOLATION_RULES } from '../scripts/unitTests.mts'

// One sample per rule, written as each hazard appears in this repo's tests.
const HAZARDS: Record<string, string> = {
  'mock-timers': "t.mock.timers.enable({ apis: ['setTimeout'] })",
  'env-write': "process.env.TZ = 'UTC'",
  globalThis: ';(globalThis as { window?: unknown }).window = { eq }',
  'child-process': "import { spawn } from 'node:child_process'",
  'top-level-hook': 'after(() => stopOcr())',
  'process-hooks': "process.on('unhandledRejection', onReject)",
  'bare-mock': "mock.method(console, 'warn')"
}

const PURE = [
  "import { test } from 'node:test'",
  "test('adds', (t) => { t.mock.method(obj, 'f'); assert.equal(1 + 1, 2) })",
  "describe('x', () => { before(() => setup()) })",
  'const env = { ...process.env }'
].join('\n')

function tree(files: Record<string, string>, listed = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'unit-runner-'))
  mkdirSync(join(root, 'tests'))
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'scripts', 'unit-isolated.txt'), listed)
  for (const [name, src] of Object.entries(files)) writeFileSync(join(root, 'tests', name), src)
  return root
}

test('every isolation rule has a sample, and each sample trips its own rule only', () => {
  assert.deepEqual(Object.keys(HAZARDS).sort(), ISOLATION_RULES.map((r) => r.name).sort())
  for (const [name, src] of Object.entries(HAZARDS)) {
    assert.deepEqual(ISOLATION_RULES.filter((r) => r.re.test(src)).map((r) => r.name), [name], name)
  }
})

test('a file with no hazard is pooled; a hazard or a listed name isolates it, with the reason', () => {
  const files: Record<string, string> = { 'pure.test.mts': PURE, 'listed.test.mts': PURE }
  for (const [name, src] of Object.entries(HAZARDS)) files[`${name}.test.mts`] = `${PURE}\n${src}\n`
  const root = tree(files, '# leaks the spell table into its neighbours\nlisted.test.mts\n')
  try {
    const split = classify(root, Object.keys(files).map((f) => join('tests', f)))
    assert.equal(split.get(join('tests', 'pure.test.mts')), null)
    assert.match(split.get(join('tests', 'listed.test.mts')) ?? '', /leaks the spell table/)
    for (const name of Object.keys(HAZARDS)) assert.equal(split.get(join('tests', `${name}.test.mts`)), name)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the pools hold every pooled file exactly once, balanced by last time, the same way every run', () => {
  const files = Array.from({ length: 23 }, (_, i) => `tests/f${String(i).padStart(2, '0')}.test.mts`)
  const times = { 'f00.test.mts': 9000, 'f01.test.mts': 5000 }
  const pools = deal(files, 4, times)
  assert.equal(pools.length, 4)
  assert.deepEqual(pools.flat().sort(), files)
  assert.deepEqual(deal(files, 4, times), pools)
  assert.deepEqual(pools.find((p) => p.includes('tests/f00.test.mts')), ['tests/f00.test.mts'])
  assert.deepEqual(deal(files.slice(0, 2), 8, {}).length, 2)
})
