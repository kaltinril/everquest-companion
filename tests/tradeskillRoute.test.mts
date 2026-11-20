// The goal routes of a workbench (src/shared/tradeskillRoute.ts and its three part files), on the
// owner's real case: Jewelcrafting at 205, four prices in the log, 54 Ruby and 23 Enchanted Gold
// Bar held. What each goal returns is pinned step by step, and one test holds the law of the
// feature: no chance, no expected count and no total appears, because nobody has measured them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GUIDE_CREDITS, guideCreditLine } from '../src/shared/guideCredits'
import { TRADESKILL_BOOK_VERSION, indexBook, type BookRecipe } from '../src/shared/tradeskillBook'
import { GOAL_LABELS, ROUTE_GOALS, ROUTE_STEP_CAP, asGoal, buildRoute, moreStepsText, routeEndText, type Route, type RouteGoal } from '../src/shared/tradeskillRoute'
import { EXPLORE_GROUP_CAP } from '../src/shared/tradeskillRouteExplore'
import { recipeBuyable } from '../src/shared/tradeskillRouteLevel'
import { recordText, type RouteCtx, type RouteFacts, type RouteStep } from '../src/shared/tradeskillRouteStep'
import { skillRecipes } from '../src/shared/tradeskillBook'
import { bought, ing, item, recipe } from './tradeskillFixtures.mts'
import { OWNER_LEVEL, ownerFacts, ownerHeld, ownerIndex, ownerRecipes, ownerSnap } from './tradeskillRouteFixtures.mts'

const route = (goal: RouteGoal, facts: RouteFacts = ownerFacts(), level: number | null = OWNER_LEVEL): Route =>
  buildRoute(facts, { tradeskill: 'Jewelcrafting', level, goal })

const allSteps = (r: Route): RouteStep[] => r.groups.flatMap((group) => group.steps)

/** A route as "range: item" lines. */
const lines = (r: Route): string[] => allSteps(r).map((s) => `${s.range}: ${s.name}`)

const stepOf = (r: Route, name: string): RouteStep => {
  const found = allSteps(r).find((s) => s.name === name)
  assert.ok(found, `${name} is on the route`)
  return found
}

/** Everything a step puts on screen. */
const words = (s: RouteStep): string => [s.range, s.name, s.why, s.aside, s.money, s.handText, s.record].join(' ')

test('four goals are built, Cheapest is the default, and Faction is not one of them', () => {
  assert.deepEqual([...ROUTE_GOALS], ['cheapest', 'fastest', 'explore', 'guide'])
  assert.deepEqual(ROUTE_GOALS.map((g) => GOAL_LABELS[g]), ['Cheapest', 'Fastest', 'Explore', 'Community route'])
  assert.equal(asGoal('fastest'), 'fastest')
  assert.equal(asGoal('faction'), 'cheapest')
  assert.equal(asGoal(null), 'cheapest')
})

test("the owner's case, Cheapest: the least cost per combine first, the unpriced recipes after, to the highest trivial", () => {
  const r = route('cheapest')
  assert.deepEqual(lines(r), [
    '205 to 218: Platinum Malachite Ring',
    '218 to 279: Platinum Ruby Veil',
    '279 to 282: Platinum Jacinth Wedding Ring',
    '282 to 284: Black Sapphire Platinum Necklace',
    '284 to 287: Platinum Diamond Wedding Ring',
    '287 to 295: Platinum Blue Diamond Tiara'
  ])
  assert.equal(r.next?.name, 'Platinum Malachite Ring')
  assert.equal(r.top, 295)
  assert.equal(routeEndText(r, 'Jewelcrafting'), 'The route stops at 295: the highest Jewelcrafting trivial the wiki holds.')

  // Platinum Bar 105 pp + Malachite 0.06 pp is under the ring's 141.75 pp and the veil's 236.25 pp.
  const first = stepOf(r, 'Platinum Malachite Ring')
  assert.equal(first.cost, 105_060)
  assert.equal(first.why, 'The lowest cost per combine of the 3 recipes above 205 your log can price. 3 other recipes up to 218 have no cost in your log.')
  assert.equal(first.money, '105.06 pp a combine at the prices you last paid. Your log shows no sale of it. A failed combine loses its materials.')
  assert.equal(first.handText, 'Materials on hand for 0.')
  assert.equal(first.record, '')
  // The ring the ranking passed over is the one the owner holds the materials for: said, not hidden.
  assert.equal(first.aside, 'Not picked, but on hand: materials for 23 Golden Ruby Ring (trivial 207), at 141.75 pp a combine.')

  const veil = stepOf(r, 'Platinum Ruby Veil')
  assert.equal(veil.cost, 236_250)
  assert.equal(veil.why, 'The only recipe above 218 your log can price. 1 other recipe up to 279 has no cost in your log.')

  // Past the last price: the next trivial up, each with the purchase that would price it.
  const jacinth = stepOf(r, 'Platinum Jacinth Wedding Ring')
  assert.equal(jacinth.cost, null)
  assert.equal(jacinth.why, 'No recipe above 279 has a cost in your log. This is the next trivial up.')
  assert.equal(jacinth.money, 'No cost stated: your log shows no purchase of Jacinth.')
  const tiara = stepOf(r, 'Platinum Blue Diamond Tiara')
  assert.equal(tiara.money, 'The wiki lists no materials for this recipe, so no cost is stated.')
  assert.equal(tiara.handText, '', 'no materials listed: no count on hand')
})

