// The macro editor's spell lookup (fork #11): ids read from field 0 of hand-written spells_us rows,
// and the `/memspellslot` line named, completed and filled.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertSpellId, memSpellHint, memSpellIds, memSpellOf } from '../src/shared/macros/memSpell'
import { parseSpellLine, readSpellIdAsk, readSpellRows, searchSpells } from '../src/shared/macros/spellIds'

/** A row of the file: id, name, filler to field 36, the sixteen class levels, then more columns. */
function row(id: number, name: string, levels: Record<number, number> = {}): string {
  const classes = Array.from({ length: 16 }, (_, i) => String(levels[i] ?? 255))
  return [String(id), name, ...Array.from({ length: 34 }, () => '0'), ...classes, ...Array.from({ length: 140 }, () => '7')].join('^')
}

const FILE = [
  row(13, 'Complete Heal', { 1: 39 }),
  row(900, 'Complete Heal'),
  row(4001, 'Scorching Arrow I', { 3: 10 }),
  row(4002, 'Scorching Arrow II', { 3: 20, 11: 22 }),
  row(5000, 'Heroic Leap', { 0: 254 }),
  row(6000, "Aanya's Quickening", { 13: 53 })
].join('\r\n')

const index = readSpellRows(FILE, 0, 100).rows

test('the id is field 0, every rank keeps its own, and only what a class can scribe is listed', () => {
  assert.deepEqual(index.map((r) => [r.id, r.name, r.classes]), [
    [13, 'Complete Heal', 'CLR 39'],
    [4001, 'Scorching Arrow I', 'RNG 10'],
    [4002, 'Scorching Arrow II', 'RNG 20, WIZ 22'],
    [6000, "Aanya's Quickening", 'ENC 53']
  ])
  assert.equal(parseSpellLine('not a row'), null)
  assert.equal(parseSpellLine('x^Name^1'), null)
})

test('the file can be read in runs', () => {
  const first = readSpellRows(FILE, 0, 2)
  assert.equal(first.rows.length, 1)
  assert.ok(first.next !== null)
  const rest = readSpellRows(FILE, first.next, 100)
  assert.equal(rest.next, null)
  assert.equal(first.rows.length + rest.rows.length, index.length)
})

test('search: every word, apostrophes folded, closest first, and an id finds its spell', () => {
  assert.deepEqual(searchSpells(index, 'arrow scorching').map((r) => r.id), [4001, 4002])
  assert.deepEqual(searchSpells(index, 'aanyas').map((r) => r.id), [6000])
  assert.deepEqual(searchSpells(index, 'scorching arrow ii').map((r) => r.id), [4002])
  assert.deepEqual(searchSpells(index, '13').map((r) => r.id), [13])
  assert.deepEqual(searchSpells(index, '   '), [])
  assert.equal(searchSpells(index, 'a', 2).length, 2)
})

test('what the renderer asks is bounded', () => {
  assert.deepEqual(readSpellIdAsk(null), { text: '', ids: [] })
  assert.deepEqual(readSpellIdAsk({ text: 5, ids: [1, 'x', 2.5] }), { text: '', ids: [1] })
  assert.equal(readSpellIdAsk({ text: 'x'.repeat(100), ids: [] }).text.length, 64)
  assert.equal(readSpellIdAsk({ text: '', ids: Array.from({ length: 50 }, (_, i) => i) }).ids.length, 20)
})

test('the /memspellslot line is read in the reporter form only', () => {
  assert.deepEqual(memSpellOf('/memspellslot 1, 4002'), { gem: 1, id: 4002 })
  assert.deepEqual(memSpellOf('  /MemSpellSlot 8,13 '), { gem: 8, id: 13 })
  assert.equal(memSpellOf('/memspellslot 1,'), null)
  assert.equal(memSpellOf('/memspell 1, 13'), null)
  assert.equal(memSpellOf('/pause 5, /memspellslot 1, 13'), null)
  assert.deepEqual(memSpellIds(['/memspellslot 1, 13', '/sit', '/memspellslot 2, 13', '/memspellslot 3, 7']), [13, 7])
})

test('the hint names the spell, says when an id is unknown, and when it cannot tell', () => {
  const ready = { state: 'ready', names: { '13': 'Complete Heal' } } as const
  assert.deepEqual(memSpellHint('/memspellslot 1, 13', ready), { warning: false, text: 'Memorizes Complete Heal in gem 1.' })
  assert.deepEqual(memSpellHint('/memspellslot 1, 99', ready), { warning: true, text: 'No player spell has id 99.' })
  assert.equal(memSpellHint('/sit', ready), null)
  assert.equal(memSpellHint('/memspellslot 1, 13', { state: 'loading', names: {} })?.text, 'Looking up the spell.')
  assert.equal(memSpellHint('/memspellslot 1, 13', { state: 'no-file', names: {} })?.text, 'Spell file not found, so this id is not checked.')
})

test('a found id completes an unfinished line, or goes in at the cursor', () => {
  assert.deepEqual(insertSpellId('/memspellslot 1,', { start: 3, end: 3 }, 13), { line: '/memspellslot 1, 13', cursor: 19 })
  assert.deepEqual(insertSpellId('/memspellslot 2, ', { start: 0, end: 0 }, 13), { line: '/memspellslot 2, 13', cursor: 19 })
  assert.deepEqual(insertSpellId('/cast  now', { start: 6, end: 6 }, 13), { line: '/cast 13 now', cursor: 8 })
  assert.deepEqual(insertSpellId('/cast 99', { start: 6, end: 8 }, 13), { line: '/cast 13', cursor: 8 })
  assert.deepEqual(insertSpellId('ab', { start: 50, end: 60 }, 7), { line: 'ab7', cursor: 3 })
})
