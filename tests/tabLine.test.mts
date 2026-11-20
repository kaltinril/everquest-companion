// A tab's status line as the views draw it (fork #9, phase R3). `tests/moduleEmpty.test.mts` covers
// the pure decision; this file covers the two things between it and the screen: the hook every
// site calls (run for real on `hookHost`), and each view's wiring, read from source. A view that
// went back to `useModule(...) ?? EMPTY` with `served={true}` would print "nothing yet" over an
// unread log again, with every pure test still passing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mountHook } from './hookHost.mjs'
import { useTabLineOf } from '../src/renderer/src/lib/useTabLine'
import { LOG_READ_INLINE_AFTER_MS, LOG_READ_TRY, LOG_READ_WORDS, type TabLine } from '../src/shared/logReadWords'
import type { LogReadFacts, LogReadReport } from '../src/shared/logReadReport'
import { error, health, report } from './logReadFactsHarness.mts'

const LIVE: Partial<LogReadFacts> = { readiness: 'ok', health: health('live') }
const READING: TabLine = { kind: 'waiting', text: LOG_READ_WORDS.reading, tryLine: LOG_READ_TRY.reading }

test('THE HOOK: no snapshot gives the status line once it has held, and never the tab-s own text', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  // Two seconds into a read: main is not showing the status yet.
  const host = mountHook(() => useTabLineOf(report(), 'loot', false))
  assert.equal(host.value, null, 'a tab drew a line the moment it mounted')
  t.mock.timers.tick(LOG_READ_INLINE_AFTER_MS - 1)
  assert.equal(host.render(), null)
  t.mock.timers.tick(1)
  assert.deepEqual(host.render(), READING)
  host.unmount()
})

test('THE HOOK: a status main is already showing is drawn at once', () => {
  const stopped = report({ health: health('idle'), error: error('fold') })
  const host = mountHook(() => useTabLineOf(stopped, 'loot', false))
  assert.deepEqual(host.value, { kind: 'waiting', text: LOG_READ_WORDS.readerStopped, tryLine: LOG_READ_TRY.readerStopped })
  host.unmount()
})

test('THE HOOK: a served module is the tab-s own, at once and whatever the status says', () => {
  for (const said of [report(LIVE), report(), report({ supervisor: 'absent' }), null]) {
    const host = mountHook(() => useTabLineOf(said, 'loot', true))
    assert.deepEqual(host.value, { kind: 'empty' })
    host.unmount()
  }
})

test('THE HOOK: with the log read and no snapshot it says the panel has no reply, not "nothing yet"', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = mountHook(() => useTabLineOf(report(LIVE), 'leveling', false))
  assert.equal(host.value, null)
  t.mock.timers.tick(LOG_READ_INLINE_AFTER_MS)
  assert.deepEqual(host.render(), { kind: 'waiting', text: LOG_READ_WORDS.ok, tryLine: null })
  host.unmount()
})

test('THE HOOK: before the window-s first status an unserved tab draws nothing, however long', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const host = mountHook(() => useTabLineOf(null, 'loot', false))
  t.mock.timers.tick(LOG_READ_INLINE_AFTER_MS * 4)
  assert.equal(host.render(), null)
  host.unmount()
})

test('THE HOOK: A REBUILD OF THE SAME LOG DRAWS NO LINE, and the status arriving later is taken up', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let served = true
  let said: LogReadReport | null = report(LIVE)
  const host = mountHook(() => useTabLineOf(said, 'respawn', served))
  // The snapshot goes for a moment while the read is "not live", and comes back.
  served = false
  said = report()
  assert.equal(host.render(), null)
  t.mock.timers.tick(200)
  assert.equal(host.render(), null)
  served = true
  said = report(LIVE)
  assert.deepEqual(host.render(), { kind: 'empty' })
  // Gone again, later: the wait starts over, it is not already spent.
  t.mock.timers.tick(5_000)
  served = false
  said = report()
  assert.equal(host.render(), null, 'an earlier wait let a rebuild flash the line')
  t.mock.timers.tick(LOG_READ_INLINE_AFTER_MS)
  assert.deepEqual(host.render(), READING)
  host.unmount()
})

// ---- the six views, from source ------------------------------------------------------------------
//
// The views are React components over MUI and the preload bridge and cannot be mounted here, so
// their wiring is read with the comments taken out (the instrument tests/logReadPokes uses).

