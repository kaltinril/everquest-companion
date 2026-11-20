// The quest page's faction lines beyond the two linked dialects (tests/questCatalog.test.mts has
// those): a faction in plain text, a figure beside the verb, bold markup, a piped label, and what
// stays unread. Measured on the 941 cached quest pages, 2026-11-20 (docs/community/agent/WIKI.md,
// "Quest faction lines"). Every wikitext line below is a cached page's own, named beside it, unless
// it says otherwise. Then the committed catalog: real rows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFactionHits } from '../scripts/sources/questPage'
import questsJson from '../src/renderer/src/data/eqlegends/quests.json'
import type { QuestData, QuestFactionHit } from '../src/shared/types'

test('parseFactionHits reads a faction written in plain text, in the whole game sentence only', () => {
  const wt = [
    '* Your faction standing with Kerra Isle has been adjusted by 20.', // Feskr's Supplies
    'Your faction standing with Kerra Isle has been adjusted by 20. <br>', // the same page, lower down
    '* Your faction standing with <nowiki>[[The Dead]]</nowiki> has been adjusted by -1.', // The Telescope
    '* Your faction standing with King Ak`Anon has been adjusted by 5.',
    '* Your faction standing with DaBashers got better.', // HEHE Meat Quest: the game's own spelling
    'Your faction with the guards got better results after that.', // prose running on
    'Raising faction with Kromzek got worse for me.' // no "Your"
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [
    { name: 'Kerra Isle', plain: true, up: true, amount: 20 },
    { name: 'The Dead', plain: true, up: false, amount: -1 },
    { name: 'King Ak`Anon', plain: true, up: true, amount: 5 },
    { name: 'DaBashers', plain: true, up: true }
  ])
})

test('a run-together plain name is an older log spelling, not this game line, and is not read', () => {
  // 119 lines on 31 cached pages: no wiki title, and not how this game spells the faction.
  const wt = [
    '* Your faction standing with LegionofCabilis got better.', // Monk Shackle Quests
    'Your faction standing with GuardsofQeynos got better.', // Armor of Ro Quests
    '* Your faction standing with KerraIsle has been adjusted by 20.', // Wislen Mamluk's Catfish
    '* Your faction standing with [[Claws of Veeshan|ClawsofVeeshan]] got better.' // a link is read: the title names it
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [{ name: 'Claws of Veeshan', label: 'ClawsofVeeshan', up: true }])
})

test('a plain spelling and a link of one faction are one hit, named by the link', () => {
  const wt = [
    '* Your faction standing with Guardians of the Vale got better.', // The Fishslayers
    '* Your faction standing with New Sebilisian Expedition has been adjusted by 5.', // Supplies for the New Sebilisian Expedition
    '* Your faction standing with [[Guardians of the Vale]] got better.',
    '* Your faction standing with [[New Sebilisian Expedition]] has been adjusted by 10.' // a later turn-in
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [
    { name: 'Guardians of the Vale', up: true },
    { name: 'New Sebilisian Expedition', up: true, amount: 5 }
  ])
})

test('parseFactionHits reads the figure a direction line states beside its verb, signed by the verb', () => {
  const wt = [
    '* Your faction standing with [[Priests of Life]] got better. (+5)', // Aegis of Life Quest
    '* Your faction standing with [[Bloodsabers]] got worse. (-1)',
    '* Your faction with [[Gem Choppers]] got better (5).',
    "* Your faction standing with [[Shadowknights of Night Keep]] got better. <span class='oppfac'>(+50)</span>", // Hukulk's Love
    "* Your faction standing with [[Circle Of Unseen Hands]] <span class='profac'>(-30)</span> got worse.", // Rohand's Brandy
    '* Your faction standing with [[Peace Keepers]] got better. +20',
    '* Your faction standing with [[Storm Guard]] got better +10.',
    '* Your faction standing with [[Knights of Thunder]] got better by 10.',
    // no figure the page commits to
    "* Your faction standing with [[Merchants of Qeynos]] <span class='oppfac'>(10+)</span> got better.", // Rohand's Brandy
    '* Your faction standing with [[Brood of Di`Zok]] got better. +3?', // Di'Zok Signet of Service Quest
    '* Your faction standing with [[Claws of Veeshan]] got worse. (-20 or more)', // Wage War Upon The Coldain
    '* Your faction standing with [[Clerics of Tunare]] got better. <<+5 in EQL>>', // Illegible Scrolls (Felwithe)
    '* Your faction standing with [[Kromzek]] got better. (-5)', // a sign against the verb
    '* Your faction standing with [[Kromrif]] got better. 5 heads at a time' // a bare unsigned number
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [
    { name: 'Priests of Life', up: true, amount: 5 },
    { name: 'Bloodsabers', up: false, amount: -1 },
    { name: 'Gem Choppers', up: true, amount: 5 },
    { name: 'Shadowknights of Night Keep', up: true, amount: 50 },
    { name: 'Circle Of Unseen Hands', up: false, amount: -30 },
    { name: 'Peace Keepers', up: true, amount: 20 },
    { name: 'Storm Guard', up: true, amount: 10 },
    { name: 'Knights of Thunder', up: true, amount: 10 },
    { name: 'Merchants of Qeynos', up: true },
    { name: 'Brood of Di`Zok', up: true },
    { name: 'Claws of Veeshan', up: false },
    { name: 'Clerics of Tunare', up: true },
    { name: 'Kromzek', up: true },
    { name: 'Kromrif', up: true }
  ])
})

