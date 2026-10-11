// scripts/scrape-quests.ts decisions that need no network: which pages are not quests.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nonQuestReason, queryBlock } from '../scripts/scrape-quests'
import { parseQuestPage } from '../scripts/sources/questPage'

const isItem = (t: string): boolean => ['rusty scythe', 'harvester'].includes(t.toLowerCase())

test('Plane of Sky class test pages are left to posky.json, stub or full page alike', () => {
  const stub = parseQuestPage('Bard Plane of Sky Tests', '{{#lsth:Plane of Sky|[[Bard]] Tests}}\n', isItem)
  const full = parseQuestPage('Monk Plane of Sky Tests', '== Test of Fists ==\n[[Rusty Scythe]] [[Harvester]]\n', isItem)
  for (const q of [stub, full]) assert.match(nonQuestReason(q) ?? '', /posky/)
  // The zone's key quest is not a class test page and is still indexed.
  assert.equal(nonQuestReason(parseQuestPage('Plane of Sky Keys', '== Walkthrough ==\n[[Rusty Scythe]]\n', isItem)), null)
})

test('a hub page that only section-transcludes other quests is not a quest', () => {
  const hub = parseQuestPage('Faction Quests', '==== [[Orc Scalp Collecting]] ====\n{{#lsth:Orc Scalp Collecting|Walkthrough}}\n[[Rusty_Scythe]]\n', isItem)
  assert.match(nonQuestReason(hub) ?? '', /section-transclusion hub/)
})

test('a list response with an API error or no query block throws instead of reading as empty', () => {
  assert.throws(() => queryBlock({ error: { code: 'maxlag', info: 'Waiting for db' } }, 'Category:Quests'), /maxlag/)
  assert.throws(() => queryBlock({}, 'Category:Quests'), /no query/)
  assert.deepEqual(queryBlock({ query: { categorymembers: [] } }, 'Category:Empty'), { categorymembers: [] })
})
