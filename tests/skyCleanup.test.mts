// The Cleanup tab's own rule, without a browser: which held items are listed, what each row says
// about the turn-ins it feeds, the order, the adapter the tab calls, the dump's places, the words.
//
// The rule under a hand-stated count is next door (tests/skyCleanupOverride.test.mts). Here the
// held counts are handed over directly, because the rule does not care where a count came from.
//
// Hand-built quests throughout: the claims are arithmetic, and a re-scrape must not move them.
// The dump cases are SYNTHETIC, as in tests/carryAll.test.mts: no real dump carries hoard rows.
//
// Run: `node --import tsx --test tests/skyCleanup.test.mts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInventoryDump } from '../src/main/outputs/inventoryParse'
import { carryAll } from '../src/shared/carryAll'
import type { QuestProgress } from '../src/renderer/src/features/posky/useProgress'
import { itemCountKey } from '../src/renderer/src/lib/itemName'
import {
  CLEANUP_CAVEAT,
  cleanupRows,
  cleanupRowsFor,
  decisionLine,
  dumpLocationsFrom,
  locationsLine,
  placeLabel,
  rewardTierLine,
  setsLine,
  timesLine,
  turnInHeading,
  type CleanupQuest
} from '../src/renderer/src/features/posky/cleanup'

/** One drop, one rune, one reward. */
const AZARACK: CleanupQuest = {
  key: 'Beastlord::Beastlord Test of Azarack',
  className: 'Beastlord',
  name: 'Beastlord Test of Azarack',
  giver: 'Animist Kratho',
  reward: 'Azarack Skin Wristwraps',
  items: [
    { name: 'Azarack Skin', count: 1 },
    { name: 'Wind Rune Heda', count: 1 }
  ]
}

/** Two quests that name the same drop. */
const CLAW_BEAST: CleanupQuest = {
  key: 'Beastlord::Test of Claw',
  className: 'Beastlord',
  name: 'Test of Claw',
  giver: 'Animist Kratho',
  reward: 'Claw Wristwraps',
  items: [{ name: 'Sphinx Claw', count: 1 }]
}
const CLAW_PALADIN: CleanupQuest = {
  key: 'Paladin::Test of Love',
  className: 'Paladin',
  name: 'Test of Love',
  giver: 'Priest of Marr',
  reward: 'Symbol of Love',
  items: [{ name: 'Sphinx Claw', count: 1 }]
}

/** A quest that eats five of one item per turn-in. */
const FIVE: CleanupQuest = {
  key: 'Monk::Test of Wu',
  className: 'Monk',
  name: 'Test of Wu',
  giver: 'Master Wu',
  reward: 'Wu Fighting Belt',
  items: [{ name: 'Sphinx Claw', count: 5 }]
}

// ---- the rule: every quest that names the item has been turned in ------------------------

test('a shared item is not listed while another quest that needs it has never been turned in', () => {
  const held = { 'sphinx claw': 3 }
  const quests = [CLAW_BEAST, CLAW_PALADIN]
  assert.deepEqual(cleanupRows(quests, { [CLAW_BEAST.key]: 1, [CLAW_PALADIN.key]: 0 }, held), [])
  // A quest the turn-in counts never mention is one that was never turned in.
  assert.deepEqual(cleanupRows(quests, { [CLAW_BEAST.key]: 4 }, held), [])

  // The same holdings are listed the moment the last quest is turned in.
  const spare = cleanupRows(quests, { [CLAW_BEAST.key]: 1, [CLAW_PALADIN.key]: 2 }, held)
  assert.equal(spare.length, 1)
  assert.equal(spare[0].key, itemCountKey('Sphinx Claw'))
  assert.equal(spare[0].name, 'Sphinx Claw')
  assert.equal(spare[0].quantity, 3)
  assert.deepEqual(
    spare[0].turnIns.map((t) => [t.name, t.times]),
    [
      ['Test of Claw', 1],
      ['Test of Love', 2]
    ]
  )
})

test('a rune every Test shares stays off the list until every Test that names it is turned in', () => {
  const rows = cleanupRows(
    [AZARACK, { ...CLAW_BEAST, items: [{ name: 'Wind Rune Heda', count: 1 }] }],
    { [AZARACK.key]: 3, [CLAW_BEAST.key]: 0 },
    { 'azarack skin': 2, 'wind rune heda': 9 }
  )
  assert.deepEqual(rows.map((r) => r.name), ['Azarack Skin'])
})

