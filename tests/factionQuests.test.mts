// The FACTION-WORK JOIN behind the Factions tab (renderer/src/features/factions/factionQuests.ts):
// faction name → the quests that raise or lower it, projected from the committed quest catalog's
// receipt lines. Pure module, real catalog — the identities here are the tab's whole claim.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFactionWorkIndex } from '../src/renderer/src/features/factions/factionQuests'
import questsJson from '../src/renderer/src/data/eqlegends/quests.json'
import type { QuestData, QuestEntry } from '../src/shared/types'

const CATALOG = (questsJson as QuestData).quests

test('the join splits raise from lower and sorts biggest known payout first', () => {
  const quests: QuestEntry[] = [
    {
      name: 'Small Favor',
      page: 'Small Favor',
      requiredItems: ['Bone Chips'],
      factions: [{ name: 'Kaladim Citizens', up: true, amount: 5 }]
    },
    {
      name: 'Big Favor',
      page: 'Big Favor',
      factions: [
        { name: 'Kaladim Citizens', up: true, amount: 25 },
        { name: 'Craknek Warriors', up: false, amount: -10 }
      ]
    },
    {
      name: 'Unpriced Favor',
      page: 'Unpriced Favor',
      factions: [{ name: 'Kaladim Citizens', up: true }]
    }
  ]
  const index = buildFactionWorkIndex(quests)
  const kaladim = index.get('kaladim citizens')
  assert.ok(kaladim)
  assert.deepEqual(
    kaladim.raise.map((q) => q.name),
    ['Big Favor', 'Small Favor', 'Unpriced Favor'],
    'numeric payouts first, biggest first, unknown last'
  )
  assert.deepEqual(kaladim.lower, [])
  assert.deepEqual(index.get('craknek warriors')?.lower.map((q) => q.name), ['Big Favor'])
  assert.deepEqual(kaladim.raise[1].items, ['Bone Chips'], 'turn-in items ride the ref')
})

test('the real catalog answers the questions the tab was built for', () => {
  const index = buildFactionWorkIndex(CATALOG)
  assert.ok(index.size > 150, `expected work for >150 factions, got ${String(index.size)}`)

  // The Bone Chips ask: something in Kaladim takes them, and the ref says who and where.
  const underfoot = index.get('clerics of underfoot')
  assert.ok(underfoot)
  const kaladimBones = underfoot.raise.find((q) => q.name === 'Bone Chips (Kaladim)')
  assert.ok(kaladimBones)
  assert.equal(kaladimBones.giver, 'Gunlok Jure')
  assert.equal(kaladimBones.startZone, 'North Kaladim')
  assert.deepEqual(kaladimBones.items, ['Bone Chips'])
  assert.equal(kaladimBones.amount, 10)

  // The Kerra Isle ask: the necklace quests that raise the island's regard.
  const kerra = index.get('kerra isle')
  assert.ok(kerra)
  assert.ok(kerra.raise.some((q) => q.name === 'Rat Teeth'))
  assert.ok(kerra.raise.some((q) => q.name === 'Gnomish Toy'))
})
