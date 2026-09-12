// EVERY WAY A PORT LANDS YOU IN A ZONE (owner ask, kaltinril 2026-09-11: "show the closest druid,
// wizard, boat, or item port ... so if i'm on say befallen map, it should show the druid port to
// west commons").
//
// This is the half derived from the two committed corpora. The map's own half - walks, boats and
// the seams the client labels - is `zoneTravel.test.mts`, and the surface joins them.

import test from 'node:test'
import assert from 'node:assert/strict'
import { portsTo, zonePorts } from '../src/main/zonePorts'

test('the corpora state a usable port table', () => {
  const all = zonePorts()
  const via = new Map<string, number>()
  for (const p of all) via.set(p.via, (via.get(p.via) ?? 0) + 1)
  // Measured 2026-09-11: 24 wizard, 18 druid, 16 item, over 17 destinations. Asserted as floors
  // rather than equalities so a corpus that GAINS a port is not a red - what matters is that the
  // three witnesses all still speak.
  assert.ok((via.get('wizard') ?? 0) >= 20, `wizard ports: ${String(via.get('wizard'))}`)
  assert.ok((via.get('druid') ?? 0) >= 15, `druid ports: ${String(via.get('druid'))}`)
  assert.ok((via.get('item') ?? 0) >= 10, `item ports: ${String(via.get('item'))}`)
  assert.ok(new Set(all.map((p) => p.zone)).size >= 15)
})

test('the owner`s example resolves end to end', () => {
  // Befallen has no port of its own; its map states `to_West_Commonlands`, and West Commons does.
  const commons = portsTo('commons')
  assert.ok(commons.length > 0, 'West Commonlands is a port destination')
  const druid = commons.find((p) => p.via === 'druid')
  assert.ok(druid, 'a druid port lands there - the ask, verbatim')
  assert.match(druid.spell, /Commons/)
  assert.equal(typeof druid.level, 'number', 'and it states the level it opens at')
  // Cheapest first, so the row a low character can actually use leads.
  const levels = commons.map((p) => p.level ?? 99)
  assert.deepEqual([...levels].sort((a, b) => a - b), levels, 'sorted by caster level')
})

test('an item port names the item, and claims no caster level', () => {
  const items = zonePorts().filter((p) => p.via === 'item')
  for (const p of items) {
    assert.ok(p.item !== undefined && p.item !== '', `${p.spell} should name the item you click`)
    assert.equal(p.level, undefined, 'clicking needs no caster level - stating one would be a lie')
  }
})

test('nothing a player cannot cast is offered', () => {
  // `BurningTouch2` teleports to burningwood and its class line reads "cast by NPCs only" - a mob's
  // ability, not travel. And every castable row states which class and at what level.
  for (const p of zonePorts()) {
    assert.ok(!/^BurningTouch/.test(p.spell), 'an NPC ability is not travel')
    if (p.via === 'item') continue
    assert.equal(typeof p.level, 'number', `${p.spell} states a caster level`)
    assert.ok(p.level > 0 && p.level <= 60, `${p.spell} level ${String(p.level)} is a real level`)
  }
})
