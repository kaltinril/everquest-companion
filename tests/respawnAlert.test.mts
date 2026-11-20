// respawnAlert: the alert a set number of seconds before a tracked mob respawns (fork #7): the
// setting, which clocks cross their lead moment between two looks, and the tokens they fill.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_SIGNAL_CAPTURES,
  APP_SIGNAL_SAMPLE_CAPTURES,
  applyCaptures,
  captureNamesIn,
  sampleCapturesFor,
  tokensIn
} from '../src/shared/alertCaptures.ts'
import type { AppSignal } from '../src/shared/alertTypes.ts'
import { DEFAULT_RESPAWN_PREFS, type RespawnRow } from '../src/shared/respawn.ts'
import {
  DEFAULT_RESPAWN_ALERT,
  RESPAWN_ALERT_BANNER,
  RESPAWN_ALERT_SPEECH,
  normalizeRespawnAlert,
  respawnAlertHeard,
  respawnAlertLeadFromDraft,
  respawnAlertLeadOk,
  respawnAlertSilentNote,
  respawnAlertStepper,
  respawnAlertsDue
} from '../src/shared/respawnAlert.ts'

const EST = 720_000
const LEAD = 20
const BASE = 10_000_000
/** The lead moment of a clock based at BASE. */
const AT = BASE + EST - LEAD * 1000

function row(zone: string, baseTs: number, over: Partial<RespawnRow> = {}): RespawnRow {
  const key = over.key ?? 'enynti'
  return {
    id: `${zone.toLowerCase()}::${key}`,
    key,
    display: over.display ?? 'Enynti',
    zone,
    baseTs,
    basis: 'death',
    source: 'observed',
    samples: 1,
    kills: 1,
    estimateMs: EST,
    ...over
  }
}

const snapIn = (zone: string, rows: RespawnRow[], watches = [{ key: 'enynti', display: 'Enynti' }]) => ({
  zone,
  rows,
  prefs: { ...DEFAULT_RESPAWN_PREFS, watches }
})

const keys = (zone: string, rows: RespawnRow[], prevMs: number | null, nowMs: number): string[] =>
  respawnAlertsDue(snapIn(zone, rows), LEAD, prevMs, nowMs).map((d) => d.key)

test('the setting: off and 20 s for nothing or garbage, the lead held to 5..300, a valid pair kept', () => {
  assert.deepEqual(DEFAULT_RESPAWN_ALERT, { on: false, leadSec: 20 })
  for (const raw of [undefined, null, 'on', 7, [], {}]) assert.deepEqual(normalizeRespawnAlert(raw), DEFAULT_RESPAWN_ALERT)
  assert.deepEqual(normalizeRespawnAlert({ on: 'yes', leadSec: 'soon' }), DEFAULT_RESPAWN_ALERT)
  assert.deepEqual(normalizeRespawnAlert({ on: true, leadSec: Number.NaN }), { on: true, leadSec: 20 })
  assert.deepEqual(normalizeRespawnAlert({ on: true, leadSec: 1 }), { on: true, leadSec: 5 })
  assert.deepEqual(normalizeRespawnAlert({ on: true, leadSec: 9000 }), { on: true, leadSec: 300 })
  assert.deepEqual(normalizeRespawnAlert({ on: true, leadSec: 44.6 }), { on: true, leadSec: 45 })
  assert.deepEqual(normalizeRespawnAlert({ on: true, leadSec: 60, extra: 1 }), { on: true, leadSec: 60 })
  assert.deepEqual([4, 5, 300, 301, 20.5, Number.NaN].map(respawnAlertLeadOk), [false, true, true, false, false, false])
})

test('what is typed in the seconds field is stored whole: held to 5..300, rounded, never a prefix', () => {
  const typed = ['600', '1000', '301', '3', '0', '-20', '44.6', '20', '300', '5', ' 45 ', '1e3']
  assert.deepEqual(typed.map(respawnAlertLeadFromDraft), [300, 300, 300, 5, 5, 5, 45, 20, 300, 5, 45, 300])
  // Nothing usable typed: the field goes back to the stored lead.
  assert.deepEqual(['', '   ', 'abc', '2 0', 'NaN', 'Infinity', '-Infinity'].map(respawnAlertLeadFromDraft), Array(7).fill(null))
  // Whatever comes back is a lead the setting may hold.
  for (const text of typed) assert.ok(respawnAlertLeadOk(respawnAlertLeadFromDraft(text) ?? Number.NaN), text)
})

