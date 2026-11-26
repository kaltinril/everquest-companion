// The Special sub-tab (src/shared/aaSpecial.ts): the stat cap as a sum, the next reincarnation, and
// the lines started versus folded away.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withGranted } from '../src/shared/aaGranted'
import { rankAas, type AaPicks } from '../src/shared/aaRanks'
import { aaBoard } from '../src/shared/aaBoard'
import { RULERS_OF_KUNARK, statCapOf } from '../src/shared/reincarnationCap'
import { aaCapView, aaDefaultRace, aaNextRebirth, aaSpecialLayout } from '../src/shared/aaSpecial'
import type { ClassAbbr } from '../src/shared/classCombo'

const OWN: ClassAbbr[] = ['WAR', 'SHM', 'MNK']
/** The owner's Special ranks: two reincarnations, into Half Elf and Iksar. */
const OWNER: AaPicks = { Banestrike: 1, 'Class Reincarnation: Warrior': 2, 'Class Reincarnation: Monk': 2, 'Class Reincarnation: Shaman': 2, 'Race Reincarnation: Half Elf': 1, 'Race Reincarnation: Iksar': 1 }
const TWO = [Date.parse('2026-11-10T12:00:00'), Date.parse('2026-11-01T12:00:00')]
const ranked = (picks: AaPicks = OWNER) => withGranted(rankAas([], picks), { level: 50, classes: OWN })
const board = (picks: AaPicks = OWNER) => aaBoard(ranked(picks), { classes: OWN, own: true })

test('THE CAP: 510 + 10 + 10 + 3 for Half Elf 1 = 533, the same number Best in slot reads', () => {
  const cap = aaCapView(ranked(), TWO)
  assert.deepEqual(cap.terms, [
    { n: 510, label: 'hard cap' },
    { n: 10, label: 'reincarnation 1' },
    { n: 10, label: 'reincarnation 2' },
    { n: 3, label: 'Half Elf 1' }
  ])
  assert.equal(cap.total, 533)
  assert.equal(cap.soft, true)
  assert.equal(cap.total, statCapOf(ranked(), TWO).value)
})

test('THE CAP: no reincarnation in the log is the hard 510 and nothing else', () => {
  assert.deepEqual(aaCapView(ranked(), []), { terms: [{ n: 510, label: 'hard cap' }], total: 510, soft: false })
})

test('NEXT REINCARNATION: +11 from Kunark, +3 more into Half Elf, and the three hotkeys unlock', () => {
  const next = aaNextRebirth(board(), TWO, { kunark: true, race: 'Half Elf' }, OWN)
  assert.equal(next.raise, 11)
  assert.equal(next.raceAdd, 3)
  assert.equal(next.total, 547)
  assert.equal(next.raceGives, '+6')
  assert.deepEqual(next.unlocks, ['Thrash', 'Judgement', 'Perfect Self'])
  const before = aaNextRebirth(board(), TWO, { kunark: false, race: 'Iksar' }, OWN)
  assert.equal(before.raise, 10)
  assert.equal(before.raceAdd, 0)
  assert.equal(before.total, 543)
  assert.ok(RULERS_OF_KUNARK > TWO[0])
})

test('LAYOUT: only started lines show; the rest fold into class and race groups; Completionist counts', () => {
  const layout = aaSpecialLayout(board(), OWN)
  assert.deepEqual(layout.started.map((b) => b.r.key), ['Banestrike', 'Class Reincarnation: Monk', 'Class Reincarnation: Shaman', 'Class Reincarnation: Warrior', 'Race Reincarnation: Half Elf', 'Race Reincarnation: Iksar'])
  assert.equal(layout.classLines.length, 13)
  assert.equal(layout.rest.map((g) => g.title).join(','), 'Class lines,Race lines')
  assert.equal(layout.classTotal, 16)
  assert.equal(layout.classDone, 0)
  assert.equal(layout.classDoneNext, 3)
  assert.equal(layout.completionist?.r.key, 'Reincarnation: Completionist')
  assert.equal(aaDefaultRace(layout.races), 'Half Elf')
  assert.equal(aaDefaultRace([]), 'Human')
})
