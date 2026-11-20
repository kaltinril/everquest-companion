// shared/questFactions.ts: an item's quests and the factions they move, and a faction's crafted
// turn-ins, over the committed catalogs (quests.json, items.json).
//
// The dataset assertions are real rows and identities, never frozen counts of a scrape that grows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import questsJson from '../src/renderer/src/data/eqlegends/quests.json'
import { inEraQuests } from '../src/shared/questEra'
import {
  buildQuestFactionIndex,
  factionHitName,
  questFactionKey,
  type FactionItemRecord
} from '../src/shared/questFactions'
import type { QuestData, QuestEntry } from '../src/shared/types'

const QUESTS = (questsJson as unknown as QuestData).quests
const ITEMS = (itemsJson as unknown as { items: Record<string, FactionItemRecord> }).items
const index = buildQuestFactionIndex(QUESTS, ITEMS)

test('questFactionKey joins the spellings of one faction', () => {
  const same = (a: string, b: string): void => assert.equal(questFactionKey(a), questFactionKey(b), `${a} / ${b}`)
  same('Legion of Cabilis', 'LegionofCabilis') // the log's run-together spelling, pasted on 4 pages
  same('King Tormax (Faction)', 'King Tormax') // the wiki's disambiguated title
  same('The Freeport Militia', 'Freeport Militia') // the dump's spelling and the wiki's
  same('The Freeport Militia', 'FreeportMilitia')
  same('Circle Of Unseen Hands', 'CircleofUnseenHands')
  same('Coalition of Tradesfolk', 'Coalition of Tradefolk') // factionNameKey's alias
  same("King Ak'Anon", 'King Ak`Anon')
  assert.notEqual(questFactionKey('Miners Guild 249'), questFactionKey('Miners Guild 628'))
  assert.notEqual(questFactionKey('Dreadguard Inner'), questFactionKey('Dreadguard Outer'))
})

test('factionHitName gives a disambiguated title its label and leaves any other title alone', () => {
  assert.equal(factionHitName({ name: 'Mayong Mistmoore (Faction)', label: 'Mayong Mistmoore', up: false }), 'Mayong Mistmoore')
  assert.equal(factionHitName({ name: 'King Tormax (Faction)', up: false }), 'King Tormax')
  assert.equal(factionHitName({ name: 'Emerald Warriors', label: 'EmeraldWarriors', up: true }), 'Emerald Warriors')
  assert.equal(factionHitName({ name: 'LegionofCabilis', plain: true, up: true }), 'LegionofCabilis')
})

test('Metal Bits (Blacksmithing 21): the quests that take it, and what each page says of factions', () => {
  const taking = index.questsTaking('Metal Bits')
  const expedition = taking.find((q) => q.page === 'Metal Bits for the New Sebilisian Expedition')
  assert.deepEqual(expedition, {
    quest: 'Metal Bits for the New Sebilisian Expedition',
    page: 'Metal Bits for the New Sebilisian Expedition',
    giver: 'Crusader Iktra',
    startZone: 'The Northern Desert of Ro',
    minLevel: 1,
    eraTag: 'Classic',
    ties: ['questPage', 'itemPage'], // the quest page names it, and its own page lists the quest
    factions: [{ name: 'New Sebilisian Expedition', up: true, amount: 5 }]
  })
  // Tied by the item's own page alone, and by the quest page alone.
  assert.deepEqual(taking.find((q) => q.page === 'Innoruuk Symbol Quests')?.ties, ['itemPage'])
  assert.deepEqual(taking.find((q) => q.page === 'Supplies for the New Sebilisian Expedition')?.ties, ['questPage'])
  // A quest whose page states no faction change is still a quest that takes it.
  assert.deepEqual(taking.find((q) => q.page === 'Bard Epic Quest')?.factions, [])
  assert.deepEqual(taking.map((q) => q.page), [...taking.map((q) => q.page)].sort((a, b) => a.localeCompare(b)))
})

test('an item is found by any of its spellings, and an unknown one has no quests', () => {
  const pages = (name: string): string[] => index.questsTaking(name).map((q) => q.page)
  assert.deepEqual(pages('metal bits'), pages('Metal Bits'))
  assert.deepEqual(pages('Metal_Bits +3'), pages('Metal Bits'))
  // items.json keys `a bar of ronium` and lists `Bar of Ronium` among its other names.
  assert.ok(pages('Bar of Ronium').includes('Armor of Ro Quests'))
  assert.deepEqual(pages('Bar of Ronium'), pages('A Bar of Ronium'))
  assert.deepEqual(pages('No Such Item'), [])
})

