// Wiki Gaps' AAs tab (src/shared/gapAas.ts): each AA the game (the log, Daybreak's notes, the AA
// window) states otherwise than the wiki's Alternate Advancement page, with what the page says, what
// it should say, the evidence, and the row as the page's table writes it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AA_PAGE, aaGapRows } from '../src/shared/gapAas'
import { AA_CORRECTIONS } from '../src/shared/aaOfficial'
import { GAP_DOMAINS, GAP_DOMAIN_LABELS, gapActions, type GapRow } from '../src/shared/gaps'
import { gapJob } from '../src/shared/gapJob'
import { gapDomainOf } from '../src/shared/gapsViewPrefs'
import { wikiPageText } from '../src/shared/wikiPage'
import type { AaTableRow } from '../src/shared/aaTable.generated'
import type { AASpendEvent } from '../src/shared/types'

const T = Date.parse('2026-11-12T18:00:00')
const spend = (ability: string, rank?: number, cost = 1): AASpendEvent =>
  rank === undefined ? { ts: T, ability, cost } : { ts: T + rank * 1000, ability: `${ability} ${String(rank)}`, cost, rank }
const byName = (rows: GapRow[]): Map<string, GapRow> => new Map(rows.map((r) => [r.name, r]))
const fieldsOf = (r: GapRow | undefined): string[] => (r?.aaFix?.issues ?? []).map((i) => i.field)

const NO_LOG = aaGapRows([])
const ROWS = byName(NO_LOG)

test('the domain is offered as the others are', () => {
  assert.ok(GAP_DOMAINS.includes('aa'))
  assert.equal(GAP_DOMAIN_LABELS.aa, 'AAs')
  assert.equal(gapDomainOf('aa'), 'aa')
})

test('with no log, each correction the page lacks is a row; one row per AA, named as the game names it', () => {
  assert.equal(new Set(NO_LOG.map((r) => r.name)).size, NO_LOG.length, 'one row per name (Done marks and rows key on it)')
  assert.ok(NO_LOG.every((r) => r.domain === 'aa' && r.page === AA_PAGE))
  assert.deepEqual(fieldsOf(ROWS.get('Strike As One')), ['row'])
  assert.equal(ROWS.get('Strike As One')?.aaFix?.issues[0].evidence.length, 2, "the game's list, then Daybreak's 08-25 notes")
  assert.deepEqual(fieldsOf(ROWS.get('Rampage')), ['ranks', 'text', 'cost'])
  assert.deepEqual(fieldsOf(ROWS.get('Unbound Strikethrough')), ['name'])
  assert.deepEqual(fieldsOf(ROWS.get('Quick Buff')), ['text', 'text', 'text', 'text'])
  assert.equal(ROWS.get('Pottery Mastery'), undefined, 'the game window shows 3/3, as the page says')
  assert.deepEqual(fieldsOf(ROWS.get('Race Reincarnation: Half Elf')), ['name'])
  assert.deepEqual(fieldsOf(ROWS.get('Race Reincarnation: Drakkin')), ['row'])
  assert.equal(ROWS.get('Race Reincarnation: Race 18')?.aaFix?.placeholder, true)
  assert.equal(ROWS.get('Turn Summoned'), undefined, 'not changed')
})

test('a removal the page already shows is no row; one it does not show is', () => {
  assert.equal(ROWS.get('Valiant Steed'), undefined, 'the wiki already says "This AA has been removed."')
  assert.equal(ROWS.get('Abyssal Steed'), undefined)
  const table: AaTableRow[] = [{ section: 'class', class: 'Paladin', name: 'Valiant Steed', ranks: 1, cost: '9', text: 'Summons a unicorn.' }]
  const rows = aaGapRows([], table, AA_CORRECTIONS.filter((c) => c.removed === true))
  assert.equal(rows.length, 1)
  const r = rows[0]
  assert.equal(r.name, 'Valiant Steed')
  assert.deepEqual(r.aaFix?.issues.map((i) => [i.says, i.should]), [['the AA as current', 'the AA marked removed']])
  assert.equal(r.aaFix?.wikitext, '| <s>Valiant Steed</s> || 1 || 9 || <s>Summons a unicorn.</s> This AA has been removed.')
})

test('each row says what the page says, what it should say, and the evidence with its URL', () => {
  const rampage = ROWS.get('Rampage') as GapRow
  const [ranks, , cost] = rampage.aaFix?.issues ?? []
  assert.deepEqual([ranks.says, ranks.should], ['1 rank', '2 ranks'])
  assert.deepEqual(ranks.evidence, ["Daybreak's 2026-10-22 notes: https://www.everquestlegends.com/patch-notes/eql-update-notes-10-22-2026"])
  assert.deepEqual(cost.evidence, ["the game's AA window and /alternateadv list, 2026-11-25"])
  assert.equal(rampage.details.samples[0], "Page: 1 rank. Should be: 2 ranks. Evidence: Daybreak's 2026-10-22 notes: https://www.everquestlegends.com/patch-notes/eql-update-notes-10-22-2026.")
})

test("a row's dates and kinds are its sources'; a second source joins the same issue", () => {
  const rampage = ROWS.get('Rampage') as GapRow
  assert.deepEqual([rampage.first, rampage.last, rampage.kinds], ['2026-10-22', '2026-11-25', ['announced', 'listed']])
  const pbf = ROWS.get('Point Blank Fire') as GapRow
  assert.equal(pbf.aaFix?.issues[0].evidence.length, 2, "the notes, and the game window's Monk combo")
})

