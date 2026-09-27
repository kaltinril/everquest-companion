// A DROP'S NAME IS THE PAGE'S TITLE, and MediaWiki reads a title's underscores as spaces.
//
// Three Plane of Sky pages (Noble Dojorn, Overseer of Air, The Hand of Veeshan) list
// `{{:Brass_Knuckles}}`. The catalog kept the underscore, so the drop joined to no item and the
// Sky tab's Brass Knuckles rows named no dropper once the last page spelling it with a space was
// edited (2026-09-27 top-up). Wikitext below is the shape of those pages' `|known_loot`.
//
// Pure units — no UI, no Electron. Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMobLoot } from '../src/main/mobLookupParse'

const names = (block: string): string[] => parseMobLoot(block).map((d) => d.item)

test('a transclusion spelled with underscores names the page with spaces', () => {
  const loot = `<ul><li> {{:Brass_Knuckles}} <span class='drare'>(Rare)</span>
</li><li> {{:Efreeti War Shield}} <span class='drare'>(Common)</span>
</li><li> {{:Rune_of_the_One_Eye_(middle)}}
</li></ul>`
  assert.deepEqual(names(loot), ['Brass Knuckles', 'Efreeti War Shield', 'Rune of the One Eye (middle)'])
  assert.equal(parseMobLoot(loot)[0].rarity, 'Rare', 'the rarity still rides on its own item')
})

test('both spellings of one page are one drop', () => {
  assert.deepEqual(names('<li>{{:Brass_Knuckles}}</li><li>{{:Brass Knuckles}}</li>'), ['Brass Knuckles'])
})
