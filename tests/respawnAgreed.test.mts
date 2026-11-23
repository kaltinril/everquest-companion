// respawnAgreed.test.mts — agreeing kill gaps lower a longer wiki respawn on the live timer (fork #8).
// The engine finds the agreed gap (`respawn_learned.rs agreed`) and publishes it as `agreedMs`; this
// is the TypeScript ladder, its labels and the archive join reading it. The ladder cases are the same
// numbers as `respawn_places_tests.rs`, so the two ladders cannot drift.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRespawn, respawnCalculated, respawnProvenance, respawnSourceLabel, type RespawnRow, type RespawnSnap } from '../src/shared/respawn'
import { mergeRespawn } from '../src/shared/logArchive/mergeRespawn'
import { agreedGap } from '../src/shared/respawnLearn'

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

const snap = (rows: RespawnRow[], over: Partial<RespawnSnap> = {}): RespawnSnap => ({
  v: 4,
  zone: 'Mistmoore',
  rows,
  recent: [],
  prefs: { watches: [{ key: 'enynti', display: 'Enynti' }] },
  ...over
})

const s = (secs: number[]): number[] => secs.map((x) => x * 1000)

/** One log's learned gaps for Enynti (seconds, newest first), as the engine publishes them. */
const learned = (gapsS: number[], zone = 'Mistmoore'): NonNullable<RespawnSnap['learned']> => [
  { id: `${zone.toLowerCase()}::enynti`, key: 'enynti', display: 'Enynti', zone, gapsMs: s(gapsS) }
]

/** A row whose kills have not agreed in its own log: the wiki floor is in force. */
const wikiFloored = (over: Partial<RespawnRow>): RespawnRow => row({ estimateMs: WIKI, ...over })

/** The owner's 31 measured Enynti gaps, in seconds (`respawn_places_tests.rs ENYNTI_S`). */
const ENYNTI_S = [558, 956, 1010, 656, 676, 550, 554, 669, 532, 533, 530, 618, 531, 544, 599, 543, 559, 608, 929, 881, 530, 2035, 529, 2272, 1921, 542, 530, 1350, 1037, 1353, 2764]

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

// The field case: every log archived before fork #8 has no agreedMs, and the live log's three gaps agree.
test('the archive join keeps an agreed gap only the live log has', () => {
  const older = row({ samples: 1, observedMs: 200_000, estimateMs: WIKI })
  const newer = row({ estimateMs: AGREED, agreedMs: AGREED, baseTs: 900 })
  const joined = mergeRespawn(snap([older]), snap([newer]))?.rows[0]
  assert.equal(joined?.agreedMs, AGREED)
  assert.equal(joined?.estimateMs, AGREED, 'the archive gap under it is lifted to the agreed gap, not to the wiki time')
  assert.equal(joined?.source, 'observed')
  assert.equal(joined?.samples, 4)
})

test('a row filed before the first zone line joins its zone row without losing the agreed gap', () => {
  const pre = row({ id: '::enynti', zone: '', samples: 0, kills: 1, baseTs: 50, source: 'wiki', estimateMs: WIKI })
  delete pre.observedMs
  const post = row({ estimateMs: AGREED, agreedMs: AGREED, baseTs: 900 })
  for (const rows of [
    [pre, post],
    [post, pre]
  ]) {
    const merged = mergeRespawn(snap([]), snap(rows, { zone: '' }))
    assert.equal(merged?.rows.length, 1)
    const joined = merged?.rows[0]
    assert.equal(joined?.id, 'mistmoore::enynti')
    assert.equal(joined?.agreedMs, AGREED)
    assert.equal(joined?.estimateMs, AGREED)
    assert.equal(joined?.kills, 5)
    assert.equal(joined?.baseTs, 900)
  }
})

// The same sets as `respawn_places_tests.rs` (three_gaps_inside_fifty_seconds_agree_on_the_lowest_of_them
// and the boundary test under it), so the engine's rule and this copy of it cannot drift.
test('agreedGap: three gaps inside 50 s agree on the lowest of them, as the engine reads it', () => {
  assert.equal(agreedGap(s(ENYNTI_S)), 529_000)
  assert.equal(agreedGap(s([527, 567, 529])), 527_000)
  assert.equal(agreedGap(s([527, 529])), undefined, 'two gaps are not enough')
  assert.equal(agreedGap(s([527, 529, 600])), undefined, 'nor three that sit apart')
  assert.equal(agreedGap(s([60, 75, 90, 720, 730, 740])), undefined, 'under two minutes is two spawns sharing the name')
  assert.equal(agreedGap(s([60, 75, 90, 720, 730, 740]), 600_000), 720_000, 'a ten-minute floor leaves the short gaps out')
  assert.equal(agreedGap([]), undefined)
})

