// The Faction goal of a workbench's route (src/shared/tradeskillRouteFaction.ts): first on a small
// fixture where every rule can be read off the page, then on the committed data (quests.json and
// the recipe book built from items.json the way the app builds it): Muffin (Baking), Silk Swatch
// (Tailoring), Tarnished Dagger (Blacksmithing).
//
// The dataset assertions are real rows and identities, never frozen counts of a scrape that grows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import questsJson from '../src/renderer/src/data/eqlegends/quests.json' with { type: 'json' }
import { buildItemDbIndex, type ItemDbFile } from '../src/main/itemsDb'
import { buildTradeskillBook } from '../src/main/tradeskillBook'
import type { OwnershipIndex } from '../src/shared/planner/ownership'
import { inEraQuests } from '../src/shared/questEra'
import { buildQuestFactionIndex, questFactionKey, type FactionItemRecord } from '../src/shared/questFactions'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookIndex } from '../src/shared/tradeskillBook'
import { NO_GUIDES } from '../src/shared/tradeskillGuide'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import { haveLookup } from '../src/shared/tradeskillMaterials'
import { moneyBook } from '../src/shared/tradeskillMoney'
import {
  AMOUNT_NOTE,
  LEVEL_UNSEEN_NOTE,
  LONG_LIST,
  NO_FORECAST_NOTE,
  SHARED_PAGE_NOTE,
  TIE_ITEM_PAGE,
  TIE_NOTE,
  TIE_QUEST_PAGE,
  bookFactionItems,
  buildFactionRoute,
  changeLabel,
  choiceFacts,
  factionCounts,
  standingText,
  trivialText,
  type FactionAsk,
  type FactionFacts,
  type FactionRoute,
  type FactionStep,
  type StandingWords
} from '../src/shared/tradeskillRouteFaction'
import { TRADESKILLS, tradeskillOf, type Tradeskill } from '../src/shared/tradeskills'
import type { QuestData, QuestEntry } from '../src/shared/types'
import { bought, fixtureSnap, ing, item, recipe, SEP_12 } from './tradeskillFixtures.mts'
import { ownerHeld } from './tradeskillRouteFixtures.mts'

// ---- the fixture --------------------------------------------------------------------------------

const baking = (name: string, trivial: number | undefined, over: Parameters<typeof recipe>[1] = {}): ReturnType<typeof recipe> =>
  recipe(name, { tradeskill: 'Baking', ...(trivial === undefined ? {} : { trivial }), ...over })

/** Five Baking recipes a quest takes, one Pottery recipe, one recipe no quest takes. */
function fixtureBook(): BookIndex {
  return indexBook({
    version: TRADESKILL_BOOK_VERSION,
    recipes: [
      // Its own page files a second turn-in under a quest the wiki hosts on a page of several.
      baking('Fish Pie', 40, { ingredients: [ing('Fish')], quests: ['Pie for Guards', 'Guard Feast'], questPages: { 'Guard Feast': 'Feast Quests' } }),
      baking('Mud Pie', 30, { ingredients: [ing('Mud')] }),
      baking('Loaf', 20),
      baking('Berry Tart', 80, { ingredients: [ing('Berry')] }),
      baking('Mystery Bun', undefined, { quests: ['Bun Run'] }),
      baking('Plain Roll', 10),
      recipe('Clay Pot', { tradeskill: 'Pottery', trivial: 12 })
    ],
    materials: {}
  })
}

