// AN ITEM NOTHING STATES AN ERA FOR IS SHOWN, WEARING "Unknown Era" (owner ruling, 2026-11-20).
//
// The report: the Exaltations list showed 9 Mana Preservation donors of the 11 the data holds. The
// two it lacked, Mane Attraction and Testament of Vanear, are quest rewards: no dropper, no era
// banner on the page. Under the 2026-08-13 rule "we cannot say" was hidden like "no" while the
// Current era filter is on, and nothing on screen said a row was being held back. The owner: "lets
// not hide it but put a chip showing Unknown Era", then "lets show items that we can't figure out
// the era".
//
// Asked through the two functions every surface calls (`eraHides`, `eraChip`), over the committed
// corpus: the Exaltations donors and the Gear rows. A positive out-of-era still hides.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildPlannerIndex } from '../src/main/planner/effectIndex'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import { UNKNOWN_ERA_LABEL, donorEra, eraChip, eraHides } from '../src/renderer/src/features/planner/plannerData'

const file = itemsJson as unknown as ItemDbFile
const donors = buildPlannerIndex(file).donors
const gear = buildGearIndex(file).rows

test('the owner`s list: all 11 Mana Preservation donors show with the filter on', () => {
  const family = donors.filter((d) => d.family === 'Mana Preservation')
  assert.equal(family.length, 11, family.map((d) => d.name).join(', '))
  const shown = family.filter((d) => !eraHides(d, true))
  assert.equal(shown.length, 11, 'the Current era filter still holds a Mana Preservation donor back')
  // The two that were hidden are quest rewards with no dropper and no banner. Since the donor index
  // carries layer 3 (tests/eraEvidenceShared.test.mts) each is IN era by its quest's starting zone,
  // so neither wears a chip. An item nothing at all states an era for is the next test's subject.
  for (const name of ['Mane Attraction', 'Testament of Vanear']) {
    const row = family.find((d) => d.name === name)
    assert.ok(row, `${name} left the donor index`)
    assert.equal(row.eraTag, undefined, `${name} carries a banner now: pick another subject`)
    assert.equal(donorEra(row).verdict, 'in-era', name)
    assert.equal(eraChip(row), null, name)
  }
  assert.equal(UNKNOWN_ERA_LABEL, 'Unknown Era')
})

test('over the corpus: unknown is never hidden, out-of-era always is, and in-era wears no chip', () => {
  const counts = { donors: { unknown: 0, out: 0, in: 0 }, gear: { unknown: 0, out: 0, in: 0 } }
  for (const [name, rows] of [['donors', donors], ['gear', gear]] as const) {
    for (const row of rows) {
      const verdict = donorEra(row).verdict
      if (verdict === 'unknown') {
        counts[name].unknown++
        assert.equal(eraHides(row, true), false, `${row.name} has no stated era and is hidden`)
        assert.equal(eraChip(row)?.label, UNKNOWN_ERA_LABEL, row.name)
      } else if (verdict === 'out-of-era') {
        counts[name].out++
        assert.equal(eraHides(row, true), true, `${row.name} is out of era and still shown`)
      } else {
        counts[name].in++
        assert.equal(eraHides(row, true), false, row.name)
        assert.equal(eraChip(row), null, row.name)
      }
      // The filter switched off hides nothing, whatever the verdict.
      assert.equal(eraHides(row, false), false, row.name)
    }
  }
  // Each state is still populated: a corpus where one of them emptied is a changed join, and this
  // test would then be checking nothing for it. The numbers are printed for the record.
  console.log(`era verdicts - donors: ${JSON.stringify(counts.donors)}; gear: ${JSON.stringify(counts.gear)}`)
  for (const name of ['donors', 'gear'] as const) {
    assert.ok(counts[name].unknown > 0 && counts[name].out > 0 && counts[name].in > 0, JSON.stringify(counts[name]))
  }
})
