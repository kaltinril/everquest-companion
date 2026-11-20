// "COPY THIS VIEW" MEANS THE VIEW ON SCREEN: the meter scope and the pet layout reach the paste.
//
// The level-1 copy used to serialize the bare segment. With the Combat tab set to You, and the pet
// inside your bar, the screen showed one You row under a headline over your own clock, and the
// paste listed the whole group, the pet apart, under the whole fight's total and rate. The panel
// now hands `formatSegmentText` the rows and the headline it is showing.
//
// Beside tests/combatCopyText.test.mts (the goldens for every block), which is at its line
// ceiling. The view is built here the way `SegmentPanel` builds it: scope filter, pet fold, the
// scoped total, the You-scope rate.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAX_WIDTH, fmtDur, formatSegmentText, type ShownSources } from '../src/renderer/src/features/combat/copyText'
import { headlineClockSec } from '../src/renderer/src/features/combat/headlineClock'
import { scopeRate, scopeSources, scopeTotals } from '../src/renderer/src/features/combat/meterScope'
import { meterSources } from '../src/renderer/src/features/combat/petRows'
import type { MeterScope, RosterSnap } from '../src/shared/roster'
import type { SegmentView, SourceView } from '../src/shared/combat'

function source(over: Partial<SourceView>): SourceView {
  return {
    id: 'x',
    name: 'x',
    kind: 'you',
    total: 0,
    dps: 0,
    pct: 100,
    hits: 0,
    crits: 0,
    critPct: 0,
    ambiguousHits: 0,
    ambiguousTotal: 0,
    misses: 0,
    hitPct: 100,
    missBreakdown: { miss: 0, dodge: 0, parry: 0, riposte: 0, block: 0, absorb: 0 },
    resists: 0,
    resistPct: 0,
    skills: [],
    categories: [],
    ...over
  }
}

const YOU = source({ id: 'you', name: 'You', total: 31200, dps: 375, hits: 260, crits: 31, critPct: 11.9, misses: 57, hitPct: 82 })
const PET = source({ id: 'pet:vebarn', name: 'Vebarn', kind: 'pet', total: 9030, dps: 108, pct: 29, hits: 120, misses: 36, hitPct: 76.9 })
/** A group-mate the roster names: the row the You scope hides. */
const BOB = source({ id: 'member:bob', name: 'Bob', kind: 'member', total: 5000, dps: 60, pct: 16, hits: 40 })

/** Only the fields the outgoing paste and the scope helpers read. An 83 s fight with idle gaps;
 *  your own clock is 50 s of it. */
const SEG = {
  name: 'a deadly black widow +2',
  durationSec: 83,
  activeSec: 70,
  selfSec: 50,
  outTotal: 45230,
  outDps: 545,
  activeDps: 646,
  entities: [YOU, PET, BOB],
  enemyHealTotal: 0
} as unknown as SegmentView

const WITH_BOB: RosterSnap = {
  members: [{ key: 'bob', name: 'Bob', source: 'joined', sinceTs: 0, lastConfirmedTs: 0, stale: false }],
  seen: true,
  lastSignalTs: 1
}

/** The rows and figures the panel shows at level 1, built the way `SegmentPanel` builds them. */
function shownAs(scope: MeterScope, nested: boolean, seg: SegmentView = SEG): ShownSources {
  const scoped = scopeSources(seg.entities, scope, WITH_BOB)
  const share = scopeTotals(seg.entities, scoped, seg.outTotal, seg.outDps)
  return {
    rows: meterSources(scoped, nested),
    total: share.total,
    dps: scopeRate(seg, scope, WITH_BOB, share),
    activeDps: scopeTotals(seg.entities, scoped, seg.outTotal, seg.activeDps).dps
  }
}

