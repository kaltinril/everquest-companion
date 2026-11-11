// A new merchant page's items_sold (owner, 2026-10-23: "why doesn't our merchant page show items
// sold?"), in the cached merchant pages' own form; prices only when every item was quoted at ally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ddpCoin, itemsSoldBlock, soldLink } from '../src/shared/gapItemsSold'
import { wikiPageText } from '../src/shared/wikiPage'
import type { GapRow } from '../src/shared/gaps'

test('a price is the wiki\'s ddp coin, zero parts left out', () => {
  assert.equal(ddpCoin(104_999), '104pp 9gp 9sp 9cp')
  assert.equal(ddpCoin(209), '2gp 9cp')
  assert.equal(ddpCoin(1_049), '1pp 4sp 9cp')
})

test('every item quoted at ally: each line carries its price, padded as the cache pads it, and the block says the standing', () => {
  const block = itemsSoldBlock([{ item: "Jeweler's Kit", copper: 1_049 }, { item: 'Platinum Bar', copper: 104_999 }])
  assert.equal(
    block,
    // `{{:Jeweler's Kit}}` is 18 characters and `{{:Platinum Bar}}` 17: each padded to 40.
    `<ul><li> {{:Jeweler's Kit}}${' '.repeat(22)}<span class='ddp'>(1pp 4sp 9cp)</span>
</li><li> {{:Platinum Bar}}${' '.repeat(23)}<span class='ddp'>(104pp 9gp 9sp 9cp)</span>
</li></ul>
Prices at Ally.`
  )
})

test('an item with no ally quote takes every price off, and a merchant that sold nothing leaves the field open', () => {
  assert.equal(itemsSoldBlock([{ item: "Cat's Eye Agate", copper: 209 }, { item: 'Malachite' }]), "<ul><li> {{:Cat's Eye Agate}}\n</li><li> {{:Malachite}}\n</li></ul>")
  assert.equal(itemsSoldBlock([]), '')
})

// Owner, 2026-11-10: `{{:Spell: Animate Dead}}` was a red link on Scribe Noglleg's page; the wiki's
// merchant pages write `[[Animate Dead|Spell: Animate Dead]]` (10,297 lines on 1,415 cached pages).
test("a spell or song scroll links its spell page under the scroll's name, as the cached merchant pages do", () => {
  assert.equal(soldLink('Spell: Animate Dead'), '[[Animate Dead|Spell: Animate Dead]]')
  assert.equal(soldLink('Song: Chords of Dissonance'), '[[Chords of Dissonance|Song: Chords of Dissonance]]')
  assert.equal(soldLink('Malachite'), '{{:Malachite}}')
  assert.equal(
    itemsSoldBlock([{ item: 'Spell: Animate Dead', copper: 3_149 }, { item: 'Spell: Bone Walk', copper: 115 }]),
    // `[[Animate Dead|Spell: Animate Dead]]` is 36 characters, padded to 40; the price span follows as for an item.
    `<ul><li> [[Animate Dead|Spell: Animate Dead]]    <span class='ddp'>(3pp 1gp 4sp 9cp)</span>
</li><li> [[Bone Walk|Spell: Bone Walk]]          <span class='ddp'>(1gp 1sp 5cp)</span>
</li></ul>
Prices at Ally.`
  )
})

test('Copy wiki page writes the merchant row\'s items under items_sold', () => {
  const row = { domain: 'merchant', name: 'Mindiinya N`Zar', kinds: ['quoted'], count: 2, first: '', last: '', details: { samples: [] }, itemsSold: [{ item: "Cat's Eye Agate" }, { item: 'Malachite' }] } as GapRow
  const text = wikiPageText(row, [], {})
  assert.ok(text.includes("| items_sold = \n\n<ul><li> {{:Cat's Eye Agate}}\n</li><li> {{:Malachite}}\n</li></ul>\n"), text)
  const bare = wikiPageText({ ...row, itemsSold: undefined } as GapRow, [], {})
  assert.ok(bare.includes('| items_sold = \n'), 'nothing quoted, the field stays open')
})
