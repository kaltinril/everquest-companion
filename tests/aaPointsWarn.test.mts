// aaPointsWarn: unspent AA points from the log, the nav row's "!" from 45, the alert's N and its
// once-per-crossing rule, and the seeded alert (off, on the 'aaPointsUnspent' signal).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeAAAccounting, unspentAaPoints } from '../src/shared/aa.ts'
import {
  AA_POINT_CAP,
  AA_POINTS_ALERT_BANNER,
  AA_POINTS_ALERT_SPEECH,
  AA_POINTS_WARN_AT,
  aaAlertAtOf,
  aaAlertCrossed,
  aaPointsCaptures,
  aaPointsWarnOf,
  aaUnspentOf
} from '../src/shared/aaPointsWarn.ts'
import { APP_SIGNAL_CAPTURES, APP_SIGNAL_SAMPLE_CAPTURES, applyCaptures, captureNamesIn, tokensIn } from '../src/shared/alertCaptures.ts'
import { AA_POINTS_ALERT_ID, seedAaPointsAlertOnce, withAaPointsAlert } from '../src/main/alertAaPointsSeed.ts'
import type { CachedStore } from '../src/main/storeCache.ts'
import type { StoreShape } from '../src/main/storeShape.ts'
import type { AlertDef } from '../src/shared/types.ts'

const gain = (ts: number, amount: number, nowHave: number): { ts: number; amount: number; nowHave: number } => ({ ts, amount, nowHave })
const spend = (ts: number, ability: string, cost: number): { ts: number; ability: string; cost: number } => ({ ts, ability, cost })

test('unspent: the newest "You now have" less the purchases after it; null before any gain line', () => {
  assert.equal(unspentAaPoints([], []), null)
  assert.equal(aaUnspentOf(undefined, undefined), null)
  assert.equal(aaUnspentOf([], []), null)
  const gains = [gain(1, 1, 10), gain(3, 2, 12)]
  assert.equal(unspentAaPoints(gains, []), 12)
  // A purchase before the newest gain is already inside its count; one after it lowers the pool.
  assert.equal(unspentAaPoints(gains, [spend(2, 'Innate Strength', 3), spend(4, 'Innate Agility', 5)]), 7)
  assert.equal(unspentAaPoints(gains, [spend(4, 'Big', 99)]), 0)
  // The accounting's headline still reads the same pool.
  assert.equal(computeAAAccounting(gains, [spend(4, 'Innate Agility', 5)]).unspent, 7)
  assert.equal(computeAAAccounting([], []).unspent, 0)
})

test('unspent at the cap: "You now have 50 ability points."', () => {
  assert.equal(aaUnspentOf([gain(1, 1, 49), gain(2, 1, AA_POINT_CAP)], []), 50)
  assert.equal(AA_POINT_CAP, 50)
  assert.equal(AA_POINTS_WARN_AT, 45)
})

test("the nav row's warning: nothing at 44, a nudge at 45, the cap at 50", () => {
  assert.equal(aaPointsWarnOf(null), null)
  assert.equal(aaPointsWarnOf(44), null)
  const near = aaPointsWarnOf(45)
  assert.ok(near)
  assert.equal(near.cap, false)
  assert.match(near.tip, /^45 unspent AA points/)
  const cap = aaPointsWarnOf(50)
  assert.ok(cap)
  assert.equal(cap.cap, true)
  assert.match(cap.tip, /cap reached/)
  for (const tip of [near.tip, cap.tip]) {
    const words = tip.split(/\s+/).length
    assert.ok(words >= 7 && words <= 15, tip)
  }
})

test("the alert's N: 45 by default, a whole number from 1 to the cap", () => {
  assert.equal(aaAlertAtOf(null), 45)
  assert.equal(aaAlertAtOf(''), 45)
  assert.equal(aaAlertAtOf('soon'), 45)
  assert.equal(aaAlertAtOf('30'), 30)
  assert.equal(aaAlertAtOf('29.6'), 30)
  assert.equal(aaAlertAtOf('0'), 1)
  assert.equal(aaAlertAtOf('99'), 50)
})

test('the signal fires once on crossing N upward, and again only after dropping below', () => {
  const at = 45
  const counts = [40, 44, 45, 46, 47, 50, 46, 44, 45, 45, 46]
  const fired: number[] = []
  let before: number | null = null
  for (const n of counts) {
    if (aaAlertCrossed(before, n, at)) fired.push(n)
    before = n
  }
  assert.deepEqual(fired, [45, 45])
  // A jump straight past N fires; the first count seen is a baseline, never a firing.
  assert.equal(aaAlertCrossed(40, 48, at), true)
  assert.equal(aaAlertCrossed(null, 48, at), false)
  assert.equal(aaAlertCrossed(44, null, at), false)
})

test('the aaPointsUnspent tokens are declared, sampled, and fill the seeded phrases', () => {
  const declared = [...APP_SIGNAL_CAPTURES.aaPointsUnspent]
  assert.deepEqual(captureNamesIn({ type: 'app', signal: 'aaPointsUnspent' }), declared)
  assert.deepEqual(Object.keys(aaPointsCaptures(47)), declared)
  assert.deepEqual(Object.keys(APP_SIGNAL_SAMPLE_CAPTURES.aaPointsUnspent).sort(), [...declared].sort())
  for (const phrase of [AA_POINTS_ALERT_BANNER, AA_POINTS_ALERT_SPEECH]) {
    for (const token of tokensIn(phrase)) assert.ok(declared.includes(token), token)
  }
  assert.equal(applyCaptures(AA_POINTS_ALERT_BANNER, aaPointsCaptures(47)), '47 unspent AA points: spend some before 50')
})

const copySeed = (seeds: readonly AlertDef[]): AlertDef[] => seeds.map((a) => ({ ...a }))
const neverSeed = (): AlertDef[] => {
  throw new Error('the seed was built for a list that needs none')
}

function stubStore(data: Record<string, unknown> = {}): Pick<CachedStore<StoreShape>, 'get' | 'set'> {
  return {
    get: (key: string): unknown => data[key],
    set: (key: string, value: unknown): void => {
      data[key] = value
    }
  } as unknown as Pick<CachedStore<StoreShape>, 'get' | 'set'>
}

test('the seeded alert: off by default, on the aaPointsUnspent signal, with the short message', () => {
  const next = withAaPointsAlert([], undefined, copySeed)
  assert.equal(next.length, 1)
  const def = next[0]
  assert.equal(def.id, AA_POINTS_ALERT_ID)
  assert.equal(def.enabled, false)
  assert.deepEqual(def.trigger, { type: 'app', signal: 'aaPointsUnspent' })
  assert.equal(def.bannerText, AA_POINTS_ALERT_BANNER)
  assert.equal(def.speech?.phrase, AA_POINTS_ALERT_SPEECH)
  assert.equal(withAaPointsAlert(next, undefined, neverSeed), next)
})

test('seeded once: a player who deletes it keeps it deleted', () => {
  const data: Record<string, unknown> = {}
  const store = stubStore(data)
  const first = seedAaPointsAlertOnce([], store, copySeed)
  assert.deepEqual(first.map((a) => a.id), [AA_POINTS_ALERT_ID])
  assert.equal(data.alertAaPointsSeed, true)
  assert.deepEqual(seedAaPointsAlertOnce([], store, neverSeed), [])
})