const QUESTS: QuestEntry[] = [
  {
    name: 'Pie for Guards',
    page: 'Pie for Guards',
    giver: 'Captain Hale',
    startZone: 'North Qeynos, Surefall Glade',
    minLevel: 5,
    eraTag: 'Classic',
    requiredItems: ['Fish Pie'],
    factions: [{ name: 'Bandits', up: false }, { name: 'Town Guards', up: true, amount: 3 }]
  },
  {
    name: 'Feast Quests',
    page: 'Feast Quests',
    factions: [
      { name: 'Town Guards', up: true, amount: 3 },
      { name: 'Thieves', up: false, amount: -1 },
      { name: 'Smugglers', up: false, amount: -1 },
      { name: 'Pirates', up: false, amount: -1 },
      { name: 'Raiders', up: false, amount: -1 },
      { name: 'Bandits', up: false }
    ]
  },
  { name: 'Cheap Pie Day', page: 'Cheap Pie Day', requiredItems: ['Mud Pie'], factions: [{ name: 'Town Guards', up: true, amount: 3 }] },
  { name: 'Bread Line', page: 'Bread Line', requiredItems: ['Loaf'], factions: [{ name: 'Town Guards', up: true }] },
  {
    name: 'Tart Tax',
    page: 'Tart Tax',
    eraTag: 'Velious',
    requiredItems: ['Berry Tart'],
    factions: [{ name: 'Town Guards', up: true, amount: 10 }, { name: 'Bakers Guild', up: true, amount: 1 }]
  },
  // Tied by the item's own page alone.
  { name: 'Bun Run', page: 'Bun Run', factions: [{ name: 'Town Guards', up: true, amount: 1 }] },
  { name: 'Pot for Guards', page: 'Pot for Guards', requiredItems: ['Clay Pot'], factions: [{ name: 'Town Guards', up: true, amount: 2 }] },
  // Lowers a faction and raises none: no row and no entry.
  { name: 'Roll Theft', page: 'Roll Theft', requiredItems: ['Plain Roll'], factions: [{ name: 'Town Guards', up: false, amount: -5 }] }
]

const TOWN_GUARDS: StandingWords = { name: 'The Town Guards', label: 'amiably', value: 320 }

interface Case {
  held?: OwnershipIndex | null
  standings?: FactionFacts['standings']
}

/** Fish at 1 pp, Mud at 0.1 pp and Berry at 0.5 pp in the log; no inventory dump unless a test hands one in. */
function fixtureFacts(over: Case = {}): FactionFacts {
  const index = fixtureBook()
  const snap = fixtureSnap({
    items: [item('Fish Pie', { made: 6, failed: 2 })],
    bought: [bought('Fish', 1, 1_000, 'Baker Ann'), bought('Mud', 10, 1_000, 'Baker Ann'), bought('Berry', 2, 1_000, 'Baker Ann')],
    sold: [],
    depot: []
  })
  const craft = indexCrafting(snap, index)
  return {
    index,
    craft,
    guides: NO_GUIDES,
    money: moneyBook(craft, index),
    have: haveLookup({ index: over.held ?? null, dumpedAt: SEP_12 }, craft),
    turnIns: buildQuestFactionIndex(QUESTS, bookFactionItems(index)),
    standings: over.standings ?? null
  }
}

const ask = (over: Partial<FactionAsk> = {}): FactionAsk => ({ tradeskill: 'Baking', level: 50, faction: null, ...over })

/** A route as "item | quest page" lines. */
const lines = (r: FactionRoute): string[] => r.steps.map((s) => `${s.name} | ${s.turnIn.page}`)

const stepOf = (r: FactionRoute, name: string, page: string): FactionStep => {
  const found = r.steps.find((s) => s.name === name && s.turnIn.page === page)
  assert.ok(found, `${name} | ${page} is a row`)
  return found
}

/** Everything a row puts on screen. */
const words = (s: FactionStep): string =>
  [s.range, s.name, s.why, s.aside, s.money, s.handText, s.record, s.turnIn.quest, s.turnIn.eraNote, s.turnIn.shared, s.turnIn.tie, ...s.turnIn.changes.map(changeLabel)].join(' ')

// ---- the fixture's tests ------------------------------------------------------------------------

