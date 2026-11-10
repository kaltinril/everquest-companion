// A known NPC's page that lacks a quest the NPC gives (owner, 2026-11-09: Lord Ollix Everling's page
// lists none of The Tragic Tale of House Everling, and the app showed nothing). The engine files a
// Mobs row with `questGaps`; this pins what the tab makes of it: an Update page, the chip, its reason,
// the lines Copy gives, and nothing left to capture. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapActions, type GapRow } from '../src/shared/gaps'
import { questGiverAddText } from '../src/shared/gapQuestGivers'
import { gapJob } from '../src/shared/gapJob'
import { updateWhy } from '../src/shared/gapUpdateWhy'
import { stillNeeded, wikiPageText } from '../src/shared/wikiPage'

const ollix: GapRow = {
  domain: 'mob',
  name: 'Lord Ollix Everling',
  kinds: ['considered', 'hailed'],
  count: 3,
  first: '2026-10-25 18:09:58',
  last: '2026-11-09 21:23:58',
  details: { samples: [], zones: { distinct: 1, entries: [{ name: 'Nektropos Castle', n: 3 }] } },
  questGaps: { page: 'Lord Ollix Everling', quests: ['The Tragic Tale of House Everling'] }
}

test('a known NPC with quest gaps is an Update page whose chip edits the page and names the quest', () => {
  assert.equal(gapJob(ollix), 'update')
  const actions = gapActions(ollix, 'hasPage')
  assert.equal(actions.length, 1, JSON.stringify(actions))
  assert.equal(actions[0]?.label, 'Add quests to mob page')
  assert.equal(actions[0]?.why, 'The wiki page for Lord Ollix Everling does not list the quest it gives: The Tragic Tale of House Everling.')
  assert.equal(actions[0]?.href, 'https://eqlwiki.com/index.php?title=Lord_Ollix_Everling&action=edit')
  assert.deepEqual(updateWhy(ollix, 'hasPage'), [actions[0]?.why])
})

test('two quests are both named, and Copy gives exactly the related_quests bullets', () => {
  const nikko: GapRow = { ...ollix, name: 'Nikko Canti', questGaps: { page: 'Nikko Canti', quests: ['Something Fishy', 'Alchemical Solution'] } }
  assert.equal(gapActions(nikko, 'unchecked')[0]?.why, 'The wiki page for Nikko Canti does not list the 2 quests it gives: Something Fishy and Alchemical Solution.')
  assert.equal(questGiverAddText(nikko.questGaps ?? { page: '', quests: [] }), '* [[Something Fishy]]\n* [[Alchemical Solution]]\n')
  assert.equal(wikiPageText(nikko, [], {}), '* [[Something Fishy]]\n* [[Alchemical Solution]]\n')
})

test('nothing is left to capture: the page exists and the lines are the whole edit', () => {
  assert.deepEqual(stillNeeded(ollix, [], {}), [])
  // A Mobs row for a name the wiki lacks still asks for its level, location, factions and picture.
  const unknown: GapRow = { ...ollix, name: 'A nameless thing', kinds: ['considered'] }
  delete unknown.questGaps
  assert.equal(gapJob(unknown), 'new')
  assert.ok(stillNeeded(unknown, [], {}).length > 0)
})
