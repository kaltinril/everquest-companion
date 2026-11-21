// What the player can make from what is held (src/shared/tradeskillHeld.ts), the route built only
// from held materials (tradeskillRouteHeld.ts, through tradeskillRoute.buildRoute) and the
// planner's "can make now" (tradeskillPlanGather.gatherHeld), on the owner's real case:
// Jewelcrafting at 205, 54 Ruby and 23 Enchanted Gold Bar in the dump.
//
// The owner's ruling these hold (2026-11-20): "the price of the materials doesn't change just
// because I already have them. but... you can add a 'only use materials i have' option".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRADESKILL_BOOK_VERSION, indexBook, ladderEmptyText, recipeLadder, skillRecipes, type BookRecipe, type LadderAsk } from '../src/shared/tradeskillBook'
import {
  HELD_ONLY_GOALS_TEXT,
  HELD_UNKNOWN_SHORT,
  benchFilters,
  canMakeLabel,
  canMakeSwitchLabel,
  canMakeTip,
  combinesHeld,
  heldKnown,
  heldOnlyBlockedText,
  makeableNow
} from '../src/shared/tradeskillHeld'
import { indexCrafting } from '../src/shared/tradeskillHistory'
import { haveLookup } from '../src/shared/tradeskillMaterials'
import { planTree } from '../src/shared/tradeskillPlan'
import { gatherFor, gatherHeld, planCanMakeTip, planHave } from '../src/shared/tradeskillPlanGather'
import { ROUTE_GOALS, ROUTE_STEP_CAP, buildRoute, capTop, heldOnlyApplies, moreStepsText, routeEndText, type BookGoal, type Route } from '../src/shared/tradeskillRoute'
import { equalsText, feedsText, heldCoverText, isHeldGoal, premakeText } from '../src/shared/tradeskillRouteHeld'
import type { RouteFacts, RouteStep } from '../src/shared/tradeskillRouteStep'
import { depot, ing, recipe, SEP_12 } from './tradeskillFixtures.mts'
import { OWNER_LEVEL, ownerFacts, ownerGuides, ownerHeld, ownerIndex, ownerSnap } from './tradeskillRouteFixtures.mts'

const held = (goal: BookGoal, facts: RouteFacts = ownerFacts(), level: number | null = OWNER_LEVEL): Route =>
  buildRoute(facts, { tradeskill: 'Jewelcrafting', level, goal, heldOnly: true })

const allSteps = (r: Route): RouteStep[] => r.groups.flatMap((group) => group.steps)

const lines = (r: Route): string[] => allSteps(r).map((s) => `${s.range}: ${s.name}: ${s.handText}`)

/** The owner's dump plus ten platinum bars and five malachite: three recipes above 205 can be made. */
const richer = (): RouteFacts => ownerFacts({ held: ownerHeld({ 'Enchanted Platinum Bar': 10, Malachite: 5 }) })

// ---- can make now -----------------------------------------------------------------------------

test('can make now: a recipe is marked when every material a combine uses up is held, with the combines the fewest covers', () => {
  const facts = ownerFacts()
  const recipes = skillRecipes(facts.index, 'Jewelcrafting')
  const makeable = makeableNow(facts, recipes)
  // 23 bars and 54 rubies: the ring, 23 times. Every other recipe lacks its gem or its bar.
  assert.deepEqual([...makeable], [['golden ruby ring#0', 23]])
  assert.equal(canMakeLabel(23), 'can make 23')
  assert.equal(canMakeTip(23), 'You hold every material this recipe uses up, enough for 23 combines. A failed combine uses its materials up too.')
  assert.match(canMakeTip(1), /enough for 1 combine\./)
  assert.equal(canMakeSwitchLabel(makeable.size), 'Can make now (1)')
  assert.equal(canMakeSwitchLabel(null), 'Can make now')

  // A recipe that lists no material has nothing to count: never marked.
  const tiara = facts.index.byId.get('platinum blue diamond tiara#0') as BookRecipe
  assert.equal(combinesHeld(facts, tiara), 0)
  // Each recipe is judged alone: with the bars for it, the veil is marked too, on the same rubies.
  // The mark does not read the level: the bracelet is long trivial at 205 and is still makeable.
  assert.deepEqual([...makeableNow(richer(), recipes)].sort(), [
    ['gold malachite bracelet#0', 5],
    ['golden ruby ring#0', 23],
    ['platinum malachite ring#0', 5],
    ['platinum ruby veil#0', 10]
  ])
})

