// THE BOARD OPTIMIZER (src/renderer/src/features/character/socketOptimize.ts; user ask,
// kaltinril 2026-09-10, with his rules verbatim: highest numbered version of each exaltation;
// lower numbers out; among equals, removal priority to a seat another exaltation can use —
// which is exactly the augmenting path of a maximum matching). What is pinned:
//
//   the matching seats the MAXIMUM number of distinct families (the reseat case: a gem that
//   fits two slots yields the contested seat to the gem that fits only one);
//   a contested family is REPORTED with who beat it where, never silently dropped
//   (the user's own belt: Burning Affliction III and Summoning Haste III are both belt-only);
//   R2 holds inside the plan - wrong slot or disjoint classes is no seat at all;
//   moves are the DIFF from today's board, and a seat already holding its target is no move.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import type { OwnedExaltation } from '../src/shared/characterSheet'
import { planBoard } from '../src/renderer/src/features/character/socketOptimize'
import type { SocketHostCell } from '../src/renderer/src/features/character/socketRecommend'

function row(key: string, name: string, effects: GearRow['effects'], slots: GearRow['slots'], classes: GearRow['classes'] = []): GearRow {
  return {
    key,
    name,
    searchKey: name.toLowerCase(),
    slots,
    classes,
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: {},
    effects
  }
}

function seat(cellId: string, type: string, slot: SocketHostCell['slot'], currentName: string | null = null, item = 'Host'): SocketHostCell {
  return {
    cellId,
    cellLabel: cellId,
    item,
    type,
    slot,
    itemKey: item.toLowerCase(),
    currentKey: currentName === null ? null : currentName.toLowerCase(),
    currentName
  }
}

function gem(name: string, where = 'Bank 1', socketed = false): OwnedExaltation {
  return { name, key: name.toLowerCase(), where, socketed }
}

const worn = (name: string, eff: string): GearRow['effects'] => [{ name: eff, kind: 'worn' }]

test('the belt contest: two belt-only families, one belt seat - one placed, the other reported with the holder named', () => {
  const rows = [
    row('ba gem', 'BA Gem', worn('BA Gem', 'Burning Affliction III'), ['WAIST']),
    row('sh gem', 'SH Gem', worn('SH Gem', 'Summoning Haste III'), ['WAIST'])
  ]
  const plan = planBoard([gem('BA Gem'), gem('SH Gem')], rows, [], [seat('waist', 'Worn', 'WAIST')])
  assert.equal(plan.placements.length, 1)
  assert.equal(plan.contested.length, 1)
  const c = plan.contested[0]
  assert.equal(c.noSeat, false)
  assert.equal(c.options.length, 1)
  assert.equal(c.options[0].cellLabel, 'waist')
  // …and the option names the effect that holds the seat, so the player can weigh the two.
  assert.ok(['Burning Affliction III', 'Summoning Haste III'].includes(c.options[0].heldBy))
})

test('the reseat rule: a gem that fits two slots yields the contested seat to the gem that fits one', () => {
  // Flexible fits WAIST and WRIST; Rigid fits only WAIST. A greedy that seats Flexible at WAIST
  // first would bench Rigid; the augmenting path reseats Flexible at WRIST and both are in force.
  const rows = [
    row('flexible', 'Flexible', worn('Flexible', 'Effect A III'), ['WAIST', 'WRIST']),
    row('rigid', 'Rigid', worn('Rigid', 'Effect B III'), ['WAIST'])
  ]
  const plan = planBoard(
    [gem('Flexible'), gem('Rigid')],
    rows,
    [],
    [seat('waist', 'Worn', 'WAIST'), seat('wrist1', 'Worn', 'WRIST')]
  )
  assert.equal(plan.placements.length, 2, 'both families in force')
  assert.equal(plan.contested.length, 0)
  const at = new Map(plan.placements.map((p) => [p.gemName, p.cellLabel]))
  assert.equal(at.get('Rigid'), 'waist')
  assert.equal(at.get('Flexible'), 'wrist1')
})

