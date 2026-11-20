// The AAs that bear on tradeskills and on foraging (owner, 2026-11-20: "I think there are AA's
// that pertain to crafting, we should somehow show stuff related to that"): the fold in
// src/shared/tradeskillAa.ts, on fixture rows and on the committed wiki table.
//
// WHAT IS PINNED HERE:
//   1. WHICH rows bear on what: a `<Tradeskill> Mastery` by name on that tradeskill (the wiki's
//      "Jewel Craft" folded to the app's Jewelcrafting), a text that says "tradeskill" on all of
//      them, a text that names Forage on foraging, everything else on nothing.
//   2. THE FIGURES are read only from the exact shapes, one value per rank; anything else is null.
//   3. THE PURCHASES are the log's lines: the top rank named, the ranks under it the log lacks,
//      and "no purchase" worded as what the log shows, never as what the player lacks.
//   4. PAST 200 is counted from the log's levels; the rule and the list are the wiki's own words.
//   5. NOTHING FORECAST: no line holds a chance, a rate or a number worked out from a figure.
//   6. THE WORDS on screen, with no em or en dash.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AASpendLike } from '../src/shared/aa'
import type { SkillRow } from '../src/shared/skills'
import {
  AA_HIDE_TEXT,
  AA_NO_PURCHASE_TEXT,
  AA_NO_PURCHASE_TIP,
  AA_PANEL_HEADING,
  AA_SHOW_TEXT,
  AA_SOURCE_TEXT,
  AA_WIKI_LABEL,
  AA_WIKI_URL,
  aaAtRankText,
  aaBoughtShort,
  aaBoughtText,
  aaCostText,
  aaNamedText,
  aaPurchases,
  aaReach,
  aaRuleLines,
  aaTradeskill,
  boughtOf,
  craftAas,
  forageAaLines,
  forageAas,
  pastCap,
  pastCapText,
  tradeskillAaLines,
  tradeskillAas,
  type AaLine
} from '../src/shared/tradeskillAa'
import { GENERAL_AAS, type WikiAaRow } from '../src/shared/tradeskillAaTable.generated'
import { TRADESKILLS } from '../src/shared/tradeskills'

const row = (name: string, ranks: number, cost: string, text: string): WikiAaRow => ({ name, ranks, cost, text })

const TABLE: WikiAaRow[] = [
  row('Combat Agility', 3, '2/4/6', 'This passive ability increases your melee avoidance by 2/5/10%. Requirements: Level 1.'),
  row('Baking Mastery', 3, '2/4/6', 'This passive ability reduces the chance of failing Baking recipes by 10/25/50%. Requirements: Level 1.'),
  row(
    'Crafting Mastery',
    6,
    '3/3/3/3/3/3',
    'This passive ability allows you to raise 1/2/3/4/5/6 additional standard tradeskill (Baking, Blacksmithing, Brewing, Fletching, Jewelcraft, Pottery, or Tailoring) from its initial Specialization cap of 200 up to 300. Requirements: Level 1.'
  ),
  row('Foraging', 1, '3', 'This passive ability increases your Forage skill cap by 50 points. Requirements: Level 1.'),
  row('Full Potential', 1, '0', 'This passive ability provides the following storage capacity increases. +50 Tradeskill slots, +25 Equipment Slots. Requirements: Level 50.'),
  row('Jewel Craft Mastery', 3, '2/4/6', 'This passive ability reduces the chance of failing Jewelcrafting recipes by 10/25/50%. Requirements: Level 1.'),
  row('Spell Casting Mastery', 3, '2/4/6', 'This passive ability reduces the mana cost of all spells by 2/5/10%. Requirements: Level 1.')
]

const spend = (ability: string, cost: number, ts: number, rank?: number): AASpendLike => ({ ts, ability, cost, ...(rank === undefined ? {} : { rank }) })

/** The owner's own purchase lines of 2026-11-12 to 2026-11-17. */
const SPENDS: AASpendLike[] = [
  spend('Jewel Craft Mastery', 2, 100),
  spend('Jewel Craft Mastery 2', 4, 101, 2),
  spend('Jewel Craft Mastery 3', 6, 102, 3),
  spend('Crafting Mastery', 3, 200),
  spend('Crafting Mastery 2', 3, 201, 2),
  spend('Innate Regeneration 7', 5, 300, 7)
]

const skill = (name: string, value: number, lastTs = 1000): SkillRow => ({ skill: name, value, lastTs, sessionUps: 0 })

const names = (aas: readonly { name: string }[]): string[] => aas.map((aa) => aa.name)