test('Cheapest with the ring the cheapest: a made one pays for itself, a failed one loses its materials, and the record is the player\'s own', () => {
  // Without a Platinum Bar price the ring is the only recipe above 205 the log can price.
  const snap = ownerSnap()
  const facts = ownerFacts({ snap: { ...snap, bought: snap.bought.filter((b) => b.item !== 'Platinum Bar') } })
  const ring = route('cheapest', facts).next
  assert.equal(ring?.name, 'Golden Ruby Ring')
  assert.equal(ring.range, '205 to 207')
  assert.equal(ring.cost, 141_750)
  assert.equal(ring.sale, 141_750)
  assert.equal(
    ring.money,
    '141.75 pp a combine at the prices you last paid. A made one last sold for 141.75 pp: the same as the materials. A failed combine loses its materials.'
  )
  assert.equal(ring.handText, 'Materials on hand for 23.')
  assert.equal(ring.record, 'Your own record: failed 0 of 4 combines.')
  assert.equal(ring.aside, '')

  // The player's own failures are a record of what happened, with the raises those combines gave.
  const bracelet = route('cheapest', ownerFacts(), 120).next
  assert.equal(bracelet?.name, 'Gold Malachite Bracelet')
  assert.equal(bracelet.cost, 10_560)
  assert.equal(bracelet.record, 'Your own record: failed 29 of 121 combines, 33 raises (114 to 146).')
  assert.equal(recordText(null), '')
  assert.equal(recordText(item('Never', {})), '')
  assert.equal(recordText(item('Once', { failed: 1 })), 'Your own record: failed 1 of 1 combine.')
})

test('Cheapest ranks on cost alone: equal costs go to the lower trivial whatever is held, and a wiki "returned on failure" is said', () => {
  const twins = [
    recipe('Ruby Band', { trivial: 210, ingredients: [ing('Enchanted Gold Bar', 1, ['Bought + Enchanted']), ing('Ruby', 1, ['Bought'])] }),
    recipe('Ruby Loop', { trivial: 209, ingredients: [ing('Gold Bar', 1, ['Bought']), ing('Ruby', 1, ['Bought', 'Returned on Failure'])] })
  ]
  const index = indexBook({ version: TRADESKILL_BOOK_VERSION, recipes: twins, materials: {} })
  // Both cost 141.75 pp. The band's bar and gem are held; the loop's plain Gold Bar is not. Holding
  // a material does not change its price (owner, 2026-11-20), so the held band does NOT move up:
  // the lower trivial leads, and the band is named in the aside.
  const first = route('cheapest', ownerFacts({ index })).next
  assert.equal(first?.name, 'Ruby Loop')
  assert.equal(first.range, '205 to 209')
  assert.equal(first.aside, 'Not picked, but on hand: materials for 23 Ruby Band (trivial 210), at 141.75 pp a combine.')
  // With nothing held the pick is the same one.
  const bare = route('cheapest', ownerFacts({ index, held: ownerHeld({ Ruby: 0, 'Enchanted Gold Bar': 0 }) })).next
  assert.equal(bare?.name, 'Ruby Loop')
  assert.equal(bare.aside, '')
  assert.equal(
    bare.money,
    '141.75 pp a combine at the prices you last paid. Your log shows no sale of it. A failed combine loses its materials, but the wiki marks as returned on failure: Ruby.'
  )
})

