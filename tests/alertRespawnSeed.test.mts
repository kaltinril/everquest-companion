// alertRespawnSeed: the Alerts tab's "Respawn timer ending" alert (fork #7) is added once, never
// doubled, never written over the player's edit, and never brought back after the player deletes it.
//
// The seed's sound refs go through main/alertSeeds.ts, which reads the installed packs through
// Electron. That step is passed in here, so the list rules run with no Electron at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESPAWN_SOON_ALERT_ID, seedRespawnAlertOnce, withRespawnAlert } from '../src/main/alertRespawnSeed.ts'
import type { CachedStore } from '../src/main/storeCache.ts'
import type { StoreShape } from '../src/main/storeShape.ts'
import { RESPAWN_ALERT_BANNER, RESPAWN_ALERT_SPEECH } from '../src/shared/respawnAlert.ts'
import type { AlertDef } from '../src/shared/types.ts'

/** The sound-ref step, standing in for seedAlertsWith: the seeds as they are, and what it was handed. */
function seedSpy(): { seed: (seeds: readonly AlertDef[], prefs: unknown) => AlertDef[]; prefsSeen: unknown[] } {
  const prefsSeen: unknown[] = []
  return {
    prefsSeen,
    seed: (seeds, prefs) => {
      prefsSeen.push(prefs)
      return seeds.map((a) => ({ ...a }))
    }
  }
}

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

const ids = (alerts: AlertDef[]): string[] => alerts.map((a) => a.id)

test('the seeded alert: on the respawnSoon signal, spoken, with no cooldown, after the alerts already there', () => {
  const { seed, prefsSeen } = seedSpy()
  const prefs = { defaultPackId: 'my-pack' }
  const list = [other]
  const next = withRespawnAlert(list, prefs, seed)
  assert.deepEqual(ids(next), ['charm-break', 'respawn-soon'])
  assert.equal(next[0], other, 'the alert already there is untouched')
  assert.deepEqual(list, [other], 'the list handed in is not changed')
  assert.deepEqual(prefsSeen, [prefs], "the player's default sound pack reaches the seed")
  const def = next[1]
  assert.equal(def.id, RESPAWN_SOON_ALERT_ID)
  assert.equal(def.name, 'Respawn timer ending')
  assert.equal(def.enabled, true)
  assert.deepEqual(def.trigger, { type: 'app', signal: 'respawnSoon' })
  assert.equal(def.audio, 'speech')
  assert.deepEqual(def.speech, { mode: 'custom', phrase: RESPAWN_ALERT_SPEECH })
  assert.equal(def.bannerText, RESPAWN_ALERT_BANNER)
  // Two mobs due inside the default 2 s cooldown must both be heard.
  assert.equal(def.cooldownMs, 0)
})

test("a list that has the alert is returned as it is: no second copy, the player's edit kept", () => {
  const edited: AlertDef = { ...other, id: RESPAWN_SOON_ALERT_ID, name: 'Named soon', enabled: false, audio: 'sound' }
  const list = [other, edited]
  assert.equal(withRespawnAlert(list, undefined, neverSeed), list)
})

test('first run: the alert is added, the list is written, and the stamp is set', () => {
  const { store, data, writes } = stubStore({ soundPacks: { defaultPackId: 'my-pack' } })
  const { seed, prefsSeen } = seedSpy()
  const next = seedRespawnAlertOnce([other], store, seed)
  assert.deepEqual(ids(next), ['charm-break', 'respawn-soon'])
  assert.deepEqual(writes, ['alerts', 'alertRespawnSeed'])
  assert.equal(data.alerts, next)
  assert.equal(data.alertRespawnSeed, true)
  assert.deepEqual(prefsSeen, [{ defaultPackId: 'my-pack' }])
})

test('every later read changes nothing and writes nothing', () => {
  const { store, writes } = stubStore()
  const { seed } = seedSpy()
  const first = seedRespawnAlertOnce([other], store, seed)
  writes.length = 0
  assert.equal(seedRespawnAlertOnce(first, store, neverSeed), first)
  assert.deepEqual(writes, [])
})

test('an alert the player deleted stays deleted', () => {
  const { store, writes } = stubStore()
  const { seed } = seedSpy()
  const first = seedRespawnAlertOnce([other], store, seed)
  const afterDelete = first.filter((a) => a.id !== RESPAWN_SOON_ALERT_ID)
  writes.length = 0
  assert.equal(seedRespawnAlertOnce(afterDelete, store, neverSeed), afterDelete)
  assert.deepEqual(ids(afterDelete), ['charm-break'])
  assert.deepEqual(writes, [])
})

test('a list that already holds the alert before the stamp: only the stamp is written', () => {
  const { store, data, writes } = stubStore()
  const list = [{ ...other, id: RESPAWN_SOON_ALERT_ID }]
  assert.equal(seedRespawnAlertOnce(list, store, neverSeed), list)
  assert.deepEqual(writes, ['alertRespawnSeed'])
  assert.equal(data.alertRespawnSeed, true)
})

test('Reset alerts brings a deleted alert back, whatever the stamp says', () => {
  const { seed } = seedSpy()
  assert.deepEqual(ids(withRespawnAlert([], undefined, seed)), ['respawn-soon'])
})
