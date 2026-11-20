// Another character's saved Gaps rows are re-checked against today's data (owner, 2026-10-20:
// "Bull Alligator Tooth" stayed under Items after the delta scrape gave it a page).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withoutNowKnown, type KnownNow } from '../src/shared/gapsRecheck'
import { questsByGiver, type PageNow, type PagesNow } from '../src/shared/gapsRecheckPages'
import { joinCharacters, otherInputs, type CharacterGaps } from '../src/shared/gapsAllCharacters'
import { questGiverAddText } from '../src/shared/gapQuestGivers'

const known: KnownNow = (domain, name) => (domain === 'item' && name === 'Bull Alligator Tooth') || (domain === 'mob' && name === 'a bull alligator')

/** Today's catalogs from a few pages and quests, each page answering to its `|name`, title and redirects. */
function pagesOf(mobs: PageNow[], quests: { page: string; giver: string }[] = [], items: PageNow[] = []): PagesNow {
  const find = (list: PageNow[], name: string): PageNow | null => {
    const k = name.toLowerCase()
    return list.find((p) => p.name?.toLowerCase() === k || p.page.toLowerCase() === k) ?? list.find((p) => p.otherNames?.some((o) => o.toLowerCase() === k)) ?? null
  }
  const given = questsByGiver(quests)
  return { page: (domain, name) => find(domain === 'item' ? items : mobs, name), givenBy: (key) => given.get(key) ?? [] }
}

const NO_PAGES = pagesOf([])
/** The catalog knows every name: what main's name test answers for a row about a page the wiki has. */
const everyName: KnownNow = () => true
const zones = (name: string) => ({ samples: [], zones: { entries: [{ name, n: 3 }], distinct: 1 } })
const mobRow = (name: string, more: object = {}) => ({ domain: 'mob', name, kinds: ['hailed'], count: 1, first: '2026-11-01 10:00:00', last: '2026-11-02 10:00:00', details: { samples: [] }, ...more })
const countOf = (rows: object[], domain: string): number => rows.filter((r) => (r as { domain: string }).domain === domain).length
const snapOf = (rows: object[]) => ({ rows, totals: { item: countOf(rows, 'item'), mob: countOf(rows, 'mob') }, seen: {} })
const names = (out: unknown): string[] => (out as { rows: { name: string }[] }).rows.map((r) => r.name)

const EVERLING: PageNow = { page: 'Lord Ollix Everling', name: 'Lord Ollix Everling' }
const TRAGIC = { page: 'The Tragic Tale of House Everling', giver: 'Lord Ollix Everling' }
const giverRow = (quests: string[]) => mobRow('Lord Ollix Everling', { questGaps: { page: 'Lord Ollix Everling', quests } })

test('a saved row today\'s data now knows is dropped, and its domain\'s total lowered', () => {
  const saved = {
    rows: [
      { domain: 'item', name: 'Bull Alligator Tooth' },
      { domain: 'item', name: 'Pristine Lizard Talon' },
      { domain: 'mob', name: 'a bull alligator' },
      { domain: 'spell', name: 'Summon Holy Steed Bridle' }
    ],
    totals: { item: 2, mob: 1, spell: 1 },
    killFactions: []
  }
  const out = withoutNowKnown(saved, known, NO_PAGES) as typeof saved
  assert.deepEqual(out.rows.map((r) => r.name), ['Pristine Lizard Talon', 'Summon Holy Steed Bridle'])
  assert.deepEqual(out.totals, { item: 1, mob: 0, spell: 1 })
  assert.equal(out.killFactions, saved.killFactions, 'everything else is kept as saved')
  assert.equal(saved.rows.length, 4, 'the saved snapshot itself is not touched')
})

test('a domain this cannot check, and anything not the snapshot shape, are handed back as they are', () => {
  const allKnown: KnownNow = () => true
  const spellsOnly = { rows: [{ domain: 'spell', name: 'X' }], totals: { spell: 1 } }
  assert.equal(withoutNowKnown(spellsOnly, allKnown, NO_PAGES), spellsOnly)
  assert.equal(withoutNowKnown(null, allKnown, NO_PAGES), null)
  assert.equal(withoutNowKnown({ rows: 'nope' }, allKnown, NO_PAGES) instanceof Object, true)
})

// ---- rows about a page the wiki HAS (bug hunt, 2026-11-19) --------------------------------------
// A quest giver, a redirect and a zone-titled row name a mob the catalog knows BY DESIGN. Main's
// name test answered yes for each and dropped them all before the tab ever saw them.

test('a quest-giver, a redirect and a zone-titled row are not closed because the catalog knows their names', () => {
  const pages = pagesOf(
    [EVERLING, { page: 'The Ghoul Lord', name: 'the ghoul lord', otherNames: ['Hoptor Thaggelum'] }, { page: 'A kobold (Warrens)', name: 'a kobold' }],
    [TRAGIC]
  )
  const saved = snapOf([
    giverRow(['The Tragic Tale of House Everling']),
    mobRow('Hoptor Thaggelum', { viaRedirect: 'The Ghoul Lord' }),
    mobRow('a kobold', { zoneTitled: true, details: zones('Rathe Mountains') }),
    mobRow('a rat')
  ])
  const out = withoutNowKnown(saved, everyName, pages) as typeof saved
  assert.deepEqual(names(out), ['Lord Ollix Everling', 'Hoptor Thaggelum', 'a kobold'], 'only the plain unknown-name row closes')
  assert.deepEqual(out.totals, { item: 0, mob: 3 })
})