test('Cheapest with no price at all: the next trivial up, held or not, and the route says nothing is ranked on cost', () => {
  const facts = ownerFacts({ snap: ownerSnap({ bought: [] }) })
  const r = route('cheapest', facts)
  // The ladder in trivial order. The ring leads because 207 is the next trivial above 205, not because it is held.
  assert.deepEqual(lines(r).slice(0, 3), ['205 to 207: Golden Ruby Ring', '207 to 210: Golden Jacinth Wedding Ring', '210 to 212: Golden Black Sapphire Earring'])
  assert.equal(r.next?.why, 'No recipe above 205 has a cost in your log. This is the next trivial up.')
  // From 200 the held ring is two rungs up: it does not jump the bracelet and the earring, and the aside names it.
  const lower = route('cheapest', facts, 200)
  assert.deepEqual(lines(lower).slice(0, 3), ['200 to 202: Fire Emerald Golden Bracelet', '202 to 204: Golden Sapphire Earring', '204 to 207: Golden Ruby Ring'])
  assert.equal(lower.next?.aside, 'Not picked, but on hand: materials for 23 Golden Ruby Ring (trivial 207).')
  assert.equal(r.next.money, 'No cost stated: your log shows no purchase of Gold Bar (the bar a spell enchants into Enchanted Gold Bar), Ruby. A made one last sold for 141.75 pp.')
  assert.ok(r.caveats.some((c) => c.startsWith('Your log shows no price for any recipe above your level')))
  assert.ok(allSteps(r).every((s) => s.cost === null))
})

test("the owner's case, Fastest: the highest trivial bought materials reach, then what is left, said plainly", () => {
  const r = route('fastest')
  assert.deepEqual(lines(r), ['205 to 279: Platinum Ruby Veil', '279 to 287: Platinum Diamond Wedding Ring', '287 to 295: Platinum Blue Diamond Tiara'])
  const veil = stepOf(r, 'Platinum Ruby Veil')
  assert.equal(veil.why, 'The highest trivial above 205 whose materials can all be bought. A spell has to enchant: Enchanted Platinum Bar.')
  assert.equal(veil.cost, 236_250, 'the cost is shown, though it is not ranked')
  assert.equal(
    stepOf(r, 'Platinum Diamond Wedding Ring').why,
    'No recipe above 279 can be made from bought materials alone. This is the highest trivial that lists its materials. Not sold: Diamond (Dropped).'
  )
  assert.equal(stepOf(r, 'Platinum Blue Diamond Tiara').why, 'The highest trivial the wiki holds for Jewelcrafting. The wiki lists no materials for it.')
  // The failure rate is named as unmeasured, in words, and never as a number.
  assert.ok(r.caveats.some((c) => c.includes("More combines fail the further your level is below a recipe's trivial") && c.includes('not measured')))
  assert.match(r.basis, /^Fewest stops/)
})

