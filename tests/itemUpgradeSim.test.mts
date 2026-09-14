// THE ITEM CARD'S SIMULATE-UPGRADE SLIDER (fork, kaltinril 2026-09-13): the Loot drill-down mounts
// the Gear toolbar's control under a wearable item's window. These pins are the three decisions the
// pure model makes for the component (renderer/features/loot/itemUpgradeSim.ts):
//   * only an item that states a slot gets the control — the Gear index's own census;
//   * the slider opens at the tier the NAME states (a ` +3` loot line is at tier 3), else base;
//   * the window is handed a state only once the reader has moved off that seed — at the seed it
//     reads as it always has, so a simulation is never on screen unasked.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseStatsBlock } from '../src/shared/itemStats'
import { scaleStatBlock } from '../src/shared/itemUpgrade'
import {
  isWearable,
  itemWindowBlock,
  sameUpgradeState,
  simulatedUpgrade,
  upgradeSeed
} from '../src/renderer/src/features/loot/itemUpgradeSim'

const WARHAMMER = `Magic Item, Lore Item, No Drop<br>
Slot: PRIMARY<br>
Class: SHM<br>
Race: ALL<br>
Skill: 1H Blunt  Atk Delay: 24<br>
DMG: 12<br>
WIS: +14  HP: +50  MANA: +50<br>
WT: 3.5  Size: LARGE<br>`

test('wearable is "states a slot": a Primary weapon yes, a slotless page no, no block no', () => {
  const worn = parseStatsBlock(WARHAMMER)
  assert.ok(worn.slot, 'the fixture states a slot line')
  assert.equal(isWearable(worn), true)
  assert.equal(isWearable(parseStatsBlock('Magic Item<br>\nWT: 0.1  Size: TINY<br>')), false, 'no Slot line')
  assert.equal(isWearable(undefined), false, 'nothing known yet - no slider, not a disabled one')
})

test('the window block: the structured lookup wins, else the raw text is parsed, else nothing', () => {
  const structured = parseStatsBlock(WARHAMMER)
  assert.equal(itemWindowBlock(structured, 'WT: 9.9'), structured)
  assert.equal(itemWindowBlock(undefined, WARHAMMER)?.dmg, 12)
  assert.equal(itemWindowBlock(undefined, undefined), undefined)
})

test('the seed is the tier the name states, else base', () => {
  assert.deepEqual(upgradeSeed('Warhammer of the Wind'), { full: 0, fraction: 0 })
  assert.deepEqual(upgradeSeed('Warhammer of the Wind +3'), { full: 3, fraction: 0 })
  assert.deepEqual(upgradeSeed('Warhammer of the Wind +10'), { full: 10, fraction: 0 })
})

test('the window is told nothing at the seed and the normalized state once moved', () => {
  const base = upgradeSeed('Warhammer of the Wind')
  assert.equal(simulatedUpgrade({ full: 0, fraction: 0 }, base), undefined, 'untouched: reads as it always has')
  assert.deepEqual(simulatedUpgrade({ full: 2, fraction: 3 }, base), { full: 2, fraction: 3 })
  assert.deepEqual(simulatedUpgrade({ full: 10, fraction: 7 }, base), { full: 10, fraction: 0 }, 'tier 10 banks nothing')
  const three = upgradeSeed('Warhammer of the Wind +3')
  assert.equal(simulatedUpgrade({ full: 3, fraction: 0 }, three), undefined, 'a +3 name at tier 3 is not a simulation')
  assert.deepEqual(simulatedUpgrade({ full: 0, fraction: 0 }, three), { full: 0, fraction: 0 }, 'dragging a +3 down to base IS one')
  assert.equal(sameUpgradeState({ full: 0, fraction: 5 }, { full: 0, fraction: 0 }), true, 'tier 0 has no fraction to differ on')
})

test('what the card will show at +10 is phase 0 arithmetic, not a restatement', () => {
  // The window calls scaleStatBlock itself; this pins the numbers the reader will see on the
  // fixture so a change to the calculator shows up here beside the slider that exposes it.
  const at10 = scaleStatBlock(parseStatsBlock(WARHAMMER), { full: 10, fraction: 0 })
  assert.equal(at10.dmg, 24, 'DMG 12 + floor(12 * 10 / 10)')
  assert.equal(at10.atkDelay, 24, 'delay never scales - that is why the ratio improves')
  assert.equal(at10.stats.find((s) => s.key === 'WIS')?.value, '+28', 'floor(14 + round(14 * 10 / 10))')
  assert.equal(at10.stats.find((s) => s.key === 'HP')?.value, '+100')
})