test("the wiki's AA spellings fold to the app's tradeskill names", () => {
  assert.equal(aaTradeskill('Jewel Craft'), 'Jewelcrafting')
  assert.equal(aaTradeskill(' Jewelcraft '), 'Jewelcrafting')
  assert.equal(aaTradeskill('Baking'), 'Baking')
  assert.equal(aaTradeskill('Jewelry Making'), 'Jewelcrafting')
  assert.equal(aaTradeskill('Crafting'), undefined)
  assert.equal(aaTradeskill('Spell Casting'), undefined)
})

test('a mastery bears on its tradeskill by name, a tradeskill text on all, a Forage text on foraging', () => {
  assert.deepEqual(aaReach(TABLE[1]), { kind: 'tradeskill', tradeskill: 'Baking' })
  assert.deepEqual(aaReach(TABLE[5]), { kind: 'tradeskill', tradeskill: 'Jewelcrafting' })
  assert.deepEqual(aaReach(TABLE[2]), {
    kind: 'all',
    named: ['Baking', 'Blacksmithing', 'Brewing', 'Fletching', 'Jewelcrafting', 'Pottery', 'Tailoring']
  })
  assert.deepEqual(aaReach(TABLE[4]), { kind: 'all', named: [] })
  assert.deepEqual(aaReach(TABLE[3]), { kind: 'forage' })
  // A mastery of something that is no tradeskill, and a combat AA, bear on nothing.
  assert.equal(aaReach(TABLE[6]), null)
  assert.equal(aaReach(TABLE[0]), null)
  assert.deepEqual(names(craftAas(TABLE)), ['Baking Mastery', 'Crafting Mastery', 'Foraging', 'Full Potential', 'Jewel Craft Mastery'])
})

test('a workbench lists its own mastery first, then the AAs for every tradeskill', () => {
  assert.deepEqual(names(tradeskillAas('Jewelcrafting', TABLE)), ['Jewel Craft Mastery', 'Crafting Mastery', 'Full Potential'])
  assert.deepEqual(names(tradeskillAas('Baking', TABLE)), ['Baking Mastery', 'Crafting Mastery', 'Full Potential'])
  // No mastery of its own: the two for every tradeskill.
  assert.deepEqual(names(tradeskillAas('Fishing', TABLE)), ['Crafting Mastery', 'Full Potential'])
  assert.deepEqual(names(forageAas(TABLE)), ['Foraging'])
  // A table with no such row: nothing, and the panel draws nothing.
  assert.deepEqual(tradeskillAas('Baking', [TABLE[0], TABLE[6]]), [])
  assert.deepEqual(tradeskillAaLines('Baking', { spends: [], skills: [] }, [TABLE[0]]), [])
})

test('figures are read only from the exact shapes, one value per rank', () => {
  const [baking, crafting, foraging, potential] = craftAas(TABLE)
  assert.deepEqual(baking.percents, [10, 25, 50])
  assert.equal(baking.extra, null)
  assert.deepEqual(baking.costs, [2, 4, 6])
  assert.deepEqual(crafting.extra, [1, 2, 3, 4, 5, 6])
  assert.equal(crafting.percents, null)
  assert.deepEqual(crafting.costs, [3, 3, 3, 3, 3, 3])
  assert.equal(foraging.percents, null)
  assert.deepEqual(foraging.costs, [3])
  assert.deepEqual(potential.costs, [0])
  // One figure too few for the ranks, a figure with no "by", two such lists, a cost in words: null.
  const odd = craftAas([
    row('Baking Mastery', 3, '2/4', 'Reduces the chance of failing Baking recipes by 10/25%.'),
    row('Brewing Mastery', 3, '1 for all ranks', 'Gives a 10/25/50% better chance at Brewing.'),
    row('Pottery Mastery', 2, '2/4', 'Fails less by 10/25% and wastes less by 5/10%.')
  ])
  assert.deepEqual(
    odd.map((aa) => [aa.percents, aa.costs]),
    [
      [null, null],
      [null, null],
      [null, [2, 4]]
    ]
  )
})