test('the list: every faction a turn-in of the tradeskill raises, with how many recipes feed it', () => {
  const r = buildFactionRoute(fixtureFacts(), ask())
  // Bandits, Thieves and the rest are only lowered: no entry. Clay Pot is Pottery's.
  assert.deepEqual(r.choices.map((c) => [c.name, c.recipes, c.quests]), [['Bakers Guild', 1, 1], ['Town Guards', 5, 6]])
  // Nothing remembered: the faction most recipes feed. A remembered one stands while the list holds it.
  assert.equal(r.picked?.name, 'Town Guards')
  assert.equal(buildFactionRoute(fixtureFacts(), ask({ faction: questFactionKey('Bakers Guild') })).picked?.name, 'Bakers Guild')
  assert.equal(buildFactionRoute(fixtureFacts(), ask({ faction: 'a faction of another tradeskill' })).picked?.name, 'Town Guards')
  assert.deepEqual(factionCounts(fixtureFacts()), [{ tradeskill: 'Baking', factions: 2 }, { tradeskill: 'Pottery', factions: 1 }])
})

test('the order: at or under the level first, then the stated raise, then the known cost, and the route says so', () => {
  const r = buildFactionRoute(fixtureFacts(), ask())
  assert.deepEqual(lines(r), [
    // At or under 50. +3 three times: Mud Pie's combine costs 0.1 pp, Fish Pie's 1 pp (its two pages by name).
    'Mud Pie | Cheap Pie Day',
    'Fish Pie | Feast Quests',
    'Fish Pie | Pie for Guards',
    // A raise with no stated number comes after every stated one.
    'Loaf | Bread Line',
    // Above the level, or no trivial on the wiki: +10 before +1.
    'Berry Tart | Tart Tax',
    'Mystery Bun | Bun Run'
  ])
  assert.deepEqual(r.steps.map((s) => s.easy), [true, true, true, true, false, false])
  assert.equal(r.next, r.steps[0])
  assert.equal(
    r.basis,
    "Baking items a quest takes where the quest's wiki page states a raise of Town Guards. Order: recipes whose trivial is at or under your level first, then the biggest raise the wiki states, then the lowest cost per combine at the prices you last paid."
  )
  assert.equal(r.empty, '')
  assert.deepEqual(r.caveats, [SHARED_PAGE_NOTE, TIE_NOTE, AMOUNT_NOTE, NO_FORECAST_NOTE])
  // A level the log never showed: nothing counts as trivial, and the route says that first.
  const unseen = buildFactionRoute(fixtureFacts(), ask({ level: null }))
  assert.ok(unseen.steps.every((s) => !s.easy))
  assert.equal(unseen.steps[0]?.name, 'Berry Tart')
  assert.equal(unseen.caveats[0], LEVEL_UNSEEN_NOTE)
})

