// ============================================================================
// logArchiveRefold.test.mts — folding a segment's archive again (log archive, step 5.4).
// ============================================================================
//
// The comparison, and the staging of an archive as an install. The second engine itself is exercised by `tests/e2e/log-archive-refold-trial.mts` against
// the real binary; here a refold that cannot start is enough to prove the temp folder goes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { liveLogName, refoldSegment, stageSegmentLog } from '../src/main/logArchive/refold'
import { compareModules, stateDifference } from '../src/shared/logArchive/refoldCompare'
import { SEGMENT_VERSION, type Segment } from '../src/shared/logArchive/segment'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

const TOTALS = '[Sun Aug 02 15:12:05 2026] You have slain a gnoll!\r\n'
const GAP = '[Sun Aug 02 15:12:09 2026] You have slain a gnoll pup!\r\n'

function segmentWith(archivePath: string | null, over: Partial<Segment> = {}): Segment {
  return {
    v: SEGMENT_VERSION,
    id: 'primitive_freeport-20260802151205-52',
    character: 'primitive_freeport',
    state: 'sealed',
    log: {
      bytes: Buffer.byteLength(TOTALS),
      sha256: sha(TOTALS),
      headBytes: Buffer.byteLength(TOTALS),
      headSha256: sha(TOTALS),
      firstStamp: '2026-08-02 15:12:05',
      lastStamp: '2026-08-02 15:12:05'
    },
    producedBy: { app: '1.0.0', engine: '1.0.0' },
    archivePath,
    modules: {},
    ...over
  }
}

/** An archive holding the segment's lines followed by a line written during the move. */
function archiveFixture(): { root: string; archive: string } {
  const root = mkdtempSync(join(tmpdir(), 'logrefold-'))
  const archive = join(root, 'eqlog_Primitive_freeport_2026-08-02_to_2026-08-02.log.gz')
  writeFileSync(archive, gzipSync(Buffer.from(TOTALS + GAP)))
  return { root, archive }
}

test('compare: the same states in another key order match', () => {
  const v = compareModules(
    { kills: { seq: 1, state: { mobs: { a: { count: 2 }, b: { count: 1 } } } } },
    { kills: { seq: 9, state: { mobs: { b: { count: 1 }, a: { count: 2 } } } } }
  )
  assert.deepEqual(v, [{ module: 'kills', same: true, detail: 'same' }])
})

test('compare: a difference names the first place and counts every value', () => {
  const d = stateDifference('loot', [{ item: 'Dagger', n: 1 }, { item: 'Rag', n: 1 }], [{ item: 'Dagger', n: 2 }, { item: 'Rag', n: 3 }, { item: 'X', n: 1 }])
  assert.equal(d?.first, '.length (2 vs 3)')
  assert.equal(d?.count, 3)
  const v = compareModules({ kills: { seq: 1, state: {} } }, { loot: { seq: 1, state: [] } })
  assert.deepEqual(v.map((x) => x.detail), ['only in the segment', 'only in the refold'])
})

test('compare: a key on one side only is a difference', () => {
  const d = stateDifference('kills', { mobs: {} }, { mobs: {}, extra: 1 })
  assert.equal(d?.first, 'extra (only in the refolded state)')
})

test('compare: the character module may name another log file', () => {
  const a = { character: { name: 'Primitive', logPath: 'C:/EQ/Logs/eqlog_Primitive_freeport.txt' } }
  const b = { character: { name: 'Primitive', logPath: 'C:/Temp/refold-1/Logs/eqlog_Primitive_freeport.txt' } }
  assert.equal(stateDifference('character', a, b), null)
  assert.notEqual(stateDifference('kills', a, b), null)
})

test('the live log name is read back off the archive name', () => {
  assert.equal(liveLogName(segmentWith('C:/a/eqlog_Primitive_freeport_2026-08-02_to_2026-08-03_2.log.gz')), 'eqlog_Primitive_freeport.txt')
  assert.equal(liveLogName(segmentWith('C:/a/eqlog_Some_Body_server_unknown_to_unknown.log.gz')), 'eqlog_Some_Body_server.txt')
  assert.equal(liveLogName(segmentWith('C:/a/odd.gz')), 'eqlog_primitive_freeport.txt')
})

test('staging keeps exactly the lines the totals were taken from', async () => {
  const { root, archive } = archiveFixture()
  const tables = join(root, 'eq')
  mkdirSync(tables)
  writeFileSync(join(tables, 'spells_us.txt'), 'x')
  const staged = await stageSegmentLog(segmentWith(archive), join(root, 'stage'), tables)
  assert.ok('logPath' in staged)
  assert.equal(readFileSync(staged.logPath, 'utf8'), TOTALS)
  assert.match(staged.logPath, /Logs[\\/]eqlog_Primitive_freeport\.txt$/)
  assert.equal(staged.tables, 1)
  assert.ok(existsSync(join(root, 'stage', 'spells_us.txt')))
})

test('staging refuses an archive that does not hold the captured lines', async () => {
  const { root, archive } = archiveFixture()
  const wrong = segmentWith(archive, { log: { ...segmentWith(archive).log, sha256: sha('something else') } })
  assert.deepEqual(await stageSegmentLog(wrong, join(root, 'stage'), null), { reason: 'its archive does not hold the lines its totals were taken from' })
  assert.deepEqual(await stageSegmentLog(segmentWith(join(root, 'gone.log.gz')), join(root, 'stage2'), null), { reason: 'its archive is missing' })
})

test('a refold that cannot start says why and leaves no temp folder', async () => {
  const { root, archive } = archiveFixture()
  const work = join(root, 'work')
  const r = await refoldSegment(segmentWith(archive), {
    bin: join(root, 'no-such-engine.exe'),
    tablesRoot: null,
    defines: [],
    clock: { utcOffsetMin: 0 },
    workRoot: work
  })
  assert.equal(r.ok, false)
  assert.deepEqual(readdirSync(work), [])
})
