// When the Spells tab shows its spell-file notice (src/shared/spellTableNotice.ts).
//
// The owner, 2026-11-23: when spells_us.txt is missing, Spells shows a notice that stays up, after
// the app has looked for another spells_*.txt. A fallback file in use gets one quiet line instead.

import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { SPELL_TABLE_LACKS, spellTableNotice } from '../src/shared/spellTableNotice'
import { spellTableReport } from '../src/main/resist/spellFiles'

const EQ = join('C:', 'EQ')

test('no spell table found: the notice names the folder looked in and what is missing', () => {
  const report = spellTableReport('missing', join(EQ, 'spells_us.txt'))
  assert.deepEqual(report, { state: 'missing', folder: EQ, file: 'spells_us.txt', fallback: false })
  assert.deepEqual(spellTableNotice(report), { kind: 'missing', folder: EQ, file: 'spells_us.txt', lacks: SPELL_TABLE_LACKS })
})

test('a table that is there but could not be read gets the notice too, naming the file', () => {
  const notice = spellTableNotice(spellTableReport('unloadable', join(EQ, 'spells_de.txt')))
  assert.equal(notice?.kind, 'unloadable')
  assert.equal(notice && 'file' in notice ? notice.file : null, 'spells_de.txt')
})

test('another language\'s table in use: one quiet line naming the file', () => {
  const report = spellTableReport('ok', join(EQ, 'spells_de.txt'))
  assert.equal(report.fallback, true)
  assert.deepEqual(spellTableNotice(report), { kind: 'fallback', file: 'spells_de.txt' })
})

test('spells_us.txt read, still loading, or not asked yet: nothing is shown', () => {
  assert.equal(spellTableNotice(spellTableReport('ok', join(EQ, 'spells_us.txt'))), null)
  assert.equal(spellTableNotice(spellTableReport('ok', join(EQ, 'SPELLS_US.TXT'))), null)
  assert.equal(spellTableNotice(spellTableReport('loading', join(EQ, 'spells_us.txt'))), null)
  assert.equal(spellTableNotice(null), null)
})

test('the notice says only what really depends on the spell file', () => {
  // Checked against the readers (spellTableNotice.ts header): icons, Loadout stacking, AE targets.
  assert.equal(SPELL_TABLE_LACKS.length, 3)
  assert.match(SPELL_TABLE_LACKS.join(' '), /icons/)
  assert.match(SPELL_TABLE_LACKS.join(' '), /stacking/)
  assert.match(SPELL_TABLE_LACKS.join(' '), /AE target/)
})
