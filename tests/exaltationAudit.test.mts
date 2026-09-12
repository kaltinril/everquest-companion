// THE EXALTATION CLEANUP ADVISOR (src/renderer/src/features/character/exaltationAudit.ts; fork
// ask, kaltinril 2026-09-09). What is pinned, because each is a decision:
//
//   DUPLICATES are counted, never commanded — the row states copies / socketed / loose, and a
//   single copy is never a finding.
//
//   SUPERSEDED runs through the CLASS GATE on the BETTER copy: a higher tier of the same effect
//   family flags the lower one only when some class of the character's loadout can use the
//   better donor. An unusable higher tier supersedes nothing ("the items are class-specific").
//
//   RANK comes from the corpus's focus parse where it ran (`family`/`familyTier`) and from the
//   trailing roman numeral where it did not — and an unranked effect belongs to no family, so a
//   family of one flags nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GearRow } from '../src/shared/planner/gear'
import type { OwnedExaltation } from '../src/shared/characterSheet'
import { auditExaltations, rankedEffects } from '../src/renderer/src/features/character/exaltationAudit'
import {
  recommendSockets,
  type SocketHostCell
} from '../src/renderer/src/features/character/socketRecommend'

function row(key: string, name: string, effects: GearRow['effects'], classes: GearRow['classes'] = []): GearRow {
  return {
    key,
    name,
    searchKey: name.toLowerCase(),
    slots: ['WAIST'],
    classes,
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: {},
    effects
  }
}

function owned(name: string, where: string, socketed = false): OwnedExaltation {
  return { name, key: name.toLowerCase(), where, socketed }
}

test('rankedEffects prefers the corpus focus parse and falls back to the trailing roman numeral', () => {
  const parsed = row('a', 'A', [
    { name: 'Improved Damage II', kind: 'focus', family: 'Improved Damage', familyTier: 2 }
  ])
  assert.deepEqual(rankedEffects(parsed), [
    { family: 'improved damage', tier: 2, effect: 'Improved Damage II' }
  ])
  const fallback = row('b', 'B', [{ name: 'Burning Affliction III', kind: 'worn' }])
  assert.deepEqual(rankedEffects(fallback), [
    { family: 'burning affliction', tier: 3, effect: 'Burning Affliction III' }
  ])
  // Unranked effects belong to no family.
  assert.deepEqual(rankedEffects(row('c', 'C', [{ name: 'See Invisible', kind: 'worn' }])), [])
})

test('a lower owned tier is flagged when a higher owned tier is usable by the loadout', () => {
  const rows = [
    row('weak belt', 'Weak Belt', [{ name: 'Burning Affliction I', kind: 'worn' }]),
    row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }], ['WAR'])
  ]
  const audit = auditExaltations(
    [owned('Weak Belt', 'General 1'), owned('Strong Belt', 'Bank 2')],
    rows,
    ['WAR', 'MNK', 'SHM']
  )
  assert.equal(audit.superseded.length, 1)
  const f = audit.superseded[0]
  assert.equal(f.name, 'Weak Belt')
  assert.equal(f.betterName, 'Strong Belt')
  assert.equal(f.betterTier, 3)
  assert.deepEqual(f.wheres, ['General 1'])
  // …and the same pair through a loadout the better donor CANNOT serve flags nothing.
  const gated = auditExaltations(
    [owned('Weak Belt', 'General 1'), owned('Strong Belt', 'Bank 2')],
    [rows[0], row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }], ['NEC'])],
    ['WAR', 'MNK', 'SHM']
  )
  assert.equal(gated.superseded.length, 0, 'an unusable higher tier supersedes nothing')
})

test('duplicates are counted with their places, and a worn copy is called socketed', () => {
  const audit = auditExaltations(
    [
      owned('Blood Fire', 'socketed in Primary', true),
      owned('Blood Fire', 'Augmentation'),
      owned('Lone Gem', 'General 3')
    ],
    [],
    []
  )
  assert.equal(audit.duplicates.length, 1)
  assert.deepEqual(audit.duplicates[0], {
    name: 'Blood Fire',
    copies: 2,
    socketed: 1,
    wheres: ['socketed in Primary', 'Augmentation']
  })
  // No corpus at all: the tier half stays silent rather than guessing.
  assert.equal(audit.superseded.length, 0)
})

function host(cellId: string, type: string, currentName: string | null, item = 'Host Item'): SocketHostCell {
  return {
    cellId,
    cellLabel: cellId,
    item,
    type,
    // The test rows all state WAIST (the `row` helper), so the default host fits them under R2.
    slot: 'WAIST',
    itemKey: item.toLowerCase(),
    currentKey: currentName === null ? null : currentName.toLowerCase(),
    currentName
  }
}

