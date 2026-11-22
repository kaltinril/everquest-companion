// Which quest pages say they repeat, and the one step that repeats (scripts/sources/questRepeat.ts),
// then how the Factions tab reads it (factionQuests.ts). The excerpts are verbatim wikitext.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQuestPage } from '../scripts/sources/questPage'
import { repeatFields } from '../scripts/sources/questRepeat'
import { buildFactionWorkIndex } from '../src/renderer/src/features/factions/factionQuests'
import questsJson from '../src/renderer/src/data/eqlegends/quests.json'
import type { QuestData, QuestEntry } from '../src/shared/types'

const CATALOG = (questsJson as QuestData).quests

const TOP = (giver: string, zone: string, related = ''): string =>
  `{| class="questTopTable"\n! ''' Start Zone: '''\n| [[${zone}]]\n|-\n! ''' Quest Giver: '''\n| [[${giver}]]\n|-\n! ''' Related Zones: '''\n| ${related}\n|}\n`

const PAINTING =
  TOP('Danaria Hollin', 'Qeynos|South Qeynos', '[[East Commonlands]], [[Freeport|East Freeport]]') +
  `== Reward ==
<ul><li>  Experience
</li></ul>
== Walkthrough ==
'''Head to East Freeport and find Palatos Kynarn. He's located in the shady part of town.'''
You say, 'Hail, Palatos Kynarn'
: Palatos Kynarn says 'What do you want?'
'''The 'captain' he speaks of is an alcoholic beverage, [[Capt. Orlin's Spiced Ale]]. This can be purchased from the bartender right next to you, Nesin Tapper.'''
Upon handing Palatos four drinks:
: Palatos Kynarn says 'Ahh.. I..  Need help..   You.. take this.. Go build.. boat beacon.'
<div class="facblock">
* Your faction standing with [[Craftkeepers]] has been adjusted by 5.
* Your faction standing with [[High Council of Erudin]] has been adjusted by 5.
* Your faction standing with [[Heretics]] has been adjusted by -1.
* Your faction standing with [[High Guard of Erudin]] has been adjusted by 5.
</div>
{{YouGainExperience}}
(This step can be repeated to easily raise Craftkeepers and Erudin city factions. Palatos Kynarn is on Craftkeepers so he can be /considered to test it.)
'''Upon turning it into Lenka Stoutheart, you receive positive Halas faction.'''
: Lenka Stoutheart says 'Oh!! You must work for that Erudite named Palatos.'
<div class="facblock">
* Your faction standing with [[Wolves of the North]] got better.
</div>
`

const isItem = (t: string): boolean => t === "Capt. Orlin's Spiced Ale" || t === 'Muffin'
const fields = (page: string, text: string): ReturnType<typeof repeatFields> =>
  repeatFields(parseQuestPage(page, text, isItem), text, isItem)

test('the repeat step takes the NPC, count, item, zone and only that block of factions', () => {
  assert.deepEqual(fields('The Painting', PAINTING), {
    repeatable: true,
    repeatStep: {
      giver: 'Palatos Kynarn',
      zone: 'East Freeport',
      items: ["Capt. Orlin's Spiced Ale"],
      count: 4,
      factions: [
        { name: 'Craftkeepers', up: true, amount: 5 },
        { name: 'High Council of Erudin', up: true, amount: 5 },
        { name: 'Heretics', up: false, amount: -1 },
        { name: 'High Guard of Erudin', up: true, amount: 5 }
      ]
    }
  })
})

test('CRLF wikitext reads the same', () => {
  assert.deepEqual(fields('The Painting', PAINTING.replace(/\n/g, '\r\n')), fields('The Painting', PAINTING))
})

test('a sentence above the page\'s one block reads that block, and a coin hand-in has no item', () => {
  const text =
    TOP('Guard Shilster', 'Northern Karana') +
    `==Description==
This Quest is very useful for raising [[Bloodsabers]] and several other Evil Qeynos factions because it is rapidly repeatable--so long as you have the gold for it.
== Walkthrough ==
'''Hand Guard Shilster 5gold pieces.'''
:Guard Shilster says, 'There you go, sport.'
<div class="facblock">
* Your faction standing with [[Bloodsabers]] got better. (+5)
</div>
`
  assert.deepEqual(fields('Guard Shilster', text).repeatStep, {
    giver: 'Guard Shilster',
    zone: 'Northern Karana',
    items: [],
    coin: '5 gold',
    factions: [{ name: 'Bloodsabers', up: true, amount: 5 }]
  })
})

