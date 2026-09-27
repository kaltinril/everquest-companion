// ELEMENTAL DAMAGE IS ITS OWN LINE (src/shared/itemStats.ts `ELEMENTAL_DMG_KEYS`).
//
// Owner report, 2026-09-26: the Mithril Champion Arrows +7 he held read Base Dmg 18, Fire Dmg 3,
// and the app predicted the +7 at 5. The wiki page is right (`DMG: 11 Fire DMG: 3`); the parser had
// no key for the second fact, so the bare `DMG` matched twice and the 3 overwrote the 11.
//
// Two halves, because there are two places the wrong number lived: the PARSER, for every page read
// from now on, and the STORED parse in the committed corpus, which is repaired at load because a
// scrape rewrites that file wholesale and nothing concluded here may live in it.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { knowledgeFromDb, type ItemDbFile } from '../src/main/itemsDb'
import { parseStatsBlock, repairElementalDamage } from '../src/shared/itemStats'
import { scaleStatBlock } from '../src/shared/itemUpgrade'
import itemsJson from '../src/main/data/items.json'

const db = itemsJson as unknown as ItemDbFile

/** The page as the wiki states it, both facts on one line. */
const ARROWS =
  'Slot: AMMO\n\nSkill: Archery Atk Delay: 0\n\nDMG: 11 Fire DMG: 3\n\nWT: 0.1 Range: 150 Size: SMALL\n\nClass: WAR PAL RNG SHD\n\nRace: ALL'

test('the weapon damage and the elemental damage are two facts', () => {
  const block = parseStatsBlock(ARROWS)
  assert.equal(block.dmg, 11)
  assert.deepEqual(block.stats, [{ key: 'FIRE DMG', value: '3' }])
  // …whether the page put them on one line or two, and whichever element it is.
  const split = parseStatsBlock('Slot: AMMO\n\nDMG: 11\n\nCold DMG: 3\n\nWT: 0.1 Range: 150 Size: SMALL')
  assert.equal(split.dmg, 11)
  assert.deepEqual(split.stats, [{ key: 'COLD DMG', value: '3' }])
  assert.equal(parseStatsBlock('DMG: 5 Poison DMG: 1 Atk Delay: 20').dmg, 5)
})

test('THE OWNER`S ARROWS: the +7 is the one he holds', () => {
  const at7 = scaleStatBlock(parseStatsBlock(ARROWS), { full: 7, fraction: 0 })
  // In game: Base Dmg 18, Fire Dmg 3. An upgrade moves the weapon damage and not the element.
  assert.equal(at7.dmg, 18)
  assert.deepEqual(at7.stats, [{ key: 'FIRE DMG', value: '3' }])
})

test('a stored parse is repaired against its own block, and only when the block states an element', () => {
  const stale = { ...parseStatsBlock(ARROWS), dmg: 3, stats: [] }
  const repaired = repairElementalDamage(stale, ARROWS)
  assert.equal(repaired.dmg, 11)
  assert.deepEqual(repaired.stats, [{ key: 'FIRE DMG', value: '3' }])
  // Repairing twice adds nothing twice.
  assert.deepEqual(repairElementalDamage(repaired, ARROWS), repaired)
  // A row with no elemental line comes back as the SAME object: untouched, and never re-parsed.
  const plain = parseStatsBlock('DMG: 30 Dmg Bon: 24 Atk Delay: 40')
  assert.equal(repairElementalDamage(plain, 'DMG: 30 Dmg Bon: 24 Atk Delay: 40'), plain)
  assert.equal(repairElementalDamage(plain, undefined), plain)
})

test('CENSUS: every committed row that states an element serves the damage its own block states', () => {
  const element = /\b(Fire|Cold|Poison|Magic|Disease) DMG\s*:\s*(\d+)/i
  const weapon = /(?:^|\s)DMG\s*:\s*(\d+)/
  let seen = 0
  for (const entry of Object.values(db.items)) {
    const block = entry.statsBlock ?? ''
    const stated = element.exec(block)
    if (stated === null) continue
    seen++
    const served = knowledgeFromDb(entry).stats
    const base = weapon.exec(block.replace(element, ''))
    assert.equal(served?.dmg, base === null ? undefined : Number(base[1]), `${entry.page}: weapon damage`)
    const key = `${stated[1].toUpperCase()} DMG`
    assert.deepEqual(
      served?.stats.filter((s) => s.key === key),
      [{ key, value: stated[2] }],
      `${entry.page}: ${key}`
    )
  }
  // A floor, not a frozen count: the corpus grows, and a fold that stops finding them must go red.
  assert.ok(seen >= 6, `only ${String(seen)} rows state an elemental damage line`)
})