test('an item you hold none of draws no row', () => {
  const progress = { [AZARACK.key]: 1 }
  assert.equal(cleanupRows([AZARACK], progress, { 'azarack skin': 2 }).length, 1)
  assert.deepEqual(cleanupRows([AZARACK], progress, { 'azarack skin': 0 }), [])
  assert.deepEqual(cleanupRows([AZARACK], progress, {}), [])
})

// ---- what a row says about another turn-in -----------------------------------------------

test('a full set left after two turn-ins says keep, and how many more', () => {
  const rows = cleanupRows([AZARACK], { [AZARACK.key]: 2 }, { 'azarack skin': 3, 'wind rune heda': 1 })
  assert.deepEqual(rows.map((r) => r.name), ['Azarack Skin', 'Wind Rune Heda'])
  const [t] = rows[0].turnIns
  assert.equal(t.times, 2)
  assert.equal(t.sets, 1, 'three skins and one rune is one more turn-in')
  assert.equal(turnInHeading(t), 'Animist Kratho - Beastlord Test of Azarack (Beastlord)')
  assert.equal(timesLine(t), 'turned in 2 times')
  assert.equal(
    decisionLine(t),
    'keep them: turning in again gives another Azarack Skin Wristwraps, two Azarack Skin Wristwraps merge into +1'
  )
  assert.equal(setsLine(t), 'you hold enough for 1 more turn-in')
})

test('the sets are the least over the required items, so a missing rune is no set', () => {
  const [t] = cleanupRows([AZARACK], { [AZARACK.key]: 1 }, { 'azarack skin': 4 })[0].turnIns
  assert.equal(t.sets, 0)
  assert.equal(setsLine(t), null)
  assert.equal(t.have, 1, 'each item counts up to its own need, so four skins count as one')
  assert.equal(t.need, 2)
  assert.equal(decisionLine(t), 'you hold 1 of the 2 needed for another turn-in')
})

test('a quest that eats five per turn-in needs ten for two more', () => {
  const turnInAt = (held: number) => cleanupRows([FIVE], { [FIVE.key]: 1 }, { 'sphinx claw': held })[0].turnIns[0]
  const ten = turnInAt(10)
  assert.equal(ten.sets, 2)
  assert.equal(setsLine(ten), 'you hold enough for 2 more turn-ins')
  assert.equal(timesLine(ten), 'turned in 1 time')
  assert.ok(decisionLine(ten).startsWith('keep them: turning in again gives another Wu Fighting Belt'))

  const seven = turnInAt(7)
  assert.deepEqual([seven.sets, seven.have, seven.need], [1, 5, 5])

  const three = turnInAt(3)
  assert.deepEqual([three.sets, three.have, three.need], [0, 3, 5])
  assert.equal(setsLine(three), null)
  assert.equal(decisionLine(three), 'you hold 3 of the 5 needed for another turn-in')
})

test('a quest that lists one item twice wants the sum, and a count of 0 is read as one', () => {
  const twice: CleanupQuest = {
    key: 'Ranger::Test of Bark',
    className: 'Ranger',
    name: 'Test of Bark',
    items: [
      { name: 'Treant Bark', count: 1 },
      { name: 'Treant Bark +1', count: 2 }
    ]
  }
  const [row] = cleanupRows([twice], { [twice.key]: 1 }, { 'treant bark': 6 })
  assert.equal(row.name, 'Treant Bark')
  assert.deepEqual([row.turnIns[0].sets, row.turnIns[0].need], [2, 3])

  const unstated: CleanupQuest = { ...twice, items: [{ name: 'Treant Bark', count: 0 }] }
  const [t] = cleanupRows([unstated], { [twice.key]: 1 }, { 'treant bark': 2 })[0].turnIns
  assert.deepEqual([t.sets, t.need], [2, 1])
})

test('a quest with no reward and no giver still argues to keep, without naming a prize', () => {
  const bare: CleanupQuest = {
    key: 'Rogue::Test of Shadow',
    className: 'Rogue',
    name: 'Test of Shadow',
    items: [{ name: 'Shadow Silk', count: 1 }]
  }
  const [t] = cleanupRows([bare], { [bare.key]: 1 }, { 'shadow silk': 2 })[0].turnIns
  assert.equal(turnInHeading(t), 'Test of Shadow (Rogue)')
  assert.equal(decisionLine(t), 'keep them: you are holding enough for another turn-in')
})

