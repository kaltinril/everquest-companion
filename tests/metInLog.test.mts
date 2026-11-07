// metInLog — what the player's own log met (owner ruling, 2026-10-17: the log outranks an era
// banner). Pins the evidence store's set/version semantics and the one mob predicate that reads it
// (`shared/mobEra.ts mobOutOfEra`), the zone table (`zoneEra`) and the item verdict (`donorEra`). Every test empties what it filled, so the suite's other tests
// see the wiki's verdicts only.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eraVersion, metVersion, setMet, wasMet } from '../src/shared/metInLog'
import { mobOutOfEra } from '../src/shared/mobEra'
import { eraCached } from '../src/shared/planner/eraCache'
import { CURRENT_ERA, eraVerdict, withoutOutOfEraMobs, zoneEra } from '../src/shared/planner/era'
import { donorEra, eraHides, type EraSubject } from '../src/renderer/src/features/planner/plannerData'

function clearAll(): void {
  setMet('mobs', [])
  setMet('items', [])
  setMet('zones', [])
}

test('setMet replaces a kind, and the version moves only on a real change', () => {
  try {
    const v0 = metVersion()
    setMet('mobs', ['A Gnoll Pup', 'a gnoll pup'])
    const v1 = metVersion()
    assert.ok(v1 > v0, 'new evidence moves the version')
    assert.equal(wasMet('mobs', 'a gnoll pup'), true)
    setMet('mobs', ['a gnoll pup'])
    assert.equal(metVersion(), v1, 'the same set again is no change')
    setMet('mobs', ['a fire beetle'])
    assert.ok(metVersion() > v1, 'a different set is a change')
    assert.equal(wasMet('mobs', 'a gnoll pup'), false, 'a set REPLACES the kind, it does not add')
    assert.equal(wasMet('items', 'a fire beetle'), false, 'kinds are separate')
  } finally {
    clearAll()
  }
})

test('each kind folds its own way: a mob by mobKey, a zone by zoneKey, an item without its +N tier', () => {
  try {
    setMet('mobs', ['An elemental capturer (14)'])
    setMet('items', ['Ghoulbane +2'])
    setMet('zones', ['Lower Guk'])
    assert.equal(wasMet('mobs', 'an elemental capturer'), true)
    assert.equal(wasMet('items', 'ghoulbane'), true)
    assert.equal(wasMet('items', 'Ghoulbane +1'), true)
    assert.equal(wasMet('zones', 'LOWER GUK'), true)
    assert.equal(wasMet('zones', 'Upper Guk'), false)
  } finally {
    clearAll()
  }
})

test('a re-feed reuses the keys it made and holds the same evidence as a first feed', () => {
  try {
    setMet('zones', ['The Lower Guk (Solo)', 'Plane of Fear'])
    const v = metVersion()
    setMet('zones', ['Plane of Fear', 'The Lower Guk (Solo)'])
    assert.equal(metVersion(), v, 'the same names, re-keyed from the memo, are no change')
    setMet('zones', ['Plane of Fear', 'Lower Guk', '  '])
    assert.equal(wasMet('zones', 'lower guk'), true, 'two spellings, one key')
    setMet('zones', ['Plane of Fear'])
    assert.equal(wasMet('zones', 'Lower Guk'), false, 'a name no longer fed is gone')
    setMet('zones', ['The Lower Guk (Solo)'])
    assert.equal(wasMet('zones', 'Lower Guk'), true, 'and keyed again when it returns')
    assert.equal(wasMet('zones', 'Plane of Fear'), false)
  } finally {
    clearAll()
  }
})

test('mobOutOfEra: a flagged mob the log met is in era; by its name or by its page', () => {
  const fiend = { name: 'a revamp fiend', page: 'A revamp fiend (Plane of Fear)', outOfEra: true as const }
  try {
    assert.equal(mobOutOfEra(fiend), true, 'the wiki flag decides while the log is silent')
    setMet('mobs', ['A revamp fiend'])
    assert.equal(mobOutOfEra(fiend), false, 'the log met it, so it is in era for this player')
    setMet('mobs', ['A revamp fiend (Plane of Fear)'])
    assert.equal(mobOutOfEra(fiend), false, 'the page spelling counts too')
    assert.deepEqual(withoutOutOfEraMobs([fiend]), [fiend], 'and the roster keeps it')
    setMet('mobs', [])
    assert.equal(mobOutOfEra(fiend), true, 'evidence gone, the flag speaks again')
    assert.equal(mobOutOfEra({ name: 'a plain rat' }), false, 'no flag is in era, met or not')
  } finally {
    clearAll()
  }
})

