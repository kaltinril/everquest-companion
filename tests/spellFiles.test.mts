// Which spell files the app reads out of an EverQuest folder (src/main/resist/spellFiles.ts).
//
// The owner, 2026-11-23: the app ships no spell file of its own, and when `spells_us.txt` is
// missing it first looks for another `spells_*.txt` (a client in another language may name it
// differently). Every case here is a real temp folder.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pickSpellTable, resolveSpellFiles, spellTableSuffix } from '../src/main/resist/spellFiles'

function folderWith(...names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-spellfiles-'))
  for (const n of names) writeFileSync(join(dir, n), 'x')
  return dir
}

function withFolder(names: string[], body: (dir: string) => void): void {
  const dir = folderWith(...names)
  try {
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('spells_us.txt is read when it is there, with its two companions', () => {
  withFolder(['spells_us.txt', 'spells_us_str.txt', 'dbstr_us.txt', 'spells_de.txt', 'dbstr_de.txt'], (dir) => {
    const f = resolveSpellFiles(dir)
    assert.equal(f.table, join(dir, 'spells_us.txt'))
    assert.equal(f.found, true)
    assert.equal(f.fallback, false)
    assert.equal(f.str, join(dir, 'spells_us_str.txt'))
    assert.equal(f.dbstr, join(dir, 'dbstr_us.txt'))
    assert.equal(f.folder, dir)
  })
})

test('with no spells_us.txt, another spells_*.txt is read, and its own companions', () => {
  withFolder(['spells_de.txt', 'spells_de_str.txt', 'dbstr_de.txt', 'eqstr_de.txt'], (dir) => {
    const f = resolveSpellFiles(dir)
    assert.equal(f.table, join(dir, 'spells_de.txt'))
    assert.equal(f.found, true)
    assert.equal(f.fallback, true)
    assert.equal(f.str, join(dir, 'spells_de_str.txt'))
    assert.equal(f.dbstr, join(dir, 'dbstr_de.txt'))
  })
})

test('a fallback table without its own companions falls back to the _us ones', () => {
  withFolder(['spells_fr.txt', 'dbstr_us.txt'], (dir) => {
    const f = resolveSpellFiles(dir)
    assert.equal(f.table, join(dir, 'spells_fr.txt'))
    assert.equal(f.str, join(dir, 'spells_us_str.txt'))
    assert.equal(f.dbstr, join(dir, 'dbstr_us.txt'))
  })
})

test('the message file alone is never taken for the table', () => {
  withFolder(['spells_us_str.txt', 'spells_de_str.txt', 'dbstr_us.txt', 'spellsnew.eff'], (dir) => {
    const f = resolveSpellFiles(dir)
    assert.equal(f.found, false)
    assert.equal(f.fallback, false)
    // Nothing found still names a place, so a notice can say where it looked.
    assert.equal(f.table, join(dir, 'spells_us.txt'))
  })
})

test('a folder that is not there answers not found, and does not throw', () => {
  const f = resolveSpellFiles(join(tmpdir(), 'eqc-no-such-folder-' + String(process.pid)))
  assert.equal(f.found, false)
})

test('the order among several fallbacks is fixed, whatever order the folder lists them in', () => {
  assert.equal(pickSpellTable(['spells_ru.txt', 'Spells_DE.txt', 'spells_cn.txt']), 'spells_cn.txt')
  assert.equal(pickSpellTable(['spells_cn.txt', 'spells_ru.txt', 'Spells_DE.txt']), 'spells_cn.txt')
  assert.equal(pickSpellTable(['spells_de.txt', 'spells_us.txt']), 'spells_us.txt')
  assert.equal(pickSpellTable(['SPELLS_US.TXT', 'spells_de.txt']), 'SPELLS_US.TXT')
  assert.equal(pickSpellTable(['spells_us_str.txt', 'spells.eff', 'spellsnew.edd']), null)
})

test('only spells_<suffix>.txt names a table', () => {
  assert.equal(spellTableSuffix('spells_us.txt'), 'us')
  assert.equal(spellTableSuffix('spells_de.txt'), 'de')
  assert.equal(spellTableSuffix('spells_us_str.txt'), null)
  assert.equal(spellTableSuffix('spells.txt'), null)
  assert.equal(spellTableSuffix('spells_de.txt.bak'), null)
  assert.equal(spellTableSuffix('dbstr_us.txt'), null)
})

test('the Gaps tab reads its spell facts from the fallback table and its own message file', async () => {
  const { spellFactsInFolder } = await import('../src/main/gapSpellFacts')
  const row = ['4093', 'Odium', ...Array.from({ length: 90 }, () => '0')].join('^')
  withFolder([], (dir) => {
    assert.deepEqual(spellFactsInFolder(dir, ['Odium']), {})
    writeFileSync(join(dir, 'spells_de.txt'), row)
    writeFileSync(join(dir, 'spells_de_str.txt'), '4093^^^Ihr taumelt.^ taumelt.^Vorbei.^')
    const facts = spellFactsInFolder(dir, ['Odium'])
    assert.equal(facts.Odium?.msgOnYou, 'Ihr taumelt.')
    assert.equal(facts.Odium?.msgWearsOff, 'Vorbei.')
  })
})