test("Copy gives the row in the page's own layout; the chip opens the AA page's editor", () => {
  const strike = ROWS.get('Strike As One') as GapRow
  assert.match(wikiPageText(strike, [], {}), /^\|-\n\| Strike As One \|\| 1 \|\| 6 \|\| This passive ability grants the Beastlord .* Requirements: Level 35\.\n$/)
  const rampage = ROWS.get('Rampage') as GapRow
  assert.match(wikiPageText(rampage, [], {}), /^\| Rampage \|\| 2 \|\| 5\/4 \|\| Ability Activation ID: 109 .*Rank 2: Level 40, Warriors and Berserkers\. Requirements: Level 30\.\n$/)
  const drakkin = ROWS.get('Race Reincarnation: Drakkin') as GapRow
  assert.equal(wikiPageText(drakkin, [], {}), '|-\n| Race Reincarnation: Drakkin || ? || ? || ? || \n')
  const [chip] = gapActions(rampage, 'unchecked')
  assert.deepEqual([chip.label, chip.href], ['Fix AA page', 'https://eqlwiki.com/index.php?title=Alternate_Advancement&action=edit'])
  assert.match(chip.why, /^Archetype AAs, row Rampage: 2 ranks \(page: 1 rank\);/)
  assert.equal(gapActions(ROWS.get('Race Reincarnation: Race 18') as GapRow, 'unchecked')[0].label, 'Check AA page')
  assert.equal(gapJob(rampage), 'update')
})

test('the log: an AA the page lacks, with its ranks and costs, dated by its lines', () => {
  const rows = aaGapRows([spend('Mystic Ward', undefined, 3), spend('Mystic Ward', 2, 6)], [], [])
  assert.equal(rows.length, 1)
  const r = rows[0]
  assert.deepEqual([r.name, r.kinds, r.count, r.aaFix?.section, r.aaFix?.wikiName], ['Mystic Ward', ['trained'], 2, null, null])
  assert.equal(r.aaFix?.wikitext, '|-\n| Mystic Ward || 2 || 3/6 || ')
  assert.deepEqual(r.aaFix?.issues[0].evidence, ['Your log: Mystic Ward rank 2, 2026-11-12'])
  assert.deepEqual([r.first, r.last], ['2026-11-12 18:00:00', '2026-11-12 18:00:02'])
})

test('the log: a name the page spells otherwise (a near match), and a rank above the page count', () => {
  const table: AaTableRow[] = [
    { section: 'general', name: 'Fear Resistence', ranks: 4, cost: '2/4/6/9', text: 'x' },
    { section: 'general', name: 'Combat Fury', ranks: 4, cost: '1/2/3/4', text: 'y. Requirements: Level 1.' }
  ]
  const rows = byName(aaGapRows([spend('Fear Resistance'), spend('Combat Fury', 5, 6)], table, []))
  const fear = rows.get('Fear Resistance')
  assert.deepEqual(fear?.aaFix?.issues.map((i) => [i.field, i.says, i.should]), [['name', 'Fear Resistence', 'Fear Resistance']])
  assert.equal(fear?.aaFix?.wikitext, '| Fear Resistance || 4 || 2/4/6/9 || x')
  const fury = rows.get('Combat Fury')
  assert.deepEqual(fury?.aaFix?.issues.map((i) => [i.says, i.should]), [['4 ranks', '5 ranks, cost 1/2/3/4/6']])
  assert.equal(fury?.aaFix?.wikitext, '| Combat Fury || 5 || 1/2/3/4/6 || y. Requirements: Level 1.')
})

test('the log joins a correction of the same AA as more evidence, never a second row', () => {
  const rows = aaGapRows([spend('Rampage'), spend('Rampage', 2, 4), spend('Unbound Strikethrough'), spend('Strike As One', undefined, 6)])
  const by = byName(rows)
  assert.equal(new Set(rows.map((r) => r.name)).size, rows.length)
  assert.ok(by.get('Rampage')?.aaFix?.issues[0].evidence.some((e) => e.startsWith('Your log: Rampage rank 2')))
  assert.ok(by.get('Rampage')?.kinds.includes('trained'))
  assert.ok(by.get('Unbound Strikethrough')?.aaFix?.issues[0].evidence.some((e) => e.startsWith('Your log: Unbound Strikethrough')))
  assert.ok(by.get('Strike As One')?.aaFix?.issues[0].evidence.some((e) => e.startsWith('Your log: Strike As One rank 1')))
})

test("the Special AAs header is one row (timer 90, refresh 2 minutes); the class rows' notes add none", () => {
  const head = ROWS.get('Special AAs header') as GapRow
  assert.deepEqual(head.aaFix?.issues.map((i) => [i.field, i.says]), [['header', 'HK Share CoolDown on 90sec timer']])
  assert.match(head.aaFix?.issues[0].should ?? '', /share ability timer 90; each refreshes in 2 minutes \(seen on Warrior, Monk, Shaman\)/)
  assert.equal(wikiPageText(head, [], {}), '! Name !! Ranks I !! Rank II !! Rank III !! Description !! HK (shared ability timer 90, refresh 2:00)\n')
  assert.match(gapActions(head, 'unchecked')[0].why, /^The Special AAs table header: /)
  assert.equal(ROWS.get('Class Reincarnation: Warrior'), undefined)
})