test('can make now: a quantity is divided, a tool is held and not used up, and the guide materials count where the wiki lists none', () => {
  const extra = [
    recipe('Triple Band', { trivial: 220, ingredients: [ing('Ruby', 3, ['Bought']), ing("Jeweler's File", 1, ['Returned on Success'])] }),
    recipe('File Only', { trivial: 221, ingredients: [ing("Jeweler's File", 1, ['Returned on Success'])] })
  ]
  const index = ownerIndex(extra)
  const band = index.byId.get('triple band#0') as BookRecipe
  // 54 rubies at three a combine, and the file in the bags: 18.
  assert.equal(combinesHeld(ownerFacts({ index, held: ownerHeld({ "Jeweler's File": 1 }) }), band), 18)
  // Without the tool nothing can be made, however many rubies are held.
  assert.equal(combinesHeld(ownerFacts({ index }), band), 0)
  // Only a tool: no material a combine uses up, so no count.
  assert.equal(combinesHeld(ownerFacts({ index, held: ownerHeld({ "Jeweler's File": 1 }) }), index.byId.get('file only#0') as BookRecipe), 0)
})

test('with no inventory dump and no depot line nothing is marked and the switches say why', () => {
  const index = ownerIndex()
  const bare = indexCrafting(ownerSnap(), index)
  assert.equal(heldKnown({ index: null }, bare), false)
  assert.equal(heldKnown({ index: ownerHeld() }, bare), true)
  assert.equal(makeableNow(ownerFacts({ held: null }), skillRecipes(index, 'Jewelcrafting')).size, 0)
  assert.equal(heldOnlyBlockedText(false, true), HELD_UNKNOWN_SHORT)
  assert.equal(heldOnlyBlockedText(true, false), HELD_ONLY_GOALS_TEXT)
  assert.equal(heldOnlyBlockedText(true, true), '')

  // A depot line alone is a count: the switch can be used, and only what the log states is held.
  const snap = ownerSnap({ depot: [depot('Ruby', 50, SEP_12), depot('Enchanted Gold Bar', 7, SEP_12)] })
  const craft = indexCrafting(snap, index)
  assert.equal(heldKnown({ index: null }, craft), true)
  const facts = ownerFacts({ snap, held: null })
  assert.deepEqual([...makeableNow(facts, skillRecipes(index, 'Jewelcrafting'))], [['golden ruby ring#0', 7]])
  // Rubies alone: the bar's count is not stated anywhere, so the ring is not marked.
  const rubies = ownerFacts({ snap: ownerSnap({ depot: [depot('Ruby', 50, SEP_12)] }), held: null })
  assert.equal(makeableNow(rubies, skillRecipes(index, 'Jewelcrafting')).size, 0)
})

