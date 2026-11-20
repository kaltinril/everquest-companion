// The General AAs table the Tradeskills section reads (src/shared/tradeskillAaTable.generated.ts),
// against the cached wiki pages it is parsed from (scripts/sources/generalAas.ts). No network: the
// caches are committed.
//
// WHAT IS PINNED HERE:
//   1. THE COMMITTED TABLE IS THE CACHE'S. Parsing the cached pages again gives the committed rows
//      and rule lines exactly. A red here after a wiki refresh means: run
//      `npx tsx scripts/gen-tradeskill-aas.mts` and commit the file with the caches.
//   2. NO ROW IS LEFT OUT. The parser names every row it could not read; on the cache there is none.
//   3. BOTH ROW LAYOUTS are read: a row on one line with `||`, and a row written one cell per line
//      (Full Potential, which the class scrape's parser does not read).
//   4. A ROW THAT IS NOT FOUR CELLS, or whose rank count is no number, is named and not guessed at.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { aaCells, cellText, parseGeneralAas, renderTradeskillAaTable, tradeskillAaRules } from '../scripts/sources/generalAas'
import { GENERAL_AAS, TRADESKILL_AA_RULES } from '../src/shared/tradeskillAaTable.generated'
import { assertCorpusFloor } from './corpusFloor.mts'

const cache = (rel: string): URL => new URL(`../scripts/sources/cache/${rel}`, import.meta.url)
const AA_WT = readFileSync(cache('classes/Alternate_Advancement.wikitext'), 'utf8')

function cachedPage(title: string): string {
  const pages = JSON.parse(readFileSync(cache('pages/pages.json'), 'utf8')) as { pageid: number; title: string }[]
  const page = pages.find((p) => p.title === title)
  assert.ok(page, `the page cache lists ${title}`)
  const file = cache(`pages/page-${String(page.pageid)}.wikitext`)
  assert.ok(existsSync(file), `the page cache holds ${title}`)
  return readFileSync(file, 'utf8')
}

test('the committed table is what the cached pages parse to (regenerate when this fails)', () => {
  const scan = parseGeneralAas(AA_WT)
  assert.deepEqual(scan.skipped, [], 'a General AA row the parser could not read')
  assert.deepEqual(scan.rows, [...GENERAL_AAS], 'run: npx tsx scripts/gen-tradeskill-aas.mts')
  assert.deepEqual(tradeskillAaRules(cachedPage('Tradeskills')), [...TRADESKILL_AA_RULES], 'run: npx tsx scripts/gen-tradeskill-aas.mts')
})

