// Quest-page parser cases taken from shapes in the committed wiki cache
// (scripts/sources/cache/quests). Wiki text, not game log.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQuestPage, splitSections } from '../scripts/sources/questPage'

const ITEMS = new Set(['harvester', 'rusty scythe', 'shadowbound gloves'])
const isItem = (t: string): boolean => ITEMS.has(t.toLowerCase())

test('a heading followed by a template on the same line still starts a section', () => {
  const wt = `== Reward ==
{{:Harvester}}

== Checklist =={{CheckboxList}}
* [[Rusty Scythe]]
== ShadowBound Gloves =={{CheckboxList}}
`
  const { sections } = splitSections(wt)
  assert.deepEqual(
    sections.map((s) => s.heading),
    ['Reward', 'Checklist', 'ShadowBound Gloves']
  )
  const q = parseQuestPage('Harvester Quest', wt, isItem)
  assert.deepEqual(q.rewards, ['Harvester'])
  assert.deepEqual(q.requiredItems, ['Rusty Scythe'])
})