// ---- the order ---------------------------------------------------------------------------

test('the biggest stack is first, and equal stacks are in name order', () => {
  const rows = cleanupRows(
    [CLAW_BEAST, AZARACK, { ...CLAW_PALADIN, items: [{ name: 'Zebuxoruk Feather', count: 1 }] }],
    { [CLAW_BEAST.key]: 1, [AZARACK.key]: 1, [CLAW_PALADIN.key]: 1 },
    { 'sphinx claw': 2, 'azarack skin': 9, 'zebuxoruk feather': 2, 'wind rune heda': 0 }
  )
  assert.deepEqual(rows.map((r) => [r.name, r.quantity]), [
    ['Azarack Skin', 9],
    ['Sphinx Claw', 2],
    ['Zebuxoruk Feather', 2]
  ])
})

test('on one row the turn-in closest to another run is first, then class, then quest name', () => {
  const quest = (className: string, name: string, count: number): CleanupQuest => ({
    key: `${className}::${name}`,
    className,
    name,
    items: [{ name: 'Sphinx Claw', count }]
  })
  // Listed in an order that is none of the sorted ones. Held 4: a count of 4 is one set, 2 is two.
  const quests = [
    quest('Wizard', 'Test of Ash', 4),
    quest('Bard', 'Test of Zeal', 4),
    quest('Monk', 'Test of Wu', 2),
    quest('Bard', 'Test of Air', 4),
    quest('Cleric', 'Test of Nine', 9)
  ]
  const progress = Object.fromEntries(quests.map((q) => [q.key, 1]))
  const [row] = cleanupRows(quests, progress, { 'sphinx claw': 4 })
  assert.deepEqual(
    row.turnIns.map((t) => [t.sets, t.className, t.name]),
    [
      [2, 'Monk', 'Test of Wu'],
      [1, 'Bard', 'Test of Air'],
      [1, 'Bard', 'Test of Zeal'],
      [1, 'Wizard', 'Test of Ash'],
      [0, 'Cleric', 'Test of Nine']
    ]
  )
})

// ---- the adapter the tab and the tab's count call ----------------------------------------

/** A quest as the Sky tab holds it. Only the fields the adapter reads are stated. */
function progressOf(q: CleanupQuest, turnIns: number, held: Record<string, number>): QuestProgress {
  return {
    key: q.key,
    className: q.className,
    name: q.name,
    giver: q.giver,
    reward: q.reward,
    turnIns,
    items: q.items.map((it) => {
      const h = held[itemCountKey(it.name)] ?? 0
      // `have` is capped at the need, as the quest row draws it. `held` is not.
      return { name: it.name, need: it.count, have: Math.min(h, it.count), held: h }
    })
  } as unknown as QuestProgress
}

test('the tab`s own quest list gives the same rows as the model over the same counts', () => {
  const held = { 'sphinx claw': 10, 'azarack skin': 3, 'wind rune heda': 0 }
  const turnIns = { [FIVE.key]: 1, [AZARACK.key]: 2 }
  const quests = [FIVE, AZARACK]
  const places = { 'sphinx claw': [{ label: 'Bank', count: 10 }] }
  const viaTab = cleanupRowsFor(
    quests.map((q) => progressOf(q, turnIns[q.key], held)),
    places
  )
  assert.deepEqual(viaTab, cleanupRows(quests, turnIns, held, places))

  const claws = viaTab[0]
  assert.equal(claws.name, 'Sphinx Claw')
  assert.equal(claws.quantity, 10, 'the uncapped held count, not the 5 the quest row caps at')
  assert.deepEqual([claws.turnIns[0].need, claws.turnIns[0].sets, claws.turnIns[0].times], [5, 2, 1])
  assert.equal(claws.turnIns[0].reward, 'Wu Fighting Belt')
  assert.equal(claws.turnIns[0].giver, 'Master Wu')
  assert.equal(locationsLine(claws.locations), 'Bank 10')
})

