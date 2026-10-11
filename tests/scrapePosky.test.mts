// Plane of Sky quest scraper (scripts/sources/eqlegends.ts). No network: fixture HTML shaped like
// the parsed main page, and a stubbed fetch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseClasses } from '../scripts/sources/eqlegends'

const classBlock = (cls: string, quest: string): string =>
  `<div class="mw-heading mw-heading3"><h3>${cls} Tests</h3></div>` +
  '<table><tr><th>Quest</th><th>Quest Giver</th><th>Rune</th><th>Quest Items</th><th>Reward</th></tr>' +
  `<tr><td>${quest}</td><td>Giver</td><td>Wind Rune Meda</td>` +
  '<td><ul><li>Nebulous Sapphire (7-SotS)</li></ul></td><td><a title="Lute">Lute</a></td></tr></table>'
const page = (...blocks: string[]): string => `<div class="mw-parser-output">${blocks.join('')}</div>`

test('every class in the list parses its table off the main page', () => {
  const quests = parseClasses(page(classBlock('Bard', 'Test of Voice'), classBlock('Cleric', 'Test of Faith')), ['Bard', 'Cleric'])
  assert.deepEqual(quests.map((q) => [q.className, q.name]), [['Bard', 'Test of Voice'], ['Cleric', 'Test of Faith']])
})

test('a class that yields no quests stops the scrape, so posky.json is never written without it', () => {
  assert.throws(() => parseClasses(page(classBlock('Bard', 'Test of Voice')), ['Bard', 'Cleric', 'Druid']), /Cleric, Druid/)
})
