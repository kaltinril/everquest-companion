// What the Gaps tab says about the other characters' read under All characters
// (src/shared/gapsOthersLine.ts): a read that failed is never shown as "no other characters".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allCharactersCaption, charactersLineEnd, otherAnswer, savedWords } from '../src/shared/gapsOthersLine'
import type { CharacterGaps } from '../src/shared/gapsAllCharacters'

const char = (name: string, extra: Partial<CharacterGaps> = {}): CharacterGaps => ({ character: `${name.toLowerCase()}_oggok`, name, server: 'oggok', savedAt: '2026-11-19T12:00:00.000Z', archives: 0, gaps: null, loot: [], kills: null, ...extra })

test('a failed read is its own answer, never the answer of a player with no other characters', () => {
  const none = otherAnswer(null, 'k', { value: [] })
  const failed = otherAnswer(null, 'k', { failed: true })
  assert.deepEqual(none, { key: 'k', value: [], failed: false })
  assert.deepEqual(failed, { key: 'k', value: [], failed: true })
  assert.notDeepEqual(failed, none)
})

test('a failed refresh keeps the list an earlier read of the same ask gave, and a later good read clears the failure', () => {
  const good = otherAnswer(null, 'k', { value: [char('Drywrought')] })
  const failed = otherAnswer(good, 'k', { failed: true })
  assert.equal(failed.value, good.value, 'the same list, so nothing is joined again')
  assert.equal(failed.failed, true)
  // Another character or day window: that list is not this ask's.
  assert.deepEqual(otherAnswer(good, 'other', { failed: true }), { key: 'other', value: [], failed: true })
  assert.equal(otherAnswer(failed, 'k', { value: [] }).failed, false)
})

test('the count line says "every character" only when the other characters were read', () => {
  assert.equal(allCharactersCaption(false, 60, undefined), ', last 60 days')
  assert.equal(allCharactersCaption(true, 60, undefined), ', every character, last 60 days', 'still reading')
  assert.equal(allCharactersCaption(true, 60, otherAnswer(null, 'k', { value: [] })), ', every character, last 60 days', 'there is no other character')
  assert.equal(allCharactersCaption(true, 30, otherAnswer(null, 'k', { failed: true })), ', last 30 days', 'the list is this character alone')
  const kept = otherAnswer(otherAnswer(null, 'k', { value: [char('Drywrought')] }), 'k', { failed: true })
  assert.equal(allCharactersCaption(true, 60, kept), ', every character, last 60 days', 'the earlier list is still joined')
})

test('the characters line ends with what is true of the read', () => {
  assert.deepEqual(charactersLineEnd(2, false), { text: '.', warn: false })
  assert.deepEqual(charactersLineEnd(0, false), { text: '. No other character saved yet: log each one in here once.', warn: false })
  const failed = charactersLineEnd(0, true)
  assert.equal(failed.warn, true)
  assert.doesNotMatch(failed.text, /No other character/)
  assert.match(failed.text, /Could not read/)
  assert.equal(charactersLineEnd(2, true).warn, true)
  assert.match(charactersLineEnd(2, true).text, /earlier/)
})

test("a character's few words: its name, and a mark when its save is old, older-built or unreadable", () => {
  const now = new Date('2026-11-19T18:00:00.000Z')
  assert.deepEqual({ text: savedWords(char('Dry'), now).text, stale: savedWords(char('Dry'), now).stale }, { text: 'Dry', stale: false })
  assert.equal(savedWords(char('Dry', { savedAt: null, archives: 2 }), now).text, 'Dry (archives only)')
  assert.match(savedWords(char('Dry', { savedAt: null, archives: 1 }), now).tip, /its 1 archived log\.$/)
  assert.deepEqual({ ...savedWords(char('Dry', { savedAt: '2026-08-01T12:00:00.000Z' }), now), tip: '' }, { text: 'Dry (over 2 months old)', tip: '', stale: true })
  assert.equal(savedWords(char('Dry', { olderRows: true }), now).text, 'Dry (needs refresh)')
  const bad = savedWords(char('Dry', { unreadable: true }), now)
  assert.deepEqual({ text: bad.text, stale: bad.stale }, { text: 'Dry (could not be read)', stale: true })
})

test('every sentence the line shows is short and plain: no dash, a tooltip of 7 to 15 words', () => {
  const now = new Date('2026-11-19T18:00:00.000Z')
  const tips = [char('Dry'), char('Dry', { savedAt: null, archives: 2 }), char('Dry', { savedAt: '2026-08-01T12:00:00.000Z' }), char('Dry', { olderRows: true }), char('Dry', { unreadable: true })].map((c) => savedWords(c, now).tip)
  for (const tip of tips) {
    const words = tip.split(/\s+/).length
    assert.ok(words >= 7 && words <= 15, `${String(words)} words: ${tip}`)
  }
  for (const text of [...tips, charactersLineEnd(0, true).text, charactersLineEnd(2, true).text, charactersLineEnd(0, false).text]) assert.doesNotMatch(text, /[–—]/)
})
