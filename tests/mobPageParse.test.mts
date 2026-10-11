// Mob page reader (src/main/mobLookupParse.ts, scripts/sources/mobPage.ts) on shapes found in the
// cached wiki corpus. Fixtures are trimmed copies of the pages they are named after.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMobLoot } from '../src/main/mobLookupParse'

test('known_loot written as [[Item]] links is read as drops (A Blood Wolf, Gnawfang)', () => {
  const wolf = '* [[Chunk of Meat]]\n* [[Mist Wolf Pelt]]\n* [[Ruined Wolf Pelt]]\n* [[Wolf Meat]]'
  assert.deepEqual(parseMobLoot(wolf).map((d) => d.item), ['Chunk of Meat', 'Mist Wolf Pelt', 'Ruined Wolf Pelt', 'Wolf Meat'])
  const gnawfang = "<ul>\n<li>  {{:Gnawfang's Pelt}}  </li>\n<li> {{:Gnawfang's Tooth}}  </li>\n<li> [[High Quality Cat Pelt]] </li>\n</ul>"
  assert.deepEqual(parseMobLoot(gnawfang).map((d) => d.item), ["Gnawfang's Pelt", "Gnawfang's Tooth", 'High Quality Cat Pelt'])
})

test('a spell link reads its Spell: label, a piped transclusion its target, underscores fold, and dupes collapse', () => {
  const block = [
    "* [[Improved Invisibility|Spell: Improved Invisibility]] <span class='drare'>(Rare)</span>",
    '* {{:A Mandible|Mandible}} (Common)',
    '* {{:Brass_Knuckles}}',
    '* [[Brass Knuckles]]',
    '* [[Category:Loot]]'
  ].join('\n')
  assert.deepEqual(parseMobLoot(block), [
    { item: 'Spell: Improved Invisibility', rarity: 'Rare' },
    { item: 'A Mandible', rarity: 'Common' },
    { item: 'Brass Knuckles' }
  ])
})

test('a link inside a note is not a drop, and a quoted scroll name is not a rarity', () => {
  const block = '* {{:Cloak of Leaves}} (Rare, [[Lesser Faydark]])\n* {{:Illegible Scroll}} ("Vok Na Zov V")'
  const drops = parseMobLoot(block)
  assert.deepEqual(drops.map((d) => d.item), ['Cloak of Leaves', 'Illegible Scroll'])
  assert.equal(drops[1].rarity, undefined)
})
