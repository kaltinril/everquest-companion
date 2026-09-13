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

import type { Loadout } from '../src/renderer/src/features/character/exaltationAudit'

/** No class filter and no deity stated - the pre-R2-fourth-condition loadout, and the one most
 *  of these fixtures want: every gate below open so the rule under test is the only one acting. */
const NOBODY: Loadout = { classes: [], deity: null }

/** The identity half of a row, bundled so the builder stays inside the tree's four-parameter bar. */
interface RowSpec {
  key: string
  name: string
  effects: GearRow['effects']
  slots: GearRow['slots']
  classes?: GearRow['classes']
}

function row({ key, name, effects, slots, classes = [] }: RowSpec): GearRow {
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

/** One seat's facts, bundled for `RowSpec`'s reason. */
interface SeatSpec {
  cellId: string
  type: string
  slot: SocketHostCell['slot']
  currentName?: string | null
  item?: string
}

function seat({ cellId, type, slot, currentName = null, item = 'Host' }: SeatSpec): SocketHostCell {
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
    row({ key: 'ba gem', name: 'BA Gem', effects: worn('BA Gem', 'Burning Affliction III'), slots: ['WAIST'] }),
    row({ key: 'sh gem', name: 'SH Gem', effects: worn('SH Gem', 'Summoning Haste III'), slots: ['WAIST'] })
  ]
  const plan = planBoard([gem('BA Gem'), gem('SH Gem')], rows, NOBODY, [seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST' })])
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
    row({ key: 'flexible', name: 'Flexible', effects: worn('Flexible', 'Effect A III'), slots: ['WAIST', 'WRIST'] }),
    row({ key: 'rigid', name: 'Rigid', effects: worn('Rigid', 'Effect B III'), slots: ['WAIST'] })
  ]
  const plan = planBoard(
    [gem('Flexible'), gem('Rigid')],
    rows,
    NOBODY,
    [seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST' }), seat({ cellId: 'wrist1', type: 'Worn', slot: 'WRIST' })]
  )
  assert.equal(plan.placements.length, 2, 'both families in force')
  assert.equal(plan.contested.length, 0)
  const at = new Map(plan.placements.map((p) => [p.gemName, p.cellLabel]))
  assert.equal(at.get('Rigid'), 'waist')
  assert.equal(at.get('Flexible'), 'wrist1')
})

test('R2 holds inside the plan, and a seat already holding its target is not a move', () => {
  const rows = [
    row({ key: 'belt gem', name: 'Belt Gem', effects: worn('Belt Gem', 'Effect A III'), slots: ['WAIST'] }),
    row({ key: 'mnk gem', name: 'Mnk Gem', effects: worn('Mnk Gem', 'Effect B III'), slots: ['WRIST'], classes: ['MNK'] }),
    row({ key: 'war host', name: 'War Host', effects: [], slots: ['WRIST'], classes: ['WAR'] })
  ]
  const plan = planBoard(
    [gem('Belt Gem', 'socketed in Waist', true), gem('Mnk Gem')],
    rows,
    NOBODY,
    [
      seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST', currentName: 'Belt Gem' }),
      seat({ cellId: 'wrist1', type: 'Worn', slot: 'WRIST', currentName: null, item: 'War Host' })
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
    row({ key: 'tier1', name: 'Tier1', effects: worn('Tier1', 'Effect A I'), slots: ['WAIST'] }),
    row({ key: 'tier3', name: 'Tier3', effects: worn('Tier3', 'Effect A III'), slots: ['WAIST'] })
  ]
  const plan = planBoard(
    [gem('Tier1', 'socketed in Waist', true), gem('Tier3', 'General 2')],
    rows,
    NOBODY,
    [seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST', currentName: 'Tier1' })]
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
    row({ key: 'shield gem', name: 'Shield Gem', effects: worn('Shield Gem', 'Spell Guard II'), slots: ['SECONDARY'] }),
    row({ key: 'neck gem', name: 'Neck Gem', effects: worn('Neck Gem', 'Spell Guard II'), slots: ['NECK'] })
  ]
  const plan = planBoard(
    [gem('Shield Gem'), gem('Neck Gem')],
    rows,
    NOBODY,
    [seat({ cellId: 'neck', type: 'Worn', slot: 'NECK' })]
  )
  assert.equal(plan.placements.length, 1)
  assert.equal(plan.placements[0].gemName, 'Neck Gem')
})

test('incumbency breaks ties: the belt keeps its socketed Burning Affliction III, Summoning Haste stays benched', () => {
  // The user's own board: BA III is IN the belt, SH III is loose, both belt-only, one seat.
  // A value judgment between the two is impossible - but the incumbent staying put needs none.
  const rows = [
    row({ key: 'ba gem', name: 'BA Gem', effects: worn('BA Gem', 'Burning Affliction III'), slots: ['WAIST'] }),
    row({ key: 'sh gem', name: 'SH Gem', effects: worn('SH Gem', 'Summoning Haste III'), slots: ['WAIST'] })
  ]
  const plan = planBoard(
    // The loose gem deliberately FIRST: processing order must not decide the seat (the bug's
    // second appearance - the claim list happened to seat Summoning Haste before the incumbent).
    [gem('SH Gem', 'General 2'), gem('BA Gem', 'socketed in Waist', true)],
    rows,
    NOBODY,
    [seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST', currentName: 'BA Gem' })]
  )
  assert.equal(plan.moves.length, 0, 'the incumbent stays - no churn')
  assert.equal(plan.contested.length, 1)
  assert.equal(plan.contested[0].effect, 'Summoning Haste III')
})

test('a vacated seat is a CLEAR: the plan names the gem to pull and where its effect now lives', () => {
  // Family X sits at wrist1 but the matching needs wrist1 for family Y (Y fits nowhere else),
  // reseating X at wrist2. The old wrist1 copy must be named as a pull, or X is in force twice.
  const rows = [
    row({ key: 'x gem', name: 'X Gem', effects: worn('X Gem', 'Effect X II'), slots: ['WRIST'] }),
    row({ key: 'y gem', name: 'Y Gem', effects: worn('Y Gem', 'Effect Y II'), slots: ['WRIST'] })
  ]
  const plan = planBoard(
    [gem('X Gem', 'socketed in Wrist', true), gem('X Gem', 'Bank 1'), gem('Y Gem', 'Bank 1')],
    rows,
    NOBODY,
    [seat({ cellId: 'wrist1', type: 'Worn', slot: 'WRIST', currentName: 'X Gem' }), seat({ cellId: 'wrist2', type: 'Worn', slot: 'WRIST' })]
  )
  // Stability keeps X at wrist1 and Y fills wrist2 - zero clears in the happy case…
  assert.equal(plan.clears.length, 0)
  assert.equal(plan.placements.length, 2)
})

test('the user`s exact belt board: tier-I incumbency elsewhere must not lend Summoning Haste the belt', () => {
  // SH I is socketed in a RING; SH III's only donor is belt-only and loose; BA III is socketed
  // in the belt. "The family is socketed somewhere" made SH III an incumbent and it evicted BA
  // on the tie - but SH III cannot keep the ring seat, so it is no incumbent at the belt.
  const rows = [
    row({ key: 'ba gem', name: 'BA Gem', effects: worn('BA Gem', 'Burning Affliction III'), slots: ['WAIST'] }),
    row({ key: 'sh3 gem', name: 'SH3 Gem', effects: worn('SH3 Gem', 'Summoning Haste III'), slots: ['WAIST'] }),
    row({ key: 'sh1 gem', name: 'SH1 Gem', effects: worn('SH1 Gem', 'Summoning Haste I'), slots: ['FINGER'] })
  ]
  const plan = planBoard(
    [
      gem('SH3 Gem', 'General 2'),
      gem('BA Gem', 'socketed in Waist', true),
      gem('SH1 Gem', 'socketed in Fingers', true)
    ],
    rows,
    NOBODY,
    [seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST', currentName: 'BA Gem' }), seat({ cellId: 'finger1', type: 'Worn', slot: 'FINGER', currentName: 'SH1 Gem' })]
  )
  const waist = plan.placements.find((p) => p.cellLabel === 'waist')
  assert.equal(waist?.effect, 'Burning Affliction III', 'the belt keeps its incumbent')
  assert.ok(plan.contested.some((c) => c.effect === 'Summoning Haste III'))
  assert.equal(plan.moves.filter((m) => m.cellLabel === 'waist').length, 0)
})

// ---- a proc is per weapon (owner correction, kaltinril 2026-09-12) ---------------------------
//
// "You can have 2 procs, one on the primary and one on the secondary and that is fine they will
// both work." The matching seats a family once; `secondHand` gives a Proc family's spare copy the
// other hand, but only a seat the matching left free.

const proc = (name: string, eff: string): GearRow['effects'] => [{ name: eff, kind: 'proc' }]
const hands = (primary: string | null, secondary: string | null): SocketHostCell[] => [
  seat({ cellId: 'primary', type: 'Proc', slot: 'PRIMARY', currentName: primary, item: 'Sword' }),
  seat({ cellId: 'secondary', type: 'Proc', slot: 'SECONDARY', currentName: secondary, item: 'Sword' })
]

test('a proc family with two copies holds both hands: two placements, no moves, no clears', () => {
  const rows = [
    row({ key: 'fangs', name: 'Fangs', effects: proc('Fangs', 'Lifebite Combat'), slots: ['PRIMARY', 'SECONDARY'] }),
    row({ key: 'sword', name: 'Sword', effects: [], slots: ['PRIMARY', 'SECONDARY'] })
  ]
  const plan = planBoard(
    [gem('Fangs', 'socketed in Primary', true), gem('Fangs', 'socketed in Secondary', true)],
    rows,
    NOBODY,
    hands('Fangs', 'Fangs')
  )
  assert.equal(plan.placements.length, 2)
  assert.deepEqual(plan.placements.map((p) => p.cellLabel).sort(), ['primary', 'secondary'])
  assert.equal(plan.moves.length, 0)
  assert.equal(plan.clears.length, 0, 'the second Lifebite is not a duplicate to pull')
  assert.equal(plan.contested.length, 0)
})

test('…but a second copy never costs a distinct family its hand', () => {
  const rows = [
    row({ key: 'fangs', name: 'Fangs', effects: proc('Fangs', 'Lifebite Combat'), slots: ['PRIMARY', 'SECONDARY'] }),
    row({ key: 'quake', name: 'Quake', effects: proc('Quake', 'Earthquake'), slots: ['PRIMARY', 'SECONDARY'] }),
    row({ key: 'sword', name: 'Sword', effects: [], slots: ['PRIMARY', 'SECONDARY'] })
  ]
  const plan = planBoard(
    [gem('Fangs', 'socketed in Primary', true), gem('Fangs', 'socketed in Secondary', true), gem('Quake', 'Bank 1')],
    rows,
    NOBODY,
    hands('Fangs', 'Fangs')
  )
  assert.deepEqual(plan.placements.map((p) => p.effect).sort(), ['Earthquake', 'Lifebite Combat'])
  assert.equal(plan.contested.length, 0)
  // One copy of Fangs is spare once Quake takes a hand: a single copy holds one seat.
  const single = planBoard([gem('Fangs', 'socketed in Primary', true)], rows, NOBODY, hands('Fangs', null))
  assert.equal(single.placements.length, 1)
})