test('agreedGap: the 50 second window and the two minute rule sit on their boundaries', () => {
  assert.equal(agreedGap(s([600, 625, 650])), 600_000, 'exactly 50 s apart agree')
  assert.equal(agreedGap(s([600, 625, 651])), undefined, '51 s do not')
  assert.equal(agreedGap(s([120, 121, 122])), 120_000, 'two minutes is not under two minutes')
  assert.equal(agreedGap(s([119, 120, 121])), undefined, 'tested on the lowest gap, not the peak')
  assert.equal(agreedGap(s([100, 121, 122, 123])), undefined, 'a lowest window that starts under two minutes offers nothing')
  assert.equal(agreedGap(s([650, 600, 625])), 600_000, 'whatever order they come in')
})

test('the archive join finds agreement across the cut: two gaps archived and one live are three', () => {
  const older = snap([wikiFloored({ samples: 2 })], { learned: learned([531, 529]) })
  const newer = snap([wikiFloored({ samples: 1, observedMs: 530_000, baseTs: 900 })], { learned: learned([530]) })
  const joined = mergeRespawn(older, newer)?.rows[0]
  assert.equal(joined?.agreedMs, 529_000)
  assert.equal(joined?.estimateMs, 529_000)
  assert.equal(joined?.source, 'observed')
  assert.equal(joined?.samples, 3)
  assert.equal(joined === undefined ? '' : respawnSourceLabel(joined), 'your kills (3 gaps)')
})

test('a log archived before agreedMs existed still lowers the wiki floor from its learned gaps', () => {
  const older = snap([wikiFloored({})], { learned: learned([531, 530, 529]) })
  const live = wikiFloored({ samples: 0, kills: 1, source: 'wiki', baseTs: 900 })
  delete live.observedMs
  const joined = mergeRespawn(older, snap([live]))?.rows[0]
  assert.equal(joined?.agreedMs, 529_000)
  assert.equal(joined?.estimateMs, 529_000)
  assert.equal(joined?.source, 'observed')
  // A mob the live log has not killed yet: the archived row alone, for a mob still watched.
  const alone = mergeRespawn(older, snap([]))?.rows[0]
  assert.equal(alone?.agreedMs, 529_000)
  assert.equal(alone?.estimateMs, 529_000)
})

test('a row with no gap of its own takes the agreeing gaps as its count, as one log would read them', () => {
  const live = wikiFloored({ samples: 0, kills: 1, source: 'wiki', baseTs: 900 })
  delete live.observedMs
  // No archived row for the mob, only its learned gaps (`respawn_places.rs pooled_gaps` reads the same).
  const joined = mergeRespawn(snap([], { learned: learned([531, 530, 529]) }), snap([live]))?.rows[0]
  assert.equal(joined?.samples, 3)
  assert.equal(joined?.observedMs, 529_000)
  assert.equal(joined?.estimateMs, 529_000)
  assert.equal(joined?.source, 'observed')
  // A shared name counts only its gaps of ten minutes or more.
  const shared = { prefs: { watches: [{ key: 'enynti', display: 'Enynti', sharedName: true as const }] } }
  const own = { ...live, sharedName: true as const }
  const long = mergeRespawn(snap([], { learned: learned([90, 75, 740, 730, 720]) }), snap([own], shared))?.rows[0]
  assert.equal(long?.samples, 3)
  assert.equal(long?.observedMs, 720_000)
  assert.equal(long?.estimateMs, 720_000)
})

test('the joined gaps are read as one log: the lowest agreeing trio, not the smaller of two verdicts', () => {
  const older = snap([row({ observedMs: 540_000, estimateMs: 540_000, agreedMs: 540_000 })], { learned: learned([550, 545, 540]) })
  const newer = snap([wikiFloored({ samples: 2, observedMs: 527_000, baseTs: 900 })], { learned: learned([529, 527]) })
  const joined = mergeRespawn(older, newer)?.rows[0]
  assert.equal(joined?.agreedMs, 527_000)
  assert.equal(joined?.estimateMs, 527_000)
})

