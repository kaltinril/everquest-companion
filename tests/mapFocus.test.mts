// The Maps tab opened at a mob's pin (src/renderer/src/features/maps/mapFocus.ts): the one-shot
// ask, when "Show on map" is offered at all (only where the Maps tab would draw the mob's pin),
// and which sidebar row an ask means once its zone is drawn. Then the recipe guide's merchants
// against the committed mob catalog, counted as a floor.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import guidesJson from '../src/main/data/tradeskillGuides.json' with { type: 'json' }
import { focusRow, parkMapFocus, pinTarget, resetMapFocus, takeMapFocus } from '../src/renderer/src/features/maps/mapFocus'
import { mobRows } from '../src/renderer/src/features/maps/mobPins'
import { zoneLabel } from '../src/renderer/src/features/maps/zoneOptions'
import { MOB_CATALOG } from '../src/renderer/src/features/mobs/mobSearch'
import type { TradeskillGuidesFile } from '../src/shared/guideData'
import { merchantEntry, merchantIndex } from '../src/shared/tradeskillMerchant'
import type { MobEntry } from '../src/shared/types'
import { zoneShortNameFromCatalog } from '../src/shared/zones'
import { assertCorpusFloor } from './corpusFloor.mts'

const mob = (page: string, over: Partial<MobEntry> = {}): MobEntry => ({ page, name: page, zones: ['North Freeport'], loc: [{ ns: -176, ew: 207 }], ...over })

// ---- the one-shot ask --------------------------------------------------------------------------

test('an ask is handed over once, and the newest replaces one nobody took', () => {
  resetMapFocus()
  assert.equal(takeMapFocus(), null)
  parkMapFocus({ zone: 'freportn', page: 'Amber (Merchant)' })
  parkMapFocus({ zone: 'halas', page: 'Spirita' })
  assert.deepEqual(takeMapFocus(), { zone: 'halas', page: 'Spirita' })
  assert.equal(takeMapFocus(), null)
})

// ---- when the link is offered ------------------------------------------------------------------

test('Show on map is offered only where the Maps tab would pin the mob', () => {
  const stem = zoneShortNameFromCatalog('North Freeport')
  assert.ok(stem, 'the zone table knows North Freeport')
  const amber = mob('Amber (Merchant)', { name: 'Amber' })
  assert.deepEqual(pinTarget(amber, 'North Freeport', true), { zone: stem, page: 'Amber (Merchant)' })
  // No stated position: the mob is listed with no pin, so no link.
  assert.equal(pinTarget(mob('Nowhere', { loc: undefined }), 'North Freeport', true), null)
  // A page naming several zones cannot place its numbers on one map (mobPins' rule).
  assert.equal(pinTarget(mob('Wanderer', { zones: ['North Freeport', 'East Freeport'] }), 'North Freeport', true), null)
  // The stated zone resolves but is not the mob's: that map holds no such pin.
  assert.equal(pinTarget(amber, 'Halas', true), null)
  // A common spawn is not on the map's list.
  assert.equal(pinTarget(mob('a merchant', { name: 'a merchant' }), 'North Freeport', true), null)
  // Out of era under the Maps tab's switch: not listed, so no link; with the switch off it is.
  const late = mob('Late Merchant', { outOfEra: true })
  assert.equal(pinTarget(late, 'North Freeport', true), null)
  assert.deepEqual(pinTarget(late, 'North Freeport', false), { zone: stem, page: 'Late Merchant' })
})

test('a stated zone the table cannot place falls back to the one zone the mob\'s own page names', () => {
  const amber = mob('Amber (Merchant)', { name: 'Amber' })
  const stem = zoneShortNameFromCatalog('North Freeport')
  assert.equal(zoneShortNameFromCatalog('N. Free'), null)
  assert.deepEqual(pinTarget(amber, 'N. Free', true), { zone: stem, page: 'Amber (Merchant)' })
  assert.deepEqual(pinTarget(amber, undefined, true), { zone: stem, page: 'Amber (Merchant)' })
  // Neither resolves: nothing.
  assert.equal(pinTarget(mob('Lost', { zones: ['Nowhere At All'] }), 'N. Free', true), null)
  assert.equal(pinTarget(mob('Lost', { zones: undefined }), undefined, true), null)
})

// ---- the row an ask means ----------------------------------------------------------------------

test('the ask rings its row only on the asked zone\'s map, and only a row with a pin', () => {
  const stem = zoneShortNameFromCatalog('North Freeport')
  assert.ok(stem)
  const rows = mobRows(zoneLabel(stem), [mob('Amber (Merchant)', { name: 'Amber' }), mob('Nowhere', { loc: undefined })])
  const focus = { zone: stem, page: 'Amber (Merchant)' }
  assert.equal(focusRow(focus, stem, rows)?.id, 'Amber (Merchant)')
  // Another map is still on screen, or none is: wait.
  assert.equal(focusRow(focus, 'halas', rows), null)
  assert.equal(focusRow(focus, undefined, rows), null)
  // The list no longer holds the row, or the row states no position: nothing to ring.
  assert.equal(focusRow(focus, stem, []), null)
  assert.equal(focusRow({ zone: stem, page: 'Nowhere' }, stem, rows), null)
})

// ---- the committed data ------------------------------------------------------------------------

test('COMMITTED DATA: most of the recipe guide\'s merchants get a pin on the Maps tab', () => {
  const guides = guidesJson as unknown as TradeskillGuidesFile
  const index = merchantIndex(MOB_CATALOG)
  const merchants = new Map<string, { merchant: string; zone?: string }>()
  const materials = Object.values(guides.recipes.tradeskills).flatMap((list) => list.recipes.flatMap((recipe) => recipe.materials))
  for (const material of materials) {
    if (material.merchant === undefined) continue
    merchants.set(`${material.merchant}|${material.zone ?? ''}`, { merchant: material.merchant, ...(material.zone === undefined ? {} : { zone: material.zone }) })
  }
  let pinned = 0
  let byStatedZone = 0
  for (const { merchant, zone } of merchants.values()) {
    const entry = merchantEntry(index, merchant, zone)
    const target = entry === null ? null : pinTarget(entry, zone, true)
    if (target === null) continue
    pinned += 1
    if (zone !== undefined && zoneShortNameFromCatalog(zone) === target.zone) byStatedZone += 1
  }
  console.log(`      guide merchants: ${String(merchants.size)}, with a pin: ${String(pinned)} (${String(byStatedZone)} by the guide's own zone)`)
  // Measured 2026-11-20: 27 merchants, 24 with a pin, 21 of them through the zone the guide states.
  assertCorpusFloor(pinned, 24, 'guide merchants with a pin')
  assertCorpusFloor(byStatedZone, 21, "guide merchants pinned in the guide's own zone")
})
