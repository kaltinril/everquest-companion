// What each AA does in a few words, per rank (src/shared/aaEffects.ts), and what its ranks cost in all
// (src/shared/aaCost.ts): the redesigned Alt. Advancement tab's rows and points column.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AA_ROWS, type AaRow } from '../src/shared/aaOfficial'
import { aaEffect, aaEffectLine, aaEffectNumber, aaEffectValue, aaFallbackLabel } from '../src/shared/aaEffects'
import { aaCostSum, aaCostSumText, aaCostText, aaRowCost } from '../src/shared/aaCost'

const row = (name: string, cls?: string): AaRow => {
  const r = AA_ROWS.find((x) => x.name === name && (cls === undefined || x.class === cls))
  assert.ok(r, name)
  return r
}

test('the slash list in the text gives one value a rank, signed by its verb', () => {
  assert.deepEqual(aaEffect(row('Combat Fury')).values, ['+1%', '+2%', '+3%', '+5%'])
  assert.deepEqual(aaEffect(row('Packrat')).values?.slice(0, 2), ['-5%', '-10%'], 'reduces is a minus')
  assert.deepEqual(aaEffect(row('Innate Regeneration')).values, ['+1', '+2', '+3', '+4', '+5', '+6', '+7'], 'point(s) carry no unit')
  assert.deepEqual(aaEffect(row("Thief's Intuition")).values, ['-1 s', '-3 s', '-5 s', '-5 s'], 'seconds')
  assert.deepEqual(aaEffect(row('Acrobatics')).values, ['+10%', '+20%', '+30%'], 'the last verb before the numbers decides')
})

test('"N per rank" counts up; a list that does not fit the rank count is not guessed', () => {
  assert.deepEqual(aaEffect(row('Mental Clarity')).values, ['+1', '+2', '+3', '+4'])
  assert.equal(aaEffect(row('Persistent Casting')).values?.[5], '+66%')
  assert.equal(aaEffect(row('Quick Evacuation', 'Druid')).values, null, 'one 10% for three ranks')
  assert.deepEqual(aaEffect(row('Quick Evacuation', 'Wizard')).values, ['-10%', '-25%', '-50%'])
})

test('Pottery Mastery has three ranks and three values', () => {
  assert.equal(row('Pottery Mastery').ranks, 3)
  assert.deepEqual(aaEffect(row('Pottery Mastery')).values, ['-10%', '-25%', '-50%'])
})

test('Special rows read their own rank cells', () => {
  assert.deepEqual(aaEffect(row('Banestrike')).values, ['+2%', '+4%', '+7%', '+10%'])
  assert.deepEqual(aaEffect(row('Class Reincarnation: Warrior')).values, ['-2%', '-4%', '-6%'])
  assert.deepEqual(aaEffect(row('Race Reincarnation: Half Elf')).values, ['+3', '+6', '+9'])
  assert.equal(aaEffect(row('Race Reincarnation: Iksar')).values?.[0], '+2 HP Gen +5 AC')
  assert.equal(aaEffectNumber('+2 HP Gen +5 AC', 1), 5)
})

test('a switch AA has a label and no value, so a row never says "none"', () => {
  const exodus = aaEffect(row('Exodus'))
  assert.equal(exodus.label, 'Group evac')
  assert.equal(exodus.values, null)
  for (const r of AA_ROWS) {
    const e = aaEffect(r)
    assert.notEqual(e.label, '', r.name)
    assert.ok(!(e.values ?? []).some((v) => /none/i.test(v)), r.name)
  }
})

test('an AA not started shows what rank 1 gives; the next rank is offered below the top', () => {
  const fury = aaEffect(row('Combat Fury'))
  assert.deepEqual(aaEffectLine(fury, 0, 4), { label: 'Melee crit chance', now: null, first: '+1%', next: '+1%' })
  assert.deepEqual(aaEffectLine(fury, 4, 4), { label: 'Melee crit chance', now: '+5%', first: null, next: null })
  assert.equal(aaEffectValue(fury, 5), null)
})

test('an AA the table does not know gets the first words of its text', () => {
  const r: AaRow = { section: 'general', name: 'A New AA', ranks: 1, cost: '3', text: 'This passive ability lets you breathe fire, sometimes. Requirements: Level 1.' }
  assert.equal(aaFallbackLabel(r), 'Lets you breathe fire')
  assert.equal(aaFallbackLabel({ ...r, text: '' }), 'No description yet')
})

test('TOTAL COST: Innate Regeneration 1/1/1/2/3/5/5 is 18 points; rank 3 of 7 is 3 of 18', () => {
  const regen = row('Innate Regeneration')
  const full = aaRowCost(regen, 7, 7)
  assert.deepEqual(full, { spent: 18, total: 18, unknown: false, next: null })
  assert.equal(aaCostText(full!, 7, 7), '18 pts')
  const part = aaRowCost(regen, 3, 7)
  assert.deepEqual(part, { spent: 3, total: 18, unknown: false, next: 2 })
  assert.equal(aaCostText(part!, 3, 7), '3 of 18 pts')
})

test('TOTAL COST: Packrat "1 for all ranks" over ten ranks is 10; a free rank is 0', () => {
  assert.equal(aaRowCost(row('Packrat'), 10, 10)?.total, 10)
  assert.deepEqual(aaRowCost(row('Unbound Wrath'), 3, 3), { spent: 0, total: 0, unknown: false, next: null })
  assert.equal(aaRowCost(row('Symphonic Aura'), 1, 5)?.spent, 0, 'rank 1 is auto-granted')
})

test('TOTAL COST: an unstated price makes a floor; corrected costs are used; Special and removed rows cost nothing', () => {
  const turn = aaRowCost(row('Turn Summoned'), 2, 3)
  assert.deepEqual(turn, { spent: 9, total: 9, unknown: true, next: null })
  assert.equal(aaCostText(turn!, 2, 3), '9 of 9+ pts')
  assert.equal(aaRowCost(row('Rampage'), 1, 2)?.total, 9, 'rank 2 costs 4 (the game window)')
  assert.equal(aaRowCost(row('Banestrike'), 1, 4), null)
  assert.equal(aaRowCost(row('Valiant Steed'), 1, 1), null)
  const sum = aaCostSum([aaRowCost(row('Innate Regeneration'), 3, 7), aaRowCost(row('Packrat'), 10, 10), null])
  assert.deepEqual(sum, { spent: 13, total: 28, unknown: false })
  assert.equal(aaCostSumText(sum), '13 of 28 pts')
  assert.equal(aaCostSumText({ spent: 28, total: 28, unknown: false }), '28 pts')
})