test('the category and the header field mark a page, with no step to read', () => {
  assert.deepEqual(fields('A', `${TOP('N', 'Z')}[[Category: Repeatable Turn-in Quests]]`), { repeatable: true })
  assert.deepEqual(fields('B', `${TOP('N', 'Z')}[[Category:Repeatable Turn-in Quests]]`), { repeatable: true })
  assert.deepEqual(fields('C', `{| class="questTopTable"\n!Repeatable:\n|Yes\n! ''' Quest Giver: '''\n| [[N]]\n|}\n`), {
    repeatable: true
  })
})

test('a page that only uses the word is not marked', () => {
  for (const line of [
    'Go to him and repeat the phrase.',
    'You cannot repeat the dialogues now that your faction has been lowered.',
    'This quest is not repeatable for faction.',
    'Non-repeatable: the faction hit happens once.',
    'Repeat attempts had their reward removed.',
    'The reward is repeatable.'
  ]) {
    assert.deepEqual(fields('X', `${TOP('N', 'Z')}== Walkthrough ==\n${line}\n`), {}, line)
  }
  assert.deepEqual(fields('C', `{| class="questTopTable"\n!Repeatable:\n|No\n! ''' Quest Giver: '''\n| [[N]]\n|}\n`), {})
})

test('a disambiguation hub is not a quest; a real page with a hatnote still is', () => {
  assert.deepEqual(fields('Hub', '{{Disambiguation}}\n* a list\n[[Category: Repeatable Turn-in Quests]]'), {})
  assert.deepEqual(fields('Belts', `{{Disambig3|[[Orc Belt Quests]]}}\n${TOP('N', 'Z')}[[Category: Repeatable Turn-in Quests]]`), {
    repeatable: true
  })
})

test('a step that does not read leaves the plain marker', () => {
  const noHandIn = PAINTING.replace('Upon handing Palatos four drinks:', 'Then this happens:')
  assert.deepEqual(fields('P', noHandIn), { repeatable: true, repeatMixed: true })
  const twoItems = PAINTING.replace('Nesin Tapper.', 'Nesin Tapper, or a [[Muffin]].')
  assert.deepEqual(fields('P', twoItems), { repeatable: true, repeatMixed: true })
})

test('two receipts with no step read are mixed; the same receipt twice is not', () => {
  const block = (faction: string): string => `<div class="facblock">\n* Your faction standing with [[${faction}]] got better.\n</div>\n`
  const page = (body: string): string => `${TOP('N', 'Z')}== Walkthrough ==\n${body}[[Category: Repeatable Turn-in Quests]]`
  assert.deepEqual(fields('A', page(block('F') + block('G'))), { repeatable: true, repeatMixed: true })
  assert.deepEqual(fields('B', page(block('F') + block('F'))), { repeatable: true })
})

test('a mixed repeat keeps its chip but its payout rank', () => {
  const big: QuestEntry = { name: 'Big Once', page: 'Big Once', factions: [{ name: 'F', up: true, amount: 50 }] }
  const mixed: QuestEntry = { name: 'Mixed', page: 'Mixed', repeatable: true, repeatMixed: true, factions: [{ name: 'F', up: true, amount: 5 }] }
  const sure: QuestEntry = { name: 'Sure', page: 'Sure', repeatable: true, factions: [{ name: 'F', up: true, amount: 1 }] }
  const raise = buildFactionWorkIndex([big, mixed, sure]).get('f')?.raise ?? []
  assert.deepEqual(raise.map((q) => q.name), ['Sure', 'Big Once', 'Mixed'])
  assert.equal(raise[2].repeatable, true)
})

test('another NPC with no zone stated gets none, never the quest\'s start zone', () => {
  const text = PAINTING.replace("'''Head to East Freeport and find Palatos Kynarn. He's located in the shady part of town.'''\n", '')
  const step = fields('The Painting', text).repeatStep
  assert.equal(step?.giver, 'Palatos Kynarn')
  assert.equal(step?.zone, undefined)
})