test('the recipe table keeps only what can be made, and says so when nothing can', () => {
  const facts = ownerFacts()
  const recipes = skillRecipes(facts.index, 'Jewelcrafting')
  const makeable = makeableNow(facts, recipes)
  const ask = (over: Partial<LadderAsk>): LadderAsk => ({ level: OWNER_LEVEL, query: '', hideTrivial: false, ...over })
  const on = ask({ only: benchFilters(makeable, false) })
  const ladder = recipeLadder(recipes, on)
  assert.deepEqual(ladder.lines.map((l) => (l.kind === 'recipe' ? `${l.recipe.item}:${l.state}` : 'heading')), ['Golden Ruby Ring:next'])
  assert.equal(ladder.shown, 1)
  assert.equal(ladder.total, recipes.length)
  // The marks are set before the switch takes lines away: the ring is still the one to make next.
  assert.equal(ladder.next?.item, 'Golden Ruby Ring')
  // Off: null hands the ladder no filter at all.
  assert.deepEqual(benchFilters(null, false), [])
  assert.equal(recipeLadder(recipes, ask({ only: benchFilters(null, false) })).shown, recipes.length)

  const none = ask({ only: benchFilters(new Map(), false) })
  assert.equal(ladderEmptyText(recipeLadder(recipes, none), none, false), 'You do not hold every material for any recipe listed here.')
  const both = ask({ only: benchFilters(new Map(), true) })
  assert.equal(ladderEmptyText(recipeLadder(recipes, both), both, false), 'No recipe here passes every switch that is on.')
  // A search that finds nothing still says so first.
  const typed = ask({ query: 'velium', only: benchFilters(makeable, false) })
  assert.equal(ladderEmptyText(recipeLadder(recipes, typed), typed, false), 'No recipe or material matches the search.')
})

// ---- only use materials I have ----------------------------------------------------------------

test("the owner's case, held only: the one recipe above 205 the dump covers, with its combines, and where the route stops", () => {
  for (const goal of ['cheapest', 'fastest'] as const) {
    const r = held(goal)
    assert.equal(r.heldOnly, true)
    assert.deepEqual(lines(r), ['205 to 207: Golden Ruby Ring: Your held materials cover 23 combines.'], goal)
    assert.equal(r.next?.why, 'The only recipe above 205 you hold every material for.')
    // The price is what was last paid, held or not.
    assert.equal(r.next.cost, 141_750)
    assert.match(r.next.money, /^141\.75 pp a combine at the prices you last paid\./)
    assert.equal(r.next.hand?.ready, 23)
    assert.equal(routeEndText(r, 'Jewelcrafting'), 'The route stops at 207: you hold every material for no recipe above it.')
    assert.match(r.basis, /^Only recipes you hold every material for\./)
    assert.ok(r.caveats.some((c) => c.includes('what a step uses is not counted again for a later one')))
  }
  // Off, the same goal is the open route: the switch never touches it.
  const open = buildRoute(ownerFacts(), { tradeskill: 'Jewelcrafting', level: OWNER_LEVEL, goal: 'cheapest' })
  assert.equal(open.heldOnly, false)
  assert.equal(open.next?.name, 'Platinum Malachite Ring')
})

test('held only, Cheapest: cost alone orders the held recipes, and one stock is shared so a material is not promised twice', () => {
  const r = held('cheapest', richer())
  // Three recipes can be made. The malachite ring is the cheapest (105.06 pp), though the ruby
  // ring is held for more combines: holding more does not move a recipe up.
  assert.deepEqual(lines(r), [
    '205 to 218: Platinum Malachite Ring: Your held materials cover 5 combines.',
    // Ten platinum bars were held; the step above took five, so the veil is covered for five, not ten.
    '218 to 279: Platinum Ruby Veil: Your held materials cover 5 combines, after what the steps above use.'
  ])
  assert.equal(r.next?.why, 'The lowest cost per combine of the 3 recipes above 205 you hold every material for.')
  assert.equal(allSteps(r)[1]?.why, 'The only recipe above 218 you hold every material for.')
  assert.equal(heldCoverText(1, false), 'Your held materials cover 1 combine.')

  // With no price in the log the held recipes go in trivial order, and the step says why.
  const unpriced = held('cheapest', ownerFacts({ snap: ownerSnap({ bought: [] }), held: ownerHeld({ 'Enchanted Platinum Bar': 10, Malachite: 5 }) }))
  assert.deepEqual(allSteps(unpriced).map((s) => s.name), ['Golden Ruby Ring', 'Platinum Malachite Ring', 'Platinum Ruby Veil'])
  assert.equal(unpriced.next?.why, 'None of the 3 recipes above 205 you hold every material for has a cost in your log. This is the lowest trivial of them.')
  // The ring took 23 of the 54 rubies and the malachite ring five of the ten bars: the veil gets what is left.
  assert.equal(allSteps(unpriced)[2]?.handText, 'Your held materials cover 5 combines, after what the steps above use.')
})