test('Fastest: what counts as bought is the log, the wiki word or a guide merchant; a made material counts when its own are bought', () => {
  const extra = [
    // Dropped by the wiki's word, but the log shows it bought.
    recipe('Logged Band', { trivial: 300, ingredients: [ing('Odd Gem', 1, ['Dropped'])] }),
    // No source word; the recipe guide places Malachite at a merchant.
    recipe('Guide Band', { trivial: 301, ingredients: [ing('Malachite')] }),
    // A made part whose own material is bought, and a tool the player holds.
    recipe('Made Band', { trivial: 302, ingredients: [ing('Gold Setting', 1, ['Crafted']), ing("Jeweler's File", 1, ['Returned on Success'])] }),
    recipe('Gold Setting', { trivial: 40, ingredients: [ing('Gold Bar', 1, ['Bought'])] }),
    // A made part whose own material is dropped.
    recipe('Dropped Band', { trivial: 303, ingredients: [ing('Rare Setting', 1, ['Crafted'])] }),
    recipe('Rare Setting', { trivial: 41, ingredients: [ing('Jacinth', 1, ['Dropped'])] })
  ]
  const index = ownerIndex(extra)
  const snap = ownerSnap()
  const facts = ownerFacts({ index, snap: { ...snap, bought: [...snap.bought, bought('Odd Gem', 1, 5_000, 'Jade')] }, held: ownerHeld({ "Jeweler's File": 1 }) })
  const ctx: RouteCtx = { facts, tradeskill: 'Jewelcrafting', level: OWNER_LEVEL, recipes: skillRecipes(index, 'Jewelcrafting') }
  const buyable = (id: string): ReturnType<typeof recipeBuyable> => recipeBuyable(ctx, index.byId.get(id) as BookRecipe)
  assert.equal(buyable('logged band#0').ok, true)
  assert.equal(buyable('guide band#0').ok, true)
  assert.deepEqual(buyable('made band#0'), { ok: true, listed: true, enchant: [], made: ['Gold Setting'], blockers: [] })
  assert.deepEqual(buyable('dropped band#0').blockers, ['Rare Setting (Crafted)'])
  // Without the file in the bags the tool has to come from somewhere, and nothing says where.
  const bare: RouteCtx = { ...ctx, facts: ownerFacts({ index }) }
  assert.deepEqual(recipeBuyable(bare, index.byId.get('made band#0') as BookRecipe).blockers, ["Jeweler's File (Returned on Success)"])

  const r = buildRoute(facts, { tradeskill: 'Jewelcrafting', level: OWNER_LEVEL, goal: 'fastest' })
  assert.deepEqual(lines(r), ['205 to 302: Made Band', '302 to 303: Dropped Band'])
  assert.equal(r.next?.why, 'The highest trivial above 205 whose materials can all be bought. Made first, from bought materials: Gold Setting.')
})

test("the owner's case, Explore: never-made recipes from 185 up, each in the first group the data puts it in", () => {
  const r = route('explore')
  assert.deepEqual(
    r.groups.map((g) => `${g.heading}: ${g.steps.map((s) => s.name).join(', ')}`),
    [
      'Used in a quest: Black Sapphire Platinum Necklace, Platinum Diamond Wedding Ring',
      'Named by a community guide: Platinum Malachite Ring, Platinum Topaz Necklace, Platinum Ruby Veil',
      'Needs a dropped material: Golden Jacinth Wedding Ring, Golden Black Sapphire Earring, Golden Diamond Mask, Platinum Jacinth Wedding Ring',
      'Has stats or effects of its own: Golden Sapphire Earring, Platinum Blue Diamond Tiara'
    ]
  )
  assert.equal(r.basis, '11 recipes you have never made, from trivial 185 up, grouped by what the wiki and the guides say of each. Nothing here is ranked.')
  // Made by the owner, or under the floor: not listed.
  const named = allSteps(r).map((s) => s.name)
  for (const made of ['Golden Ruby Ring', 'Fire Emerald Golden Bracelet', 'Golden Jaded Bracelet', 'Gold Malachite Bracelet']) assert.ok(!named.includes(made), made)

  // The reasons are the data's own words.
  assert.equal(stepOf(r, 'Black Sapphire Platinum Necklace').why, 'The quest White Dragonscale Cloak Quest takes it.')
  const two = route('explore', ownerFacts({ index: ownerIndex([recipe('Twice Asked Charm', { trivial: 290, quests: ['Cloak Quest', 'Crown Quest', 'Ring Quest'] })]) }))
  assert.equal(stepOf(two, 'Twice Asked Charm').why, 'The quest Cloak Quest and 2 more take it.')
  assert.equal(stepOf(r, 'Platinum Malachite Ring').why, 'Listed in the recipe guide. It notes: Can use regular platinum bars but sells for less.')
  assert.equal(stepOf(r, 'Platinum Topaz Necklace').why, "On the leveling guide's route for 229 - 255.")
  assert.equal(stepOf(r, 'Golden Diamond Mask').why, 'Dropped, and not sold by a merchant: Diamond.')
  assert.equal(stepOf(r, 'Platinum Blue Diamond Tiara').why, 'Its own stats: MANA +25, SV FIRE +8, SV DISEASE +8, SV COLD +8 and 2 more.')
  assert.equal(stepOf(r, 'Golden Sapphire Earring').range, 'trivial 204, at or under your level')
  assert.equal(stepOf(r, 'Golden Diamond Mask').range, 'trivial 215')
  // A reason from a guide carries both guides' credit.
  assert.equal(r.credits.length, 1)
  for (const credit of GUIDE_CREDITS) assert.ok(r.credits[0]?.includes(guideCreditLine(credit)), credit.id)
})