test('the paste is the scoped, pet-folded rows and the headline over them', () => {
  const text = formatSegmentText(SEG, 'out', null, shownAs('you', true))
  assert.equal(
    text,
    [
      'a deadly black widow +2 · 1:23',
      // 40,230 over your own 50 s, and the paste says so: the 1:23 above is the fight's length,
      // not the time this rate was taken over. The fight's active rate, scaled to these rows, is
      // below that headline, so it is left off as the panel leaves it off.
      'Outgoing damage · 40.2k · 805 dps over 0:50',
      '',
      '   Source  Total      DPS  Crit  Hit',
      '1  You     40.2k  483 dps    8%  80%'
    ].join('\n')
  )
  assert.doesNotMatch(text, /Bob|\(pet\)|45\.2k/)
  assert.ok(text.split('\n').every((l) => l.length <= MAX_WIDTH))
})

test('the pet stays a row of its own when the layout keeps it apart', () => {
  const lines = formatSegmentText(SEG, 'out', null, shownAs('you', false)).split('\n')
  assert.equal(lines[1], 'Outgoing damage · 40.2k · 805 dps over 0:50')
  assert.deepEqual(
    lines.slice(4).map((l) => l.slice(0, 15).trimEnd()),
    ['1  You', '2  Vebarn (pet)']
  )
})

test('the time in the paste is the one the Combat tab header prints beside the same figures', () => {
  const shown = shownAs('you', true)
  const clock = fmtDur(headlineClockSec(shown.total, shown.dps, SEG.durationSec))
  assert.equal(clock, '0:50')
  assert.notEqual(clock, fmtDur(SEG.durationSec))
  // Total, rate and time agree inside the paste: 40,230 / 805 is 50 s, not the fight's 83.
  assert.ok(formatSegmentText(SEG, 'out', null, shown).split('\n')[1].endsWith(`dps over ${clock}`))
})

test('an active rate above a headline over your own clock rides after that clock', () => {
  // Your clock is 76 s here, longer than the fight's 70 active seconds.
  const seg = { ...SEG, selfSec: 76 } as SegmentView
  const lines = formatSegmentText(seg, 'out', null, shownAs('you', true, seg)).split('\n')
  assert.equal(lines[1], 'Outgoing damage · 40.2k · 529 dps over 1:16 (act 575 dps)')
})

test('a scope that keeps the fight’s clock adds no second time', () => {
  // Group hides a stranger: the total and the rate shrink together, so the rate is still over the
  // fight's length, which the first line already states.
  const zed = source({ id: 'member:zed', name: 'Zed', kind: 'member', total: 2000, dps: 24, pct: 6, hits: 20 })
  const seg = { ...SEG, outTotal: 47230, outDps: 569, activeDps: 675, entities: [YOU, PET, BOB, zed] } as SegmentView
  const text = formatSegmentText(seg, 'out', null, shownAs('group', false, seg))
  const lines = text.split('\n')
  assert.equal(lines[0], 'a deadly black widow +2 · 1:23')
  assert.equal(lines[1], 'Outgoing damage · 45.2k · 545 dps (act 646 dps)')
  assert.doesNotMatch(text, /Zed| over /)
})

test('Group keeps the roster’s rows and their share of the fight’s rate', () => {
  const lines = formatSegmentText(SEG, 'out', null, shownAs('group', false)).split('\n')
  // Nothing hidden: the whole fight's figures, the active rate beside them.
  assert.equal(lines[1], 'Outgoing damage · 45.2k · 545 dps (act 646 dps)')
  assert.equal(lines.length, 7)
})

test('a view that hides nothing pastes exactly what the bare segment does', () => {
  assert.equal(formatSegmentText(SEG, 'out', null, shownAs('everyone', false)), formatSegmentText(SEG, 'out'))
})

test('the Combat tab copies the rows and headline its panel is showing', () => {
  const panelText = readFileSync(
    new URL('../src/renderer/src/features/combat/SegmentPanel.tsx', import.meta.url),
    'utf8'
  )
  assert.match(panelText, /formatSegmentText\([^)]*rows: panel\.sources/, 'copy reads the bare segment again')
})