test('the tab`s own quest list keeps an item off while one quest naming it is not turned in', () => {
  const held = { 'sphinx claw': 3 }
  const off = cleanupRowsFor([progressOf(CLAW_BEAST, 1, held), progressOf(CLAW_PALADIN, 0, held)])
  assert.deepEqual(off, [])
  const on = cleanupRowsFor([progressOf(CLAW_BEAST, 1, held), progressOf(CLAW_PALADIN, 1, held)])
  assert.deepEqual(on.map((r) => [r.name, r.quantity, r.turnIns.length]), [['Sphinx Claw', 3, 2]])
})

// ---- where the dump says it is -----------------------------------------------------------

/** A tab-separated dump, written the way the client writes one. */
const synth = (...lines: string[]): string => `${lines.join('\r\n')}\r\n`

test('SYNTHETIC: slots fold into one place with a count, and a +1 copy answers for the base item', () => {
  const text = synth(
    'Location\tName\tID\tCount\tSlots',
    'General 1\tSpacious Rucksack\t177751\t1\t24',
    'General 1-Slot1\tSphinx Claw\t100\t1\t10',
    'General 1-Slot2\tSphinx Claw +1\t100\t3\t10',
    'Bank3\tSphinx Claw\t100\t1\t10',
    '',
    "Dragon's Hoard\tName\tID\tCount\tSlots",
    "Dragon's Hoard1\tSphinx Claw\t100\t2\t10"
  )
  const places = dumpLocationsFrom(carryAll(parseInventoryDump(text)).rows)
  assert.deepEqual(places[itemCountKey('Sphinx Claw')], [
    // One slot holding one and one slot holding a stack of three: the counts are summed.
    { label: 'General', count: 4 },
    { label: 'Bank', count: 1 },
    // A section the client named is shown under the client's own name.
    { label: "Dragon's Hoard", count: 2 }
  ])
  assert.equal(locationsLine(places['sphinx claw']), "General 4, Bank 1, Dragon's Hoard 2")
})

test('SYNTHETIC: the shared bank, the personal depot and a worn slot get the player`s words', () => {
  const text = synth(
    'Location\tName\tID\tCount\tSlots',
    'SharedBank1\tSphinx Claw\t100\t1\t10',
    'Personal-Depot2\tSphinx Claw\t100\t2\t10',
    'Head\tSphinx Claw\t100\t1\t10'
  )
  const rows = carryAll(parseInventoryDump(text)).rows
  assert.deepEqual(rows.map(placeLabel), ['Shared Bank', 'Personal Depot', 'Worn'])
  assert.equal(locationsLine(dumpLocationsFrom(rows)['sphinx claw']), 'Shared Bank 1, Personal Depot 2, Worn 1')
})

test('no dump at all is no places, and a row then says the export does not name it', () => {
  assert.deepEqual(dumpLocationsFrom(null), {})
  assert.deepEqual(dumpLocationsFrom(undefined), {})
  const rows = cleanupRows([AZARACK], { [AZARACK.key]: 1 }, { 'azarack skin': 2 })
  assert.deepEqual(rows[0].locations, [])
  assert.equal(locationsLine(rows[0].locations), 'not in the export')
})

test('the places ride the row when the dump does know them', () => {
  const rows = cleanupRows(
    [AZARACK],
    { [AZARACK.key]: 1 },
    { 'azarack skin': 2 },
    { 'azarack skin': [{ label: 'Bank', count: 2 }] }
  )
  assert.equal(locationsLine(rows[0].locations), 'Bank 2')
})

// ---- the copy that is not a row ----------------------------------------------------------

test('the caveat is the owner`s sentence and holds no long dash', () => {
  assert.equal(
    CLEANUP_CAVEAT,
    'Cleanup lists items you could destroy because every Sky quest that needs them has been turned in. Destroying is permanent and happens in the game, not here. If you delete something you wanted, that is on you.'
  )
  assert.ok(!/[–—]/.test(CLEANUP_CAVEAT))
})

test('the reward`s upgrade level is a line only when one was observed', () => {
  assert.equal(rewardTierLine('Azarack Skin Wristwraps', 3), 'your Azarack Skin Wristwraps is +3')
  assert.equal(rewardTierLine('Azarack Skin Wristwraps', undefined), null)
  assert.equal(rewardTierLine(undefined, 3), null)
})