test("main's re-check then the tab's: another character's quest-giver row reaches the joined list", () => {
  const pages = pagesOf([EVERLING], [TRAGIC])
  const alt: CharacterGaps = { character: 'd_o', name: 'D', server: 'o', savedAt: null, archives: 0, loot: [], kills: null, gaps: null }
  const served = { ...alt, gaps: withoutNowKnown(snapOf([giverRow(['The Tragic Tale of House Everling'])]), everyName, pages) }
  const j = joinCharacters([{ label: 'Live', gaps: { rows: [], totals: {}, seen: {} }, loot: [], kills: null }, ...otherInputs([served], () => true)], null)
  assert.deepEqual(j.gaps?.rows.map((r) => [r.name, r.questGaps?.quests]), [['Lord Ollix Everling', ['The Tragic Tale of House Everling']]])
})

test('a saved quest-giver row offers only the quests the page still lacks today', () => {
  // The delta scrape has since put one quest on the page: Copy must not hand that bullet over again.
  const now: PageNow = { ...EVERLING, relatedQuests: ['Family Heirloom'] }
  const pages = pagesOf([now], [TRAGIC, { page: 'Family Heirloom', giver: 'lord ollix everling' }])
  const out = withoutNowKnown(snapOf([giverRow(['Family Heirloom', 'The Tragic Tale of House Everling'])]), everyName, pages) as { rows: { questGaps: { page: string; quests: string[] } }[] }
  assert.deepEqual(out.rows[0].questGaps.quests, ['The Tragic Tale of House Everling'])
  assert.equal(questGiverAddText(out.rows[0].questGaps), '* [[The Tragic Tale of House Everling]]\n')
})

test('a saved quest-giver row closes when today\'s catalog no longer says its page lacks a quest', () => {
  const saved = snapOf([giverRow(['The Tragic Tale of House Everling']), mobRow('a zork')])
  const listed = pagesOf([{ ...EVERLING, relatedQuests: ['The Tragic Tale of House Everling'] }], [TRAGIC])
  const out = withoutNowKnown(saved, () => false, listed) as typeof saved
  assert.deepEqual(names(out), ['a zork'], 'the page links the quest now')
  assert.deepEqual(out.totals, { item: 0, mob: 1 })
  // The quest left the catalog, went to another giver, or the page is gone: nothing confirms the bullet.
  assert.deepEqual(names(withoutNowKnown(saved, () => false, pagesOf([EVERLING], []))), ['a zork'])
  assert.deepEqual(names(withoutNowKnown(saved, () => false, pagesOf([EVERLING], [{ ...TRAGIC, giver: 'Someone Else' }]))), ['a zork'])
  assert.deepEqual(names(withoutNowKnown(saved, () => false, NO_PAGES)), ['a zork'])
})

test('a saved redirect row stays only while today\'s data still sends its name to that page', () => {
  const saved = snapOf([mobRow('Hoptor Thaggelum', { viaRedirect: 'The Ghoul Lord' }), { domain: 'item', name: 'Halfling Blood', viaRedirect: 'Vial of Halfling Blood' }])
  const ghoul: PageNow = { page: 'The Ghoul Lord', name: 'the ghoul lord', otherNames: ['Hoptor Thaggelum'] }
  const vial: PageNow = { page: 'Vial of Halfling Blood', otherNames: ['Halfling Blood'] }
  assert.equal(withoutNowKnown(saved, everyName, pagesOf([ghoul], [], [vial])), saved, 'both redirects stand: the snapshot as saved')
  // The redirect was replaced by a page of its own, or now lands elsewhere: the saved sentence is no longer true.
  const own = pagesOf([ghoul, { page: 'Hoptor Thaggelum', name: 'Hoptor Thaggelum' }], [], [{ page: 'Halfling Blood' }, vial])
  const out = withoutNowKnown(saved, everyName, own) as typeof saved
  assert.deepEqual(names(out), [])
  assert.deepEqual(out.totals, { item: 0, mob: 0 })
  const moved = pagesOf([{ page: 'Ghoul Lord (Befallen)', name: 'the ghoul lord', otherNames: ['Hoptor Thaggelum'] }], [], [vial])
  assert.deepEqual(names(withoutNowKnown(saved, everyName, moved)), ['Halfling Blood'])
})

test('a saved zone-titled row closes once the wiki has the page it asks for', () => {
  const saved = snapOf([mobRow('a kobold', { zoneTitled: true, details: zones('The Rathe Mountains') })])
  const warrens: PageNow = { page: 'A kobold (Warrens)', name: 'a kobold' }
  assert.equal(withoutNowKnown(saved, everyName, pagesOf([warrens])), saved)
  assert.deepEqual(names(withoutNowKnown(saved, everyName, pagesOf([warrens, { page: 'A kobold (Rathe Mountains)', name: 'a kobold' }]))), [])
  // With no zone on the row its page title is the plain name, which says nothing: kept as saved.
  const noZone = snapOf([mobRow('a kobold', { zoneTitled: true })])
  assert.equal(withoutNowKnown(noZone, everyName, pagesOf([warrens])), noZone)
})