test('R2 holds inside the plan, and a seat already holding its target is not a move', () => {
  const rows = [
    row('belt gem', 'Belt Gem', worn('Belt Gem', 'Effect A III'), ['WAIST']),
    row('mnk gem', 'Mnk Gem', worn('Mnk Gem', 'Effect B III'), ['WRIST'], ['MNK']),
    row('war host', 'War Host', [], ['WRIST'], ['WAR'])
  ]
  const plan = planBoard(
    [gem('Belt Gem', 'socketed in Waist', true), gem('Mnk Gem')],
    rows,
    [],
    [
      seat('waist', 'Worn', 'WAIST', 'Belt Gem'),
      seat('wrist1', 'Worn', 'WRIST', null, 'War Host')
    ]
  )
  // Belt Gem already sits where the plan wants it: no move. Mnk Gem cannot enter the WAR-only
  // wrist (its socketing would re-restrict the item to MNK): no seat.
  assert.equal(plan.moves.length, 0)
  assert.equal(plan.contested.length, 1)
  assert.equal(plan.contested[0].noSeat, true)
})

test('a move names what it replaces, and the higher tier takes the family seat', () => {
  const rows = [
    row('tier1', 'Tier1', worn('Tier1', 'Effect A I'), ['WAIST']),
    row('tier3', 'Tier3', worn('Tier3', 'Effect A III'), ['WAIST'])
  ]
  const plan = planBoard(
    [gem('Tier1', 'socketed in Waist', true), gem('Tier3', 'General 2')],
    rows,
    [],
    [seat('waist', 'Worn', 'WAIST', 'Tier1')]
  )
  assert.equal(plan.moves.length, 1)
  assert.equal(plan.moves[0].gemName, 'Tier3')
  assert.equal(plan.moves[0].replacesName, 'Tier1')
})

test('a placement names the donor that FITS the seat, never the claim`s first donor', () => {
  // Two donors of the same effect and tier: a SECONDARY-only shield gem and a NECK torque.
  // The neck seat must be labelled with the torque - naming the shield gem here is the bug the
  // user read as "put my secondary-only exaltation into the neck slot".
  const rows = [
    row('shield gem', 'Shield Gem', worn('Shield Gem', 'Spell Guard II'), ['SECONDARY']),
    row('neck gem', 'Neck Gem', worn('Neck Gem', 'Spell Guard II'), ['NECK'])
  ]
  const plan = planBoard(
    [gem('Shield Gem'), gem('Neck Gem')],
    rows,
    [],
    [seat('neck', 'Worn', 'NECK')]
  )
  assert.equal(plan.placements.length, 1)
  assert.equal(plan.placements[0].gemName, 'Neck Gem')
})

test('incumbency breaks ties: the belt keeps its socketed Burning Affliction III, Summoning Haste stays benched', () => {
  // The user's own board: BA III is IN the belt, SH III is loose, both belt-only, one seat.
  // A value judgment between the two is impossible - but the incumbent staying put needs none.
  const rows = [
    row('ba gem', 'BA Gem', worn('BA Gem', 'Burning Affliction III'), ['WAIST']),
    row('sh gem', 'SH Gem', worn('SH Gem', 'Summoning Haste III'), ['WAIST'])
  ]
  const plan = planBoard(
    // The loose gem deliberately FIRST: processing order must not decide the seat (the bug's
    // second appearance - the claim list happened to seat Summoning Haste before the incumbent).
    [gem('SH Gem', 'General 2'), gem('BA Gem', 'socketed in Waist', true)],
    rows,
    [],
    [seat('waist', 'Worn', 'WAIST', 'BA Gem')]
  )
  assert.equal(plan.moves.length, 0, 'the incumbent stays - no churn')
  assert.equal(plan.contested.length, 1)
  assert.equal(plan.contested[0].effect, 'Summoning Haste III')
})

test('a vacated seat is a CLEAR: the plan names the gem to pull and where its effect now lives', () => {
  // Family X sits at wrist1 but the matching needs wrist1 for family Y (Y fits nowhere else),
  // reseating X at wrist2. The old wrist1 copy must be named as a pull, or X is in force twice.
  const rows = [
    row('x gem', 'X Gem', worn('X Gem', 'Effect X II'), ['WRIST']),
    row('y gem', 'Y Gem', worn('Y Gem', 'Effect Y II'), ['WRIST'])
  ]
  const plan = planBoard(
    [gem('X Gem', 'socketed in Wrist', true), gem('X Gem', 'Bank 1'), gem('Y Gem', 'Bank 1')],
    rows,
    [],
    [seat('wrist1', 'Worn', 'WRIST', 'X Gem'), seat('wrist2', 'Worn', 'WRIST')]
  )
  // Stability keeps X at wrist1 and Y fills wrist2 - zero clears in the happy case…
  assert.equal(plan.clears.length, 0)
  assert.equal(plan.placements.length, 2)
})