test('zoneEra: a zone the log entered is the current era, whatever the zone table says', () => {
  try {
    assert.equal(zoneEra("Sleeper's Tomb"), 'velious')
    assert.equal(eraVerdict(["Sleeper's Tomb"]), 'out-of-era')
    setMet('zones', ["Sleeper's Tomb"])
    assert.equal(zoneEra("Sleeper's Tomb"), CURRENT_ERA)
    assert.equal(zoneEra("SLEEPER'S TOMB"), CURRENT_ERA, 'joined by zoneKey')
    assert.equal(eraVerdict(["Sleeper's Tomb"]), 'in-era')
    assert.equal(zoneEra('Kael Drakkel'), 'velious', 'only the zone the log met')
  } finally {
    clearAll()
  }
})

test('donorEra: an item the log looted is in era, over every wiki layer, and the cache sees it', () => {
  // A Velious drop by its only zone, and a revamp-bannered one: both out of era on the wiki.
  const tomb: EraSubject = { key: 'a test warder blade', zones: ["Sleeper's Tomb"] }
  const revamp: EraSubject = { key: 'a test revamp choker', eraTag: 'FearHateRevamp', zones: ['Plane of Fear'] }
  try {
    assert.equal(donorEra(tomb).verdict, 'out-of-era')
    assert.equal(donorEra(revamp).verdict, 'out-of-era')
    setMet('items', ['A Test Warder Blade +2', 'a test revamp choker'])
    assert.equal(donorEra(tomb).verdict, 'in-era', 'looted, so in era: the cached out-of-era answer is gone')
    assert.equal(donorEra(tomb).by, 'log')
    assert.equal(donorEra(revamp).verdict, 'in-era', 'the log outranks even a no-expansion banner')
    assert.equal(eraHides(tomb, true), false)
    setMet('items', [])
    assert.equal(donorEra(tomb).verdict, 'out-of-era', 'evidence gone, the wiki speaks again')
  } finally {
    clearAll()
  }
})

test('eraVersion moves only when a mob or zone key some verdict has read arrives or leaves', () => {
  try {
    const fiend = { name: 'an era bench fiend', page: 'An era bench fiend (Plane of Fear)', outOfEra: true as const }
    assert.equal(mobOutOfEra(fiend), true, 'the verdict reads the fiend: it joins the read set')
    const e0 = eraVersion()
    const v0 = metVersion()
    setMet('mobs', ['a never asked bench rat'])
    assert.notEqual(metVersion(), v0, 'the evidence moved')
    assert.equal(eraVersion(), e0, 'but no verdict ever asked about the rat')
    setMet('mobs', ['a never asked bench rat', 'An era bench fiend'])
    assert.notEqual(eraVersion(), e0, 'the fiend was read: a verdict can change')
    const e1 = eraVersion()
    assert.equal(mobOutOfEra(fiend), false)
    setMet('mobs', ['An era bench fiend', 'another unasked bench rat'])
    assert.equal(eraVersion(), e1, 'a rat came and a rat went, neither read')
    setMet('mobs', ['another unasked bench rat'])
    assert.notEqual(eraVersion(), e1, 'the fiend left: a verdict can change back')
    const e2 = eraVersion()
    setMet('items', ['Bench Blade'])
    assert.equal(eraVersion(), e2, 'items never move it (their verdicts key on metVersion)')
    assert.equal(zoneEra('Bench Hollow Nowhere'), null, 'a zone read joins the read set too')
    setMet('zones', ['Bench Hollow Nowhere'])
    assert.notEqual(eraVersion(), e2)
    assert.equal(zoneEra('Bench Hollow Nowhere'), CURRENT_ERA)
  } finally {
    clearAll()
  }
})

test('eraCached holds its fold across evidence no verdict read, and folds again when a read key moves', () => {
  let builds = 0
  const drake = { name: 'a bench cached drake', outOfEra: true as const }
  const kept = eraCached((eraOnly) => {
    builds++
    return { eraOnly, out: mobOutOfEra(drake) }
  })
  try {
    const first = kept(true)
    assert.equal(first.out, true)
    setMet('mobs', ['a bench cached unread mob'])
    assert.equal(kept(true), first, 'held: the new name was never read by the fold')
    assert.equal(builds, 1)
    setMet('mobs', ['a bench cached unread mob', 'A Bench Cached Drake'])
    const after = kept(true)
    assert.notEqual(after, first, 'the drake was read: folded again')
    assert.equal(after.out, false)
    assert.equal(builds, 2)
  } finally {
    clearAll()
  }
})