test('the recommender swaps a socketed gem only for a strictly better LOOSE copy of the same family', () => {
  const rows = [
    row('weak belt', 'Weak Belt', [{ name: 'Burning Affliction I', kind: 'worn' }]),
    row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }]),
    // A higher tier of a DIFFERENT family must never be offered as a swap: no exchange rate.
    row('other gem', 'Other Gem', [{ name: 'Enhancement Haste V', kind: 'worn' }])
  ]
  const recs = recommendSockets(
    [
      { name: 'Weak Belt', key: 'weak belt', where: 'socketed in Waist', socketed: true },
      { name: 'Strong Belt', key: 'strong belt', where: 'Bank 2', socketed: false },
      { name: 'Other Gem', key: 'other gem', where: 'Bank 2', socketed: false }
    ],
    rows,
    [],
    [host('waist', 'Worn', 'Weak Belt')]
  )
  assert.equal(recs.swaps.length, 1)
  assert.equal(recs.swaps[0].toName, 'Strong Belt')
  assert.equal(recs.swaps[0].toWhere, 'Bank 2')
  // …and the cell is flagged for the grid to paint red.
  assert.deepEqual([...(recs.flaggedByCell.get('waist') ?? [])], ['weak belt'])
})

test('an empty socket takes the best remaining loose gem, and one physical copy is never spent twice', () => {
  const rows = [
    row('gem a', 'Gem A', [{ name: 'Improved Damage II', kind: 'worn' }]),
    row('gem b', 'Gem B', [{ name: 'See Invisible', kind: 'worn' }])
  ]
  const recs = recommendSockets(
    [{ name: 'Gem A', key: 'gem a', where: 'General 1', socketed: false },
     { name: 'Gem B', key: 'gem b', where: 'General 2', socketed: false }],
    rows,
    [],
    [host('ear1', 'Worn', null), host('ear2', 'Worn', null), host('neck', 'Worn', null)]
  )
  // Two gems, three empty sockets: the ranked one first, the unranked one second, nothing third.
  assert.equal(recs.fills.length, 2)
  assert.equal(recs.fills[0].gemName, 'Gem A')
  assert.equal(recs.fills[1].gemName, 'Gem B')
})

test('a socketed gem the corpus cannot rank is left alone - "better" would be a guess', () => {
  const recs = recommendSockets(
    [
      { name: 'Mystery Gem', key: 'mystery gem', where: 'socketed in Head', socketed: true },
      { name: 'Strong Belt', key: 'strong belt', where: 'Bank 2', socketed: false }
    ],
    [row('strong belt', 'Strong Belt', [{ name: 'Burning Affliction III', kind: 'worn' }])],
    [],
    [host('head', 'Worn', 'Mystery Gem')]
  )
  assert.equal(recs.swaps.length, 0)
  assert.equal(recs.flaggedByCell.size, 0)
})

test('a family socketed twice is a DEAD socket: the lesser copy is flagged and offered a different family', () => {
  const rows = [
    row('aff gem', 'Aff Gem', [{ name: 'Affliction Efficiency I', kind: 'focus', family: 'Affliction Efficiency', familyTier: 1 }]),
    row('aff gem 2', 'Aff Gem 2', [{ name: 'Affliction Efficiency II', kind: 'focus', family: 'Affliction Efficiency', familyTier: 2 }]),
    row('other', 'Other', [{ name: 'Improved Damage I', kind: 'focus', family: 'Improved Damage', familyTier: 1 }])
  ]
  const recs = recommendSockets(
    [
      { name: 'Aff Gem', key: 'aff gem', where: 'socketed in Ear', socketed: true },
      { name: 'Aff Gem 2', key: 'aff gem 2', where: 'socketed in Ear', socketed: true },
      { name: 'Other', key: 'other', where: 'Bank 1', socketed: false }
    ],
    rows,
    [],
    [host('ear1', 'Focus', 'Aff Gem'), host('ear2', 'Focus', 'Aff Gem 2')]
  )
  assert.equal(recs.redundant.length, 1)
  const r = recs.redundant[0]
  // The tier-II copy is kept; the tier-I ear is the dead socket, replaced cross-family.
  assert.equal(r.cellId, 'ear1')
  assert.equal(r.keptIn, 'ear2')
  // The sentence must name the KEPT copy's tier, never the dead one's (user report 2026-09-10).
  assert.equal(r.keptEffect, 'Affliction Efficiency II')
  assert.equal(r.replaceWith?.name, 'Other')
  // …and the dead cell is flagged for the grid.
  assert.ok(recs.flaggedByCell.get('ear1')?.has('aff gem'))
  assert.equal(recs.flaggedByCell.get('ear2'), undefined)
})