test('held only, Fastest: the highest trivial the held materials reach, then what is left', () => {
  const r = held('fastest', richer())
  assert.deepEqual(lines(r), ['205 to 279: Platinum Ruby Veil: Your held materials cover 10 combines.'])
  assert.equal(r.next?.why, 'The highest trivial of the 3 recipes above 205 you hold every material for.')
  assert.match(r.basis, /the highest trivial among them/)
})

test('held only: a tool is not used up by a step, and a material with no stated count is not held', () => {
  const tooled = [
    recipe('Filed Band', { trivial: 210, ingredients: [ing('Ruby', 1, ['Bought']), ing("Jeweler's File", 1, ['Returned on Success'])] }),
    recipe('Filed Crown', { trivial: 220, ingredients: [ing('Ruby', 2, ['Bought']), ing("Jeweler's File", 1, ['Returned on Success'])] })
  ]
  const index = indexBook({ version: TRADESKILL_BOOK_VERSION, recipes: tooled, materials: {} })
  const r = held('cheapest', ownerFacts({ index, held: ownerHeld({ "Jeweler's File": 1 }) }))
  // The band takes all 54 rubies, so the crown has none, though the one file serves both.
  assert.deepEqual(lines(r), ['205 to 210: Filed Band: Your held materials cover 54 combines.'])
  const fast = held('fastest', ownerFacts({ index, held: ownerHeld({ "Jeweler's File": 1 }) }))
  assert.deepEqual(lines(fast), ['205 to 220: Filed Crown: Your held materials cover 27 combines.'])

  // No dump, and the log's depot line names only the ruby: the bar's count is unknown, so nothing qualifies.
  const rubies = ownerFacts({ snap: ownerSnap({ depot: [depot('Ruby', 50, SEP_12)] }), held: null })
  assert.deepEqual(held('cheapest', rubies).groups, [])
})

/** The owner's Tailoring at 6 (2026-11-20): spider silk and spiderling silk held, nothing made of them yet. */
function silkFacts(heldNow: Record<string, number>): RouteFacts {
  const tailoring = (item: string, trivial: number, ingredients: BookRecipe['ingredients']): BookRecipe => recipe(item, { tradeskill: 'Tailoring', trivial, ingredients })
  const recipes = [
    tailoring('Silk Swatch', 15, [ing('Spider Silk', 2)]),
    tailoring('Silk Thread', 15, [ing('Spiderling Silk', 2)]),
    tailoring('Silk Bandage', 21, [ing('Silk Thread', 2)]),
    tailoring('Silk Cord', 26, [ing('Silk Thread', 3)]),
    tailoring('Raw Silk Cap', 36, [ing('Silk Swatch', 1), ing('Cap Pattern', 1)])
  ]
  const index = indexBook({ version: TRADESKILL_BOOK_VERSION, recipes, materials: {} })
  return ownerFacts({ index, held: ownerHeld(heldNow) })
}

const tailored = (goal: BookGoal, facts: RouteFacts, level: number): Route => buildRoute(facts, { tradeskill: 'Tailoring', level, goal, heldOnly: true })

test('held only: equals at one trivial are named, the one more later recipes use is picked, and what a step makes feeds the next', () => {
  const r = tailored('cheapest', silkFacts({ 'Spider Silk': 210, 'Spiderling Silk': 200 }), 6)
  const steps = allSteps(r)
  assert.deepEqual(steps.map((s) => `${s.range}: ${s.name}`), ['6 to 15: Silk Thread', '15 to 21: Silk Bandage'])
  // Thread and swatch tie at 15 with no cost: thread goes into two recipes above it, swatch into one.
  assert.equal(steps[0].aside, 'Same trivial, and your materials cover it too: Silk Swatch. Silk Thread is a material in 2 Tailoring recipes above it.')
  assert.equal(steps[0].handText, 'Your held materials cover 100 combines.')
  // The bandage is made of the thread the step above makes, and says what that count rests on.
  assert.equal(
    steps[1].handText,
    'Your held materials cover 50 combines, after what the steps above use. That counts the Silk Thread the steps above make: one fewer for each combine there that fails.'
  )
  // The bandages took every thread, so the cord has none and nothing is left to make it from: the route stops.
  assert.equal(equalsText(['A', 'B', 'C', 'D', 'E', 'F']), 'Same trivial, and your materials cover them too: A, B, C, D and 2 more.')
  assert.equal(feedsText('Silk Swatch', 'Tailoring', 1), 'Silk Swatch is a material in 1 Tailoring recipe above it.')
  assert.equal(feedsText('Silk Cord', 'Tailoring', 0), '')
})

