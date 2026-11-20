// The workbench's history folds (src/shared/tradeskillHistory.ts): the crafting snapshot keyed for
// lookup, one recipe's combines, one tradeskill's totals and item rows, and the count held when
// the log's depot line is newer than the dump. The fixture has the shape of the owner's own log
// (Jewelry Making 205, the Golden Ruby Ring, the Gold Malachite Bracelet); no log is read.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { skillRecipes } from '../src/shared/tradeskillBook'
import {
  NOTICE_LABEL,
  NO_HISTORY_TEXT,
  PACE_SHORT_TEXT,
  depotTip,
  haveNow,
  haveSourceText,
  historyWords,
  indexCrafting,
  levelsText,
  logCountsInUse,
  madeByYouText,
  madeRecipes,
  noCombinesText,
  noticeTip,
  paceLine,
  paceTooShort,
  percentText,
  rateText,
  recipeHistory,
  recipeSkillLookup,
  skillHistory,
  totalsFigures,
  totalsLine,
  trivialNotice,
  unplacedText
} from '../src/shared/tradeskillHistory'
import { MIN, SEP_12, bought, depot, fixtureIndex, fixtureSnap, item, span } from './tradeskillFixtures.mts'

test('the snapshot is keyed by item, the newest row of a key stays, and an unserved module says so', () => {
  const index = fixtureIndex()
  const craft = indexCrafting(
    fixtureSnap({
      bought: [
        { ...bought('Ruby', 1, 100_000, 'Old Merchant'), ts: SEP_12 - MIN },
        bought('Ruby', 1, 131_250, 'Jade'),
        { ...bought('ruby +1', 1, 90_000, 'Older'), ts: SEP_12 - 5 * MIN }
      ]
    }),
    index
  )
  assert.equal(craft.served, true)
  assert.equal(craft.bought.get('ruby')?.merchant, 'Jade')
  assert.equal(craft.items.get('golden ruby ring')?.made, 4)
  assert.equal(craft.depot.get('ruby')?.left, 50)
  const unserved = indexCrafting(null, index)
  assert.equal(unserved.served, false)
  assert.equal(unserved.items.size, 0)
})

test('a combine no raise named takes its tradeskill from the recipe book, the lowest trivial first', () => {
  const lookup = recipeSkillLookup(fixtureIndex())
  assert.equal(lookup('Golden Ruby Ring'), 'Jewelcrafting')
  assert.equal(lookup('golden ruby ring +2'), 'Jewelcrafting')
  assert.equal(lookup('Pie Tin'), 'Blacksmithing')
  assert.equal(lookup('Mystery Stew'), undefined)
})

test('a recipe shows what the log says of the item it makes, by name or by what the combine yields', () => {
  const index = fixtureIndex()
  const craft = indexCrafting(fixtureSnap(), index)
  const ring = index.byId.get('golden ruby ring#0')
  const arrow = index.byId.get('class 1 wood point arrow#0')
  const untouched = index.byId.get('platinum malachite ring#0')
  assert.ok(ring && arrow && untouched)
  assert.equal(recipeHistory(craft, ring)?.made, 4)
  assert.equal(recipeHistory(craft, arrow)?.item, 'Arrow')
  assert.equal(recipeHistory(craft, untouched), null)
  assert.equal(recipeHistory(indexCrafting(null, index), ring), null)
})

test('the words of a recipe line: made, failed, and the raises with the levels they spanned', () => {
  const rows = fixtureSnap().items
  assert.equal(historyWords(rows[0]), 'made 4, failed 0')
  assert.equal(historyWords(rows[1]), 'made 92, failed 29, 33 raises (114 to 146)')
  assert.equal(historyWords(rows[3]), 'made 5, failed 1, 1 raise (to 12)')
  assert.equal(historyWords(item('X', { made: 1, raises: 2 })), 'made 1, failed 0, 2 raises')
  assert.equal(levelsText(rows[1]), '114 to 146')
  assert.equal(levelsText(rows[3]), '12')
  assert.equal(levelsText(rows[0]), '')
  assert.ok(NO_HISTORY_TEXT.includes('no combine'))
})