test('a clock is returned exactly when its lead moment falls in (prevMs, nowMs]', () => {
  const rows = [row('Lake Nerius', BASE)]
  const key = `lake nerius::enynti@${String(BASE)}`
  assert.deepEqual(keys('Lake Nerius', rows, AT - 1000, AT - 1), [], 'not yet')
  assert.deepEqual(keys('Lake Nerius', rows, AT - 1, AT), [key], 'the moment itself')
  assert.deepEqual(keys('Lake Nerius', rows, AT - 500, AT + 500), [key])
  assert.deepEqual(keys('Lake Nerius', rows, AT, AT + 1000), [], 'already passed at the last look')
  // The same window gives the same key, so the caller's fired set drops the repeat.
  assert.deepEqual(keys('Lake Nerius', rows, AT - 500, AT + 500), [key])
})

test('the first look is a baseline', () => {
  assert.deepEqual(keys('Lake Nerius', [row('Lake Nerius', BASE)], null, AT), [])
})

test('nothing for a row seen up, with no estimate, in another zone, in a dungeon crawl, or already due', () => {
  const win = (zone: string, rows: RespawnRow[]): string[] => keys(zone, rows, AT - 500, AT + 500)
  assert.deepEqual(win('Lake Nerius', [row('Lake Nerius', BASE, { seenTs: BASE + 60_000, seenVia: 'consider' })]), [])
  assert.deepEqual(win('Lake Nerius', [row('Lake Nerius', BASE, { estimateMs: undefined, source: 'none' })]), [])
  assert.deepEqual(win('Befallen', [row('Lake Nerius', BASE)]), [])
  // Standing elsewhere silences only the other zone's clock, not the one in the zone you are in.
  assert.deepEqual(win('Befallen', [row('Lake Nerius', BASE), row('Befallen', BASE)]), [`befallen::enynti@${String(BASE)}`])
  const crawl = "Nagafen's Lair - Group 4 (Refined)"
  assert.deepEqual(win(crawl, [row(crawl, BASE)]), [])
  assert.deepEqual(win("Nagafen's Lair", [row(crawl, BASE)]), [])
  // A sleep or a long gap: the lead moment is inside the window, but the clock has run out.
  assert.deepEqual(keys('Lake Nerius', [row('Lake Nerius', BASE)], AT - 500, BASE + EST), [])
  assert.deepEqual(keys('Lake Nerius', [row('Lake Nerius', BASE)], AT - 500, BASE + EST - 1).length, 1)
})

test('a respawn no longer than the lead never alerts; an unwatched mob has no clock to alert on', () => {
  const short = row('Lake Nerius', BASE, { estimateMs: LEAD * 1000 })
  assert.deepEqual(keys('Lake Nerius', [short], BASE - 500, BASE + 500), [])
  const due = respawnAlertsDue(snapIn('Lake Nerius', [row('Lake Nerius', BASE)], []), LEAD, AT - 500, AT + 500)
  assert.deepEqual(due, [])
})

test('a re-based clock is a new key; a moved estimate keeps the key', () => {
  const first = keys('Lake Nerius', [row('Lake Nerius', BASE)], AT - 500, AT + 500)
  const longer = keys('Lake Nerius', [row('Lake Nerius', BASE, { estimateMs: EST + 60_000 })], AT + 59_500, AT + 60_500)
  assert.deepEqual(longer, first)
  const rebased = keys('Lake Nerius', [row('Lake Nerius', BASE + 5000, { basis: 'sighting' })], AT + 4500, AT + 5500)
  assert.deepEqual(rebased, [`lake nerius::enynti@${String(BASE + 5000)}`])
})

// ------------------------------------------------------------ will anything be heard?

test('the box is only heard through an enabled alert on the signal: ok, switched off, or missing', () => {
  const respawn = { type: 'app', signal: 'respawnSoon' } as const
  const other = [
    { enabled: true, trigger: { type: 'raw', regex: 'respawn' } as const },
    { enabled: true, trigger: { type: 'app', signal: 'bazaarWatch' } as const },
    // An app condition inside a composite is never fired, so it is not an alert on the signal.
    { enabled: true, trigger: { type: 'any', conditions: [{ ...respawn }] } as const }
  ]
  assert.equal(respawnAlertHeard([]), 'missing')
  assert.equal(respawnAlertHeard(other), 'missing')
  assert.equal(respawnAlertHeard([...other, { enabled: false, trigger: respawn }]), 'off')
  assert.equal(respawnAlertHeard([...other, { enabled: true, trigger: respawn }]), 'ok')
  // By signal, not by the seeded id: the player's own alert on the signal counts.
  assert.equal(respawnAlertHeard([{ enabled: false, trigger: respawn }, { enabled: true, trigger: respawn }]), 'ok')
  assert.equal(respawnAlertHeard([{ enabled: false, trigger: respawn }, { enabled: false, trigger: respawn }]), 'off')
})