test('the redundancy pass judges POST-swap effects, so a swap does not create a phantom duplicate', () => {
  // One ear holds tier I, a loose tier II exists: the swap upgrades the ear, and the OTHER ear
  // holding an unrelated family stays unflagged.
  const rows = [
    row('aff gem', 'Aff Gem', [{ name: 'Affliction Efficiency I', kind: 'focus', family: 'Affliction Efficiency', familyTier: 1 }]),
    row('aff gem 2', 'Aff Gem 2', [{ name: 'Affliction Efficiency II', kind: 'focus', family: 'Affliction Efficiency', familyTier: 2 }]),
    row('other', 'Other', [{ name: 'Improved Damage I', kind: 'focus', family: 'Improved Damage', familyTier: 1 }])
  ]
  const recs = recommendSockets(
    [
      { name: 'Aff Gem', key: 'aff gem', where: 'socketed in Ear', socketed: true },
      { name: 'Other', key: 'other', where: 'socketed in Ear', socketed: true },
      { name: 'Aff Gem 2', key: 'aff gem 2', where: 'Bank 1', socketed: false }
    ],
    rows,
    [],
    [host('ear1', 'Focus', 'Aff Gem'), host('ear2', 'Focus', 'Other')]
  )
  assert.equal(recs.swaps.length, 1)
  assert.equal(recs.redundant.length, 0)
})

test('R2: a gem fits only a host sharing its donor SLOT, and only a host sharing a CLASS', () => {
  const rows = [
    row('belt gem', 'Belt Gem', [{ name: 'Burning Affliction III', kind: 'worn' }]),
    row('mnk gem', 'Mnk Gem', [{ name: 'Improved Damage III', kind: 'worn' }], ['MNK']),
    row('war host', 'War Host', [], ['WAR'])
  ]
  const looseBoth = [
    { name: 'Belt Gem', key: 'belt gem', where: 'Bank 1', socketed: false },
    { name: 'Mnk Gem', key: 'mnk gem', where: 'Bank 1', socketed: false }
  ]
  // A WAIST-slot gem is never offered to a FINGER cell...
  const fingerHost = { ...host('finger1', 'Worn', null), slot: 'FINGER' as const }
  assert.equal(recommendSockets(looseBoth, rows, [], [fingerHost]).fills.length, 0)
  // ...and a MNK-only gem is never offered to a WAR-only host item, even at the right slot -
  // socketing it would re-restrict an item its own wearer could not use.
  const warHost = { ...host('waist', 'Worn', null, 'War Host'), itemKey: 'war host' }
  const fills = recommendSockets(looseBoth, rows, [], [warHost]).fills
  assert.equal(fills.length, 1)
  assert.equal(fills[0].gemName, 'Belt Gem')
})

test('keeper-first: a socket called dead is never also offered an upgrade (the Summoning Haste case)', () => {
  // Fingers holds tier I, Waist holds tier III of the same family, a loose tier III exists:
  // the old order swapped the ring UP and then called it dead. Now the waist is the keeper
  // (nothing to upgrade - the loose copy does not beat III), and the ring is ONLY dead.
  const rows = [
    row('ring gem', 'Ring Gem', [{ name: 'Summoning Haste I', kind: 'worn' }]),
    row('belt gem', 'Belt Gem', [{ name: 'Summoning Haste III', kind: 'worn' }])
  ]
  const recs = recommendSockets(
    [
      { name: 'Ring Gem', key: 'ring gem', where: 'socketed in Fingers', socketed: true },
      { name: 'Belt Gem', key: 'belt gem', where: 'socketed in Waist', socketed: true },
      { name: 'Belt Gem', key: 'belt gem', where: 'General 6', socketed: false }
    ],
    rows,
    [],
    [host('finger1', 'Worn', 'Ring Gem'), host('waist', 'Worn', 'Belt Gem')]
  )
  assert.equal(recs.swaps.length, 0, 'the keeper already holds III; the loose III upgrades nothing')
  assert.equal(recs.redundant.length, 1)
  assert.equal(recs.redundant[0].cellId, 'finger1')
})

// ---- the fill pass obeys the in-force ledger (Malkil via kaltinril, 2026-09-11) --------------
//
// The report, verbatim: *"It's telling me to put Summoning Haste I in my finger focus slot, then
// telling me that the same Exaltation is outclassed by Brell's Girdle, which I already have
// equipped"*. Both halves of the panel were defensible alone. Together they told him to spend a
// socket on nothing, because same-name effects do not stack.
//
// The fill pass was the only one of the three that asked its candidates nothing (`() => true`)
// while the swap and redundancy passes had always been gated. These two tests are that gate.