test('every row of the wiki table is kept, with the cells as the wiki writes them', () => {
  // A floor (32 on the 2026-11-20 cache): editors add rows, and a parser that stops reading falls under it.
  assertCorpusFloor(GENERAL_AAS.length, 32, 'General AAs')
  const byName = new Map(GENERAL_AAS.map((r) => [r.name, r]))
  assert.equal(byName.size, GENERAL_AAS.length, 'no name twice')
  assert.deepEqual(byName.get('Jewel Craft Mastery'), {
    name: 'Jewel Craft Mastery',
    ranks: 3,
    cost: '2/4/6',
    text: 'This passive ability reduces the chance of failing Jewelcrafting recipes by 10/25/50%. Requirements: Level 1.'
  })
  assert.deepEqual(byName.get('Foraging'), {
    name: 'Foraging',
    ranks: 1,
    cost: '3',
    text: 'This passive ability increases your Forage skill cap by 50 points. Requirements: Level 1.'
  })
  // Written one cell per line on the wiki.
  assert.equal(byName.get('Full Potential')?.ranks, 1)
  assert.equal(byName.get('Full Potential')?.cost, '0')
  assert.match(byName.get('Full Potential')?.text ?? '', /\+50 Tradeskill slots/)
  // A cost that is not a list of numbers is kept as written.
  assert.equal(byName.get('Packrat')?.cost, '1 for all ranks')
  for (const row of GENERAL_AAS) {
    assert.ok(Number.isInteger(row.ranks) && row.ranks >= 1, `${row.name}: ranks`)
    assert.doesNotMatch(row.text, /\[\[|\]\]|'''|<[^>]+>/, `${row.name}: wiki markup left in the text`)
  }
})

test('the Tradeskills page line that links to the AA page is kept as plain text', () => {
  assert.equal(TRADESKILL_AA_RULES.length, 1)
  assert.match(TRADESKILL_AA_RULES[0], /Once you pass 200 in any one skill, all other tradeskills will cap out at 200 until you buy the Crafting Mastery/)
  assert.deepEqual(tradeskillAaRules('No link here.\n== Heading =='), [])
  assert.deepEqual(tradeskillAaRules("<span>Buy '''Deep Pockets''' [[Alternate Advancement#General AAs|AA]].</span>\nOther line."), ['Buy Deep Pockets AA.'])
})

const TABLE = `intro
== General AAs ==
Words above the table.
{| class="wikitable sortable"
! Name !! Ranks !! Cost !! Description
|-
| One Line || 3 || 2/4/6 || Does a thing by 10/25/50%. Requirements: Level 1.
|-
|Cell Per Line
|1
|0
|Adds [[Depot|storage]].
and a second line of it.
|-
| Three Cells || 2 || 1/1
|-
| Odd Ranks || many || 5 || Text.
|}

== Archetype AAs ==
{| class="wikitable"
|-
| Not General || 1 || 1 || Text.
|}
`

test('both row layouts are read; a short row and a rank count that is no number are named', () => {
  const scan = parseGeneralAas(TABLE)
  assert.deepEqual(scan.rows, [
    { name: 'One Line', ranks: 3, cost: '2/4/6', text: 'Does a thing by 10/25/50%. Requirements: Level 1.' },
    { name: 'Cell Per Line', ranks: 1, cost: '0', text: 'Adds storage. and a second line of it.' }
  ])
  assert.deepEqual(scan.skipped, ['Three Cells: 3 cells, not 4', 'Odd Ranks: rank count "many" is not a number'])
  assert.deepEqual(aaCells('! Name !! Ranks'), [])
})

test('a long dash in a cell is written as a spaced hyphen, the rule for every string the app prints', () => {
  const em = String.fromCharCode(0x2014)
  const en = String.fromCharCode(0x2013)
  assert.equal(cellText(`Fast${em}very fast`), 'Fast - very fast')
  assert.equal(cellText(`Levels 1 ${en} 5`), 'Levels 1 - 5')
  assert.equal(cellText("A '''bold''' [[Page|word]] with a hyphen-ated one"), 'A bold word with a hyphen-ated one')
  // The cached table carries neither today: the rule changed no text of it.
  const general = AA_WT.slice(AA_WT.indexOf('== General AAs =='), AA_WT.indexOf('== Archetype AAs =='))
  assert.ok(general.length > 1000 && !general.includes(em) && !general.includes(en))
})

test('a page with no General AAs heading gives no row and says why', () => {
  const scan = parseGeneralAas('== Archetype AAs ==\n{|\n|-\n| A || 1 || 1 || Text.\n|}')
  assert.deepEqual(scan.rows, [])
  assert.equal(scan.skipped.length, 1)
})

test('the generated source lists one row per line and round-trips its values', () => {
  const rows = [{ name: 'A "quoted" one', ranks: 2, cost: '1/2', text: "It's text." }]
  const source = renderTradeskillAaTable(rows, ['A rule.'])
  assert.match(source, /^\/\/ GENERATED by scripts\/gen-tradeskill-aas\.mts/)
  assert.ok(source.includes(`  ${JSON.stringify(rows[0])}\n`))
  assert.ok(source.includes('  "A rule."\n'))
  assert.doesNotMatch(source, /[\u2013\u2014]/)
})