test('the Timers tab says why nothing will play, only while the box is ticked', () => {
  assert.equal(respawnAlertSilentNote(false, 'missing'), null)
  assert.equal(respawnAlertSilentNote(false, 'off'), null)
  assert.equal(respawnAlertSilentNote(true, 'ok'), null)
  const off = respawnAlertSilentNote(true, 'off')
  const missing = respawnAlertSilentNote(true, 'missing')
  assert.match(off ?? '', /switched off on the Alerts tab/)
  assert.match(missing ?? '', /Alerts tab has no/)
  for (const note of [off, missing]) {
    assert.ok(note?.includes('Respawn timer ending'))
    assert.doesNotMatch(note ?? '', /[–—]/)
  }
})

// ------------------------------------------------------------ once per clock (the watcher's steps)

const KEY = `lake nerius::enynti@${String(BASE)}`
const lake = (over: Partial<RespawnRow> = {}, baseTs = BASE): ReturnType<typeof snapIn> =>
  snapIn('Lake Nerius', [row('Lake Nerius', baseTs, over)])
const stepKeys = (
  stepper: ReturnType<typeof respawnAlertStepper>,
  snap: ReturnType<typeof snapIn> | null,
  nowMs: number,
  leadSec = LEAD
): string[] => stepper.step(snap, leadSec, nowMs).map((d) => d.key)

test('the first tick is a baseline, even one that lands on the lead moment; so is a fresh start', () => {
  const stepper = respawnAlertStepper()
  assert.deepEqual(stepKeys(stepper, lake(), AT), [])
  assert.deepEqual(stepKeys(stepper, lake(), AT + 1000), [], 'and the moment has passed')
  // The setting switched off and on again is a new stepper.
  assert.deepEqual(stepKeys(respawnAlertStepper(), lake(), AT), [])
})

test('a clock alerts once, however its estimate moves afterwards', () => {
  const stepper = respawnAlertStepper()
  assert.deepEqual(stepKeys(stepper, lake(), AT - 500), [])
  assert.deepEqual(stepKeys(stepper, lake(), AT + 500), [KEY])
  // A longer estimate puts the same clock's lead moment in a later window.
  const longer = lake({ estimateMs: EST + 60_000 })
  assert.deepEqual(respawnAlertsDue(longer, LEAD, AT + 59_500, AT + 60_500).map((d) => d.key), [KEY], 'the window alone repeats it')
  assert.deepEqual(stepKeys(stepper, longer, AT + 59_500), [])
  assert.deepEqual(stepKeys(stepper, longer, AT + 60_500), [], 'already heard')
})

test('a clock alerts once when the lead is lowered after it was heard', () => {
  const stepper = respawnAlertStepper()
  stepKeys(stepper, lake(), AT - 500)
  assert.deepEqual(stepKeys(stepper, lake(), AT + 500), [KEY])
  const at10 = BASE + EST - 10_000
  assert.deepEqual(stepKeys(stepper, lake(), at10 - 500, 10), [])
  assert.deepEqual(stepKeys(stepper, lake(), at10 + 500, 10), [], 'not again at 10 s')
})

test('a tick with no snapshot still moves the clock on: no burst when the log has been read', () => {
  const stepper = respawnAlertStepper()
  assert.deepEqual(stepKeys(stepper, lake(), AT - 1000), [])
  assert.deepEqual(stepKeys(stepper, null, AT + 500), [], 'reading the log')
  assert.deepEqual(stepKeys(stepper, lake(), AT + 1000), [], 'its lead moment passed unseen')
  // A first tick with no snapshot is the baseline too.
  const late = respawnAlertStepper()
  assert.deepEqual(stepKeys(late, null, AT - 500), [])
  assert.deepEqual(stepKeys(late, lake(), AT + 500), [KEY])
})

test('a re-based clock alerts again; two clocks due in one tick are both returned', () => {
  const stepper = respawnAlertStepper()
  stepKeys(stepper, lake(), AT - 500)
  assert.deepEqual(stepKeys(stepper, lake(), AT + 500), [KEY])
  const rebased = lake({ basis: 'sighting' }, BASE + 5000)
  assert.deepEqual(stepKeys(stepper, rebased, AT + 4500), [])
  assert.deepEqual(stepKeys(stepper, rebased, AT + 5500), [`lake nerius::enynti@${String(BASE + 5000)}`])
  const two = snapIn('Lake Nerius', [row('Lake Nerius 3 (Fused)', BASE), row('Lake Nerius', BASE)])
  const both = respawnAlertStepper()
  stepKeys(both, two, AT - 500)
  assert.equal(stepKeys(both, two, AT + 500).length, 2)
})

