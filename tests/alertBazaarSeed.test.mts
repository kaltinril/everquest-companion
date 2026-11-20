// alertBazaarSeed: the Alerts tab's "Bazaar watchlist match" alert is seeded with no cooldown, so
// two watched items offered in one trade-chat line are both spoken and both shown. A store that
// still holds the first seed (no cooldown, so the 2 s default) is given the same answer once, and
// a cooldown the player saved is never written over.
//
// The seed's sound refs go through main/alertSeeds.ts, which reads the installed packs through
// Electron. That step is passed in here, so the list rules run with no Electron at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BAZAAR_WATCH_ALERT_ID, seedBazaarAlertOnce, withBazaarAlert, withBazaarCooldown } from '../src/main/alertBazaarSeed.ts'
import type { CachedStore } from '../src/main/storeCache.ts'
import type { StoreShape } from '../src/main/storeShape.ts'
import { cooldownOver } from '../src/shared/alertCooldown.ts'
import type { AlertDef } from '../src/shared/types.ts'

const seed = (seeds: readonly AlertDef[]): AlertDef[] => seeds.map((a) => ({ ...a }))

const neverSeed = (): AlertDef[] => {
  throw new Error('the seed was built for a list that needs none')
}

/** A settings store over a plain object, recording every key written. */
function stubStore(data: Partial<StoreShape> = {}): {
  store: Pick<CachedStore<StoreShape>, 'get' | 'set'>
  data: Partial<StoreShape>
  writes: string[]
} {
  const writes: string[] = []
  const bag = data as Record<string, unknown>
  const store = {
    get: (key: string): unknown => bag[key],
    set: (key: string, value: unknown): void => {
      bag[key] = value
      writes.push(key)
    }
  } as unknown as Pick<CachedStore<StoreShape>, 'get' | 'set'>
  return { store, data, writes }
}

const other: AlertDef = {
  id: 'charm-break',
  name: 'Charm break',
  enabled: true,
  trigger: { type: 'event', kind: 'uncharm' },
  sound: { packId: 'p', soundId: 's' }
}

/** The alert as builds before this fix seeded it: no cooldown key at all. */
const firstSeed: AlertDef = {
  id: BAZAAR_WATCH_ALERT_ID,
  name: 'Bazaar watchlist match',
  enabled: true,
  trigger: { type: 'app', signal: 'bazaarWatch' },
  sound: { packId: 'p', soundId: 's' },
  audio: 'speech',
  speech: { mode: 'custom', phrase: '{item} {what}' },
  bannerText: '{offer} - {why}'
}

test('the seeded alert: on the bazaarWatch signal, spoken, with no cooldown', () => {
  const next = withBazaarAlert([other], undefined, seed)
  assert.deepEqual(
    next.map((a) => a.id),
    ['charm-break', 'bazaar-watch']
  )
  const def = next[1]
  assert.deepEqual(def.trigger, { type: 'app', signal: 'bazaarWatch' })
  assert.equal(def.audio, 'speech')
  // Two offers in one trade-chat line must both be heard; the engine lists each offer once.
  assert.equal(def.cooldownMs, 0)
})

test('two matches in the same moment both pass the alert gate; the first seed dropped the second', () => {
  const def = withBazaarAlert([], undefined, seed)[0]
  assert.equal(cooldownOver(def, undefined, 1000), true)
  assert.equal(cooldownOver(def, 1000, 1000), true)
  // The 2 s default the first seed fell to.
  assert.equal(cooldownOver(firstSeed, 1000, 1000), false)
  assert.equal(cooldownOver(firstSeed, 1000, 2999), false)
  assert.equal(cooldownOver(firstSeed, 1000, 3000), true)
})

test('a stored first seed with no cooldown is given none, and nothing else about it changes', () => {
  const list = [other, firstSeed]
  const next = withBazaarCooldown(list)
  assert.deepEqual(next, [other, { ...firstSeed, cooldownMs: 0 }])
  assert.equal(next[0], other)
  assert.deepEqual(list, [other, firstSeed], 'the list handed in is not changed')
})

test("a cooldown the player saved is left alone, and so is a list without the alert", () => {
  const chosen = [other, { ...firstSeed, cooldownMs: 5000 }]
  assert.equal(withBazaarCooldown(chosen), chosen)
  const already = [{ ...firstSeed, cooldownMs: 0 }]
  assert.equal(withBazaarCooldown(already), already)
  const without = [other]
  assert.equal(withBazaarCooldown(without), without)
})

test('first run: the alert is added with no cooldown, the list is written, and the stamp is set', () => {
  const { store, data, writes } = stubStore()
  const next = seedBazaarAlertOnce([other], store, seed)
  assert.equal(next[1].cooldownMs, 0)
  assert.deepEqual(writes, ['alerts', 'alertBazaarSeed'])
  assert.equal(data.alerts, next)
})

test('a store seeded by an older build: the cooldown is fixed once, then nothing is written again', () => {
  const { store, data, writes } = stubStore({ alertBazaarSeed: true })
  const next = seedBazaarAlertOnce([other, firstSeed], store, neverSeed)
  assert.equal(next[1].cooldownMs, 0)
  assert.deepEqual(writes, ['alerts'])
  assert.equal(data.alerts, next)
  writes.length = 0
  assert.equal(seedBazaarAlertOnce(next, store, neverSeed), next)
  assert.deepEqual(writes, [])
})

test('an alert the player deleted stays deleted', () => {
  const { store, writes } = stubStore({ alertBazaarSeed: true })
  const list = [other]
  assert.equal(seedBazaarAlertOnce(list, store, neverSeed), list)
  assert.deepEqual(writes, [])
})