test('the join keeps the wiki floor while the joined gaps do not agree', () => {
  const live = wikiFloored({ samples: 1, observedMs: 600_000, baseTs: 900 })
  const two = mergeRespawn(snap([wikiFloored({ samples: 2 })], { learned: learned([531, 529]) }), snap([wikiFloored({ samples: 0, baseTs: 900 })]))?.rows[0]
  assert.equal(two?.agreedMs, undefined, 'two gaps and none')
  assert.equal(two?.estimateMs, WIKI)
  const apart = mergeRespawn(snap([wikiFloored({ samples: 2 })], { learned: learned([530, 527]) }), snap([live], { learned: learned([600]) }))?.rows[0]
  assert.equal(apart?.agreedMs, undefined, 'three that sit apart')
  assert.equal(apart?.estimateMs, WIKI)
  const one = mergeRespawn(snap([wikiFloored({ samples: 1 })], { learned: learned([529]) }), snap([live], { learned: learned([530]) }))?.rows[0]
  assert.equal(one?.estimateMs, WIKI, 'one gap each side')
})

test('a typed number stays the estimate when the joined gaps agree', () => {
  const older = snap([wikiFloored({ samples: 2 })], { learned: learned([531, 529]) })
  const typed = row({ samples: 1, observedMs: 530_000, source: 'custom', customMs: 60_000, estimateMs: 60_000, baseTs: 900 })
  const newer = snap([typed], { learned: learned([530]), prefs: { watches: [{ key: 'enynti', display: 'Enynti', customSec: 60 }] } })
  const joined = mergeRespawn(older, newer)?.rows[0]
  assert.equal(joined?.estimateMs, 60_000)
  assert.equal(joined?.source, 'custom')
})

test('the joined gaps pool across the places of one zone, and never across zones', () => {
  const MM = 'The Castle of Mistmoore'
  const here = wikiFloored({ id: 'the castle of mistmoore 4 (refined) [instance 17]::enynti', zone: `${MM} 4 (Refined) [instance 17]`, baseTs: 900 })
  // The archive learned two gaps in the open +3, the live log one in the +4 (a private instance's gaps file without the tag).
  const pooled = mergeRespawn(snap([], { zone: MM, learned: learned([531, 529], `${MM} 3 (Fused)`) }), snap([here], { zone: here.zone, learned: learned([530], `${MM} 4 (Refined)`) }))
  assert.equal(pooled?.rows[0]?.agreedMs, 529_000)
  assert.equal(pooled?.rows[0]?.estimateMs, 529_000)
  // Another zone's mob of the same name is another spawn.
  const other = mergeRespawn(snap([], { zone: MM, learned: learned([531, 530, 529], 'Najena') }), snap([here], { zone: here.zone }))
  assert.equal(other?.rows[0]?.agreedMs, undefined)
  assert.equal(other?.rows[0]?.estimateMs, WIKI)
})

test('a shared name keeps its ten minute floor when the joined gaps are read', () => {
  const shared = { prefs: { watches: [{ key: 'enynti', display: 'Enynti', sharedName: true as const }] } }
  // Two spawns of the name make short gaps that agree: they never lower the wiki floor.
  const short = wikiFloored({ samples: 0, sharedName: true, source: 'wiki', baseTs: 900 })
  delete short.observedMs
  const kept = mergeRespawn(snap([], { learned: learned([131, 130]) }), snap([short], { ...shared, learned: learned([132]) }))?.rows[0]
  assert.equal(kept?.agreedMs, undefined)
  assert.equal(kept?.estimateMs, WIKI)
  // Agreeing gaps over ten minutes still do.
  const long = wikiFloored({ observedMs: 720_000, sharedName: true, baseTs: 900 })
  const lowered = mergeRespawn(snap([], { learned: learned([90, 75, 60, 740, 730]) }), snap([long], { ...shared, learned: learned([720]) }))?.rows[0]
  assert.equal(lowered?.agreedMs, 720_000)
  assert.equal(lowered?.estimateMs, 720_000)
  // An archived row captured before the switch was set is read with today's watch list.
  const archived = wikiFloored({ observedMs: 130_000 })
  const today = mergeRespawn(snap([archived], { learned: learned([132, 131, 130]) }), snap([], shared))?.rows[0]
  assert.equal(today?.agreedMs, undefined)
  assert.equal(today?.estimateMs, WIKI)
})
