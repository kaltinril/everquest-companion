// The Faction goal of a workbench's route (src/shared/tradeskillRouteFaction.ts) on the committed
// data: quests.json and the recipe book built from items.json the way the app builds it. Muffin
// (Baking), Silk Swatch (Tailoring), Tarnished Dagger (Blacksmithing), then every row of every
// tradeskill. The rules themselves are read off a small fixture in
// tradeskillRouteFaction.test.mts; this file was split from it at the lint's file-length ceiling.
//
// The assertions are real rows and identities, never frozen counts of a scrape that grows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import questsJson from '../src/renderer/src/data/eqlegends/quests.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook } from '../src/main/tradeskillBook'
import { inEraQuests } from '../src/shared/questEra'
import { buildQuestFactionIndex, questFactionKey, type FactionItemRecord } from '../src/shared/questFactions'
import { indexBook } from '../src/shared/tradeskillBook'
import { NO_GUIDES } from '../src/shared/tradeskillGuide'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import { haveLookup } from '../src/shared/tradeskillMaterials'
import { moneyBook } from '../src/shared/tradeskillMoney'
import {
  CHANGE_CAP,
  LONG_LIST,
  TIE_ITEM_PAGE,
  TIE_QUEST_PAGE,
  bookFactionItems,
  buildFactionRoute,
  changeLabel,
  factionCounts,
  shownChanges,
  type FactionFacts,
  type FactionRoute,
  type FactionStep
} from '../src/shared/tradeskillRouteFaction'
import { TRADESKILLS, tradeskillOf, type Tradeskill } from '../src/shared/tradeskills'
import type { QuestData, QuestEntry } from '../src/shared/types'

/** The order's three groups as their place in it. */
const RANK = { own: 0, shared: 1, questOnly: 2 } as const

const stepOf = (r: FactionRoute, name: string, page: string): FactionStep => {
  const found = r.steps.find((s) => s.name === name && s.turnIn.page === page)
  assert.ok(found, `${name} | ${page} is a row`)
  return found
}

const ALL_QUESTS = (questsJson as unknown as QuestData).quests
const ITEMS = (itemsJson as unknown as { items: Record<string, FactionItemRecord> }).items
const BOOK = indexBook(buildTradeskillBook(buildItemDbIndex(itemsJson as unknown as ItemDbFile), new Map()))

/** The committed data as the workbench reads it: no log, no dump. `eraOnly` is the Current era setting. */
function dataFacts(eraOnly: boolean): FactionFacts {
  const craft = indexCrafting(null, BOOK)
  return {
    index: BOOK,
    craft,
    guides: NO_GUIDES,
    money: moneyBook(craft, BOOK),
    have: haveLookup({ index: null, dumpedAt: null }, craft),
    turnIns: buildQuestFactionIndex(eraOnly ? inEraQuests(ALL_QUESTS) : ALL_QUESTS, bookFactionItems(BOOK)),
    standings: null
  }
}

const IN_ERA = dataFacts(true)

const dataRoute = (tradeskill: Tradeskill, faction: string, level: number | null = null): FactionRoute =>
  buildFactionRoute(IN_ERA, { tradeskill, level, faction: questFactionKey(faction), eraOnly: true })

test('Muffin (Baking 135): King Tearis Thex through Muffin for Pandos, +5, with the loss beside the raises', () => {
  const r = dataRoute('Baking', 'King Tearis Thex', 150)
  assert.equal(r.picked?.name, 'King Tearis Thex')
  const muffin = stepOf(r, 'Muffin', 'Muffin for Pandos')
  assert.equal(muffin.range, 'trivial 135, at or under your level (150)')
  assert.equal(muffin.turnIn.giver, 'Pandos Flintside')
  assert.deepEqual(muffin.turnIn.zones, ['West Freeport'])
  assert.equal(muffin.turnIn.raise.text, '+5')
  const changes = muffin.turnIn.changes.map(changeLabel)
  assert.ok(changes.includes('King Tearis Thex +5'), changes.join(', '))
  assert.ok(changes.includes('Crushbone Orcs -1'), changes.join(', '))
  // Raises before losses.
  assert.deepEqual(muffin.turnIn.changes.map((c) => c.up), [...muffin.turnIn.changes.map((c) => c.up)].sort((a, b) => Number(b) - Number(a)))
  assert.equal(muffin.turnIn.shared, '')
  // The quest page names the muffin; the muffin's own page lists another quest page.
  assert.equal(muffin.turnIn.tie, TIE_QUEST_PAGE)
  // No log: the cost is not stated, and the reason names what was never bought.
  assert.equal(muffin.cost, null)
  assert.match(muffin.money, /^No cost stated: your log shows no purchase of /)
  // Above the level, the same row says so.
  assert.equal(stepOf(dataRoute('Baking', 'King Tearis Thex', 100), 'Muffin', 'Muffin for Pandos').range, 'trivial 135, above your level (100)')
})