test('where you stand is said plainly; another tier or instance names its place', () => {
  const rows = [row('Lake Nerius 3 (Fused)', BASE), row('Lake Nerius 4 (Refined) [instance 17]', BASE), row('Lake Nerius', BASE)]
  const due = respawnAlertsDue(snapIn('Lake Nerius', rows), LEAD, AT - 500, AT + 500)
  const by = new Map(due.map((d) => [d.captures.place, d]))
  assert.deepEqual([...by.keys()].sort(), ['inst +4', 'open +0', 'open +3'])
  assert.equal(applyCaptures(RESPAWN_ALERT_SPEECH, by.get('open +0')?.captures), 'Enynti in 20 seconds')
  assert.equal(applyCaptures(RESPAWN_ALERT_SPEECH, by.get('open +3')?.captures), 'Enynti in 20 seconds, open plus 3')
  assert.equal(applyCaptures(RESPAWN_ALERT_SPEECH, by.get('inst +4')?.captures), 'Enynti in 20 seconds, instance plus 4')
  assert.equal(applyCaptures(RESPAWN_ALERT_BANNER, by.get('open +3')?.captures), 'Enynti in 20s - open +3')
  assert.equal(by.get('open +3')?.context, 'Enynti - open +3')
  assert.equal(by.get('open +3')?.captures.zone, 'Lake Nerius')
  assert.equal(new Set(due.map((d) => d.key)).size, 3, 'one key per place')
})

test('the respawnSoon signal declares the tokens it fills, and the default phrases use only those', () => {
  const declared = [...APP_SIGNAL_CAPTURES.respawnSoon]
  assert.deepEqual(captureNamesIn({ type: 'app', signal: 'respawnSoon' }), declared)
  // The longest name the game is likely to print, the longest lead, a private instance.
  const long = row('Lake Nerius 4 (Refined) [instance 17]', BASE, { display: 'a Tesch Mas Gnoll Deathcaller of the Depths' })
  const watches = [{ key: 'enynti', display: 'a Tesch Mas Gnoll Deathcaller of the Depths' }]
  const [due] = respawnAlertsDue(snapIn('Lake Nerius', [long], watches), 300, BASE + EST - 300_500, BASE + EST - 299_500)
  assert.ok(due)
  assert.deepEqual(Object.keys(due.captures), declared)
  for (const value of Object.values(due.captures)) assert.notEqual(value, '')
  for (const phrase of [RESPAWN_ALERT_SPEECH, RESPAWN_ALERT_BANNER]) {
    for (const token of tokensIn(phrase)) assert.ok(declared.includes(token), token)
    assert.doesNotMatch(applyCaptures(phrase, due.captures), /[{}]/)
  }
  // A capture is cut at 48 characters, which is why the sentence is not one token.
  assert.equal(
    applyCaptures(RESPAWN_ALERT_SPEECH, due.captures),
    'a Tesch Mas Gnoll Deathcaller of the Depths in 300 seconds, instance plus 4'
  )
})

test("the Alerts tab's Test button has a sample value for every token an app signal fills", () => {
  for (const signal of Object.keys(APP_SIGNAL_CAPTURES) as AppSignal[]) {
    const sample = APP_SIGNAL_SAMPLE_CAPTURES[signal]
    assert.deepEqual(Object.keys(sample).sort(), [...APP_SIGNAL_CAPTURES[signal]].sort(), signal)
    for (const [name, value] of Object.entries(sample)) {
      // What a real firing would carry: nothing empty, nothing the 48-character cut would change.
      assert.equal(applyCaptures(`{${name}}`, sample), value, `${signal} ${name}`)
      assert.notEqual(value.trim(), '', `${signal} ${name}`)
    }
  }
  const respawn = sampleCapturesFor({ type: 'app', signal: 'respawnSoon' })
  assert.equal(applyCaptures(RESPAWN_ALERT_SPEECH, respawn), 'Enynti in 20 seconds')
  assert.equal(applyCaptures(RESPAWN_ALERT_BANNER, respawn), 'Enynti in 20s - open +0')
  // The Bazaar alert's seeded phrases (main/alertBazaarSeed.ts) are tokens only too.
  const bazaar = sampleCapturesFor({ type: 'app', signal: 'bazaarWatch' })
  for (const phrase of ['{item} {what}', '{offer} - {why}']) assert.doesNotMatch(applyCaptures(phrase, bazaar), /[{}]/)
})

test('only an app signal that fills tokens has sample values; a log alert is tested as before', () => {
  assert.equal(sampleCapturesFor({ type: 'app', signal: 'bossDefeat' }), undefined)
  assert.equal(sampleCapturesFor({ type: 'raw', regex: '(?<mob>\\w+) hits' }), undefined)
  assert.equal(sampleCapturesFor({ type: 'event', kind: 'uncharm' }), undefined)
  // An app condition inside a composite never fires (alertTypes.ts), so it has nothing to sample.
  const composite = { type: 'any', conditions: [{ type: 'app', signal: 'respawnSoon' }] } as const
  assert.equal(sampleCapturesFor({ ...composite, conditions: [...composite.conditions] }), undefined)
})
