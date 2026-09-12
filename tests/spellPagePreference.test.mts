// TWO WIKI PAGES UNDER ONE NAME, AND THE ONE EQ LEGENDS RUNS WINS (owner report 2026-09-12:
// the spellbook "showing 2 of the same spell").
//
// `src/main/data/spellPagePreference.ts` carries the rule and its evidence; this suite pins the
// six names the committed corpus contests, that the survivor is the page with the `(Autogranted)`
// note, and that the survivor's numbers are the ones the owner's client states (spells_us.txt,
// 2026-09-12) — read here as literals so the suite needs no install.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLegendsPagePreference, spellPagePreferenceReport } from '../src/main/data/spellPagePreference.ts'
import { loadSpellDb } from '../src/main/data/spellDb.ts'
import type { SpellDbFile, SpellEntry } from '../src/shared/types.ts'
import spellsJson from '../src/main/data/spells.json' with { type: 'json' }

const RAW = (spellsJson as SpellDbFile).spells
const NOTE = /\(Autogranted\)/

const CONTESTED = ['Anthem De Arms', 'Burst of Flame', 'Greater Healing', 'Healing', "O'Keils Radiation", 'Shock of Frost']

test('the committed corpus contests exactly these six names, each a classic page beside a Legends page', () => {
  const { report } = applyLegendsPagePreference(RAW)
  assert.deepEqual([...report.names].sort(), CONTESTED)
  assert.equal(report.dropped, 6, 'one classic row per name')
  for (const n of CONTESTED) {
    const rows = RAW.filter((s) => s.name === n)
    assert.equal(rows.length, 2, `${n}: two pages in the scrape`)
    assert.equal(rows.filter((s) => NOTE.test(s.classes ?? '')).length, 1, `${n}: one of them autogranted`)
  }
})

test('the effective DB holds one row per contested name, and it is the autogranted page', () => {
  const effective = loadSpellDb().spells
  for (const n of CONTESTED) {
    const rows = effective.filter((s) => s.name === n)
    assert.equal(rows.length, 1, `${n}: one row after the load`)
    assert.ok(NOTE.test(rows[0].classes ?? ''), `${n}: the survivor carries the note`)
  }
  loadSpellDb()
  assert.deepEqual(spellPagePreferenceReport()?.names.slice().sort(), CONTESTED)
})

test("the survivor's numbers are the client's, where the client has the row", () => {
  // spells_us.txt (owner's install, 2026-09-12): Burst of Flame id 93 mana 4 cast 1500; Greater
  // Healing id 15 mana 115 cast 3000; Healing id 12 mana 65 cast 2500. The dropped pages said
  // 7 mana, 150 mana / 750 cast, and "* None" at 0 mana respectively.
  const by = new Map(loadSpellDb().spells.map((s) => [s.name, s]))
  const fig = (s: SpellEntry | undefined): [number | undefined, number | undefined] => [s?.mana, s?.castTimeMs]
  assert.deepEqual(fig(by.get('Burst of Flame')), [4, 1500])
  assert.deepEqual(fig(by.get('Greater Healing')), [115, 3000])
  assert.deepEqual(fig(by.get('Healing')), [65, 2500])
})

test('a name whose rows all carry the note, or none of them, is untouched', () => {
  const rows: SpellEntry[] = [
    { name: 'Twin', classes: '* Wizard - Level 1 (Autogranted)' } as SpellEntry,
    { name: 'Twin', classes: '* Wizard - Level 9 (Autogranted)' } as SpellEntry,
    { name: 'Era', classes: '* Wizard - Level 1' } as SpellEntry,
    { name: 'Era', classes: '* Wizard - Level 4' } as SpellEntry,
    { name: 'Lone', classes: '* Wizard - Level 2' } as SpellEntry,
    { name: 'Bare' } as SpellEntry
  ]
  const { spells, report } = applyLegendsPagePreference(rows)
  assert.equal(spells.length, 6)
  assert.deepEqual(report, { dropped: 0, names: [] })
})