test('Explore: an odd yield or a rare container is a group, a group is capped and counted, and nothing is said before the log is read', () => {
  const kit = (n: number): BookRecipe => recipe(`Plain Ring ${String(n).padStart(2, '0')}`, { trivial: 210 + n, container: "Jeweler's Kit", ingredients: [ing('Ruby', 1, ['Bought'])] })
  const extra = [
    ...Array.from({ length: 12 }, (_, i) => kit(i)).map((r, i) => (i < 10 ? { ...r, worn: { stats: ['HP +5'], effects: ['Minor Shielding'] } } : r)),
    recipe('Champagne Magnum', { trivial: 215, container: 'Brew Barrel', ingredients: [ing('Opal', 1, ['Bought'])] }),
    recipe('Gem Dust', { trivial: 216, container: "Jeweler's Kit", yieldItem: 'Pinch of Gem Dust', yieldQty: 3, ingredients: [ing('Ruby', 1, ['Bought'])] })
  ]
  const r = route('explore', ownerFacts({ index: ownerIndex(extra) }))
  const odd = r.groups.find((g) => g.id === 'odd')
  assert.deepEqual(odd?.steps.map((s) => `${s.name}: ${s.why}`), [
    'Champagne Magnum: Made in a Brew Barrel: 1 of 29 Jewelcrafting recipes use one.',
    'Gem Dust: One combine makes 3 x Pinch of Gem Dust.'
  ])
  const worn = r.groups.find((g) => g.id === 'worn')
  assert.equal(worn?.steps.length, EXPLORE_GROUP_CAP)
  assert.equal(worn.more, 4, 'two of the owner case and ten here, past the cap of eight')
  assert.equal(moreStepsText(worn, r.top), '4 more of these, on the Recipes tab.')
  assert.equal(worn.steps.at(-1)?.why, 'Its own stats: HP +5. Effect: Minor Shielding.')
  // Two plain rings have nothing to set them apart: counted, pointed at the Recipes tab.
  assert.deepEqual(r.caveats, ['2 more never-made recipes have nothing in the data to set them apart. They are on the Recipes tab.'])

  const unread = route('explore', ownerFacts({ snap: null }))
  assert.deepEqual(unread.groups, [])
  assert.equal(unread.empty, 'Your log is still being read: what you have made is not known yet.')
})

test('the community route: the guide\'s steps from the level in its own order, joined where the name is a wiki item, credited', () => {
  const r = route('guide')
  assert.deepEqual(lines(r), [
    "203 - 228: Platinum cat's eye agate",
    '229 - 255: Platinum Topaz Necklace',
    '256 - 279: Platinum ruby',
    '280 - 282: Platinum jacinth',
    '288 - 295: Platinum blue diamond'
  ])
  const here = stepOf(r, "Platinum cat's eye agate")
  assert.equal(here.linked, false)
  assert.equal(here.recipe, null)
  assert.equal(here.why, "Your level is inside this step of the guide. The guide's name for it is no wiki item's exactly, so no cost or materials are joined.")
  assert.equal(here.money, '')
  const joined = stepOf(r, 'Platinum Topaz Necklace')
  assert.equal(joined.recipe?.id, 'platinum topaz necklace#0')
  assert.equal(joined.why, 'A later step of the guide.')
  assert.equal(joined.money, 'No cost stated: your log shows no purchase of Topaz.')
  assert.equal(stepOf(r, 'Platinum ruby').why, "A later step of the guide. The guide notes: Last store bought gem. The guide's name for it is no wiki item's exactly, so no cost or materials are joined.")
  const leveling = GUIDE_CREDITS.find((c) => c.id === 'eql-tradeskill-guide')
  assert.ok(leveling)
  assert.deepEqual(r.credits, [`Route and notes from ${guideCreditLine(leveling)}.`])
  assert.equal(routeEndText(r, 'Jewelcrafting'), '')

  // A tradeskill the guide has no route for, and a level past its last step.
  assert.equal(buildRoute(ownerFacts(), { tradeskill: 'Baking', level: 10, goal: 'guide' }).empty, 'The leveling guide has no route for Baking.')
  assert.equal(route('guide', ownerFacts(), 295).empty, "Your level is past the last step of the guide's route.")
  // A level the log never showed: every step is listed, none marked as the player's.
  assert.equal(allSteps(route('guide', ownerFacts(), null)).length, 6)
})

