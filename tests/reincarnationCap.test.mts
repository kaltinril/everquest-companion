// The base stat cap after reincarnations (src/shared/reincarnationCap.ts): hard with none, soft and
// raised by 10 a reincarnation (11 from Rulers of Kunark), 5 a Human rank and 3 a Half Elf rank.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_STAT_CAP,
  HALF_ELF_AA,
  HUMAN_AA,
  RULERS_OF_KUNARK,
  SOFT_CAP_OVER,
  reincarnationStatCap,
  statCapOf
} from '../src/shared/reincarnationCap'
import { rankAas } from '../src/shared/aaRanks'
import { reincarnations } from '../src/shared/reincarnationClimbs'
import type { AASpendEvent, LevelEvent } from '../src/shared/types'

const BEFORE = new Date(2026, 10, 20, 12).getTime()
const AFTER = new Date(2026, 11, 8, 0, 0, 1).getTime()

test('no reincarnation: the cap is hard at 510', () => {
  assert.deepEqual(reincarnationStatCap({ reincarnationTimes: [], humanRanks: 0, halfElfRanks: 0 }), {
    value: 510,
    over: 0,
    reincarnations: 0
  })
  assert.equal(BASE_STAT_CAP, 510)
  assert.equal(reincarnationStatCap({ reincarnationTimes: [], humanRanks: 0, halfElfRanks: 0, hardCap: 400 }).value, 400)
})

test('one reincarnation before Rulers of Kunark is 520, one on or after it 521, both soft', () => {
  assert.deepEqual(reincarnationStatCap({ reincarnationTimes: [BEFORE], humanRanks: 0, halfElfRanks: 0 }), {
    value: 520,
    over: 0.2,
    reincarnations: 1
  })
  assert.equal(reincarnationStatCap({ reincarnationTimes: [AFTER], humanRanks: 0, halfElfRanks: 0 }).value, 521)
  assert.equal(reincarnationStatCap({ reincarnationTimes: [RULERS_OF_KUNARK], humanRanks: 0, halfElfRanks: 0 }).value, 521)
  assert.equal(reincarnationStatCap({ reincarnationTimes: [RULERS_OF_KUNARK - 1], humanRanks: 0, halfElfRanks: 0 }).value, 520)
})

test('one of each, Human 2 ranks and Half Elf 1: 510 + 10 + 11 + 10 + 3 = 544', () => {
  assert.deepEqual(reincarnationStatCap({ reincarnationTimes: [AFTER, BEFORE], humanRanks: 2, halfElfRanks: 1 }), {
    value: 544,
    over: SOFT_CAP_OVER,
    reincarnations: 2
  })
  assert.equal(SOFT_CAP_OVER, 0.2)
})

test('from ranked AAs: the race ranks are read by their log names', () => {
  const ranked = rankAas([], { [HUMAN_AA]: 2, [HALF_ELF_AA]: 1 })
  assert.equal(statCapOf(ranked, [AFTER, BEFORE]).value, 544)
  assert.equal(statCapOf(ranked, []).value, 510)
})

test('the reincarnations come from the log with their race', () => {
  const at = (ts: number, race: string, rank?: number): AASpendEvent[] => [
    { ts, ability: `Race Reincarnation: ${race}`, cost: 0 },
    rank === undefined
      ? { ts, ability: 'Class Reincarnation: Monk', cost: 0 }
      : { ts, ability: `Class Reincarnation: Monk ${String(rank)}`, cost: 0, rank }
  ]
  const levels: LevelEvent[] = [
    { ts: BEFORE + 60_000, level: 2 },
    { ts: AFTER + 60_000, level: 2 }
  ]
  const found = reincarnations(levels, [...at(BEFORE, 'Human'), ...at(AFTER, 'Half Elf', 2)])
  assert.deepEqual(found, [
    { ts: AFTER, race: 'Half Elf' },
    { ts: BEFORE, race: 'Human' }
  ])
  const ranked = rankAas([], {}, found.map((r) => r.race))
  assert.equal(statCapOf(ranked, found.map((r) => r.ts)).value, 510 + 11 + 10 + 5 + 3)
})
