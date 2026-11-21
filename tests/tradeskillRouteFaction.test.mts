// The Faction goal of a workbench's route (src/shared/tradeskillRouteFaction.ts), on a small
// fixture where every rule can be read off the page: the list of factions and its default, the
// order of the rows, a row's words, the marks, the cut list of changes, the held-only switch.
// The same rules on the committed data are tradeskillRouteFactionData.test.mts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { OwnershipIndex } from '../src/shared/planner/ownership'
import { buildQuestFactionIndex, questFactionKey } from '../src/shared/questFactions'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookIndex } from '../src/shared/tradeskillBook'
import { NO_GUIDES } from '../src/shared/tradeskillGuide'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import { haveLookup } from '../src/shared/tradeskillMaterials'
import { moneyBook } from '../src/shared/tradeskillMoney'
import {
  AMOUNT_NOTE,
  CHANGE_CAP,
  FEWER_CHANGES_LABEL,
  HOW_TO_READ_HIDE_LABEL,
  HOW_TO_READ_LABEL,
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
  moreChangesLabel,
  shownChanges,
  standingText,
  trivialText,
  type FactionAsk,
  type FactionChange,
  type FactionFacts,
  type FactionRoute,
  type FactionStep,
  type StandingWords
} from '../src/shared/tradeskillRouteFaction'
import type { QuestEntry } from '../src/shared/types'
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
  /** Another set of quest pages over the same recipes; the fixture's own when absent. */
  quests?: QuestEntry[]
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
    turnIns: buildQuestFactionIndex(over.quests ?? QUESTS, bookFactionItems(index)),
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
  // The count shown is the recipes; the order is by the rows the item's own page backs, then by name.
  assert.deepEqual(r.choices.map((c) => [c.name, c.recipes, c.quests, c.own]), [['Town Guards', 5, 6, 2], ['Bakers Guild', 1, 1, 0]])
  // Nothing remembered: the list's first. A remembered one stands while the list holds it.
  assert.equal(r.picked?.name, 'Town Guards')
  assert.equal(buildFactionRoute(fixtureFacts(), ask({ faction: questFactionKey('Bakers Guild') })).picked?.name, 'Bakers Guild')
  assert.equal(buildFactionRoute(fixtureFacts(), ask({ faction: 'a faction of another tradeskill' })).picked?.name, 'Town Guards')
  assert.deepEqual(factionCounts(fixtureFacts()), [{ tradeskill: 'Baking', factions: 2 }, { tradeskill: 'Pottery', factions: 1 }])
})

test("the order: rows the item's own page backs, then shared pages, then quest-page-only rows; inside each the level, the raise, the cost", () => {
  const r = buildFactionRoute(fixtureFacts(), ask())
  assert.deepEqual(lines(r), [
    // The item's own page lists the quest and nothing marks the page: at or under 50 before no trivial.
    'Fish Pie | Pie for Guards',
    'Mystery Bun | Bun Run',
    // Marked as a shared page (and the item's own page lists it).
    'Fish Pie | Feast Quests',
    // Named on the quest page only. At or under 50: +3 at 0.1 pp a combine, then a raise with no stated number.
    'Mud Pie | Cheap Pie Day',
    'Loaf | Bread Line',
    // Above the level.
    'Berry Tart | Tart Tax'
  ])
  assert.deepEqual(r.steps.map((s) => s.turnIn.group), ['own', 'own', 'shared', 'questOnly', 'questOnly', 'questOnly'])
  assert.deepEqual(r.steps.map((s) => s.easy), [true, false, true, true, true, false])
  assert.equal(r.next, r.steps[0])
  assert.equal(
    r.basis,
    "Baking items a quest takes where the quest's wiki page states a raise of Town Guards. Order: turn-ins the item's own page lists first, then rows marked shared page, then rows named on the quest page only. Inside each: trivial at or under your level, then the biggest raise the wiki states, then the lowest cost per combine at the prices you last paid."
  )
  assert.equal(r.empty, '')
  // The reading notes, behind one control on screen; nothing bears on this reader's own rows.
  assert.deepEqual(r.caveats, [SHARED_PAGE_NOTE, TIE_NOTE, AMOUNT_NOTE, NO_FORECAST_NOTE])
  assert.equal(r.notice, '')
  // A level the log never showed: nothing counts as trivial, and the route says that under its first line.
  const unseen = buildFactionRoute(fixtureFacts(), ask({ level: null }))
  assert.ok(unseen.steps.every((s) => !s.easy))
  assert.deepEqual(lines(unseen).slice(0, 2), ['Fish Pie | Pie for Guards', 'Mystery Bun | Bun Run'])
  // Inside the last group the stated raises now decide alone: +10, +3, then the one with no number.
  assert.deepEqual(lines(unseen).slice(3), ['Berry Tart | Tart Tax', 'Mud Pie | Cheap Pie Day', 'Loaf | Bread Line'])
  assert.equal(unseen.notice, LEVEL_UNSEEN_NOTE)
  assert.deepEqual(unseen.caveats, r.caveats)
})