test('a row: the trivial against the level, the quest, who and where, every change, cost and the own record', () => {
  const r = buildFactionRoute(fixtureFacts(), ask())
  const pie = stepOf(r, 'Fish Pie', 'Pie for Guards')
  assert.equal(pie.range, 'trivial 40, at or under your level (50)')
  assert.equal(pie.recipe?.item, 'Fish Pie')
  assert.equal(pie.linked, true)
  assert.equal(pie.turnIn.quest, 'Pie for Guards')
  assert.equal(pie.turnIn.giver, 'Captain Hale')
  assert.deepEqual(pie.turnIn.zones, ['North Qeynos', 'Surefall Glade'])
  assert.equal(pie.turnIn.minLevel, 5)
  // Raises, then losses: the loss is on the row as plainly as the raise, with no number the wiki does not state.
  assert.deepEqual(pie.turnIn.changes.map(changeLabel), ['Town Guards +3', 'Bandits lowered'])
  assert.deepEqual(pie.turnIn.changes.map((c) => [c.up, c.picked]), [[true, true], [false, false]])
  assert.deepEqual([pie.turnIn.raises.map(changeLabel), pie.turnIn.losses.map(changeLabel)], [['Town Guards +3'], ['Bandits lowered']])
  assert.equal(pie.turnIn.raise.text, '+3')
  assert.equal(pie.cost, 1_000)
  // The price is tradeskillMoney's own print: only its sentence is pinned here.
  assert.match(pie.money, /^\S+ pp a combine at the prices you last paid\. /)
  assert.equal(pie.record, 'Your own record: failed 2 of 8 combines.')
  assert.equal(pie.id, 'fish pie#0|Pie for Guards')
  // Both pages tie it: nothing to say. The quest page alone, and the item's own page alone, say which.
  assert.equal(pie.turnIn.tie, '')
  assert.equal(stepOf(r, 'Mud Pie', 'Cheap Pie Day').turnIn.tie, TIE_QUEST_PAGE)
  assert.equal(stepOf(r, 'Mystery Bun', 'Bun Run').turnIn.tie, TIE_ITEM_PAGE)

  assert.equal(stepOf(r, 'Loaf', 'Bread Line').turnIn.raise.text, 'raised')
  assert.equal(stepOf(r, 'Berry Tart', 'Tart Tax').range, 'trivial 80, above your level (50)')
  assert.equal(stepOf(r, 'Mystery Bun', 'Bun Run').range, 'no trivial on the wiki')
  assert.equal(trivialText({ trivial: 80 }, null), 'trivial 80')
  assert.equal(stepOf(r, 'Berry Tart', 'Tart Tax').turnIn.eraNote, 'Velious quest: not open in the current era.')
  assert.equal(pie.turnIn.eraNote, '')
})

test('a row whose page hosts several turn-ins is marked, by what the data gives, and is never hidden', () => {
  const r = buildFactionRoute(fixtureFacts(), ask())
  const feast = stepOf(r, 'Fish Pie', 'Feast Quests')
  assert.deepEqual(feast.turnIn.filedAs, ['Guard Feast'])
  assert.equal(
    feast.turnIn.shared,
    'Shared page: the item\'s own page files this turn-in as "Guard Feast"; its title names several quests; it lists 6 faction changes. Some of the changes on this row may belong to another turn-in on it.'
  )
  // The whole list is on the row all the same.
  assert.equal(feast.turnIn.changes.length, 6)
  assert.ok(6 > LONG_LIST)
  for (const page of ['Pie for Guards', 'Cheap Pie Day']) assert.equal(r.steps.find((s) => s.turnIn.page === page)?.turnIn.shared, '', page)
  assert.ok(r.caveats.includes(SHARED_PAGE_NOTE))
})

test('the standing is the Factions tab\'s words when a dump is loaded, and nothing when none is', () => {
  const key = questFactionKey('Town Guards')
  const none = buildFactionRoute(fixtureFacts(), ask())
  assert.equal(none.picked?.standing, null)
  assert.equal(choiceFacts(none.choices[1], false), '5 recipes')
  assert.equal(none.steps[0]?.turnIn.raise.openAs, 'Town Guards')

  const r = buildFactionRoute(fixtureFacts({ standings: new Map([[key, TOWN_GUARDS]]) }), ask())
  assert.deepEqual(r.picked?.standing, TOWN_GUARDS)
  assert.equal(standingText(TOWN_GUARDS), 'amiably, 320')
  assert.equal(choiceFacts(r.choices[1], true), '5 recipes · your standing: amiably, 320')
  assert.equal(choiceFacts(r.choices[0], true), '1 recipe · not in your faction dump')
  // The link to the Factions tab asks for the dump's own spelling.
  assert.equal(r.steps[0]?.turnIn.raise.openAs, 'The Town Guards')
})