test('NOTHING GUESSED: no step of any goal states a chance, an expected count or a total, and every price is one the log can add up', () => {
  // The only prices the fixture can state: bar + gem at the four prices paid, and the ring's sale.
  const known = new Set(['105.06 pp', '141.75 pp', '236.25 pp'])
  const forecast = /%|percent|chance|odds|expect|estimat|\best\b|about \d|roughly|approx|probabl|likely|on average|per skill|per raise|per point|in total|altogether/i
  for (const goal of ROUTE_GOALS) {
    const r = route(goal)
    for (const step of allSteps(r)) {
      const text = words(step)
      assert.doesNotMatch(text, forecast, `${goal}: ${text}`)
      for (const price of text.match(/\d[\d.,]* pp/g) ?? []) assert.ok(known.has(price), `${goal}: ${price} in "${text}"`)
      assert.doesNotMatch(text, /[–—]/, 'no long dash in a step')
    }
    // The route's own lines name the unmeasured rate only to say it is not shown.
    for (const line of [r.basis, ...r.caveats]) assert.doesNotMatch(line, /%|\d+ (?:combines|raises) (?:to|per)|[–—]/, line)
  }
  assert.ok(route('cheapest').caveats.some((c) => c.includes('no chance, no number of combines and no total is shown')))
})

test('a route starts from 0 for a skill the log never showed, stops at the top, and is capped with a count', () => {
  const unseen = route('cheapest', ownerFacts(), null)
  // From 0 every recipe is above the level: the cheapest of all is the bracelet at 10.56 pp.
  assert.equal(unseen.next?.name, 'Gold Malachite Bracelet')
  assert.equal(unseen.next.range, '0 to 146')

  for (const goal of ['cheapest', 'fastest'] as const) {
    const done = route(goal, ownerFacts(), 295)
    assert.deepEqual(done.groups, [])
    assert.equal(done.next, null)
    assert.equal(done.empty, 'Your level is at or past 295, the highest Jewelcrafting trivial the wiki holds.')
    assert.equal(routeEndText(done, 'Jewelcrafting'), '')
  }
  assert.equal(buildRoute(ownerFacts(), { tradeskill: 'Fishing', level: 10, goal: 'cheapest' }).empty, 'The wiki lists no Fishing recipe with a trivial, so there is nothing to route.')

  // Twenty unpriced recipes one trivial apart: twelve steps listed, eight counted.
  const ladder = Array.from({ length: 20 }, (_, i) => recipe(`Rung ${String(i).padStart(2, '0')}`, { trivial: 10 + i, ingredients: [ing('Mystery Ore')] }))
  const index = indexBook({ version: TRADESKILL_BOOK_VERSION, recipes: ladder, materials: {} })
  const long = route('cheapest', ownerFacts({ index }), 0)
  assert.equal(allSteps(long).length, ROUTE_STEP_CAP)
  assert.equal(long.groups[0]?.more, 8)
  assert.equal(moreStepsText(long.groups[0], long.top), '8 more steps, up to 29, not listed.')
})

test('the era setting is respected: a recipe the book index hides is on no route', () => {
  const velium = recipe('Velium Ruby Veil', { trivial: 299, ingredients: [ing('Enchanted Platinum Bar', 1, ['Bought + Enchanted']), ing('Ruby', 1, ['Bought'])], eraTag: 'Velious' })
  const payload = { version: TRADESKILL_BOOK_VERSION, recipes: [...ownerRecipes(), velium], materials: {} }
  const shown = route('fastest', ownerFacts({ index: indexBook(payload) }))
  assert.equal(shown.next?.name, 'Velium Ruby Veil')
  const hidden = indexBook(payload, (r) => r.eraTag === 'Velious')
  for (const goal of ROUTE_GOALS) {
    const r = route(goal, ownerFacts({ index: hidden }))
    assert.ok(!allSteps(r).some((s) => s.name === 'Velium Ruby Veil'), goal)
    assert.equal(r.top, 295)
  }
})