test('held only: a material the stock is short of is made first from what is held, one level deep, and its inputs are spent once', () => {
  // Past 15, thread is no step of its own: the bandage still qualifies, through the spiderling silk held.
  const r = tailored('cheapest', silkFacts({ 'Spiderling Silk': 200, 'Silk Thread': 4 }), 15)
  const steps = allSteps(r)
  assert.deepEqual(steps.map((s) => `${s.range}: ${s.name}: ${s.handText}`), [
    // 4 thread held and 100 more from 200 silk: 104 thread, two a bandage.
    '15 to 21: Silk Bandage: Your held materials cover 52 combines.'
  ])
  assert.equal(steps[0].aside, 'Make first, from what you hold: Silk Thread (100 combines, trivial 15).')
  assert.equal(premakeText([]), '')
  // Nothing held that makes thread: the bandage is not on the route, and neither is anything else.
  assert.deepEqual(tailored('cheapest', silkFacts({ 'Spider Silk': 10 }), 15).groups, [])
  // Fastest reaches the highest trivial the chain covers.
  assert.equal(allSteps(tailored('fastest', silkFacts({ 'Spiderling Silk': 200 }), 6))[0].name, 'Silk Cord')
})

test('held only: when nothing qualifies the route says so in one line, and past the top it says that instead', () => {
  const none = held('cheapest', ownerFacts({ held: ownerHeld({ Ruby: 0, 'Enchanted Gold Bar': 0 }) }))
  assert.deepEqual(none.groups, [])
  assert.equal(none.next, null)
  assert.equal(none.empty, 'You do not hold every material for any Jewelcrafting recipe above 205.')
  assert.equal(routeEndText(none, 'Jewelcrafting'), '')
  assert.equal(held('fastest', ownerFacts(), 295).empty, 'Your level is at or past 295, the highest Jewelcrafting trivial the wiki holds.')
  // A skill the log never showed starts from 0, as every route does.
  assert.equal(held('cheapest', ownerFacts(), null).next?.range, '0 to 207')
})

test('a long held-only route is capped with a count, and names neither the wiki top nor an end it did not list', () => {
  // Twenty unpriced recipes one trivial apart, each on its own held gem: one step per recipe.
  const rungs = Array.from({ length: 20 }, (_, i) => recipe(`Rung ${String(i).padStart(2, '0')}`, { trivial: 210 + i, ingredients: [ing(`Gem ${String(i)}`, 1, ['Dropped'])] }))
  const index = indexBook({ version: TRADESKILL_BOOK_VERSION, recipes: rungs, materials: {} })
  const gems = Object.fromEntries(rungs.map((_, i) => [`Gem ${String(i)}`, 2]))
  const r = held('cheapest', ownerFacts({ index, held: ownerHeld(gems) }))
  assert.equal(allSteps(r).length, ROUTE_STEP_CAP)
  assert.equal(r.groups[0]?.more, 8)
  assert.equal(capTop(r), null)
  assert.equal(moreStepsText(r.groups[0], capTop(r)), '8 more steps, not listed.')
  assert.equal(routeEndText(r, 'Jewelcrafting'), '', 'the listed steps are not where the route ends')
  // The open route still names the wiki top.
  const open = buildRoute(ownerFacts({ index }), { tradeskill: 'Jewelcrafting', level: OWNER_LEVEL, goal: 'cheapest' })
  assert.equal(capTop(open), 229)
})