test('a fill never offers a family the board already grants - the Summoning Haste report', () => {
  const rows = [
    row('belt gem', 'Belt Gem', [{ name: 'Summoning Haste III', kind: 'worn' }]),
    row('ring gem', 'Ring Gem', [{ name: 'Summoning Haste I', kind: 'worn' }]),
    row('other gem', 'Other Gem', [{ name: 'Improved Damage II', kind: 'worn' }])
  ]
  const recs = recommendSockets(
    [
      { name: 'Belt Gem', key: 'belt gem', where: 'socketed in Waist', socketed: true },
      { name: 'Ring Gem', key: 'ring gem', where: 'General 2', socketed: false },
      { name: 'Other Gem', key: 'other gem', where: 'General 3', socketed: false }
    ],
    rows,
    [],
    [host('waist', 'Worn', 'Belt Gem'), host('finger1', 'Worn', null)]
  )
  // The empty finger takes the OTHER family. The loose Summoning Haste I is left where it is: the
  // III in the waist outranks it and the socket would have granted nothing.
  assert.equal(recs.fills.length, 1)
  assert.equal(recs.fills[0].cellId, 'finger1')
  assert.equal(recs.fills[0].gemName, 'Other Gem')
})

test('…and two empty sockets are never filled from one family, which is the same bug twice', () => {
  const rows = [
    row('big gem', 'Big Gem', [{ name: 'Summoning Haste III', kind: 'worn' }]),
    row('small gem', 'Small Gem', [{ name: 'Summoning Haste I', kind: 'worn' }])
  ]
  const recs = recommendSockets(
    [
      { name: 'Big Gem', key: 'big gem', where: 'General 1', socketed: false },
      { name: 'Small Gem', key: 'small gem', where: 'General 2', socketed: false }
    ],
    rows,
    [],
    [host('ear1', 'Worn', null), host('ear2', 'Worn', null)]
  )
  // Two loose copies of one family, two open sockets: the better one is placed and the second
  // socket is left empty rather than filled with a copy that would add nothing to it.
  assert.equal(recs.fills.length, 1)
  assert.equal(recs.fills[0].gemName, 'Big Gem')
})

// ---- the proc rule (owner ruling, kaltinril 2026-09-11) --------------------------------------
//
// "it's recommending PROCS in the any slot. I don't think any slot can proc????" - and R2 had let
// it through honestly: his Any Slot cells hold SECONDARY items, the offered gems are
// Primary/Secondary weapons, and the pair shares SECONDARY. The client even enumerates a proc
// socket on every worn item. A proc still needs something to SWING, and nothing attacks with an
// Any Slot. `socketRecommend.seatIsLive` carries the ruling and what would overturn it.

test('a Proc seat is only offered where a weapon is actually swung', () => {
  // The donor is a Primary/Secondary weapon gem - the shape of Gold Plated Koshigatana. The HOST
  // is a Primary/Secondary item too, so R2 passes on both seats below and the proc rule is the
  // only thing that can separate them.
  const weapon = (key: string, name: string, effects: GearRow['effects']): GearRow => ({
    ...row(key, name, effects),
    slots: ['PRIMARY', 'SECONDARY']
  })
  const rows = [weapon('sword gem', 'Sword Gem', [{ name: 'Dismiss Summoned', kind: 'proc' }]),
                weapon('bladestopper', 'Bladestopper', [])]
  const gem = [{ name: 'Sword Gem', key: 'sword gem', where: 'Bank 12', socketed: false }]

  // An `Any Slot` cell (slot null) holding that weapon: R2 passes, the proc rule does not.
  const anySlot: SocketHostCell = { ...host('any1', 'Proc', null, 'Bladestopper'), slot: null }
  const idle = recommendSockets(gem, rows, [], [anySlot])
  assert.equal(idle.fills.length, 0, 'nothing swings an Any Slot, so its proc socket is not a seat')

  // The same gem into the hand that swings - the one place a proc can fire.
  const primary: SocketHostCell = { ...anySlot, cellId: 'primary', slot: 'PRIMARY' }
  const armed = recommendSockets(gem, rows, [], [primary])
  assert.equal(armed.fills.length, 1)
  assert.equal(armed.fills[0].gemName, 'Sword Gem')

  // …and a FOCUS seat on that same Any Slot item is untouched: the rule is about procs only.
  const focus: SocketHostCell = { ...anySlot, cellId: 'any1f', type: 'Focus' }
  const focusGem = [{ name: 'Focus Gem', key: 'focus gem', where: 'Bank 12', socketed: false }]
  const still = recommendSockets(
    focusGem,
    [weapon('focus gem', 'Focus Gem', [{ name: 'Improved Damage II', kind: 'focus' }]), rows[1]],
    [],
    [focus]
  )
  assert.equal(still.fills.length, 1, 'an Any Slot is a real seat for everything but a proc')
})