test("the game's own trivial notice is its own mark: only when the log printed it", () => {
  const rows = fixtureSnap().items
  assert.equal(trivialNotice(rows[0]), null)
  assert.equal(trivialNotice(null), null)
  assert.deepEqual(trivialNotice(rows[2]), { count: 3, ts: SEP_12 + 60 * MIN })
  assert.deepEqual(trivialNotice(item('X', { trivial: 1 })), { count: 1, ts: null })
  assert.equal(NOTICE_LABEL, 'trivial for you')
  assert.ok(noticeTip(3, '9/12/2026').includes('3 times, last on 9/12/2026'))
  assert.ok(noticeTip(1, '').includes('once.'))
})

test("a tradeskill's history: its totals, its pace per crafting hour, and its items newest first", () => {
  const index = fixtureIndex()
  const history = skillHistory(indexCrafting(fixtureSnap(), index), index, 'Jewelcrafting')
  assert.deepEqual(history.rows.map((r) => r.row.item), ['Golden Ruby Ring', 'Golden Jaded Bracelet', 'Gold Malachite Bracelet'])
  assert.deepEqual(history.rows.map((r) => r.combines), [4, 121, 121])
  assert.equal(history.rows[0]?.successRate, 1)
  assert.equal(history.rows[0]?.recipeId, 'golden ruby ring#0')
  assert.ok(history.totals)
  assert.deepEqual(
    { combines: history.totals.combines, made: history.totals.made, failed: history.totals.failed, raises: history.totals.raises },
    { combines: 246, made: 196, failed: 50, raises: 46 }
  )
  // Only the run that raised Jewelry Making counts toward its pace: one hour, 242 combines.
  assert.equal(history.pace.spans, 1)
  assert.equal(history.pace.combinesPerHour, 242)
  assert.equal(history.pace.raisesPerHour, 46)
  assert.equal(paceLine(history.pace), '242 combines and 46 raises per crafting hour, over 1 h 0 min of crafting in 1 run that raised the skill.')
  assert.equal(totalsLine(history.totals), '246 combines in your log: 196 made, 50 failed')
  assert.deepEqual(totalsFigures(history.totals).map((f) => `${f.label} ${f.value}`), [
    'Combines 246',
    'Made 196',
    'Failed 50',
    'Success 80%',
    'Raises 46',
    'Combines per raise 5.3'
  ])
})

test('the combine with a yield under another name lands on its tradeskill, with the recipe that makes it', () => {
  const index = fixtureIndex()
  const history = skillHistory(indexCrafting(fixtureSnap(), index), index, 'Fletching')
  assert.deepEqual(history.rows.map((r) => r.row.item), ['Arrow'])
  // The book has no recipe NAMED Arrow: the row opens the one whose combine yields it.
  assert.equal(history.rows[0]?.recipeId, 'class 1 wood point arrow#0')
  assert.equal(history.pace.combinesPerHour, 12)
})

test('a tradeskill the log never combined has no totals, and items nothing places are counted apart', () => {
  const index = fixtureIndex()
  const history = skillHistory(indexCrafting(fixtureSnap(), index), index, 'Baking')
  assert.equal(history.totals, null)
  assert.deepEqual(history.rows, [])
  assert.equal(totalsLine(history.totals), '')
  assert.equal(noCombinesText('Baking'), 'Your log shows no Baking combine.')
  assert.deepEqual(history.unplaced, { items: 1, combines: 3, names: ['Mystery Stew'] })
  assert.equal(unplacedText(history.unplaced), 'Not on any workbench: 3 combines of 1 item that no raise named and the wiki has no recipe for (Mystery Stew).')
  assert.equal(unplacedText({ items: 0, combines: 0, names: [] }), '')
  const many = { items: 8, combines: 20, names: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }
  assert.ok(unplacedText(many).endsWith('(a, b, c, d, e, f and 2 more).'))
})

