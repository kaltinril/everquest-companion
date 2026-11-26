// The AA table the Alt. Advancement tab reads (src/shared/aaTable.generated.ts), against the cached
// wiki page it is parsed from (scripts/sources/allAas.ts). No network: the cache is committed.
//
// WHAT IS PINNED HERE:
//   1. THE COMMITTED TABLE IS THE CACHE'S. A red here after a wiki refresh means: run
//      `npx tsx scripts/gen-aa-table.mts` and commit the file with the cache.
//   2. NO ROW IS LEFT OUT. The parser names every row it could not read; on the cache there is none.
//   3. THE SPECIAL TABLE's rank cells are kept per rank, Banestrike's fourth rank and Halfling's
//      stray bar included.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseAllAas, renderAaTable } from '../scripts/sources/allAas'
import { AA_TABLE } from '../src/shared/aaTable.generated'
import { assertCorpusFloor } from './corpusFloor.mts'

const AA_WT = readFileSync(new URL('../scripts/sources/cache/classes/Alternate_Advancement.wikitext', import.meta.url), 'utf8')
const of = (section: string): typeof AA_TABLE => AA_TABLE.filter((r) => r.section === section)

test('the committed table is what the cached page parses to (regenerate when this fails)', () => {
  const scan = parseAllAas(AA_WT)
  assert.deepEqual(scan.skipped, [], 'an AA row the parser could not read')
  assert.deepEqual(scan.rows, [...AA_TABLE], 'run: npx tsx scripts/gen-aa-table.mts')
})

test('all four sections are read, every class table with its class', () => {
  // Floors (2026-11-25 cache: 32, 35, 78, 34): editors add rows, and a parser that stops reading falls under them.
  assertCorpusFloor(of('general').length, 32, 'General AAs')
  assertCorpusFloor(of('archetype').length, 35, 'Archetype AAs')
  assertCorpusFloor(of('class').length, 78, 'Class AAs')
  assertCorpusFloor(of('special').length, 34, 'Special AAs')
  assert.equal(new Set(of('class').map((r) => r.class)).size, 16)
  assert.ok(AA_TABLE.every((r) => (r.section === 'class') === (r.class !== undefined)))
  const bard = AA_TABLE.find((r) => r.name === 'Symphonic Aura')
  assert.deepEqual(bard && { section: bard.section, class: bard.class, ranks: bard.ranks, cost: bard.cost }, {
    section: 'class',
    class: 'Bard',
    ranks: 5,
    cost: '0/3/3/3/3'
  })
  assert.equal(AA_TABLE.find((r) => r.name === 'Acrobatics')?.section, 'archetype')
  for (const row of AA_TABLE) {
    assert.ok(Number.isInteger(row.ranks) && row.ranks >= 1, `${row.name}: ranks`)
    assert.doesNotMatch(row.text, /\[\[|\]\]|'''|<[^>]+>/, `${row.name}: wiki markup left in the text`)
  }
})

test('a Special row keeps one value per rank and its hotkey', () => {
  const by = new Map(of('special').map((r) => [r.name, r]))
  assert.deepEqual(by.get('Class Reincarnation: Human')?.values, ['5', '10', '15'])
  assert.deepEqual(by.get('Class Reincarnation: Half Elf')?.values, ['3', '6', '9'])
  assert.deepEqual(by.get('Banestrike')?.values, ['2', '4', '7%', '10%'])
  assert.equal(by.get('Banestrike')?.ranks, 4)
  assert.match(by.get('Class Reincarnation: Halfling')?.text ?? '', /^This passive ability will mitigate/)
  assert.match(by.get('Class Reincarnation: Bard')?.hk ?? '', /^Fading Memories:/)
  assert.equal(by.get('Class Reincarnation: Human')?.hk, undefined)
  assert.ok(of('special').every((r) => r.cost === '' && r.values?.length === r.ranks))
})

const PAGE = `== General AAs ==
{|
! Name !! Ranks !! Cost !! Description
|-
| One || 2 || 1/2 || Text one.
|-
| Short || 2 || 1/2
|}
== Archetype AAs ==
{|
|-
| Arch || 1 || 3 || Text.
|}
== Class AAs ==
=== Shadow Knight Class AAs ===
{|
! colspan="4" | Shadow Knight Class AAs
|-
! Name !! Ranks !! Cost !! Description
|-
| Steed || 1 || 5 || Rides.
|}
== Special AAs ==
{|
|-
| Plain || 1 || 2 || 3 || Words.
|-
| With Hk || 1% || 2% || 3% || Words. || Key: does it
|-
| Stray || 1 || 2 || 3 ||| Bar text.
|-
| Odd || 1 || 2 || Words.
|}
`

test('a fixture page: each table read, a short row and a short Special row named', () => {
  const scan = parseAllAas(PAGE)
  assert.deepEqual(scan.rows, [
    { section: 'general', name: 'One', ranks: 2, cost: '1/2', text: 'Text one.' },
    { section: 'archetype', name: 'Arch', ranks: 1, cost: '3', text: 'Text.' },
    { section: 'class', class: 'Shadow Knight', name: 'Steed', ranks: 1, cost: '5', text: 'Rides.' },
    { section: 'special', name: 'Plain', ranks: 3, cost: '', values: ['1', '2', '3'], text: 'Words.' },
    { section: 'special', name: 'With Hk', ranks: 3, cost: '', values: ['1%', '2%', '3%'], text: 'Words.', hk: 'Key: does it' },
    { section: 'special', name: 'Stray', ranks: 3, cost: '', values: ['1', '2', '3'], text: 'Bar text.' }
  ])
  assert.deepEqual(scan.skipped, ['general: Short: 3 cells, not 4', 'special: Odd: 4 cells, not 5 or 6'])
})

test('a page without the headings says which are missing', () => {
  const scan = parseAllAas('nothing here')
  assert.deepEqual(scan.rows, [])
  assert.equal(scan.skipped.length, 4)
})

test('the generated source lists one row per line with no long dash', () => {
  const rows = [{ section: 'general' as const, name: 'A "q" one', ranks: 1, cost: '1', text: "It's." }]
  const source = renderAaTable(rows)
  assert.match(source, /^\/\/ GENERATED by scripts\/gen-aa-table\.mts/)
  assert.ok(source.includes(`  ${JSON.stringify(rows[0])}\n`))
  assert.doesNotMatch(source, /[–—]/)
})