function source(rel: string): string {
  return readFileSync(new URL(`../src/renderer/src/${rel}`, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** How many times `text` is in `src`. A tab's empty text must have one home, inside the wrapper. */
function count(src: string, text: string): number {
  return src.split(text).length - 1
}

const VIEWS = [
  'features/buffs/BuffsView.tsx',
  'features/leveling/LevelingView.tsx',
  'features/timers/TimersView.tsx',
  'features/loot/LootChrome.tsx',
  'features/gaps/GapsView.tsx',
  'features/bazaar/BazaarView.tsx'
]

test('NO VIEW TELLS THE LINE ITS MODULE IS SERVED WITHOUT ASKING: `served` is never a bare true', () => {
  for (const rel of VIEWS) {
    const src = source(rel)
    assert.match(src, /LogReadInline|useTabLine/, `${rel} no longer draws the status line`)
    assert.doesNotMatch(src, /served=\{true\}/, `${rel} passes served={true}`)
    assert.doesNotMatch(src, /<LogReadInline\b[^>]*\sserved(?=[\s/>])/, `${rel} passes a bare served`)
    assert.doesNotMatch(src, /useTabLine\([^()]*,\s*true\)/, `${rel} calls useTabLine with served true`)
  }
})

test('Buffs: "No active buffs." is inside the line, and served is the RAW snapshot', () => {
  const src = source('features/buffs/BuffsView.tsx')
  assert.match(src, /const served = useModule<BuffsSnap>\('buffs'\)\n/)
  assert.match(src, /<LogReadInline module="buffs" served=\{served !== null\}>[\s\S]{0,160}No active buffs\.[\s\S]{0,80}<\/LogReadInline>/)
  assert.equal(count(src, 'No active buffs.'), 1)
})

test('Leveling: the "No level-ups" text is inside the line, and served is the RAW snapshot', () => {
  const src = source('features/leveling/LevelingView.tsx')
  assert.match(src, /const snap = useModule<LevelingSnap>\('leveling'\)\n/)
  assert.match(src, /<LogReadInline module="leveling" served=\{snap !== null\}[^>]*>[\s\S]{0,260}data-testid="leveling-empty"[\s\S]{0,260}<\/LogReadInline>/)
  assert.equal(count(src, 'data-testid="leveling-empty"'), 1)
})

test('Timers: "Nothing has died yet" is inside the line, and served is the RAW respawn snapshot', () => {
  const src = source('features/timers/TimersView.tsx')
  assert.match(src, /const served = useRespawnServed\(\)/)
  assert.match(src, /<LogReadInline module="respawn" served=\{served\}>[\s\S]{0,200}data-testid="respawn-recent-empty"[\s\S]{0,80}<\/LogReadInline>/)
  assert.equal(count(src, 'data-testid="respawn-recent-empty"'), 1)
  const hook = source('features/timers/useRespawn.ts')
  assert.match(hook, /export function useRespawnServed\(\): boolean \{\s*return useModule<RespawnSnap>\('respawn'\) !== null\s*\}/)
})

test('Loot: "No loot parsed yet" is reached only past the waiting line, and served is the RAW snapshot', () => {
  const src = source('features/loot/LootChrome.tsx')
  const wired = /const line = useTabLine\('loot', useLootServed\(\)\)\s*if \(line === null\) return null\s*if \(line\.kind === 'waiting'\) \{\s*return \(/.exec(src)
  assert.ok(wired, 'NoLootYet does not ask the line first')
  assert.equal(count(src, 'No loot parsed yet'), 1)
  assert.ok(src.indexOf('No loot parsed yet') > wired.index, '"No loot parsed yet" is drawn before the line is asked')
  assert.match(src, /data-testid="log-read-inline"/)
  const hook = source('features/loot/useLootHistory.ts')
  assert.match(hook, /export function useLootServed\(\): boolean \{\s*return useModule<LootSnap>\('loot'\) !== null\s*\}/)
})

test('Gaps and Bazaar: with no snapshot they draw the line, not a bare spinner or "Reading your log"', () => {
  const gaps = source('features/gaps/GapsView.tsx')
  assert.match(gaps, /if \(!snap\) return <GapsWaiting \/>/)
  assert.match(gaps, /const line = useTabLine\(GAPS_MODULE_ID, false\)\s*if \(line\?\.kind !== 'waiting'\) return <CircularProgress size=\{20\} \/>/)
  assert.match(gaps, /data-testid="log-read-inline"/)
  const bazaar = source('features/bazaar/BazaarView.tsx')
  assert.match(bazaar, /\{snap === null \? \(\s*<LogReadInline module=\{BAZAAR_MODULE_ID\} served=\{false\} \/>/)
  assert.doesNotMatch(bazaar, /Reading your log/)
})

test('the component draws through the tested hook: one rule, and the id the e2e run looks for', () => {
  const src = source('components/LogReadInline.tsx')
  assert.match(src, /return useTabLineOf\(useLogReadReport\(\), module, served\)/)
  assert.match(src, /const line = useTabLine\(module, served\)\s*if \(line === null\) return null\s*if \(line\.kind === 'empty'\) return <>\{children\}<\/>/)
  assert.match(src, /data-testid="log-read-inline"/)
})