test('the default faction is the one with the most rows the item\'s own page backs, never one with only shared or quest-page-only rows', () => {
  // Dockworkers and Town Guards: three quest-page-only rows each. Bakers Guild: two rows, one of
  // them (Bun Run) listed on the bun's own page.
  const dock = { name: 'Dockworkers', up: true, amount: 20 }
  const guards = { name: 'Town Guards', up: true, amount: 3 }
  const quests: QuestEntry[] = [
    { name: 'Cheap Pie Day', page: 'Cheap Pie Day', requiredItems: ['Mud Pie'], factions: [guards, dock] },
    { name: 'Bread Line', page: 'Bread Line', requiredItems: ['Loaf'], factions: [guards, dock] },
    { name: 'Tart Tax', page: 'Tart Tax', requiredItems: ['Berry Tart'], factions: [guards, dock, { name: 'Bakers Guild', up: true, amount: 1 }] },
    { name: 'Bun Run', page: 'Bun Run', factions: [{ name: 'Bakers Guild', up: true, amount: 1 }] }
  ]
  const r = buildFactionRoute(fixtureFacts({ quests }), ask())
  // The picker lists them in the same order, each with its own count of recipes.
  assert.deepEqual(r.choices.map((c) => [c.name, c.recipes, c.own]), [['Bakers Guild', 2, 1], ['Dockworkers', 3, 0], ['Town Guards', 3, 0]])
  assert.equal(r.picked?.name, 'Bakers Guild')
  assert.equal(choiceFacts(r.choices[1], false), '3 recipes')
  // The row the reader meets first is the one its item's own page backs, though the other raise is as big.
  assert.deepEqual(lines(r), ['Mystery Bun | Bun Run', 'Berry Tart | Tart Tax'])
  // With no such row anywhere, the faction more recipes feed, then the first by name.
  const none = buildFactionRoute(fixtureFacts({ quests: quests.slice(0, 3) }), ask())
  assert.deepEqual(none.choices.map((c) => [c.name, c.recipes, c.own]), [['Dockworkers', 3, 0], ['Town Guards', 3, 0], ['Bakers Guild', 1, 0]])
  assert.equal(none.picked?.name, 'Dockworkers')
  // A remembered pick stands whatever its rows are.
  assert.equal(buildFactionRoute(fixtureFacts({ quests }), ask({ faction: questFactionKey('Dockworkers') })).picked?.name, 'Dockworkers')
})

/** A change as a row holds it. */
const change = (name: string, up: boolean, picked = false): FactionChange => ({ key: questFactionKey(name), name, up, text: up ? '+1' : '-1', picked, openAs: name })

