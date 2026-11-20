// The notes of the log-read status (fork #9, phase R3): what else the player is told while the
// read itself is fine. Each is a fact of one read of the log, composed in one place.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bannerFor, ENGINE_LAUNCH_STARTING as NO_FAULT } from '../src/shared/engineLaunch'
import { logReadNotes, NOTHING_RECOGNISED_BYTES } from '../src/shared/logReadNotes'
import { statusChanged } from '../src/main/logReadStatus'
import type { LogReadFacts } from '../src/shared/logReadReport'
import { facts, health, report, MB, NOW } from './logReadFactsHarness.mts'

const LIVE: Partial<LogReadFacts> = { readiness: 'ok', health: health('live') }
const SHOWN = { op: 'module.snapshot', module: 'events', chars: 20 * MB, refused: false, limit: null, at: NOW }

test('a healthy read has no note, and the band draws nothing', () => {
  const r = report(LIVE)
  assert.deepEqual(r.notes, [])
  assert.equal(bannerFor(r, NO_FAULT, false), 'none')
})

test('A REPLY OF 16 MiB OR MORE THAT WAS SHOWN adds the getting-large note, on the band', () => {
  const r = report({ ...LIVE, large: SHOWN })
  assert.deepEqual(r.notes, [
    { id: 'large', text: 'Your log is getting large. Turn on Summarize and archive log in Preferences.' }
  ])
  assert.equal(bannerFor(r, NO_FAULT, false), 'notes')
  // With the archive on the app archives by itself: telling the player to turn it on is untrue.
  assert.deepEqual(report({ ...LIVE, large: SHOWN, archiveOn: true }).notes, [])
})

test('A MODULE REPLY TOO LARGE TO SHOW adds the too-large note with its Try line and its modules', () => {
  const r = report({ ...LIVE, tooLargeModules: ['loot', 'gaps'], large: SHOWN })
  assert.deepEqual(r.notes, [
    {
      id: 'tooLarge',
      text: "Part of your log's history is too large for the app to show.",
      modules: ['loot', 'gaps'],
      tryLine: 'Turn on Summarize and archive log in Preferences, then restart the app.'
    }
  ])
  assert.equal(r.wait, 'ok', 'a module too large is a note, never a wait: the rest of the app works')
  assert.equal(r.action, null)
  const on = report({ ...LIVE, tooLargeModules: ['loot'], archiveOn: true }).notes
  assert.deepEqual(on, [{ id: 'tooLarge', text: "Part of your log's history is too large for the app to show.", modules: ['loot'] }])
})

test('A READ THAT RECOGNISED NO LINES says how much it read, of which file, with no path', () => {
  const r = report({ ...LIVE, fold: null, nothingRecognised: 238.4 * MB })
  assert.deepEqual(r.notes, [
    { id: 'nothingRecognised', text: 'The app read 238.4 MB of eqlog_Primitive_freeport.txt and recognised no lines.' }
  ])
  assert.doesNotMatch(JSON.stringify(r), /Jeremy|Users/i)
  assert.ok(NOTHING_RECOGNISED_BYTES === 64 * 1024)
  // It comes first: it is why everything else is empty.
  const both = logReadNotes(facts({ ...LIVE, nothingRecognised: 9 * MB, tooLargeModules: ['loot'] }), 'eqlog_A_b.txt')
  assert.deepEqual(both.map((note) => note.id), ['nothingRecognised', 'tooLarge'])
})

test('every note is short, a sentence, and carries no long dash', () => {
  const all = [
    ...report({ ...LIVE, large: SHOWN }).notes,
    ...report({ ...LIVE, tooLargeModules: ['loot'], nothingRecognised: 9 * MB }).notes
  ]
  assert.equal(all.length, 3)
  for (const note of all) {
    for (const line of [note.text, note.tryLine].filter((text) => text !== undefined)) {
      assert.ok(line.length < 90, line)
      assert.match(line, /\.$/)
      assert.doesNotMatch(line, /[–—]/)
    }
  }
})

test('A NOTE THAT NAMES ANOTHER MODULE IS A CHANGE OF STATUS, so every window hears of it', () => {
  const one = report({ ...LIVE, tooLargeModules: ['loot'] })
  const two = report({ ...LIVE, tooLargeModules: ['loot', 'gaps'] })
  assert.equal(statusChanged(one, two), true, 'the Gaps tab would never learn its reply was too large')
  assert.equal(statusChanged(one, report({ ...LIVE, tooLargeModules: ['loot'] })), false)
})

test('the notes are still composed while something is waited on, and the band draws the wait', () => {
  const r = report({ tooLargeModules: ['loot'], waitingSince: 0 })
  assert.equal(r.wait, 'reading')
  assert.equal(r.notes.length, 1)
  assert.equal(bannerFor(r, NO_FAULT, false), 'band')
})
