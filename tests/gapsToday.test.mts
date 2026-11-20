// Main's side of the saved-row re-check, on the COMMITTED catalogs (bug hunt, 2026-11-19). The
// rule's own cases are in gapsRecheck.test.mts on small fixtures; this drives the real mob and
// quest data through `pagesToday`, with main's own name test, so the rows that used to be dropped
// before the tab saw them are shown to survive the path the app runs. Every name is picked from
// the data as it stands: nothing here pins a page, a quest or a count.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withoutNowKnown, type KnownNow } from '../src/shared/gapsRecheck'
import { mobKey } from '../src/shared/mobKey'
import type { MobData, QuestData } from '../src/shared/types'
import { pagesToday } from '../src/main/gapsToday'
import { localMobEntry } from '../src/main/mobLookupLocal'
import mobsJson from '../src/renderer/src/data/eqlegends/mobs.json' with { type: 'json' }
import questsJson from '../src/renderer/src/data/eqlegends/quests.json' with { type: 'json' }

const mobs = (mobsJson as unknown as MobData).mobs
const quests = (questsJson as unknown as QuestData).quests
/** gapsCharacters.ts `knownNow`, the mob half: the name test that closed these rows. */
const knownNow: KnownNow = (domain, name) => domain === 'mob' && localMobEntry(name) !== null
const pages = pagesToday(() => null)
const titleKey = (t: string): string => t.trim().toLowerCase().replace(/`/g, "'")
const snapOf = (rows: object[]) => ({ rows, totals: { mob: rows.length }, seen: {} })
const rowsOf = (out: unknown) => (out as { rows: { name: string; questGaps?: { quests: string[] } }[] }).rows

test('a name the mob catalog knows only through a redirect keeps its saved row', (t) => {
  const own = new Set(mobs.flatMap((m) => [mobKey(m.name), mobKey(m.page)]))
  const page = mobs.find((m) => m.otherNames?.some((n) => !own.has(mobKey(n)) && localMobEntry(n)?.page === m.page))
  const name = page?.otherNames?.find((n) => !own.has(mobKey(n)) && localMobEntry(n)?.page === page.page)
  if (page === undefined || name === undefined) return t.skip('the catalog has no redirect-only mob name today')
  assert.equal(knownNow('mob', name), true, 'the catalog knows the name, which is what dropped the row')
  const saved = snapOf([{ domain: 'mob', name, viaRedirect: page.page }])
  assert.equal(withoutNowKnown(saved, knownNow, pages), saved)
  // The same name saved as sent to some other page is no longer what the data says.
  assert.deepEqual(rowsOf(withoutNowKnown(snapOf([{ domain: 'mob', name, viaRedirect: `${page.page} (elsewhere)` }]), knownNow, pages)), [])
})

test("a quest giver's saved row keeps the quest its page lacks and loses one the page links", (t) => {
  const pairs = quests.flatMap((q) => {
    const page = q.giver === undefined ? null : localMobEntry(q.giver)
    return page === null || q.giver === undefined ? [] : [{ quest: q.page, giver: q.giver, page }]
  })
  const linked = (p: (typeof pairs)[number]): boolean => (p.page.relatedQuests ?? []).some((r) => titleKey(r) === titleKey(p.quest))
  const lacks = pairs.find((p) => !linked(p))
  if (lacks === undefined) return t.skip('every giver page links its quests today')
  assert.equal(knownNow('mob', lacks.giver), true, 'the catalog knows the giver, which is what dropped the row')
  const other = lacks.page.relatedQuests?.[0] ?? 'A Quest No Catalog Has'
  const saved = snapOf([{ domain: 'mob', name: lacks.giver, questGaps: { page: lacks.page.page, quests: [other, lacks.quest] } }])
  assert.deepEqual(rowsOf(withoutNowKnown(saved, knownNow, pages)).map((r) => [r.name, r.questGaps?.quests]), [[lacks.giver, [lacks.quest]]])
  const has = pairs.find(linked)
  if (has === undefined) return
  const done = snapOf([{ domain: 'mob', name: has.giver, questGaps: { page: has.page.page, quests: [has.quest] } }])
  assert.deepEqual(rowsOf(withoutNowKnown(done, knownNow, pages)), [], 'a page that links the quest now has nothing to add')
})