test('bold around the link or the verb, and "the" before the link, are still the game line', () => {
  const wt = [
    "* Your faction standing with '''[[The Freeport Militia]] got better.'''", // Deathfist Slashed Belts
    "* Your faction standing with [[Neriak Trolls]] '''got worse'''.", // Hukulk's Love
    "* Your faction standing with [[Circle of Unseen Hands]] '''has gotten worse'''.<span class='profac'>(-1)</span>", // Muffin Quests
    '* Your faction standing with the [[Kromrif]] gets better.' // Vkjor's Minor Task
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [
    { name: 'The Freeport Militia', up: true },
    { name: 'Neriak Trolls', up: false },
    { name: 'Circle of Unseen Hands', up: false, amount: -1 },
    { name: 'Kromrif', up: true }
  ])
})

test('a piped label is kept when it differs from the title, first one seen', () => {
  const wt = [
    '* Your faction standing with [[Mayong Mistmoore (Faction)|Mayong Mistmoore]] got worse.', // Aenia and Behroe
    '* Your faction standing with [[High_Guard_of_Erudin|High Guard of Erudin]] got better.', // the title itself
    '* Your faction standing with [[King Tormax (Faction)]] got worse.',
    '* Your faction standing with [[King Tormax (Faction)|King Tormax]] has been adjusted by -5.'
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [
    { name: 'Mayong Mistmoore (Faction)', label: 'Mayong Mistmoore', up: false },
    { name: 'High Guard of Erudin', up: true },
    { name: 'King Tormax (Faction)', label: 'King Tormax', up: false, amount: -5 }
  ])
})

test('a later figure fills an earlier line only when both point the same way', () => {
  // Winds of Karana: the main route raises Guards of Qeynos, a side step lowers it by 7, and the
  // main route's own numbers come last.
  const wt = [
    '* Your faction standing with [[Guards of Qeynos]] got better.',
    '* Your faction standing with [[Guards of Qeynos]] has been adjusted by -7.',
    '* Your faction standing with [[Guards of Qeynos]] has been adjusted by 1.',
    '* Your faction standing with [[Guards of Qeynos]] has been adjusted by 4.'
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [{ name: 'Guards of Qeynos', up: true, amount: 1 }])
})

test('what parseFactionHits leaves alone: no direction, prose, a requirement', () => {
  const wt = [
    '* Your faction standing with [[Coalition of Tradefolk Underground]] has been adjusted by ?.', // Cutthroat Rings
    '* Your faction standing with Kerra Isle has been adjusted by X.', // Fish Dinner
    '* Faction improves with [[Kromzek]].',
    '**The best way to raise Temple of Sol Ro faction is to seek out Rathmana in South Ro.', // Armor of Ro Quests
    "! ''' Required Faction: '''",
    '| Amiable or better'
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [])
})

const data = questsJson as unknown as QuestData

test('the committed catalog carries the plain-text line, the label and the figure beside the verb', () => {
  const factions = (page: string): QuestFactionHit[] => data.quests.find((q) => q.page === page)?.factions ?? []
  assert.deepEqual(factions("Feskr's Supplies"), [{ name: 'Kerra Isle', plain: true, up: true, amount: 20 }])
  assert.deepEqual(factions('Aenia and Behroe').at(-1), { name: 'Mayong Mistmoore (Faction)', label: 'Mayong Mistmoore', up: false })
  assert.deepEqual(factions('Aegis of Life Quest')[0], { name: 'Priests of Life', up: true, amount: 5 })
  // Winds of Karana: raised on the main route, as its first line says.
  assert.deepEqual(factions('Winds of Karana')[0], { name: 'Guards of Qeynos', up: true, amount: 1 })
})

test('every committed hit is well formed: a clean name, a signed amount, a label only on a link', () => {
  const hits = data.quests.flatMap((q) => (q.factions ?? []).map((f) => ({ page: q.page, f })))
  assert.ok(hits.some(({ f }) => f.plain === true) && hits.some(({ f }) => f.label !== undefined))
  for (const { page, f } of hits) {
    assert.ok(f.name.length > 1 && !/[[\]<>|]/.test(f.name), `clean faction name on ${page}`)
    assert.ok(f.amount === undefined || f.up === f.amount > 0, `direction matches sign on ${page}`)
    assert.ok(f.label === undefined || (f.plain !== true && f.label !== f.name), `a label is a link's own on ${page}`)
  }
})

test('one page, one hit per faction, whatever its spelling', () => {
  const key = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  for (const q of data.quests) {
    const keys = (q.factions ?? []).map((f) => key(f.name))
    assert.equal(new Set(keys).size, keys.length, q.page)
  }
})
