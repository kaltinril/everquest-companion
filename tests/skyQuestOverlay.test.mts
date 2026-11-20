// The Sky quest overlay's payload (shared/skyQuestOverlay.ts): the order its rows are drawn in, and
// what the overlay makes of whatever it finds under the storage key.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_SKY_OVERLAY,
  buildSkyOverlayPayload,
  orderSkyOverlayRows,
  parseSkyOverlay,
  skyOverlayNotice,
  type SkyOverlayRow
} from '../src/shared/skyQuestOverlay'
import { applySkyQuestsKnob } from '../src/main/storeSkyQuestsKnob'

function row(className: string, name: string, ready: boolean): SkyOverlayRow {
  return { key: `${className}::${name}`, className, name, items: [{ name: 'Item', have: ready ? 1 : 0, need: 1 }], ready }
}

test('ready quests come first, then by class and quest name', () => {
  const rows = [
    row('Wizard', 'Wizard Test of Mind', false),
    row('Bard', 'Bard Test of Tone', false),
    row('Wizard', 'Wizard Test of Air', true),
    row('Bard', 'Bard Test of Song', true),
    row('Bard', 'Bard Test of Pitch', false)
  ]
  assert.deepEqual(
    orderSkyOverlayRows(rows).map((r) => r.name),
    ['Bard Test of Song', 'Wizard Test of Air', 'Bard Test of Pitch', 'Bard Test of Tone', 'Wizard Test of Mind']
  )
})

test('a written payload reads back as it was written', () => {
  const payload = {
    loaded: true,
    rows: [
      {
        key: 'Bard::Bard Test of Tone',
        className: 'Bard',
        name: 'Bard Test of Tone',
        reward: 'Mask of Song',
        giver: 'Cilin Spellsinger',
        items: [
          { name: 'Light Woolen Mask', have: 1, need: 1, iconId: 1234 },
          { name: 'Sky Pearl', have: 1, need: 3 }
        ],
        ready: false
      }
    ]
  }
  assert.deepEqual(parseSkyOverlay(JSON.stringify(payload)), payload)
})

// COUNTS DRAWN BEFORE THE LOG IS IN. Progress arrives from main at once; the loot and turn-ins come
// from the engine's fold of the log, which takes minutes on a large log and never arrives when the
// engine did not start. Until then every starred quest was written as it counted without them
// (0 held, not ready) and the overlay drew that with no sign. The payload now says so.

const IN = { progress: true, loot: true, turnIns: true }

test('rows written before the loot or the turn-ins are in are marked as pending', () => {
  const rows = [row('Bard', 'Bard Test of Tone', false)]
  assert.equal(buildSkyOverlayPayload({ ...IN, loot: false }, rows).countsPending, true)
  assert.equal(buildSkyOverlayPayload({ ...IN, turnIns: false }, rows).countsPending, true)
  // Progress present is still `loaded`: the starred list is known, only its counts are not.
  assert.equal(buildSkyOverlayPayload({ ...IN, loot: false }, rows).loaded, true)
})

test('with everything in, the payload is the one written before: no extra key, rows in drawing order', () => {
  const rows = [row('Wizard', 'Wizard Test of Mind', false), row('Bard', 'Bard Test of Song', true)]
  assert.deepEqual(buildSkyOverlayPayload(IN, rows), { loaded: true, rows: orderSkyOverlayRows(rows) })
  // Before progress there is nothing to qualify: the overlay says it is waiting.
  assert.deepEqual(buildSkyOverlayPayload({ progress: false, loot: false, turnIns: false }, []), EMPTY_SKY_OVERLAY)
})

test('the pending mark survives the storage round trip, and only as a real true', () => {
  const rows = [row('Bard', 'Bard Test of Tone', false)]
  const read = parseSkyOverlay(JSON.stringify(buildSkyOverlayPayload({ ...IN, loot: false }, rows)))
  assert.deepEqual([read.loaded, read.countsPending, read.rows.length], [true, true, 1])
  assert.equal('countsPending' in parseSkyOverlay(JSON.stringify({ loaded: true, rows, countsPending: 'yes' })), false)
})

test('the overlay says the counts may be wrong only above rows it is drawing', () => {
  const rows = [row('Bard', 'Bard Test of Tone', false)]
  const notice = skyOverlayNotice(buildSkyOverlayPayload({ ...IN, loot: false }, rows))
  assert.ok(notice)
  const words = notice.split(/\s+/).length
  assert.ok(words >= 7 && words <= 15, `one sentence of 7 to 15 words, got ${String(words)}`)
  assert.equal(skyOverlayNotice(buildSkyOverlayPayload(IN, rows)), null, 'counts in: nothing to say')
  // No starred quests: the empty text already speaks, and it does not wait on the log.
  assert.equal(skyOverlayNotice(buildSkyOverlayPayload({ ...IN, loot: false }, [])), null)
})

test('nothing stored, or nothing readable, is the empty payload', () => {
  for (const raw of [null, '', 'not json', '42', 'null', '[]']) {
    assert.deepEqual(parseSkyOverlay(raw), EMPTY_SKY_OVERLAY, String(raw))
  }
})

test('a row missing its key, class or name is dropped, and an item needs a name', () => {
  const raw = JSON.stringify({
    loaded: true,
    rows: [
      { className: 'Bard', name: 'No key', items: [] },
      { key: 'Bard::x', name: 'No class', items: [] },
      {
        key: 'Cleric::Cleric Test of Faith',
        className: 'Cleric',
        name: 'Cleric Test of Faith',
        reward: 42,
        items: [{ have: 1, need: 1 }, { name: 'Sky Pearl', have: -2, need: 0, iconId: '../x' }, 'junk'],
        ready: 'yes'
      }
    ]
  })
  const p = parseSkyOverlay(raw)
  assert.equal(p.rows.length, 1)
  const [r] = p.rows
  assert.equal(r.reward, undefined)
  assert.equal(r.ready, false, 'only a real true is ready')
  assert.deepEqual(r.items, [{ name: 'Sky Pearl', have: 0, need: 1 }], 'an icon id that is not a positive integer is dropped')
})

test('the icons switch is kept only on the Sky quest overlay, and only as a real boolean', () => {
  const base = { open: true, locked: false, bgAlpha: 0.72, drill: null }
  const off = { ...base, skyIcons: false }
  applySkyQuestsKnob('skyQuests', off)
  assert.equal(off.skyIcons, false)
  const junk = { ...base, skyIcons: 'no' as unknown as boolean }
  applySkyQuestsKnob('skyQuests', junk)
  assert.equal('skyIcons' in junk, false, 'a non-boolean is dropped, so the overlay reads it as on')
  const stray = { ...base, skyIcons: false }
  applySkyQuestsKnob('xp', stray)
  assert.equal('skyIcons' in stray, false, 'another window does not keep it')
})