test('the purchases are what the log shows: the top rank named and the ranks under it the log lacks', () => {
  const purchases = aaPurchases(SPENDS)
  assert.deepEqual(boughtOf(purchases, 'Jewel Craft Mastery'), { top: 3, unlogged: [], granted: false })
  assert.deepEqual(boughtOf(purchases, 'crafting  mastery'), { top: 2, unlogged: [], granted: false })
  // The log began after the first six ranks were bought.
  assert.deepEqual(boughtOf(purchases, 'Innate Regeneration'), { top: 7, unlogged: [1, 2, 3, 4, 5, 6], granted: false })
  assert.equal(boughtOf(purchases, 'Baking Mastery'), null)
  // A respec that bought the same rank again is one rank; a rank at no cost is a grant.
  const again = aaPurchases([spend('Baking Mastery', 2, 1), spend('Baking Mastery', 2, 9), spend('Full Potential', 0, 5)])
  assert.deepEqual(boughtOf(again, 'Baking Mastery'), { top: 1, unlogged: [], granted: false })
  assert.deepEqual(boughtOf(again, 'Full Potential'), { top: 1, unlogged: [], granted: true })
})

test('the cost and purchase words', () => {
  const [baking, crafting, foraging, potential] = craftAas(TABLE)
  assert.equal(aaCostText(baking), '3 ranks costing 2, 4 and 6 points')
  assert.equal(aaCostText(crafting), '6 ranks costing 3 points each')
  assert.equal(aaCostText(foraging), '1 rank costing 3 points')
  assert.equal(aaCostText(potential), '1 rank costing 0 points')
  assert.equal(aaCostText({ ranks: 1, cost: '1', costs: [1] }), '1 rank costing 1 point')
  assert.equal(aaCostText({ ranks: 10, cost: '1 for all ranks', costs: null }), '10 ranks, cost on the wiki: 1 for all ranks')

  const three = { top: 3, unlogged: [], granted: false }
  assert.equal(aaBoughtText(baking, three), 'Your log shows rank 3 of 3 bought.')
  assert.equal(aaBoughtShort(baking, three), 'rank 3 of 3 in your log')
  assert.equal(aaBoughtText(potential, { top: 1, unlogged: [], granted: true }), 'Your log shows rank 1 of 1 granted.')
  // The log names a rank the wiki does not list: both are said, neither is corrected.
  assert.equal(aaBoughtText(baking, { top: 4, unlogged: [], granted: false }), 'Your log shows rank 4 bought. The wiki lists 3 ranks.')
  assert.equal(aaBoughtShort(baking, { top: 4, unlogged: [], granted: false }), 'rank 4 in your log')
  // No purchase line is not "you do not have it".
  assert.equal(aaBoughtText(baking, null), AA_NO_PURCHASE_TEXT)
  assert.equal(aaBoughtShort(baking, null), 'no purchase in your log')
  assert.doesNotMatch(`${AA_NO_PURCHASE_TEXT} ${aaBoughtShort(baking, null)}`, /you (do not|don't) have|not owned|missing/i)
  assert.match(AA_NO_PURCHASE_TIP, /began after the purchase/)
  // Not read yet: nothing is said.
  assert.equal(aaBoughtText(baking, undefined), '')
  assert.equal(aaBoughtShort(baking, undefined), '')
})

test("the figure at the bought rank is the wiki's own, picked out and nothing more", () => {
  const [baking, crafting, foraging] = craftAas(TABLE)
  const at = (top: number): { top: number; unlogged: number[]; granted: boolean } => ({ top, unlogged: [], granted: false })
  assert.equal(aaAtRankText(baking, at(1)), 'At rank 1 the wiki states 10%.')
  assert.equal(aaAtRankText(baking, at(3)), 'At rank 3 the wiki states 50%.')
  assert.equal(aaAtRankText(crafting, at(1)), 'At rank 1 the wiki states 1 additional tradeskill.')
  assert.equal(aaAtRankText(crafting, at(6)), 'At rank 6 the wiki states 6 additional tradeskills.')
  // No figure in the text, no purchase, a rank the wiki does not list, not read yet: no line.
  assert.equal(aaAtRankText(foraging, at(1)), '')
  assert.equal(aaAtRankText(baking, null), '')
  assert.equal(aaAtRankText(baking, undefined), '')
  assert.equal(aaAtRankText(baking, at(4)), '')
})

test("past 200 is counted from the log's levels, highest first", () => {
  const skills = [skill('Jewelry Making', 205), skill('Baking', 200), skill('Fishing', 231), skill('Forage', 250), skill('Taunt', 240)]
  assert.deepEqual(pastCap(skills), [
    { tradeskill: 'Fishing', level: 231 },
    { tradeskill: 'Jewelcrafting', level: 205 }
  ])
  assert.equal(pastCapText(pastCap(skills)), 'Your log shows 2 tradeskills past 200: Fishing 231, Jewelcrafting 205.')
  assert.equal(pastCapText(pastCap([skill('Jewelry Making', 205)])), 'Your log shows 1 tradeskill past 200: Jewelcrafting 205.')
  assert.equal(pastCapText(pastCap([skill('Baking', 200)])), 'Your log shows no tradeskill past 200.')
  assert.equal(pastCapText([]), 'Your log shows no tradeskill past 200.')
})

test("the rule and the list beside Crafting Mastery are the wiki's own words", () => {
  const crafting = craftAas(TABLE)[1]
  const rules = ['Once you pass 200 in any one skill, all other tradeskills will cap out at 200 until you buy the Crafting Mastery Alternate Advancement.', 'A line about Packrat.']
  assert.deepEqual(aaRuleLines(crafting, rules), [rules[0]])
  assert.deepEqual(aaRuleLines({ name: 'Foraging' }, rules), [])
  // The open tradeskill is in the wiki's list: no line. It is not: the list, and that it is not named.
  assert.equal(aaNamedText(crafting, 'Baking'), '')
  assert.equal(aaNamedText(crafting, 'Jewelcrafting'), '')
  assert.equal(
    aaNamedText(crafting, 'Alchemy'),
    "The wiki's text names Baking, Blacksmithing, Brewing, Fletching, Jewelcrafting, Pottery and Tailoring. It does not name Alchemy."
  )
  // An AA for every tradeskill that lists none, and a mastery: no line.
  assert.equal(aaNamedText(craftAas(TABLE)[3], 'Alchemy'), '')
  assert.equal(aaNamedText(craftAas(TABLE)[0], 'Alchemy'), '')
})

test('a workbench line holds everything the panel draws', () => {
  const lines = tradeskillAaLines('Jewelcrafting', { spends: SPENDS, skills: [skill('Jewelry Making', 205)] }, TABLE)
  assert.deepEqual(names(lines.map((l) => l.aa)), ['Jewel Craft Mastery', 'Crafting Mastery', 'Full Potential'])
  const [mastery, crafting, potential] = lines
  assert.equal(mastery.costText, '3 ranks costing 2, 4 and 6 points')
  assert.equal(mastery.boughtText, 'Your log shows rank 3 of 3 bought.')
  assert.equal(mastery.bought, true)
  assert.equal(mastery.atRankText, 'At rank 3 the wiki states 50%.')
  assert.equal(mastery.cap, null)
  assert.equal(crafting.boughtShort, 'rank 2 of 6 in your log')
  assert.equal(crafting.atRankText, 'At rank 2 the wiki states 2 additional tradeskills.')
  assert.ok(crafting.cap)
  assert.equal(crafting.cap.past, 'Your log shows 1 tradeskill past 200: Jewelcrafting 205.')
  assert.equal(crafting.cap.named, '')
  // The committed rule line names Crafting Mastery.
  assert.equal(crafting.cap.rules.length, 1)
  assert.match(crafting.cap.rules[0], /cap out at 200 until you buy the Crafting Mastery/)
  assert.equal(potential.boughtText, AA_NO_PURCHASE_TEXT)
  assert.equal(potential.bought, false)
  assert.equal(potential.cap, null)
})

test('before the log is read nothing is said of purchases or levels', () => {
  const [mastery, crafting] = tradeskillAaLines('Jewelcrafting', { spends: null, skills: null }, TABLE)
  assert.equal(mastery.boughtText, '')
  assert.equal(mastery.boughtShort, '')
  assert.equal(mastery.bought, false)
  assert.equal(mastery.atRankText, '')
  assert.equal(crafting.cap?.past, '')
})

test('the Foraging AA line', () => {
  const [line] = forageAaLines({ spends: SPENDS, skills: [] }, TABLE)
  assert.equal(line.aa.name, 'Foraging')
  assert.equal(line.costText, '1 rank costing 3 points')
  assert.equal(line.boughtText, AA_NO_PURCHASE_TEXT)
  assert.equal(line.cap, null)
  const [bought] = forageAaLines({ spends: [spend('Foraging', 3, 5)], skills: [] }, TABLE)
  assert.equal(bought.boughtText, 'Your log shows rank 1 of 1 bought.')
  assert.equal(bought.atRankText, '')
})

/** Every sentence a line can put on screen. */
function wordsOf(line: AaLine): string[] {
  return [line.costText, line.boughtText, line.boughtShort, line.atRankText, ...(line.cap === null ? [] : [line.cap.past, line.cap.named])]
}

test('NOTHING GUESSED: no line of ours forecasts, and none carries an em or en dash', () => {
  const facts = { spends: SPENDS, skills: [skill('Jewelry Making', 205), skill('Baking', 120)] }
  const ours = [AA_PANEL_HEADING, AA_SHOW_TEXT, AA_HIDE_TEXT, AA_SOURCE_TEXT, AA_NO_PURCHASE_TEXT, AA_NO_PURCHASE_TIP, AA_WIKI_LABEL]
  for (const tradeskill of TRADESKILLS) {
    for (const line of tradeskillAaLines(tradeskill, facts)) ours.push(...wordsOf(line))
  }
  for (const line of forageAaLines(facts)) ours.push(...wordsOf(line))
  for (const words of ours) {
    assert.doesNotMatch(words, /[\u2013\u2014]/, words)
    assert.doesNotMatch(words, /chance|success|likely|expect|should take|will take|combines to|you can raise|you may raise|left to/i, words)
  }
  // The only percent of ours is the wiki's figure for the rank, word for word from its list.
  const percents = ours.filter((w) => w.includes('%'))
  assert.deepEqual([...new Set(percents)], ['At rank 3 the wiki states 50%.'])
  assert.equal(AA_WIKI_URL, 'https://eqlwiki.com/Alternate_Advancement')
})

test('ON THE COMMITTED TABLE: the AAs that bear on tradeskills and foraging', () => {
  const all = craftAas()
  const got = new Map(all.map((aa) => [aa.name, aa]))
  // The eleven on the 2026-11-20 cache. A superset passes: the wiki may add a row.
  const masteries: [string, string, string][] = [
    ['Alchemy Mastery', 'Alchemy', '3/6/9'],
    ['Baking Mastery', 'Baking', '2/4/6'],
    ['Blacksmithing Mastery', 'Blacksmithing', '2/4/6'],
    ['Brewing Mastery', 'Brewing', '2/4/6'],
    ['Fletching Mastery', 'Fletching', '2/4/6'],
    ['Jewel Craft Mastery', 'Jewelcrafting', '2/4/6'],
    ['Pottery Mastery', 'Pottery', '2/4/6'],
    ['Tailoring Mastery', 'Tailoring', '2/4/6']
  ]
  for (const [name, tradeskill, cost] of masteries) {
    const aa = got.get(name)
    assert.ok(aa, name)
    assert.deepEqual(aa.reach, { kind: 'tradeskill', tradeskill }, name)
    assert.equal(aa.ranks, 3, name)
    assert.equal(aa.cost, cost, name)
    assert.deepEqual(aa.percents, [10, 25, 50], name)
    assert.match(aa.text, /reduces the chance of failing .+ recipes by 10\/25\/50%/, name)
    assert.equal(tradeskillAas(tradeskill as (typeof TRADESKILLS)[number])[0].name, name)
  }
  const crafting = got.get('Crafting Mastery')
  assert.ok(crafting)
  assert.deepEqual(crafting.reach, { kind: 'all', named: ['Baking', 'Blacksmithing', 'Brewing', 'Fletching', 'Jewelcrafting', 'Pottery', 'Tailoring'] })
  assert.equal(crafting.ranks, 6)
  assert.deepEqual(crafting.costs, [3, 3, 3, 3, 3, 3])
  assert.deepEqual(crafting.extra, [1, 2, 3, 4, 5, 6])
  assert.equal(aaRuleLines(crafting).length, 1)
  const potential = got.get('Full Potential')
  assert.ok(potential)
  assert.deepEqual(potential.reach, { kind: 'all', named: [] })
  assert.deepEqual(potential.costs, [0])
  const foraging = got.get('Foraging')
  assert.ok(foraging)
  assert.deepEqual(foraging.reach, { kind: 'forage' })
  assert.deepEqual(foraging.costs, [3])
  assert.deepEqual(names(forageAas()), ['Foraging'])
  // Every tradeskill's workbench lists the two for all; the wiki has no mastery for these four.
  for (const tradeskill of TRADESKILLS) {
    const listed = names(tradeskillAas(tradeskill))
    assert.ok(listed.includes('Crafting Mastery') && listed.includes('Full Potential'), tradeskill)
  }
  for (const tradeskill of ['Fishing', 'Poison Making', 'Spell Research', 'Tinkering'] as const) {
    assert.ok(!tradeskillAas(tradeskill).some((aa) => aa.reach.kind === 'tradeskill'), `${tradeskill} has no mastery on the wiki`)
  }
  // Nothing else of the table is swept in: no combat or utility AA.
  for (const aa of all) assert.match(`${aa.name} ${aa.text}`, /tradeskill|recipes|Forage/i, aa.name)
  assert.ok(all.length < GENERAL_AAS.length / 2, 'most of the table bears on no tradeskill')
})