test('Muffin on Muffin Quests: one page for every city, so the row is marked and its whole list is shown', () => {
  const r = dataRoute('Baking', 'Merchants of Halas', 150)
  const muffin = stepOf(r, 'Muffin', 'Muffin Quests')
  assert.match(muffin.turnIn.shared, /^Shared page: its title names several quests; it lists \d+ faction changes\. /)
  assert.ok(muffin.turnIn.changes.length > LONG_LIST)
  // The page's other cities are on the row too: that is what the mark is about.
  const names = muffin.turnIn.changes.map((c) => c.name)
  for (const name of ['Merchants of Halas', 'Merchants of Kaladim', 'Merchants of Qeynos']) assert.ok(names.includes(name), name)
  assert.equal(muffin.turnIn.tie, '')
  // Clump of Dough is a material of the muffin that the page names: tied by the quest page alone, and the row says so.
  const dough = stepOf(r, 'Clump of Dough', 'Muffin Quests')
  assert.equal(dough.turnIn.tie, TIE_QUEST_PAGE)
  // Both rows are kept, the muffin's (its own page lists the quest) before the dough's.
  assert.deepEqual([muffin.turnIn.group, dough.turnIn.group], ['shared', 'questOnly'])
  assert.ok(r.steps.indexOf(muffin) < r.steps.indexOf(dough))
  // The page's long list is cut on screen to this faction's own change and eight more, and opens whole.
  const closed = shownChanges(muffin.turnIn, false)
  assert.equal(closed.raises[0]?.name, 'Merchants of Halas')
  assert.equal(closed.raises.length + closed.losses.length, 1 + CHANGE_CAP)
  assert.equal(closed.more, muffin.turnIn.changes.length - 1 - CHANGE_CAP)
  const open = shownChanges(muffin.turnIn, true)
  assert.deepEqual([...open.raises, ...open.losses].map((c) => c.name).sort(), muffin.turnIn.changes.map((c) => c.name).sort())
})

test('what the goal opens on: Baking and Tailoring start on a faction with a row the item\'s own page backs, and on that row', () => {
  for (const tradeskill of ['Baking', 'Tailoring'] as const) {
    const r = buildFactionRoute(IN_ERA, { tradeskill, level: null, faction: null, eraOnly: true })
    const [picked] = r.choices
    const [first] = r.steps
    assert.ok(picked !== undefined && first !== undefined, tradeskill)
    assert.equal(r.picked, picked, tradeskill)
    assert.ok(picked.own > 0, `${tradeskill} opens on ${picked.name}, which has no such row`)
    assert.deepEqual([first.turnIn.group, first.turnIn.shared], ['own', ''], `${tradeskill}: ${first.name} on ${first.turnIn.page}`)
    assert.notEqual(first.turnIn.tie, TIE_QUEST_PAGE)
  }
  // The capture of 2026-11-20: Baking opened on Clurg, whose rows are all on Muffin Quests.
  assert.notEqual(buildFactionRoute(IN_ERA, { tradeskill: 'Baking', level: null, faction: null, eraOnly: true }).picked?.name, 'Clurg')
})

test("Silk Swatch (Tailoring 15): Faydarks Champions through Orc Vest, +5, in Kelethin and West Freeport", () => {
  const r = dataRoute('Tailoring', "Faydark's Champions", 60)
  assert.equal(r.picked?.name, 'Faydarks Champions')
  const swatch = stepOf(r, 'Silk Swatch', 'Orc Vest')
  assert.equal(swatch.range, 'trivial 15, at or under your level (60)')
  assert.equal(swatch.easy, true)
  assert.equal(swatch.turnIn.giver, 'Linadian')
  assert.deepEqual(swatch.turnIn.zones, ['Kelethin', 'West Freeport'])
  assert.deepEqual(swatch.turnIn.changes.map(changeLabel), ['Kelethin Merchants +5', 'Faydarks Champions +5', 'Emerald Warriors +5'])
  assert.equal(swatch.turnIn.shared, '')
  assert.equal(swatch.turnIn.tie, '')
  // The same recipe is a row under each of the three factions its page raises.
  for (const faction of ['Kelethin Merchants', 'Emerald Warriors']) stepOf(dataRoute('Tailoring', faction), 'Silk Swatch', 'Orc Vest')
})

