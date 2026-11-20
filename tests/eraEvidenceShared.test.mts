// ONE ITEM, ONE ERA VERDICT, ON EVERY LIST (owner, 2026-11-20).
//
// The Gear tab called Mane Attraction in era (it is only awarded by a quest that starts in Greater
// Faydark) while the Exaltations list called the same item "era unknown" and its era filter hid it.
// Each index wrote its own era fields, and only the Gear index attached layer 3. Both now take them
// from one builder, `main/planner/eraEvidence.ts`.
//
// The property is checked over the whole committed corpus, through the function every surface asks
// (`plannerData.donorEra`): for every item that has both a Gear row and an Exaltation donor row, the
// two rows state the same evidence and get the same verdict.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildPlannerIndex } from '../src/main/planner/effectIndex'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import { buildEraDerivations } from '../src/main/planner/eraDerive'
import { eraEvidenceOf } from '../src/main/planner/eraEvidence'
import { donorEra, eraChip, eraHides } from '../src/renderer/src/features/planner/plannerData'

const file = itemsJson as unknown as ItemDbFile
const derivations = buildEraDerivations(file)
const donors = buildPlannerIndex(file, undefined, undefined, derivations).donors
const gear = buildGearIndex(file).rows
const gearByKey = new Map(gear.map((r) => [r.key, r]))

test('the builder: a banner and a derivation are stated when the corpus has them, and only then', () => {
  const edge = { basis: 'quest', verdict: 'in-era', target: 'Rain Caller Quest', detail: 'Greater Faydark' } as const
  const map = new Map([['mane attraction', edge]])
  assert.deepEqual(eraEvidenceOf('Mane Attraction', undefined, map), { eraDerived: edge })
  assert.deepEqual(eraEvidenceOf('Mane Attraction', 'Classic', map), { eraTag: 'Classic', eraDerived: edge })
  assert.deepEqual(eraEvidenceOf('Cloak of Flames', 'Classic', map), { eraTag: 'Classic' })
  // Absent means absent: no key at all, so a row never carries `eraTag: undefined`.
  assert.deepEqual(Object.keys(eraEvidenceOf('Cloak of Flames', undefined, map)), [])
  // Looked up by the PAGE's key, tier suffix and case folded as every item key is.
  assert.deepEqual(eraEvidenceOf('MANE ATTRACTION +3', undefined, map), { eraDerived: edge })
})

test('the owner`s item: Mane Attraction is in era on the Exaltations list, for the reason the Gear tab gives', () => {
  const donor = donors.find((d) => d.name === 'Mane Attraction')
  const row = gearByKey.get('mane attraction')
  assert.ok(donor && row, 'Mane Attraction left an index')
  // Until 2026-11-20 the evidence was layer 3 alone (its quest starts in Greater Faydark). The owner
  // then put the Classic banner on the page, and the delta of that day brought it in: the banner is
  // the evidence now. Either way both lists state the same thing.
  assert.equal(donor.eraTag, row.eraTag)
  assert.deepEqual(donor.eraDerived, row.eraDerived)
  assert.ok(donor.eraTag !== undefined || donor.eraDerived !== undefined, 'Mane Attraction states no era evidence at all')
  assert.equal(donorEra(donor).verdict, 'in-era')
  assert.equal(eraHides(donor, true), false)
  // In era needs no chip.
  assert.equal(eraChip(donor), null)
})

test('every item on both lists carries the same era evidence and gets the same verdict', () => {
  let both = 0
  let derived = 0
  for (const donor of donors) {
    const row = gearByKey.get(donor.key)
    if (row === undefined) continue
    both++
    assert.equal(donor.eraTag, row.eraTag, `${donor.name}: the banner differs between the lists`)
    assert.deepEqual(donor.eraDerived, row.eraDerived, `${donor.name}: layer 3 differs between the lists`)
    assert.equal(donorEra(donor).verdict, donorEra(row).verdict, `${donor.name}: two verdicts for one item`)
    if (donor.eraDerived !== undefined) derived++
  }
  assert.ok(both >= 1000, `only ${String(both)} items are on both lists`)
  assert.ok(derived >= 100, `only ${String(derived)} donors carry a derivation: layer 3 is not reaching the list`)
  console.log(`items on both lists: ${String(both)}; donors carrying a derivation: ${String(derived)} of ${String(donors.length)}`)
})

test('a donor with no Gear row still takes layer 3: the derivation is by page, not by list', () => {
  const lone = donors.filter((d) => !gearByKey.has(d.key) && d.eraDerived !== undefined)
  console.log(`donors with no Gear row that carry a derivation: ${String(lone.length)}`)
  for (const d of lone) assert.ok(['in-era', 'out-of-era'].includes(d.eraDerived?.verdict ?? ''), d.name)
})