test('a long list of changes: the picked faction first, eight more, then "and N more" that opens the whole list', () => {
  const raises = [change('Aa', true), change('Bb', true), change('Picked', true, true), ...['Cc', 'Dd', 'Ee', 'Ff', 'Gg'].map((n) => change(n, true))]
  const losses = ['Hh', 'Ii', 'Jj', 'Kk'].map((n) => change(n, false))
  const closed = shownChanges({ raises, losses }, false)
  // The row's own change leads; then the page's order, raises before losses, eight in all.
  assert.deepEqual(closed.raises.map((c) => c.name), ['Picked', 'Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff', 'Gg'])
  assert.deepEqual(closed.losses.map((c) => c.name), ['Hh'])
  assert.equal(closed.raises.length + closed.losses.length, 1 + CHANGE_CAP)
  assert.equal(closed.more, 3)
  assert.equal(moreChangesLabel(closed.more), 'and 3 more')
  // Opened in place: every change, the picked one still first, and the count the control came with.
  const open = shownChanges({ raises, losses }, true)
  assert.deepEqual(open.raises.map((c) => c.name), ['Picked', 'Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff', 'Gg'])
  assert.deepEqual(open.losses.map((c) => c.name), ['Hh', 'Ii', 'Jj', 'Kk'])
  assert.equal(open.more, 3)
  assert.equal(FEWER_CHANGES_LABEL, 'show fewer')
  // More raises than the cap: no loss is drawn until the list is opened.
  const many = shownChanges({ raises: [change('Picked', true, true), ...Array.from({ length: 12 }, (_, i) => change(`R${String(i)}`, true))], losses }, false)
  assert.deepEqual([many.raises.length, many.losses.length, many.more], [1 + CHANGE_CAP, 0, 8])
  // A list that fits is drawn whole, and has no control.
  const short = shownChanges({ raises: raises.slice(0, 5), losses }, false)
  assert.deepEqual([short.raises.length, short.losses.length, short.more], [5, 4, 0])
  assert.equal(short.raises[0]?.name, 'Picked')
  // The fixture's longest page (six changes) fits: nothing is cut.
  const feast = stepOf(buildFactionRoute(fixtureFacts(), ask()), 'Fish Pie', 'Feast Quests').turnIn
  assert.equal(shownChanges(feast, false).more, 0)
  assert.equal(HOW_TO_READ_LABEL, 'How to read this')
  assert.notEqual(HOW_TO_READ_HIDE_LABEL, HOW_TO_READ_LABEL)
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
  assert.equal(choiceFacts(none.choices[0], false), '5 recipes')
  assert.equal(none.steps[0]?.turnIn.raise.openAs, 'Town Guards')

  const r = buildFactionRoute(fixtureFacts({ standings: new Map([[key, TOWN_GUARDS]]) }), ask())
  assert.deepEqual(r.picked?.standing, TOWN_GUARDS)
  assert.equal(standingText(TOWN_GUARDS), 'amiably, 320')
  assert.equal(choiceFacts(r.choices[0], true), '5 recipes · your standing: amiably, 320')
  assert.equal(choiceFacts(r.choices[1], true), '1 recipe · not in your faction dump')
  // The link to the Factions tab asks for the dump's own spelling.
  assert.equal(r.steps[0]?.turnIn.raise.openAs, 'The Town Guards')
})

test('"Only use materials I have": only recipes the held materials cover, each judged alone, and it says when none is', () => {
  // The dump holds 3 Fish and no Mud or Berry; Loaf and the bun list no material to count.
  const held = buildFactionRoute(fixtureFacts({ held: ownerHeld({ Fish: 3 }) }), ask({ heldOnly: true }))
  assert.equal(held.heldOnly, true)
  assert.deepEqual(lines(held), ['Fish Pie | Pie for Guards', 'Fish Pie | Feast Quests'])
  // The mark is the Recipes tab's "can make 3"; the sentence is kept for a count of 0.
  assert.deepEqual(held.steps.map((s) => [s.canMake, s.handText]), [[3, ''], [3, '']])
  assert.equal(stepOf(buildFactionRoute(fixtureFacts({ held: ownerHeld() }), ask()), 'Fish Pie', 'Pie for Guards').handText, 'Materials on hand for 0.')
  assert.equal(stepOf(buildFactionRoute(fixtureFacts(), ask()), 'Fish Pie', 'Pie for Guards').canMake, 0)
  assert.match(held.basis, /^Only recipes you hold every material for\. /)
  // The list of factions is the data's, whatever is held.
  assert.deepEqual(held.choices.map((c) => c.recipes), [5, 1])
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
  const unseen = buildFactionRoute(fixtureFacts(), ask({ level: null }))
  for (const line of [r.basis, unseen.notice, ...r.caveats, moreChangesLabel(3)]) assert.doesNotMatch(line, /%|\d+ (?:turn-ins|combines)|[–—]/, line)
  assert.ok(r.caveats.some((c) => c.includes('no number of turn-ins or combines is shown')))
})