test('a pace is stated only once the runs add up to enough time', () => {
  const index = fixtureIndex()
  const short = skillHistory(indexCrafting(fixtureSnap({ spans: [span(0, 2, 9, { 'Jewelry Making': 3 })] }), index), index, 'Jewelcrafting')
  assert.equal(paceLine(short.pace), '')
  assert.equal(paceTooShort(short.pace), true)
  assert.ok(PACE_SHORT_TEXT.length > 0)
  const none = skillHistory(indexCrafting(fixtureSnap({ spans: [] }), index), index, 'Jewelcrafting')
  assert.equal(paceTooShort(none.pace), false)
})

test('the recipe count says how many the log shows made', () => {
  const index = fixtureIndex()
  const craft = indexCrafting(fixtureSnap(), index)
  assert.equal(madeRecipes(craft, skillRecipes(index, 'Jewelcrafting')), 3)
  assert.equal(madeRecipes(craft, skillRecipes(index, 'Pottery')), 0)
  assert.equal(madeByYouText(3), ', 3 made by you')
  assert.equal(madeByYouText(0), '')
})

test('Have is the dump, unless the log stated a depot count after the dump was written', () => {
  const dumpAt = SEP_12 + 10 * MIN
  const newer = depot('Ruby', 50, dumpAt + MIN)
  const older = depot('Ruby', 50, dumpAt - MIN)
  assert.deepEqual(haveNow({ count: 54, at: dumpAt }, newer), { count: 50, source: 'depot', ts: dumpAt + MIN })
  assert.deepEqual(haveNow({ count: 54, at: dumpAt }, older), { count: 54, source: 'dump', ts: dumpAt })
  assert.deepEqual(haveNow({ count: 54, at: dumpAt }, undefined), { count: 54, source: 'dump', ts: dumpAt })
  // No dump: the log is the only word there is.
  assert.deepEqual(haveNow(null, older), { count: 50, source: 'depot', ts: dumpAt - MIN })
  assert.equal(haveNow(null, undefined), null)
  // A dump whose time could not be read is kept: nothing says the log is newer.
  assert.deepEqual(haveNow({ count: 54, at: null }, newer), { count: 54, source: 'dump', ts: null })
})

test('the line under the materials names the source of Have, and the log only when a count is from it', () => {
  const index = fixtureIndex()
  const craft = indexCrafting(fixtureSnap(), index)
  assert.equal(logCountsInUse(craft, { at: SEP_12 + 30 * MIN }), true)
  assert.equal(logCountsInUse(craft, { at: SEP_12 + 300 * MIN }), false)
  assert.equal(logCountsInUse(craft, { at: null }), false)
  assert.equal(logCountsInUse(craft, null), true)
  assert.equal(logCountsInUse(indexCrafting(null, index), null), false)
  assert.equal(haveSourceText('9/12/2026', false), 'Have is from your inventory dump of 9/12/2026.')
  assert.ok(haveSourceText('9/12/2026', true).startsWith('Have is from your inventory dump of 9/12/2026. A count marked log'))
  assert.ok(haveSourceText(null, true).startsWith('A count marked log'))
  assert.equal(haveSourceText(null, false), '')
  assert.ok(depotTip('9/12/2026, 9:30 PM', '9/12/2026').includes('newer than your inventory dump of 9/12/2026'))
  assert.ok(depotTip('9/12/2026, 9:30 PM', '').includes('depot only'))
})

test('the small words: a percent, a rate', () => {
  assert.equal(percentText(0.7603), '76%')
  assert.equal(percentText(null), '')
  assert.equal(rateText(3.666), '3.7')
  assert.equal(rateText(121.4), '121')
  assert.equal(rateText(null), '')
})
