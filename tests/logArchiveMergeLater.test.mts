// ============================================================================
// logArchiveMergeLater.test.mts — the merge rules added on 2026-10-08, one section per step of
// docs/plans/log-archive/phase-4-more-history.md.
// ============================================================================
//
// The split-log fixtures `la3-{a,b,whole}.json` are `tests/fixtures/logArchive/la3-gems-run.log` cut
// after line 10: ranked casts and merges, gems memorized and forgotten, two saved sets, and the
// character's own `/who` row on both sides of the cut. To re-record: cut the log the same way into
// files named `eqlog_Primitive_freeport.<part>.txt`, run
// `engine/target/release/parity.exe <file> --snapshots --tz UTC` on each, and keep each module's
// `snapshot.state`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { mergeSpellRanks } from '../src/shared/logArchive/mergeSpellRanks'
import { mergeBuffStats } from '../src/shared/logArchive/mergeBuffStats'
import type { ObservedSpellRanksSnap } from '../src/shared/spellRanks'
import type { SpellSetsSnap } from '../src/shared/spellSets'
import type { ComboSnap } from '../src/shared/classCombo'
import type { BuffStat, BuffsSnap } from '../src/shared/buffTypes'

interface Recorded {
  observedSpellRanks: ObservedSpellRanksSnap
  spellSets: SpellSetsSnap
  combo: ComboSnap
}

const fixture = (name: string): Recorded =>
  JSON.parse(readFileSync(new URL(`fixtures/logArchive/${name}.json`, import.meta.url), 'utf8')) as Recorded

const G = { a: fixture('la3-a'), b: fixture('la3-b'), whole: fixture('la3-whole') }

// ── 4.10 spell ranks ────────────────────────────────────────────────────────────────────────────

test('spell ranks: the rule is in the lookup', () => {
  assert.ok(hasMergeRule('observedSpellRanks'))
})

test('split log: observed spell ranks of A merged with B equal the whole log', () => {
  assert.deepEqual(mergeModule('observedSpellRanks', [G.a.observedSpellRanks], G.b.observedSpellRanks).state, G.whole.observedSpellRanks)
})

test('split log: the spell ranks fixture really is split', () => {
  const a = G.a.observedSpellRanks['shiftless deeds']
  const b = G.b.observedSpellRanks['shiftless deeds']
  assert.equal(a.mergedRank, 5, 'the merge is in A')
  assert.equal(b.mergedRank, undefined, 'and not in B')
  assert.equal(b.castRank, 6)
  assert.equal(G.b.observedSpellRanks["denon's disruptive discord"].castRank, undefined, 'the cast of the apostrophe line is in A only')
})

test('spell ranks: a rank learned only in the archive is kept, and absent stays absent', () => {
  const older: ObservedSpellRanksSnap = { mez: { key: 'mez', name: 'Mez', rank: 3, castRank: 3, merges: 0, firstAt: 1, lastAt: 2 } }
  const newer: ObservedSpellRanksSnap = { mez: { key: 'mez', name: 'Mez', rank: 1, merges: 2, firstAt: 5, lastAt: 9 } }
  assert.deepEqual(mergeSpellRanks(older, newer), { mez: { key: 'mez', name: 'Mez', rank: 3, castRank: 3, merges: 2, firstAt: 1, lastAt: 9 } })
  assert.equal(mergeSpellRanks(older, { mez: { key: 'mez' } }), null)
})

// ── 4.6 learned buff durations ──────────────────────────────────────────────────────────────────

const stat = (spell: string, n: number, medianMs: number): BuffStat => ({
  spell,
  cls: 'buff',
  n,
  medianMs,
  p25: medianMs,
  p75: medianMs,
  minMs: medianMs,
  maxMs: medianMs
})

test('buffs: the rule is in the lookup', () => {
  assert.ok(hasMergeRule('buffs'))
})

test('buffs: each spell keeps the summary of the newest stretch that saw it; the present is the live log', () => {
  const older: BuffsSnap = { active: [], stats: { a: stat('A', 9, 1000), b: stat('B', 4, 2000) } }
  const newer = { active: [{ spell: 'live' }], stats: { b: stat('B', 1, 3000) } } as unknown as BuffsSnap
  const merged = mergeModule('buffs', [older], newer).state as BuffsSnap
  assert.deepEqual(merged.stats, { a: stat('A', 9, 1000), b: stat('B', 1, 3000) })
  assert.equal(merged.active, newer.active)
  assert.equal(mergeBuffStats(older, { active: [] }), null)
})