test('Tarnished Dagger (Blacksmithing 18): its page files the turn-in under a quest the wiki hosts on Tunare Symbol Quests', () => {
  const r = dataRoute('Blacksmithing', 'Clerics of Tunare')
  const dagger = stepOf(r, 'Tarnished Dagger', 'Tunare Symbol Quests')
  assert.deepEqual(dagger.turnIn.filedAs, ['Tunare Scouts Dagger'])
  assert.match(dagger.turnIn.shared, /^Shared page: the item's own page files this turn-in as "Tunare Scouts Dagger"; its title names several quests\./)
  // The page states the direction and no number.
  assert.equal(dagger.turnIn.raise.text, 'raised')
  assert.equal(dagger.turnIn.tie, TIE_ITEM_PAGE)
})

test('the recipe book carries the page of a quest the wiki hosts under another title (main/tradeskillBook.ts)', () => {
  const dagger = [...BOOK.byId.values()].find((r) => r.item === 'Tarnished Dagger')
  assert.ok(dagger?.quests?.includes('Tunare Scouts Dagger'))
  assert.equal(dagger.questPages?.['Tunare Scouts Dagger'], 'Tunare Symbol Quests')
  // Only a quest whose page has another title has an entry, and every entry is one of the recipe's quests.
  let hosted = 0
  for (const r of BOOK.byId.values()) {
    for (const [quest, page] of Object.entries(r.questPages ?? {})) {
      hosted += 1
      assert.notEqual(quest, page, r.item)
      assert.ok(r.quests?.includes(quest), `${r.item}: ${quest}`)
    }
  }
  assert.ok(hosted > 20, `expected dozens of hosted quests, got ${String(hosted)}`)
})

test('every row of every tradeskill is ordered by the stated rule and carries its picked raise', () => {
  let rows = 0
  for (const tradeskill of TRADESKILLS) {
    for (const choice of buildFactionRoute(IN_ERA, { tradeskill, level: 100, faction: null }).choices) {
      const r = buildFactionRoute(IN_ERA, { tradeskill, level: 100, faction: choice.key })
      assert.equal(r.picked?.key, choice.key)
      assert.equal(new Set(r.steps.map((s) => s.recipe?.id)).size, choice.recipes, `${tradeskill} ${choice.name}`)
      assert.equal(new Set(r.steps.map((s) => s.id)).size, r.steps.length, `${tradeskill} ${choice.name}: one row per recipe and page`)
      // The three groups in their order; inside each, at or under the level first.
      const ranks = r.steps.map((s) => RANK[s.turnIn.group])
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${tradeskill} ${choice.name}`)
      assert.equal(r.steps.filter((s) => s.turnIn.group === 'own').length, choice.own, `${tradeskill} ${choice.name}: the count the list is ordered by`)
      for (const group of ['own', 'shared', 'questOnly'] as const) {
        const easy = r.steps.filter((s) => s.turnIn.group === group).map((s) => s.easy)
        assert.deepEqual(easy, [...easy].sort((a, b) => Number(b) - Number(a)), `${tradeskill} ${choice.name} ${group}`)
      }
      for (const step of r.steps) {
        // A quest-page-only row is in the last group whatever else marks it; a marked row is never in the first.
        assert.equal(step.turnIn.group === 'questOnly', step.turnIn.tie === TIE_QUEST_PAGE, step.id)
        assert.ok(step.turnIn.group !== 'own' || step.turnIn.shared === '', step.id)
        rows += 1
        assert.equal(step.recipe?.tradeskill, tradeskill)
        assert.ok(step.turnIn.raise.up && step.turnIn.raise.picked && step.turnIn.raise.key === choice.key)
        assert.ok(step.turnIn.changes.some((c) => c.picked))
        assert.equal(step.turnIn.eraNote, '', `${step.name}: an out-of-era quest under the era setting`)
      }
    }
  }
  assert.ok(rows > 200, `expected hundreds of turn-in rows, got ${String(rows)}`)
})

test('the list of factions on the committed data: the most rows the item\'s own page backs first, and the default is its first', () => {
  for (const tradeskill of TRADESKILLS) {
    const r = buildFactionRoute(IN_ERA, { tradeskill, level: null, faction: null })
    const order = r.choices.map((c) => c.own)
    assert.deepEqual(order, [...order].sort((a, b) => b - a), tradeskill)
    assert.equal(r.picked ?? null, r.choices[0] ?? null, tradeskill)
    // Never a faction with only shared or quest-page-only rows while another has a row its item's page backs.
    if (r.choices.some((c) => c.own > 0)) assert.ok((r.picked?.own ?? 0) > 0 && r.steps[0]?.turnIn.group === 'own', tradeskill)
  }
})

/** Every "tradeskill|faction|item page|quest page" the item database's own join holds for a list of quests. */
function turnInsFromItems(quests: readonly QuestEntry[]): Set<string> {
  const full = buildQuestFactionIndex(quests, ITEMS)
  const rows = full.raisedByCrafting().flatMap((faction) =>
    full.craftedTurnInsRaising(faction.name).flatMap((t) =>
      t.tradeskills.flatMap((made) => {
        const tradeskill = tradeskillOf(made.tradeskill)
        return tradeskill === undefined ? [] : [`${tradeskill}|${faction.key}|${t.item}|${t.quest.page}`]
      })
    )
  )
  return new Set(rows)
}

/** The same keys, from the rows the Faction goal draws for every tradeskill and faction. */
function turnInsFromBook(facts: FactionFacts): Set<string> {
  const rows = TRADESKILLS.flatMap((tradeskill) =>
    buildFactionRoute(facts, { tradeskill, level: null, faction: null }).choices.flatMap((choice) =>
      buildFactionRoute(facts, { tradeskill, level: null, faction: choice.key }).steps.map((step) => `${tradeskill}|${choice.key}|${step.recipe?.page ?? step.name}|${step.turnIn.page}`)
    )
  )
  return new Set(rows)
}

test('the recipe book gives the join the same turn-ins the item database does', () => {
  // The renderer holds the book, not items.json: `bookFactionItems` must lose no turn-in of a tradeskill.
  for (const [quests, facts] of [[inEraQuests(ALL_QUESTS), IN_ERA], [ALL_QUESTS, dataFacts(false)]] as const) {
    const fromItems = turnInsFromItems(quests)
    const fromBook = turnInsFromBook(facts)
    assert.ok(fromItems.size > 200, `expected hundreds of turn-ins, got ${String(fromItems.size)}`)
    const invented = [...fromBook].filter((row) => !fromItems.has(row))
    const lost = [...fromItems].filter((row) => !fromBook.has(row))
    assert.deepEqual(invented, [], 'a row the item database does not hold')
    // Measured 2026-11-20: none lost. A few may be once an item is tied only through another name of its page.
    assert.ok(lost.length <= fromItems.size * 0.02, `the book lost ${String(lost.length)} of ${String(fromItems.size)} turn-ins: ${lost.slice(0, 5).join('; ')}`)
  }
})

test('the era setting: out-of-era quest pages are left out, and shown with their era when the setting is off', () => {
  // Jewelcrafting's only faction turn-ins are on pages of a later era.
  const inEra = buildFactionRoute(IN_ERA, { tradeskill: 'Jewelcrafting', level: 205, faction: null, eraOnly: true })
  assert.deepEqual(inEra.choices, [])
  assert.match(inEra.empty, /^No Jewelcrafting recipe makes an item that a quest takes for a faction raise in the current era, on the wiki's quest pages\. \w+ has \d+/)
  const all = dataFacts(false)
  const open = buildFactionRoute(all, { tradeskill: 'Jewelcrafting', level: 205, faction: null })
  assert.ok(open.choices.length > 0)
  assert.ok(open.steps.length > 0 && open.steps.every((s) => s.turnIn.eraNote !== ''), 'each row names its era')
  // With the setting off a tradeskill never has fewer factions than with it on.
  const counts = new Map(factionCounts(all).map((row) => [row.tradeskill, row.factions]))
  for (const row of factionCounts(IN_ERA)) assert.ok((counts.get(row.tradeskill) ?? 0) >= row.factions, row.tradeskill)
})

test('how many factions each tradeskill feeds: Baking, Brewing, Blacksmithing and Tailoring by the dozen', () => {
  const counts = new Map(factionCounts(IN_ERA).map((row) => [row.tradeskill, row.factions]))
  // Measured 2026-11-20, in era: Baking 42, Brewing 42, Blacksmithing 38, Tailoring 30, Pottery 25, Fletching 13, Fishing 3.
  for (const tradeskill of ['Baking', 'Brewing', 'Blacksmithing', 'Tailoring'] as const) assert.ok((counts.get(tradeskill) ?? 0) >= 20, `${tradeskill}: ${String(counts.get(tradeskill))}`)
  assert.equal(counts.has('Jewelcrafting'), false)
  const sizes = factionCounts(IN_ERA).map((row) => row.factions)
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a), 'most first')
})
