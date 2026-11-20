// respawnEdit.test.mts — the respawn edit dialog's Save (bug hunt 2026-11-19). The field opens on
// the duration in force, so a Save that wrote whatever the field held turned a learned or wiki
// number into "your number", which never learns again, on a press that changed nothing. Save now
// writes only what the player typed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESPAWN_CUSTOM_MAX_SEC, RESPAWN_INPUT_HELP, formatRespawnDuration, parseRespawnDuration, type RespawnRow } from '../src/shared/respawn'
import { RESPAWN_SAVE_NOTE, respawnDraftToSave, respawnPrefill } from '../src/shared/respawnEdit'

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
  observedMs: 525_000,
  estimateMs: 525_000,
  ...over
})

test('the field shows the duration in force, written the way it accepts', () => {
  assert.equal(respawnPrefill(row({})), '8m 45s')
  assert.equal(respawnPrefill(row({ estimateMs: 1_320_000, source: 'wiki' })), '22m')
  assert.equal(respawnPrefill(row({ estimateMs: 525_400 })), '8m 45s', 'to the whole second')
  const none = row({ source: 'none', samples: 0 })
  delete none.estimateMs
  delete none.observedMs
  assert.equal(respawnPrefill(none), '', 'no estimate, an empty field')
})

test('Save writes nothing while the field is untouched', () => {
  const inForce = respawnPrefill(row({}))
  assert.equal(respawnDraftToSave(null, inForce), null, 'never typed in')
  assert.equal(respawnDraftToSave('8m 45s', inForce), null, 'typed and put back')
  assert.equal(respawnDraftToSave('  8m 45s ', inForce), null, 'spaces around it are not an edit')
  // The same for a wiki number and for a number that is already the player's own.
  assert.equal(respawnDraftToSave(null, respawnPrefill(row({ estimateMs: 1_320_000, source: 'wiki' }))), null)
  assert.equal(respawnDraftToSave(null, respawnPrefill(row({ estimateMs: 60_000, customMs: 60_000, source: 'custom' }))), null)
})

test('Save writes the number the player typed', () => {
  const inForce = respawnPrefill(row({}))
  assert.equal(respawnDraftToSave('9m', inForce), 540)
  assert.equal(respawnDraftToSave('44m 30s', inForce), 2670)
  // The number in force typed another way is a choice to keep it: it is saved.
  assert.equal(respawnDraftToSave('525', inForce), 525)
  // A row with no estimate opens empty: anything readable is an edit.
  assert.equal(respawnDraftToSave('20m', ''), 1200)
})

test('Save writes nothing while the field cannot be read', () => {
  const inForce = respawnPrefill(row({}))
  assert.equal(respawnDraftToSave('', inForce), null, 'emptied')
  assert.equal(respawnDraftToSave('banana', inForce), null)
  assert.equal(respawnDraftToSave('1:30', inForce), null, 'a colon form is refused')
  assert.equal(respawnDraftToSave('8d', inForce), null, 'out of range')
  assert.equal(respawnDraftToSave(null, ''), null, 'an empty field never typed in')
})

test('after the shared-name switch moves the estimate, the untouched field is still not an edit', () => {
  // The row read 1m 30s at opening; the switch then left it with a 21 minute estimate, or none.
  assert.equal(respawnDraftToSave(null, respawnPrefill(row({ estimateMs: 1_260_000, sharedName: true }))), null)
  assert.equal(respawnDraftToSave(null, ''), null)
})

test('the prefill reads back as the same number, so the field never moves a clock by itself', () => {
  for (const sec of [1, 59, 60, 61, 525, 570, 3600, 3661, 86_400, 90_061, RESPAWN_CUSTOM_MAX_SEC]) {
    assert.deepEqual(parseRespawnDuration(formatRespawnDuration(sec)), { ok: true, sec }, String(sec))
  }
})

test('the field promises nothing for an empty box, which Save refuses', () => {
  assert.equal(respawnDraftToSave('', '8m 45s'), null)
  assert.ok(!/empty/i.test(RESPAWN_INPUT_HELP), RESPAWN_INPUT_HELP)
  assert.ok(RESPAWN_INPUT_HELP.includes('1s to 7d'), 'it still states the range')
})

test('the note under the field says a saved number stops the learning, in one short sentence', () => {
  const words = RESPAWN_SAVE_NOTE.split(/\s+/).length
  assert.ok(words >= 7 && words <= 15, `${String(words)} words`)
  assert.ok(RESPAWN_SAVE_NOTE.includes('Use calculated'), 'names the way back by its button')
  assert.ok(!/[–—]/.test(RESPAWN_SAVE_NOTE))
})