const STEP_QUEST: QuestEntry = {
  name: 'Long Quest',
  page: 'Long Quest',
  giver: 'First NPC',
  startZone: 'Home Town',
  requiredItems: ['Ale', 'Late Item'],
  rewards: [{ name: 'Late Reward' }],
  factions: [
    { name: 'Repeat Faction', up: true, amount: 5 },
    { name: 'Lost Faction', up: false, amount: -1 },
    { name: 'Later Faction', up: true }
  ],
  repeatable: true,
  repeatStep: {
    giver: 'Step NPC',
    zone: 'Far Town',
    items: ['Ale'],
    count: 4,
    factions: [
      { name: 'Repeat Faction', up: true, amount: 5 },
      { name: 'Lost Faction', up: false, amount: -1 }
    ]
  }
}

test('a faction the step moves shows the step; a faction only a later step moves stays unmarked', () => {
  const index = buildFactionWorkIndex([STEP_QUEST])
  const work = index.get('repeat faction')
  assert.ok(work)
  const row = work.raise[0]
  assert.equal(row.repeatable, true)
  assert.equal(row.giver, 'Step NPC')
  assert.equal(row.startZone, 'Far Town')
  assert.deepEqual(row.items, ['Ale'])
  assert.equal(row.itemCount, 4)
  assert.deepEqual(row.rewards, [])
  assert.deepEqual(row.hits.map((h) => h.name), ['Repeat Faction', 'Lost Faction'])
  assert.equal(work.homeZone, 'Home Town', 'the page still votes its own start zone')
  const later = index.get('later faction')?.raise[0]
  assert.ok(later)
  assert.equal(later.repeatable, undefined)
  assert.equal(later.giver, 'First NPC')
  assert.deepEqual(later.items, ['Ale', 'Late Item'])
})

test('repeatable raises sort first, even over a bigger one-time payout', () => {
  const one: QuestEntry = { name: 'Big Once', page: 'Big Once', factions: [{ name: 'F', up: true, amount: 50 }] }
  const again: QuestEntry = { name: 'Small Again', page: 'Small Again', repeatable: true, factions: [{ name: 'F', up: true, amount: 1 }] }
  assert.deepEqual(buildFactionWorkIndex([one, again]).get('f')?.raise.map((q) => q.name), ['Small Again', 'Big Once'])
})

test('the real catalog: The Painting is the ale step, first of the marked raises it belongs to', () => {
  const q = CATALOG.find((x) => x.page === 'The Painting')
  assert.equal(q?.repeatStep?.giver, 'Palatos Kynarn')
  assert.equal(q?.repeatStep?.count, 4)
  assert.deepEqual(q?.repeatStep?.items, ["Capt. Orlin's Spiced Ale"])
  assert.deepEqual(
    q?.repeatStep?.factions.map((h) => `${h.name} ${String(h.amount)}`),
    ['Craftkeepers 5', 'High Council of Erudin 5', 'Heretics -1', 'High Guard of Erudin 5']
  )
  const index = buildFactionWorkIndex(CATALOG)
  for (const name of ['craftkeepers', 'high council of erudin', 'high guard of erudin']) {
    const raise = index.get(name)?.raise ?? []
    const at = raise.findIndex((r) => r.page === 'The Painting')
    assert.ok(at >= 0, name)
    assert.ok(raise.slice(0, at).every((r) => r.repeatable === true && r.repeatMixed !== true), `${name}: only sure repeats sit above it`)
  }
  assert.deepEqual(CATALOG.filter((x) => x.repeatMixed).map((x) => x.page), ['Deathfist Slashed Belts', 'Karana Clovers', 'Moonstones Quest'])
})

test('the real catalog marks exactly the pages read by hand', () => {
  const marked = CATALOG.filter((q) => q.repeatable).map((q) => q.page)
  assert.equal(marked.length, 22)
  assert.ok(!marked.includes('Bone Chips Quests'), 'a hub of quests')
  assert.ok(!marked.includes('The Icestar Remembers'), 'its repeat attempts lost the reward')
  assert.deepEqual(CATALOG.filter((q) => q.repeatStep).map((q) => q.page), ["Guard Shilster's Stout", 'The Painting'])
})
