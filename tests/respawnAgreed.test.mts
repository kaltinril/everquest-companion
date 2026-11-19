// respawnAgreed.test.mts — agreeing kill gaps lower a longer wiki respawn on the live timer (fork #8).
// The engine finds the agreed gap (`respawn_learned.rs agreed`) and publishes it as `agreedMs`; this
// is the TypeScript ladder, its labels and the archive join reading it. The ladder cases are the same
// numbers as `respawn_places_tests.rs`, so the two ladders cannot drift.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRespawn, respawnCalculated, respawnProvenance, respawnSourceLabel, type RespawnRow, type RespawnSnap } from '../src/shared/respawn'
import { mergeRespawn } from '../src/shared/logArchive/mergeRespawn'

const WIKI = 1_320_000
const AGREED = 529_000

const fmt = (ms: number | null | undefined): string => (ms == null ? '-' : `${String(Math.round(ms / 1000))}s`)

const row = (over: Partial<RespawnRow>): RespawnRow => ({
  id: 'mistmoore::enynti',
  key: 'enynti',
  display: 'Enynti',
  zone: 'Mistmoore',
  baseTs: 100,
  basis: 'death',
  source: 'observed',
  samples: 3,
  kills: 4,
  observedMs: AGREED,
  wikiText: '22 minutes',
  wikiMs: WIKI,
  ...over
})

const snap = (rows: RespawnRow[]): RespawnSnap => ({ v: 4, zone: 'Mistmoore', rows, recent: [], prefs: { watches: [{ key: 'enynti', display: 'Enynti' }] } })

test('the ladder: an agreed gap lowers a longer wiki floor and changes nothing else', () => {
  const ladder = (observedMs: number, wikiMs?: number, agreedMs?: number) =>
    resolveRespawn({ observedMs, samples: 3, ...(wikiMs === undefined ? {} : { wikiMs }), ...(agreedMs === undefined ? {} : { agreedMs }) })
  assert.deepEqual(ladder(AGREED, WIKI, AGREED), { estimateMs: AGREED, source: 'observed' })
  assert.deepEqual(ladder(AGREED, WIKI), { estimateMs: WIKI, source: 'observed' }, 'no agreement keeps the wiki floor')
  assert.deepEqual(ladder(200_000, WIKI, AGREED), { estimateMs: AGREED, source: 'observed' }, 'an outlier under the agreed gap')
  assert.deepEqual(ladder(AGREED, 300_000, AGREED), { estimateMs: AGREED, source: 'observed' }, 'a wiki time under the kills')
  assert.deepEqual(ladder(200_000, 300_000, AGREED), { estimateMs: 300_000, source: 'observed' }, 'the floor is never raised')
  assert.deepEqual(ladder(200_000, undefined, AGREED), { estimateMs: 200_000, source: 'observed' }, 'no wiki time, no floor')
})

test('the ladder: a typed number and the wiki default are not touched by an agreed gap', () => {
  assert.deepEqual(resolveRespawn({ customMs: 60_000, observedMs: AGREED, samples: 3, wikiMs: WIKI, agreedMs: AGREED }), { estimateMs: 60_000, source: 'custom' })
  assert.deepEqual(resolveRespawn({ samples: 0, wikiMs: WIKI, agreedMs: AGREED }), { estimateMs: WIKI, source: 'wiki' })
})

test('the label says "floored by the wiki" only while the wiki time is the floor in force', () => {
  assert.equal(respawnSourceLabel(row({ estimateMs: WIKI })), 'your kills (3 gaps), floored by the wiki')
  assert.equal(respawnSourceLabel(row({ estimateMs: AGREED, agreedMs: AGREED })), 'your kills (3 gaps)')
  // An agreed gap that is not under the wiki time changes nothing: the wiki still lifts a shorter gap.
  assert.equal(respawnSourceLabel(row({ observedMs: 200_000, wikiMs: 300_000, agreedMs: AGREED, estimateMs: 300_000 })), 'your kills (3 gaps), floored by the wiki')
})

test('the hover says the wiki time is not used only when the agreed gap replaced it', () => {
  const sentence = 'Your kills agree, so the wiki time is not used.'
  const agreed = respawnProvenance(row({ estimateMs: AGREED, agreedMs: AGREED }), fmt)
  assert.ok(agreed.includes(sentence), agreed)
  assert.ok(!agreed.includes('The wiki floor lifted it.'), agreed)
  const floored = respawnProvenance(row({ estimateMs: WIKI }), fmt)
  assert.ok(!floored.includes(sentence) && floored.includes('The wiki floor lifted it.'), floored)
  assert.ok(!respawnProvenance(row({ agreedMs: AGREED, wikiMs: 300_000, estimateMs: AGREED }), fmt).includes(sentence), 'a wiki time under the kills')
  const noWiki = row({ agreedMs: AGREED, estimateMs: AGREED })
  delete noWiki.wikiMs
  delete noWiki.wikiText
  assert.ok(!respawnProvenance(noWiki, fmt).includes(sentence), 'no wiki time at all')
  assert.ok(!respawnProvenance(row({ source: 'custom', customMs: 60_000, estimateMs: 60_000, agreedMs: AGREED }), fmt).includes(sentence), 'a typed number')
})

test('clearing a typed number shows the agreed estimate, not the wiki time', () => {
  const calc = respawnCalculated(row({ source: 'custom', customMs: 60_000, estimateMs: 60_000, agreedMs: AGREED }))
  assert.equal(calc.estimateMs, AGREED)
  assert.equal(calc.source, 'observed')
  assert.equal(calc.customMs, undefined)
  assert.equal(respawnCalculated(row({ source: 'custom', customMs: 60_000, estimateMs: 60_000 })).estimateMs, WIKI, 'without agreement, the wiki floor as before')
})

test('the archive join keeps the smaller agreed gap and numbers the joined row from it', () => {
  const older = row({ estimateMs: 540_000, observedMs: 540_000, agreedMs: 540_000 })
  const newer = row({ estimateMs: AGREED, agreedMs: AGREED, baseTs: 900 })
  const both = mergeRespawn(snap([older]), snap([newer]))?.rows[0]
  assert.equal(both?.agreedMs, AGREED)
  assert.equal(both?.estimateMs, AGREED)
  // Only the archive had enough gaps: its agreed gap still lowers the joined row's wiki floor.
  const live = row({ samples: 1, observedMs: 560_000, estimateMs: WIKI, baseTs: 900 })
  const joined = mergeRespawn(snap([older]), snap([live]))?.rows[0]
  assert.equal(joined?.agreedMs, 540_000)
  assert.equal(joined?.estimateMs, 540_000)
  assert.equal(joined?.source, 'observed')
  // Neither side agreed: the wiki floor stands, as before.
  const neither = mergeRespawn(snap([row({ samples: 1, estimateMs: WIKI })]), snap([live]))?.rows[0]
  assert.equal(neither?.agreedMs, undefined)
  assert.equal(neither?.estimateMs, WIKI)
})
