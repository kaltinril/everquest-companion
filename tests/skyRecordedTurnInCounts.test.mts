// What a turn-in recorded with '+' does to the held counts, per count source, and what the Sky
// tab says about it.
//
// The '+' hover said "The items it required are subtracted" under every source, and the badge said
// "The items it required were spent". Under "Log only (loot minus hand-ins)" the count follows the
// hand-overs the log shows and never reads the turn-in ledger, so a '+' changed the badge and no
// number. The sentences are now picked by the source (countSource.ts), and this file pins them
// against the real reconcile so the words and the arithmetic cannot part again.
//
// Run: `node --import tsx --test tests/skyRecordedTurnInCounts.test.mts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reconcile } from '../src/renderer/src/features/inventory/reconcile'
import {
  recordTurnInTitle,
  recordedTurnInMovesCounts,
  turnInHoverSource,
  turnedInHover
} from '../src/renderer/src/features/inventory/countSource'
import { computeHeldCounts, computeLogOnlyCounts } from '../src/renderer/src/features/posky/heldCounts'
import { questKey } from '../src/renderer/src/features/posky/keys'
import type { CountSource, LootEvent, PoskyQuest } from '../src/shared/types'

const RUNE = 'Wind Rune Kala'
const KEY = 'wind rune kala'
const T = 1_700_000_000_000
const DUMP_AT = T + 10
const CLICK_AT = T + 20

const QUEST: PoskyQuest = {
  className: 'Druid',
  name: 'Test of Wind',
  giver: 'Kizdean Gix',
  items: [{ name: RUNE, count: 2, who: [], where: 'Island 1' }]
}
const LOOT: LootEvent[] = [{ ts: T + 1, item: RUNE, count: 5 }]

/** Held runes with 5 looted, and optionally a dump of 5 written before the '+' click. */
function held(countSource: CountSource, x: { recorded: boolean; dump: boolean; stated?: number }): number {
  const key = questKey(QUEST)
  const override = x.stated === undefined ? undefined : { key: KEY, name: RUNE, count: x.stated, setAt: DUMP_AT }
  return (
    reconcile({
      log: computeHeldCounts(LOOT),
      inv: x.dump ? { [RUNE]: 5 } : {},
      lootNames: {},
      countSource,
      turnIns: x.recorded ? { [key]: 1 } : {},
      // The '+' stamps the click; the log shows no trade, so nothing is detected.
      turnInInstants: x.recorded ? { [key]: [CLICK_AT] } : {},
      detectedTurnInInstants: {},
      quests: [QUEST],
      rebaselineAt: x.dump ? DUMP_AT : null,
      overrides: override ? { [KEY]: override } : {},
      logOnly: computeLogOnlyCounts(LOOT, [])
    }).net[KEY] ?? 0
  )
}

const moves = (s: CountSource, dump: boolean): boolean =>
  held(s, { recorded: true, dump }) < held(s, { recorded: false, dump })

test('under "Log only (loot minus hand-ins)" a recorded turn-in changes no count', () => {
  assert.equal(held('handins', { recorded: false, dump: false }), 5)
  assert.equal(held('handins', { recorded: true, dump: false }), 5)
  assert.equal(held('handins', { recorded: true, dump: true }), 5)
  // Contrast: the plain log source takes the quest's two runes off.
  assert.equal(held('log', { recorded: true, dump: false }), 3)
})

test('the same holds for the export sources: a click time never discounts a dump', () => {
  for (const s of ['inventory', 'rebaseline'] as const) {
    assert.equal(moves(s, true), false, s)
  }
})

test('the hover promises a subtraction only where the reconcile makes one', () => {
  for (const s of ['log', 'inventory', 'both', 'rebaseline', 'handins'] as const) {
    if (recordedTurnInMovesCounts(s)) {
      assert.equal(moves(s, false), true, `${s}: the log half goes down`)
      assert.match(recordTurnInTitle(s), /subtracted/)
    } else {
      assert.equal(moves(s, true), false, `${s}: nothing goes down`)
      assert.doesNotMatch(recordTurnInTitle(s), /subtracted|spent/)
      assert.match(recordTurnInTitle(s), /stay the same/)
    }
  }
  assert.equal(recordedTurnInMovesCounts('handins'), false)
  assert.equal(recordedTurnInMovesCounts('log'), true)
})

test('…and its remedy is true: a count set by hand does go down for a later recorded turn-in', () => {
  assert.match(recordTurnInTitle('handins'), /set them by hand/)
  assert.equal(held('handins', { recorded: false, dump: false, stated: 5 }), 5)
  assert.equal(held('handins', { recorded: true, dump: false, stated: 5 }), 3)
})

test('the badge under that source points at the log, and keeps its old words elsewhere', () => {
  assert.doesNotMatch(turnedInHover('handins', 1), /were spent|spends/)
  assert.match(turnedInHover('handins', 1), /^Turned in once; .*your log shows/)
  assert.match(turnedInHover('handins', 3), /^Turned in 3 times; /)
  assert.equal(
    turnedInHover('both', 1),
    'Turned in once. The items it required were spent, so the progress beside this is what you hold toward doing it again.'
  )
  assert.equal(
    turnedInHover('log', 3),
    'Turned in 3 times. Each turn-in spends the items it required, so the progress beside this is what you hold toward doing it again.'
  )
})

test('a hover written for this is one sentence of 7 to 15 words', () => {
  for (const text of [recordTurnInTitle('handins'), turnedInHover('handins', 1), turnedInHover('handins', 12)]) {
    const words = text.split(/\s+/).length
    assert.ok(words >= 7 && words <= 15, `${String(words)} words: ${text}`)
    assert.equal(text.split(/[.!?](\s|$)/).filter((p) => p.trim()).length, 1, text)
  }
})

// With no export it can date, "Set from export, then log" counts as `both`, so the log's count
// does go down on a '+', and the old hover said the counts stay the same (bug hunt, 2026-11-19).
test('rebaseline with no datable export speaks as the source it counts as', () => {
  assert.equal(moves('rebaseline', false), true, 'the reconcile takes the items off the log count')
  const undated = turnInHoverSource('rebaseline', undefined)
  assert.equal(undated, 'both')
  assert.equal(recordedTurnInMovesCounts(undated), true)
  assert.doesNotMatch(recordTurnInTitle(undated), /stay the same/)
})

test('rebaseline with a dated export keeps its words, and no other source is touched', () => {
  const dated = { path: 'x', loadedAt: 'x', readAt: DUMP_AT }
  assert.equal(moves('rebaseline', true), false)
  assert.equal(turnInHoverSource('rebaseline', dated), 'rebaseline')
  assert.match(recordTurnInTitle(turnInHoverSource('rebaseline', dated)), /stay the same/)
  for (const s of ['log', 'inventory', 'both', 'handins'] as const) {
    assert.equal(turnInHoverSource(s, undefined), s)
    assert.equal(turnInHoverSource(s, dated), s)
  }
})

test("the '+' button asks for the hover through the export's date", () => {
  const src = readFileSync(new URL('../src/renderer/src/features/posky/TurnInControls.tsx', import.meta.url), 'utf8')
  assert.match(src, /recordTurnInTitle\(turnInHoverSource\(countSource, heldProgressNow\(\)\?\.inventorySource\)\)/)
})