test('Hand Made Backpack (Tailoring 88) raises Kerra Isle through a page that never links the faction', () => {
  // Feskr's Supplies writes `Your faction standing with Kerra Isle has been adjusted by 20.`
  const turnIns = index.craftedTurnInsRaising('Kerra Isle')
  const backpack = turnIns.find((t) => t.item === 'Hand Made Backpack')
  assert.deepEqual(backpack?.tradeskills, [{ tradeskill: 'Tailoring', trivial: 88 }])
  assert.equal(backpack?.quest.page, "Feskr's Supplies")
  assert.deepEqual(backpack?.quest.ties, ['itemPage'])
  assert.deepEqual(backpack?.hit, { name: 'Kerra Isle', plain: true, up: true, amount: 20 })
  assert.deepEqual(index.craftedTurnInsRaising('KerraIsle'), turnIns)
})

test('Merchants of Halas: the patchwork armor (Tailoring 26) Cindl takes, +5 a turn-in', () => {
  const turnIns = index.craftedTurnInsRaising('Merchants of Halas')
  const boots = turnIns.find((t) => t.item === 'Large Patchwork Boots')
  assert.deepEqual(boots?.tradeskills, [{ tradeskill: 'Tailoring', trivial: 26 }])
  assert.equal(boots?.quest.page, "Cindl's Polar Bear Collection")
  assert.deepEqual(boots?.hit, { name: 'Merchants of Halas', up: true, amount: 5 })
  // The row carries the page's whole list, so a loss beside the raise can be shown.
  assert.deepEqual(boots?.quest.factions.map((h) => h.name), ['Merchants of Halas', 'Wolves of the North', 'Shamen of Justice', 'Rogues of the White Rose'])
})

test('more real rows: Muffin (Baking 135), Silk Swatch (Tailoring 15), Water Flask (Brewing 21)', () => {
  const row = (faction: string, item: string, page: string): { tradeskills: unknown; amount?: number } | undefined => {
    const t = index.craftedTurnInsRaising(faction).find((x) => x.item === item && x.quest.page === page)
    return t === undefined ? undefined : { tradeskills: t.tradeskills, ...(t.hit.amount === undefined ? {} : { amount: t.hit.amount }) }
  }
  assert.deepEqual(row('King Tearis Thex', 'Muffin', 'Muffin for Pandos'), { tradeskills: [{ tradeskill: 'Baking', trivial: 135 }], amount: 5 })
  assert.deepEqual(row("Faydark's Champions", 'Silk Swatch', 'Orc Vest'), { tradeskills: [{ tradeskill: 'Tailoring', trivial: 15 }], amount: 5 })
  assert.deepEqual(row('New Sebilisian Expedition', 'Water Flask', 'Supplies for the New Sebilisian Expedition'), {
    tradeskills: [{ tradeskill: 'Brewing', trivial: 21 }],
    amount: 5
  })
})

test('an item a quest hands out is not a turn-in for it', () => {
  // Bloodclaw Battle Axe is made by players and its page lists Collier's Weapon Treatment, which
  // rewards it.
  assert.ok(ITEMS['bloodclaw battle axe']?.questUses?.some((u) => u.page === "Collier's Weapon Treatment"))
  assert.ok(QUESTS.find((q) => q.page === "Collier's Weapon Treatment")?.rewards?.some((r) => r.name === 'Bloodclaw Battle Axe'))
  assert.deepEqual(index.questsTaking('Bloodclaw Battle Axe').filter((q) => q.page === "Collier's Weapon Treatment"), [])
})

test('a faction is answered in the game spelling, the wiki title or the log spelling alike', () => {
  const legion = index.craftedTurnInsRaising('Legion of Cabilis')
  assert.ok(legion.length > 0)
  assert.deepEqual(index.craftedTurnInsRaising('LegionofCabilis'), legion)
  assert.deepEqual(index.craftedTurnInsRaising('legion of cabilis'), legion)
  assert.ok(legion.some((t) => t.quest.page === 'Warrior Pike Quests'))
  assert.deepEqual(index.craftedTurnInsRaising('No Such Faction'), [])
})

test('the biggest stated raise comes first, the unstated ones last', () => {
  for (const faction of index.raisedByCrafting()) {
    const amounts = index.craftedTurnInsRaising(faction.name).map((t) => t.hit.amount ?? 0)
    assert.deepEqual(amounts, [...amounts].sort((a, b) => b - a), faction.name)
  }
})

