// Copy on a mob row when the wiki has the page (owner, 2026-11-10: "give me the updated full wiki to
// just copy/paste into place"; "I don't want to be doing surgery on the page"): empty fields filled
// from the draft, filled fields and the description left alone and handed back, nothing outside the
// template touched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fieldSection, mergeMobPage, templateFieldSpans } from '../src/shared/gapPageMerge'

const LIVE = `{{Classic Era}}
{{Namedmobpage

| imagefilename     =

| name              = a burnt zombie
| race              = [[Zombie]]
| class             = [[Warrior]]
| level             = 44 - 46
| agro_radius       =
| run_speed         =

| zone              = [[Befallen]]
| location          =
| respawn_time      =

| description =

A burnt zombie shambles the lower halls.

| known_loot =

<ul><li> {{:Rusty Weapons}}
</li><li> {{:Bone Chips}}
</li></ul>

| common_loot =

| factions =

| opposing_factions =

| related_quests =

}}

[[Category:Befallen]]
`

const DRAFT = `{{Classic Era}}
{{Namedmobpage

| imagefilename     = npc_a_burnt_zombie.png

| name              = a burnt zombie
| race              =
| class             =
| level             = 45
| agro_radius       =
| run_speed         =

| zone              = [[Befallen]]
| location          = (-120, 318), (-96, 351)
| respawn_time      =

| description =

:You say, 'Hail a burnt zombie'

| known_loot =

<ul><li> {{:Festering Cloak}}
</li></ul>

| common_loot =

| factions =

* [[Befallen Inhabitants]] <span class='profac'>(?)</span>

| opposing_factions =

| related_quests =

}}

[[Category:Befallen]]
`

test('every template field is found with its value span, in page order', () => {
  const spans = templateFieldSpans(LIVE)
  assert.deepEqual(
    spans.map((s) => s.field),
    ['imagefilename', 'name', 'race', 'class', 'level', 'agro_radius', 'run_speed', 'zone', 'location', 'respawn_time', 'description', 'known_loot', 'common_loot', 'factions', 'opposing_factions', 'related_quests']
  )
  const level = spans.find((s) => s.field === 'level')
  assert.equal(LIVE.slice(level!.start, level!.end).trim(), '44 - 46')
  const loot = spans.find((s) => s.field === 'known_loot')
  assert.ok(LIVE.slice(loot!.start, loot!.end).includes('{{:Bone Chips}}'), 'a block value runs to the next field, nested templates and all')
})

test('empty fields take the draft, filled fields and the description stay, and the rest of the page is untouched', () => {
  const m = mergeMobPage(LIVE, DRAFT)
  assert.deepEqual(m.filled, ['imagefilename', 'location', 'factions'])
  assert.ok(m.text.includes('| imagefilename     = npc_a_burnt_zombie.png\n'), m.text)
  assert.ok(m.text.includes('| location          = (-120, 318), (-96, 351)\n'), m.text)
  assert.match(m.text, /\| factions = ?\n\n\* \[\[Befallen Inhabitants\]\] <span class='profac'>\(\?\)<\/span>\n\n\| opposing_factions/, 'the factions block lands between its neighbours')
  // Filled fields keep the page's words, whatever the draft says.
  assert.ok(m.text.includes('| level             = 44 - 46\n'))
  assert.ok(m.text.includes('| race              = [[Zombie]]\n'))
  assert.ok(m.text.includes('A burnt zombie shambles the lower halls.'))
  assert.ok(m.text.includes('{{:Bone Chips}}') && !m.text.includes('{{:Festering Cloak}}'))
  assert.ok(m.text.startsWith('{{Classic Era}}\n') && m.text.endsWith('[[Category:Befallen]]\n'))
  // What the page did not take, with why.
  assert.deepEqual(
    m.leftover.map((l) => [l.field, l.why]),
    [
      ['level', 'has content'],
      ['description', 'own words'],
      ['known_loot', 'has content']
    ]
  )
  assert.equal(m.leftover[2].value, '<ul><li> {{:Festering Cloak}}\n</li></ul>')
})

test('a draft value the page already has is neither filled nor left over; a field the page lacks is left over', () => {
  const same = mergeMobPage(LIVE, LIVE.replace('| level             = 44 - 46', '| level             = 44 - 46'))
  assert.deepEqual(same.filled, [])
  assert.deepEqual(same.leftover.map((l) => l.field), ['description'])
  const extra = mergeMobPage(LIVE, DRAFT.replace(/\| respawn_time {6}= ?\n/, '| respawn_time      = 8:50\n| special           = Flurries\n'))
  assert.ok(extra.filled.includes('respawn_time'))
  assert.deepEqual(extra.leftover.find((l) => l.field === 'special'), { field: 'special', value: 'Flurries', why: 'no field' })
})

test('a MerchantPage merges the same way, and a page with CRLF line ends keeps them outside the filled fields', () => {
  const live = `{{MerchantPage\r\n\r\n| name              = Scribe Noglleg\r\n| class             = [[Merchant]]\r\n| location          =\r\n\r\n| items_sold =\r\n\r\n}}\r\n\r\n[[Category:Rathe Mountains]]\r\n`
  const draft = `{{MerchantPage\n\n| name              = Scribe Noglleg\n| class             = [[Merchant]]\n| location          = (-2057, 1960)\n\n| items_sold = \n\n<ul><li> [[Animate Dead|Spell: Animate Dead]]\n</li></ul>\n\n}}\n\n[[Category:Rathe Mountains]]\n`
  const m = mergeMobPage(live, draft)
  assert.deepEqual(m.filled, ['location', 'items_sold'])
  assert.ok(m.text.startsWith('{{MerchantPage\r\n\r\n| name              = Scribe Noglleg\r\n'), 'untouched lines keep CRLF')
  assert.match(m.text, /\| location {10}= ?\(-2057, 1960\)\n/)
  assert.ok(m.text.includes('[[Animate Dead|Spell: Animate Dead]]'))
  assert.ok(m.text.endsWith('}}\r\n\r\n[[Category:Rathe Mountains]]\r\n'))
  assert.deepEqual(m.leftover, [])
})

test('a leftover section pastes as the draft wrote it: one line for a value, a block for a list', () => {
  assert.equal(fieldSection('level', '45'), '| level             = 45')
  assert.equal(fieldSection('known_loot', '<ul><li> {{:Festering Cloak}}\n</li></ul>'), '| known_loot = \n\n<ul><li> {{:Festering Cloak}}\n</li></ul>\n')
})
