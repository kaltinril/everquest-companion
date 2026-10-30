// The death recap's grouping (shared/deathRecap.ts) over a real death: `fixtures/death-recap.json`
// is what the engine hands the Combat tab for `fixtures/death-recap.log` (the Rust test
// `fold/tests/death_recap.rs` pins that), so this reads the same death end to end.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { DeathRecap } from '../src/shared/combat'
import { summarizeDeath, summarizeDeaths } from '../src/shared/deathRecap'

const deaths = JSON.parse(readFileSync(new URL('./fixtures/death-recap.json', import.meta.url), 'utf8')) as DeathRecap[]
const recap = summarizeDeath(deaths[0])

test('the mob that hit hardest leads, its two casings one row', () => {
  assert.deepEqual(
    recap.sources.map((s) => [s.source, s.total, s.hits]),
    [
      ['A tree snake', 85, 15],
      ['A black bear', 13, 3]
    ]
  )
  assert.deepEqual(
    recap.sources[0].abilities.map((a) => [a.ability, a.total, a.hits, a.max]),
    [
      ['Melee', 58, 8],
      ['Weak Poison', 24, 4],
      ['Bash', 3, 3]
    ].map(([n, t, h]) => [n, t, h, n === 'Melee' ? 12 : n === 'Weak Poison' ? 6 : 1])
  )
  assert.equal(recap.taken, 98)
})

test('the killing blow is the last hit before the death line', () => {
  assert.equal(recap.killer, 'a tree snake')
  assert.equal(recap.killingBlow?.ability, 'Weak Poison')
  assert.equal(recap.killingBlow?.amount, 6)
  assert.equal(recap.windowSec, 15)
})

test('heals on you in the window are grouped by healer and spell', () => {
  assert.deepEqual(recap.heals, [{ source: 'You', spell: 'Lifetap', total: 10, count: 2 }])
  assert.equal(recap.healed, 10)
})

test('a death with nothing in the window has no killing blow, and the newest death leads', () => {
  const quiet = summarizeDeath({ ts: 5, windowMs: 15_000, hits: [], heals: [] })
  assert.equal(quiet.killingBlow, null)
  assert.equal(quiet.killer, null)
  assert.deepEqual(
    summarizeDeaths([deaths[0], { ts: deaths[0].ts + 60_000, windowMs: 15_000, hits: [], heals: [] }]).map((d) => d.ts),
    [deaths[0].ts + 60_000, deaths[0].ts]
  )
  assert.deepEqual(summarizeDeaths(undefined), [])
})