test('held only is for the two goals that climb: Explore and the community route are unchanged by it', () => {
  assert.deepEqual(ROUTE_GOALS.filter(isHeldGoal), ['cheapest', 'fastest'])
  // Faction reads the switch too, its own way (tests/tradeskillRouteFaction.test.mts).
  assert.deepEqual(ROUTE_GOALS.filter(heldOnlyApplies), ['cheapest', 'fastest', 'faction'])
  for (const goal of ['explore', 'guide'] as const) {
    const on = held(goal)
    const off = buildRoute(ownerFacts(), { tradeskill: 'Jewelcrafting', level: OWNER_LEVEL, goal })
    assert.equal(on.heldOnly, false, goal)
    assert.deepEqual(on.groups.map((g) => g.steps.map((s) => s.name)), off.groups.map((g) => g.steps.map((s) => s.name)), goal)
    assert.equal(on.basis, off.basis, goal)
  }
})

test('NOTHING GUESSED on a held-only route: no chance, no forecast, no long dash, and every price is one the log states', () => {
  const known = new Set(['105.06 pp', '141.75 pp', '236.25 pp'])
  const forecast = /%|percent|chance|odds|expect|estimat|\best\b|about \d|roughly|approx|probabl|likely|on average|per skill|per raise|per point|in total|altogether|enough to reach|will reach/i
  for (const goal of ['cheapest', 'fastest'] as const) {
    const r = held(goal, richer())
    for (const step of allSteps(r)) {
      const text = [step.range, step.name, step.why, step.aside, step.money, step.handText, step.record].join(' ')
      assert.doesNotMatch(text, forecast, `${goal}: ${text}`)
      assert.doesNotMatch(text, /[–—]/, text)
      for (const price of text.match(/\d[\d.,]* pp/g) ?? []) assert.ok(known.has(price), `${goal}: ${price} in "${text}"`)
    }
    for (const line of [r.basis, ...r.caveats, r.empty, routeEndText(r, 'Jewelcrafting')]) assert.doesNotMatch(line, /%|\d+ (?:combines|raises) (?:to|per)|[–—]/, line)
    // The count of combines is named for what it is: what the materials allow, not what a level takes.
    assert.ok(r.caveats.some((c) => c.includes('cannot say whether the combines you hold materials for reach')))
  }
})

// ---- the planner's mark -----------------------------------------------------------------------

test('the planner marks an item "can make now" only when everything on its gather list is held', () => {
  const index = ownerIndex()
  const deps = { index, guides: ownerGuides() }
  const craft = indexCrafting(ownerSnap(), index)
  const ring = planTree(deps, index.byId.get('golden ruby ring#0') as BookRecipe)
  const have = planHave({ index: ownerHeld(), dumpedAt: SEP_12 }, craft)
  const gather = (count: number, counts = have): ReturnType<typeof gatherFor> => gatherFor(ring, { count, have: counts, price: () => null })
  assert.equal(gatherHeld(gather(23)), true)
  // One more than the 23 bars cover.
  assert.equal(gatherHeld(gather(24)), false)
  // No dump and no depot line: nothing says what is held, so nothing is marked.
  assert.equal(gatherHeld(gather(1, planHave({ index: null, dumpedAt: null }, craft))), false)
  // A recipe that lists nothing has no list to hold.
  const tiara = planTree(deps, index.byId.get('platinum blue diamond tiara#0') as BookRecipe)
  assert.equal(gatherHeld(gatherFor(tiara, { count: 1, have, price: () => null })), false)
  assert.equal(planCanMakeTip(23, 'Golden Ruby Ring'), 'You hold everything on the gather list for 23 Golden Ruby Ring. A failed combine uses its materials up too.')
  // The same count the workbench's mark shows.
  assert.equal(combinesHeld({ index, guides: deps.guides, have: haveLookup({ index: ownerHeld(), dumpedAt: SEP_12 }, craft) }, ring.recipe), 23)
})