test('"Only use materials I have": only recipes the held materials cover, each judged alone, and it says when none is', () => {
  // The dump holds 3 Fish and no Mud or Berry; Loaf and the bun list no material to count.
  const held = buildFactionRoute(fixtureFacts({ held: ownerHeld({ Fish: 3 }) }), ask({ heldOnly: true }))
  assert.equal(held.heldOnly, true)
  assert.deepEqual(lines(held), ['Fish Pie | Feast Quests', 'Fish Pie | Pie for Guards'])
  // The mark is the Recipes tab's "can make 3"; the sentence is kept for a count of 0.
  assert.deepEqual(held.steps.map((s) => [s.canMake, s.handText]), [[3, ''], [3, '']])
  assert.equal(stepOf(buildFactionRoute(fixtureFacts({ held: ownerHeld() }), ask()), 'Fish Pie', 'Pie for Guards').handText, 'Materials on hand for 0.')
  assert.equal(stepOf(buildFactionRoute(fixtureFacts(), ask()), 'Fish Pie', 'Pie for Guards').canMake, 0)
  assert.match(held.basis, /^Only recipes you hold every material for\. /)
  // The list of factions is the data's, whatever is held.
  assert.deepEqual(held.choices.map((c) => c.recipes), [1, 5])
  const none = buildFactionRoute(fixtureFacts({ held: ownerHeld() }), ask({ heldOnly: true }))
  assert.deepEqual(none.steps, [])
  assert.equal(none.next, null)
  assert.equal(none.empty, 'You do not hold every material for any Baking recipe whose item is a turn-in that raises Town Guards.')
  // Off, the same dump changes no row.
  assert.equal(buildFactionRoute(fixtureFacts({ held: ownerHeld() }), ask()).steps.length, 6)
})

test('no turn-in of the tradeskill raises a faction: one line says so, with the tradeskills that have some', () => {
  const r = buildFactionRoute(fixtureFacts(), ask({ tradeskill: 'Fletching' }))
  assert.deepEqual(r.choices, [])
  assert.equal(r.picked, null)
  assert.deepEqual(r.steps, [])
  assert.equal(r.basis, '')
  assert.deepEqual(r.caveats, [])
  assert.equal(r.empty, "No Fletching recipe makes an item that a quest takes for a faction raise, on the wiki's quest pages. Baking has 2, Pottery 1.")
  assert.match(buildFactionRoute(fixtureFacts(), ask({ tradeskill: 'Fletching', eraOnly: true })).empty, /for a faction raise in the current era, on the wiki's quest pages\./)
})

test('NOTHING FORECAST: no row states a chance, a count of turn-ins or a standing to reach', () => {
  const forecast = /%|percent|chance|odds|expect|estimat|\best\b|about \d|roughly|approx|probabl|likely|on average|in total|altogether|to reach|turn-ins? (?:needed|to)|more turn-ins/i
  const r = buildFactionRoute(fixtureFacts({ held: ownerHeld({ Fish: 3 }), standings: new Map([[questFactionKey('Town Guards'), TOWN_GUARDS]]) }), ask())
  assert.ok(r.steps.length > 0)
  for (const step of r.steps) {
    assert.doesNotMatch(words(step), forecast)
    assert.doesNotMatch(words(step), /[–—]/, 'no long dash in a row')
  }
  // The route's own lines name a forecast only to say none is shown.
  for (const line of [r.basis, ...r.caveats]) assert.doesNotMatch(line, /%|\d+ (?:turn-ins|combines)|[–—]/, line)
  assert.ok(r.caveats.some((c) => c.includes('no number of turn-ins or combines is shown')))
})

// ---- the committed data -------------------------------------------------------------------------

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
  assert.equal(stepOf(r, 'Clump of Dough', 'Muffin Quests').turnIn.tie, TIE_QUEST_PAGE)
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
      // At or under the level first; inside each half no stated raise after an unstated one.
      const easy = r.steps.map((s) => s.easy)
      assert.deepEqual(easy, [...easy].sort((a, b) => Number(b) - Number(a)), `${tradeskill} ${choice.name}`)
      for (const step of r.steps) {
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
