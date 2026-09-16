// HIDE MOBS FROM RAID TARGETS (GitHub issue #32) — the pure half of the roster's hide flag.
//
// THE REPORT: "I do not personally see much of a use in displaying all hate minis on the page
// and even plane of sky could be hideable since it's not effected by the weekly loot as well."
// "Hate minis" is not a data category — Plane of Hate's twelve targets mix Innoruuk with the
// minis — so the flag is PER TARGET, a localStorage set of lowercased names in the
// `useQuestFlags` shape (useHiddenTargets.ts), and the filter is one more input to
// `filterRoster` (rosterFilter.ts).
//
// THE ORDER IS THE DESIGN: hidden drops FIRST, before the search box and the defeated switch,
// because hiding is an identity statement about the roster ("this card is not my raid week")
// where the other two are momentary narrowings of it. `showHidden` is a PEEK, not an un-hide:
// it stops the drop so the cards can render (dimmed, with the restore control) and changes
// nothing about the set.
//
// The roster is the two-boss history tests/bossHistories.mts used to replay (Lord of Ire on d4
// and in the open world either side of the Aug 04 reset, the princess twice in Sky) — built by
// hand here, because JOS-499 retired that helper with the TypeScript kills module it replayed
// through. The same rows, the same counts, the same tiers; only the parser is gone.
//
// Run: `npm test`.

process.env.TZ = 'America/Los_Angeles'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { everDefeated, filterRoster } from '../src/renderer/src/features/bosses/rosterFilter'
import { allStatuses, type TargetStatus } from '../src/renderer/src/features/bosses/bossStatus'
import { TIER_OPEN_WORLD } from '../src/shared/kills'
import type { KillMap, KillTierRun, RaidTarget } from '../src/shared/types'

/** An untouched toolbar, stated once. */
const none = { query: '', defeatedOnly: false, defeated: everDefeated } as const

const IRE: RaidTarget = { name: 'Lord of Ire', category: 'Plane of Hate', match: ['Lord of Ire'] }
const PRINCESS: RaidTarget = {
  name: 'Thunder Spirit Princess',
  category: 'Plane of Sky',
  match: ['Thunder Spirit Princess']
}

/** One kill at one tier, credited or merely witnessed. */
function run(ts: number, credited: boolean): KillTierRun {
  return { count: 1, firstTs: ts, lastTs: ts, credited: credited ? 1 : 0, lastCreditedTs: credited ? ts : 0 }
}

/**
 * The history the retired helper replayed, straddling Tue Aug 04 2026 08:00 Pacific:
 *   Sat Aug 01 16:09:29  Lord of Ire, d4                — credited
 *   Mon Aug 03 23:02:44  Lord of Ire, open world        — credited
 *   Tue Aug 04 22:55:08  a thunder spirit princess, OW  — credited
 *   Wed Aug 05 00:33:45  a thunder spirit princess, OW  — witnessed (killed by Pesmerga)
 */
function history(): TargetStatus[] {
  const ireD4 = run(Date.UTC(2026, 7, 1, 23, 9, 29), true)
  const ireOw = run(Date.UTC(2026, 7, 4, 6, 2, 44), true)
  const princess: KillTierRun = {
    count: 2,
    firstTs: Date.UTC(2026, 7, 5, 5, 55, 8),
    lastTs: Date.UTC(2026, 7, 5, 7, 33, 45),
    credited: 1,
    lastCreditedTs: Date.UTC(2026, 7, 5, 5, 55, 8)
  }
  const kills: KillMap = {
    'lord of ire': {
      count: 2,
      bestTier: 4,
      firstTs: ireD4.firstTs,
      lastTs: ireOw.lastTs,
      credited: 2,
      display: 'Lord of Ire',
      tiers: { 4: ireD4, [TIER_OPEN_WORLD]: ireOw }
    },
    'a thunder spirit princess': {
      count: 2,
      bestTier: TIER_OPEN_WORLD,
      firstTs: princess.firstTs,
      lastTs: princess.lastTs,
      credited: 1,
      display: 'a thunder spirit princess',
      tiers: { [TIER_OPEN_WORLD]: princess }
    }
  }
  return allStatuses([IRE, PRINCESS], kills)
}

test('a hidden target leaves the roster', () => {
  const list = history()
  const out = filterRoster(list, { ...none, hidden: new Set(['lord of ire']), showHidden: false })
  assert.equal(out.length, list.length - 1)
  assert.ok(!out.some((s) => s.target.name === 'Lord of Ire'))
})

test('the set holds LOWERCASED names and the filter lowercases before asking', () => {
  // The same casing armour useQuestFlags states: a data casing drift must not orphan a hide.
  const list = history()
  const out = filterRoster(list, { ...none, hidden: new Set(['lord of ire']), showHidden: false })
  assert.ok(!out.some((s) => s.target.name.toLowerCase() === 'lord of ire'))
})

test('showHidden is a PEEK: nothing is dropped, and the set is not consulted for membership', () => {
  const list = history()
  const out = filterRoster(list, { ...none, hidden: new Set(['lord of ire']), showHidden: true })
  assert.equal(out, list, 'peeking an otherwise-untouched toolbar hands back the same array')
})

test('hidden drops FIRST: a hidden target that matches the search box is still gone', () => {
  const list = history()
  const out = filterRoster(list, {
    ...none,
    query: 'lord of ire',
    hidden: new Set(['lord of ire']),
    showHidden: false
  })
  assert.equal(out.length, 0, 'the search box cannot resurrect what the user hid')
})

test('…and the other filters still apply to what survives the hide', () => {
  const list = history()
  const out = filterRoster(list, {
    ...none,
    defeatedOnly: true,
    hidden: new Set(['lord of ire']),
    showHidden: false
  })
  assert.ok(out.every((s) => s.killed), 'the defeated switch reads the un-hidden remainder')
  assert.ok(!out.some((s) => s.target.name === 'Lord of Ire'))
})

test('an untouched toolbar with an EMPTY hidden set hands back the same array', () => {
  // The memo-identity promise filterRoster already makes, extended to the new inputs: an empty
  // set must not churn the sectioning below it.
  const list = history()
  assert.equal(filterRoster(list, { ...none, hidden: new Set(), showHidden: false }), list)
  assert.equal(filterRoster(list, none), list, 'and the fields are optional — old call sites stand')
})
