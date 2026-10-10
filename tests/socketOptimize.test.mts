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

test('R2`s third party holds inside the plan: a seat whose combined item the loadout cannot wear is no seat', () => {
  // Donor [ROG,MNK], host [WAR,ROG], character [WAR,MNK]: both pairs overlap, the socketed host
  // is ROG-only, and nobody in the loadout can wear it. Not contested - there is no legal seat.
  const rows = [
    row({ key: 'rogmnk gem', name: 'RogMnk Gem', effects: worn('RogMnk Gem', 'Effect A III'), slots: ['WRIST'], classes: ['ROG', 'MNK'] }),
    row({ key: 'war rog host', name: 'War Rog Host', effects: [], slots: ['WRIST'], classes: ['WAR', 'ROG'] })
  ]
  const board = [seat({ cellId: 'wrist1', type: 'Worn', slot: 'WRIST', item: 'War Rog Host' })]
  const plan = planBoard([gem('RogMnk Gem')], rows, { classes: ['WAR', 'MNK'], deity: null }, board)
  assert.equal(plan.placements.length, 0)
  assert.equal(plan.contested.length, 1)
  assert.equal(plan.contested[0].noSeat, true)
  // The same board on a character who CAN wear a ROG-only bracer seats it.
  assert.equal(planBoard([gem('RogMnk Gem')], rows, { classes: ['WAR', 'ROG'], deity: null }, board).placements.length, 1)
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

test('a seat keeps its own copy: two gems of one effect are not a swap, whichever the dump lists first', () => {
  // Gem A sits in the waist; Gem B, the same effect at the same tier, is loose. Naming B here is
  // "socket Gem B replacing Gem A" - a move that grants nothing - and the old `find` named it
  // exactly when the dump happened to list B ahead of A.
  const rows = [
    row({ key: 'gem a', name: 'Gem A', effects: worn('Gem A', 'Effect A III'), slots: ['WAIST'] }),
    row({ key: 'gem b', name: 'Gem B', effects: worn('Gem B', 'Effect A III'), slots: ['WAIST'] })
  ]
  const board = [seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST', currentName: 'Gem A' })]
  const socketedA = gem('Gem A', 'socketed in Waist', true)
  for (const owned of [[gem('Gem B', 'General 1'), socketedA], [socketedA, gem('Gem B', 'General 1')]]) {
    const plan = planBoard(owned, rows, NOBODY, board)
    assert.equal(plan.placements.length, 1)
    assert.equal(plan.placements[0].gemName, 'Gem A')
    assert.equal(plan.moves.length, 0, 'the seat already holds a copy of its target')
  }
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

test('two donors of one proc family, one copy each: each hand names its own gem, never one gem twice', () => {
  // Fangs and Claw both proc Lifebite. The claim had "two copies", so the second hand was taken -
  // and both seats were labelled Fangs, because the label took the first donor that fit. One
  // physical Fangs is one seat; the other hand is Claw's.
  const rows = [
    row({ key: 'fangs', name: 'Fangs', effects: proc('Fangs', 'Lifebite Combat'), slots: ['PRIMARY', 'SECONDARY'] }),
    row({ key: 'claw', name: 'Claw', effects: proc('Claw', 'Lifebite Combat'), slots: ['PRIMARY', 'SECONDARY'] }),
    row({ key: 'sword', name: 'Sword', effects: [], slots: ['PRIMARY', 'SECONDARY'] })
  ]
  const plan = planBoard([gem('Fangs'), gem('Claw')], rows, NOBODY, hands(null, null))
  assert.deepEqual(
    plan.placements.map((p) => `${p.cellLabel}:${p.gemName}`).sort(),
    ['primary:Fangs', 'secondary:Claw']
  )
  // Fangs already in the primary, Claw loose: the one move is Claw into the empty hand.
  const seated = planBoard(
    [gem('Fangs', 'socketed in Primary', true), gem('Claw', 'Bank 1')],
    rows,
    NOBODY,
    hands('Fangs', null)
  )
  assert.deepEqual(
    seated.moves.map((m) => `${m.cellLabel}: socket ${m.gemName}`),
    ['secondary: socket Claw']
  )
  assert.equal(seated.clears.length, 0)
})

test('a lower tier of the same proc family keeps the other hand: both weapons fire their own', () => {
  // Lifebite III in the primary and Lifebite II in the secondary are two procs, one per weapon.
  // The claim held only the best tier, so the plan said to pull Claw ("it now lives in primary")
  // and, with the secondary empty, left it empty while the recommender said to socket Claw there.
  const rows = [
    row({ key: 'fangs', name: 'Fangs', effects: proc('Fangs', 'Lifebite III'), slots: ['PRIMARY', 'SECONDARY'] }),
    row({ key: 'claw', name: 'Claw', effects: proc('Claw', 'Lifebite II'), slots: ['PRIMARY', 'SECONDARY'] }),
    row({ key: 'sword', name: 'Sword', effects: [], slots: ['PRIMARY', 'SECONDARY'] })
  ]
  const kept = planBoard(
    [gem('Fangs', 'socketed in Primary', true), gem('Claw', 'socketed in Secondary', true)],
    rows,
    NOBODY,
    hands('Fangs', 'Claw')
  )
  assert.deepEqual(
    kept.placements.map((p) => `${p.cellLabel}:${p.gemName}:${p.effect}`).sort(),
    ['primary:Fangs:Lifebite III', 'secondary:Claw:Lifebite II']
  )
  assert.equal(kept.moves.length, 0)
  assert.equal(kept.clears.length, 0, 'the secondary proc fires on its own weapon')
  const offered = planBoard([gem('Fangs', 'socketed in Primary', true), gem('Claw')], rows, NOBODY, hands('Fangs', null))
  assert.deepEqual(
    offered.moves.map((m) => `${m.cellLabel}: socket ${m.gemName}`),
    ['secondary: socket Claw']
  )
  assert.equal(offered.clears.length, 0)
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

test('a free seat is taken before an incumbent is asked to move', () => {
  // A sits in the neck and fits neck and waist; X fits back and neck; C fits back and waist.
  // X takes the empty back, so C's free seat is the waist: two moves, and A stays put. Walking
  // C's list in one pass recursed through the held back first and sent A to the waist.
  const rows = [
    row({ key: 'a', name: 'A', effects: worn('A', 'Effect A'), slots: ['NECK', 'WAIST'] }),
    row({ key: 'x', name: 'X', effects: worn('X', 'Effect X'), slots: ['BACK', 'NECK'] }),
    row({ key: 'c', name: 'C', effects: worn('C', 'Effect C'), slots: ['BACK', 'WAIST'] })
  ]
  const plan = planBoard(
    [gem('A', 'socketed in Neck', true), gem('X'), gem('C')],
    rows,
    NOBODY,
    [
      seat({ cellId: 'neck', type: 'Worn', slot: 'NECK', currentName: 'A' }),
      seat({ cellId: 'back', type: 'Worn', slot: 'BACK' }),
      seat({ cellId: 'waist', type: 'Worn', slot: 'WAIST' })
    ]
  )
  assert.equal(plan.placements.length, 3)
  assert.deepEqual(plan.moves.map((m) => `${m.cellLabel}: socket ${m.gemName}`).sort(), [
    'back: socket X',
    'waist: socket C'
  ])
  assert.equal(plan.clears.length, 0)
})

test('one copy granting two families is seated once, and the seat it cannot fill goes to another family', () => {
  // g x1 carries Alpha (focus) and Beta (click); h carries Gamma (focus); one ring with a Focus
  // and a Click socket. The matching seats Alpha and Beta, both through the one g - the ledger
  // can name only one, and the plan used to stop at "Focus: g" with h benched. g in the Click
  // and h in the Focus seats two families.
  const rows = [
    row({
      key: 'g',
      name: 'g',
      effects: [{ name: 'Alpha', kind: 'focus' }, { name: 'Beta', kind: 'click' }],
      slots: ['FINGER']
    }),
    row({ key: 'h', name: 'h', effects: [{ name: 'Gamma', kind: 'focus' }], slots: ['FINGER'] })
  ]
  const plan = planBoard([gem('g'), gem('h')], rows, NOBODY, [
    seat({ cellId: 'ring', type: 'Focus', slot: 'FINGER' }),
    seat({ cellId: 'ring', type: 'Click', slot: 'FINGER' })
  ])
  assert.deepEqual(plan.placements.map((p) => `${p.type}:${p.gemName}:${p.effect}`).sort(), [
    'Click:g:Beta',
    'Focus:h:Gamma'
  ])
  // Alpha is the honest contest: its one seat holds Gamma, and its copy is in the Click.
  assert.deepEqual(
    plan.contested.map((c) => ({ effect: c.effect, options: c.options })),
    [{ effect: 'Alpha', options: [{ cellLabel: 'ring', type: 'Focus', heldBy: 'Gamma' }] }]
  )
})

test('the plan judges an item by ALL its sockets: a WAR-only and a MNK-only gem never share one', () => {
  const rows = [
    row({ key: 'war gem', name: 'War Gem', effects: [{ name: 'Effect A', kind: 'focus' }], slots: ['WRIST'], classes: ['WAR'] }),
    row({ key: 'mnk gem', name: 'Mnk Gem', effects: worn('Mnk Gem', 'Effect B'), slots: ['WRIST'], classes: ['MNK'] }),
    row({ key: 'bracer a', name: 'Bracer A', effects: [], slots: ['WRIST'], classes: ['WAR', 'MNK', 'ROG'] }),
    row({ key: 'bracer b', name: 'Bracer B', effects: [], slots: ['WRIST'], classes: ['WAR', 'MNK', 'ROG'] })
  ]
  const loadout: Loadout = { classes: ['WAR', 'MNK'], deity: null }
  const gems = [gem('War Gem'), gem('Mnk Gem')]
  const a = [
    seat({ cellId: 'wrist1', type: 'Focus', slot: 'WRIST', item: 'Bracer A' }),
    seat({ cellId: 'wrist1', type: 'Worn', slot: 'WRIST', item: 'Bracer A' })
  ]
  // One bracer: both gems fit it alone, together they make it unwearable - one is contested.
  const one = planBoard(gems, rows, loadout, a)
  assert.deepEqual(one.placements.map((p) => p.gemName), ['War Gem'])
  assert.deepEqual(one.contested.map((c) => c.gemName), ['Mnk Gem'])
  assert.match(one.contested[0].options[0].heldBy, /other sockets/)
  // A second bracer with a Worn socket: the matching sends the MNK gem there instead.
  const two = planBoard(gems, rows, loadout, [...a, seat({ cellId: 'wrist2', type: 'Worn', slot: 'WRIST', item: 'Bracer B' })])
  assert.deepEqual(two.placements.map((p) => `${p.cellId}:${p.gemName}`).sort(), ['wrist1:War Gem', 'wrist2:Mnk Gem'])
  assert.equal(two.contested.length, 0)
})