test('every crafted turn-in row is a raise on a quest that takes a player-made item', () => {
  const factions = index.raisedByCrafting()
  assert.ok(factions.length > 50, `expected dozens of factions a crafted turn-in raises, got ${factions.length}`)
  const crafted = new Set(Object.values(ITEMS).filter((r) => r.playerCrafted === true).map((r) => r.page))
  const items = new Set<string>()
  for (const f of factions) {
    const turnIns = index.craftedTurnInsRaising(f.name)
    assert.equal(f.key, questFactionKey(f.name))
    assert.equal(f.items, new Set(turnIns.map((t) => t.item)).size, f.name)
    assert.equal(f.quests, new Set(turnIns.map((t) => t.quest.page)).size, f.name)
    for (const t of turnIns) {
      items.add(t.item)
      assert.ok(crafted.has(t.item), `${t.item} is player-made`)
      assert.ok(t.hit.up && t.quest.factions.includes(t.hit), `${t.item}: the hit is a raise on ${t.quest.page}`)
      assert.equal(questFactionKey(factionHitName(t.hit)), f.key)
      assert.ok(index.questsTaking(t.item).some((q) => q.page === t.quest.page), `${t.item} is taken by ${t.quest.page}`)
    }
  }
  assert.ok(items.size > 120, `expected over a hundred crafted items with a raise, got ${items.size}`)
  // Named as the wiki links them where any page does.
  for (const name of ['Coldain', 'Kerra Isle', 'Legion of Cabilis', 'Merchants of Halas']) assert.ok(factions.some((f) => f.name === name), name)
})

test('quests left out of the catalog passed in are left out of the answers', () => {
  // The Coldain turn-ins are on Velious pages; a caller that wants only what the server ships
  // passes inEraQuests(quests).
  assert.ok(index.craftedTurnInsRaising('Coldain').length > 0)
  const inEra = buildQuestFactionIndex(inEraQuests(QUESTS), ITEMS)
  for (const t of inEra.craftedTurnInsRaising('Coldain')) assert.notEqual(t.quest.eraTag, 'Velious')
  assert.ok(inEra.craftedTurnInsRaising('Merchants of Halas').length > 0)
})

test('a small catalog: ties, a reward left out, tradeskills listed once', () => {
  const quests: QuestEntry[] = [
    { name: 'Pie for Guards', page: 'Pie for Guards', requiredItems: ['Fish Pie'], factions: [{ name: 'Town Guards', up: true, amount: 3 }, { name: 'Bandits', up: false }] },
    { name: 'Baker Test', page: 'Baker Test', rewards: [{ name: 'Fish Pie' }], factions: [{ name: 'Bakers', up: true }] },
    { name: 'Silent Errand', page: 'Silent Errand', requiredItems: ['Fish Pie'] }
  ]
  const items: Record<string, FactionItemRecord> = {
    'fish pie': {
      page: 'Fish Pie',
      playerCrafted: true,
      craftedBy: [{ tradeskill: 'Baking' }, { tradeskill: 'Baking', trivial: 40 }, { tradeskill: 'Pottery', trivial: 12 }, {}],
      questUses: [{ quest: 'Pie', page: 'Pie for Guards#Second turn-in' }, { quest: 'Baker Test' }, { quest: 'A page the catalog lacks' }]
    },
    'fish scales': { page: 'Fish Scales', questUses: [{ quest: 'Pie for Guards' }] }
  }
  const small = buildQuestFactionIndex(quests, items)
  assert.deepEqual(small.questsTaking('Fish Pie').map((q) => [q.page, q.ties, q.factions.length]), [
    ['Pie for Guards', ['questPage', 'itemPage'], 2],
    ['Silent Errand', ['questPage'], 0]
  ])
  assert.deepEqual(small.raisedByCrafting(), [{ name: 'Town Guards', key: 'townguards', items: 1, quests: 1 }])
  const [turnIn] = small.craftedTurnInsRaising('town guards')
  assert.deepEqual(turnIn.tradeskills, [{ tradeskill: 'Baking', trivial: 40 }, { tradeskill: 'Pottery', trivial: 12 }])
  assert.equal(turnIn.item, 'Fish Pie')
  // Fish Scales is taken by the quest and is not player-made: a turn-in, no crafted row.
  assert.deepEqual(small.questsTaking('fish scales').map((q) => q.page), ['Pie for Guards'])
  assert.deepEqual(small.craftedTurnInsRaising('Bandits'), [])
})
