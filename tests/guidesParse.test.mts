// The two community tradeskill guides, from fetched bytes to the shape in src/shared/guideData.ts
// (scripts/community/guides/). Run against tests/fixtures/guides, a copy of the pull of 2026-11-20,
// so a count here is a fact about that copy and does not move when the guides are pulled again.
// Nothing reaches the network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, trimGrid } from '../scripts/community/guides/csv'
import { MAX_CONTENT_XML_BYTES, ODS_MIME, parseOdsContent, readOds } from '../scripts/community/guides/ods'
import { parseRecipeTable, readCredit, takeCredit } from '../scripts/community/guides/kornerstore'
import { PullRefusal } from '../scripts/community/guides/rules'
import { parseLadder, readName, readOverview, readRange, readWelcome } from '../scripts/community/guides/sheetGuide'
import { foldTradeskill, pageTitle, parseTabList, slugOf } from '../scripts/community/guides/tabs'
import { bytesOf, fixtureFiles, fixtureGrid, odsOf, textOf, zipOf } from './guidesFixture.mts'

const files = fixtureFiles()
const ladder = (tab: string) => parseLadder(fixtureGrid(tab), tab)

// ---- CSV and the tab list ------------------------------------------------------------------------------

test('CSV: quoted cells, doubled quotes, a comma and a line break inside quotes, CRLF, no last newline', () => {
  assert.deepEqual(parseCsv('a,"b,1",c\r\n"say ""hi""",,\r\n"two\nlines",x'), [
    ['a', 'b,1', 'c'],
    ['say "hi"', '', ''],
    ['two\nlines', 'x']
  ])
  assert.deepEqual(trimGrid([[' a ', '', ''], ['', '', '']]), [['a'], []])
})

test('the tab list is read from the published page: eleven tabs with their gids, in order', () => {
  const html = textOf(files, 'pubhtml.html')
  assert.deepEqual(parseTabList(html), [
    { name: 'Welcome', gid: '1848784077' },
    { name: 'Overview', gid: '0' },
    { name: 'Alchemy', gid: '1909290481' },
    { name: 'Baking', gid: '2126140250' },
    { name: 'Blacksmithing', gid: '1131536115' },
    { name: 'Brewing', gid: '554177470' },
    { name: 'Fletching', gid: '705688313' },
    { name: 'Jewelcrafting', gid: '1243487254' },
    { name: 'Pottery', gid: '1240291122' },
    { name: 'Tailoring', gid: '789035462' },
    { name: 'Tinkering', gid: '929336399' }
  ])
  assert.equal(pageTitle(html), 'EQ Legends Tradeskill Guide')
})

test('a page with no tab entry is refused, and an escaped tab name is read as text, never run', () => {
  assert.throws(() => parseTabList('<html><body>Sign in</body></html>'), /no tab entry/)
  const tabs = parseTabList('items.push({name: "Jewel\\x20Crafting \\u0026 \\"more\\"", pageUrl: "x", gid: "7"})')
  assert.deepEqual(tabs, [{ name: 'Jewel Crafting & "more"', gid: '7' }])
})

test('tab and table names fold to one tradeskill spelling, and to a safe file name', () => {
  assert.equal(foldTradeskill('Jewel_Crafting'), 'Jewelcrafting')
  assert.equal(foldTradeskill('Jewelcrafting'), 'Jewelcrafting')
  assert.equal(foldTradeskill('Lets_get_Crafting!'), undefined)
  assert.equal(foldTradeskill('Welcome'), undefined)
  assert.equal(slugOf('../../etc/Jewel Crafting!'), 'etc_Jewel_Crafting')
})

// ---- the leveling guide ----------------------------------------------------------------------------------

test('a name cell gives the name, the count, the returned mark and the remark', () => {
  assert.deepEqual(readName('small piece of ore x2'), { name: 'small piece of ore', qty: 2 })
  assert.deepEqual(readName('smithy hammer (returned)'), { name: 'smithy hammer', returned: true })
  assert.deepEqual(readName('Metal bits  (save for later)'), { name: 'Metal bits', note: 'save for later' })
  assert.deepEqual(readName('clump of dough x2 (see below)'), { name: 'clump of dough', qty: 2, note: 'see below' })
  const skull = readName('Cyclops skull (returned.  from undead cyclops in south karana)')
  assert.deepEqual(skull, { name: 'Cyclops skull', returned: true, note: 'from undead cyclops in south karana', text: 'Cyclops skull (returned. from undead cyclops in south karana)' })
  const knife = readName('Mithril Working Knife – Crafted (Blacksmiting, Trivial 42)  (returned)')
  assert.equal(knife.name, 'Mithril Working Knife')
  assert.equal(knife.returned, true)
  assert.equal(knife.note, 'Crafted (Blacksmiting, Trivial 42)')
  assert.equal(readName('leather padding*  (see blacksmithing tab)').name, 'leather padding')
  assert.deepEqual(readName('(only a remark)'), { name: '(only a remark)' })
})

test('a range cell is a step; a bound that is no number is kept as written', () => {
  assert.deepEqual(readRange('1 - 18'), { from: 1, to: 18 })
  assert.deepEqual(readRange('189 - see side'), { from: 189, range: '189 - see side' })
  assert.equal(readRange('Useful items:'), undefined)
})

test('Jewelcrafting: the ladder starts 1 - 34 Silver star rose quartz, 35 - 74 Electrum malachite', () => {
  const { ladder: l, refusals } = ladder('Jewelcrafting')
  assert.deepEqual(refusals, [])
  assert.deepEqual(l.steps[0], { from: 1, to: 34, item: 'Silver star rose quartz', materials: [] })
  assert.deepEqual(l.steps[1], { from: 35, to: 74, item: 'Electrum malachite', materials: [] })
  assert.equal(l.steps.length, 16)
  assert.equal(l.notes.length, 3)
  // Its one recipe with ingredients writes them in column B, under the item.
  const magnum = l.steps.find((s) => s.item === 'Champagne Magnum')!
  assert.deepEqual(magnum.materials.map((m) => m.name), ['Enchanted gold bar', 'Opal', 'Bottle'])
  assert.equal(magnum.note, 'Can start earlier if desired')
})

test('Blacksmithing: counts, returned tools, sub-combines nested, the side table kept apart', () => {
  const { ladder: l } = ladder('Blacksmithing')
  assert.deepEqual(l.steps[0], {
    from: 1,
    to: 18,
    item: 'Metal bits',
    note: 'save for later',
    materials: [{ name: 'small piece of ore', qty: 2 }, { name: 'water flask' }]
  })
  const breastplate = l.steps.find((s) => s.item === 'Imbued field breastplate')!
  assert.deepEqual([breastplate.from, breastplate.to], [189, 242])
  const jointing = breastplate.materials.find((m) => m.name === 'chain jointing')!
  assert.deepEqual(jointing.materials, [{ name: 'water flask' }, { name: 'file', returned: true }, { name: 'smithy hammer', returned: true }, { name: 'metal rings' }])
  const temper = breastplate.materials.find((m) => m.name === 'sea temper')!
  assert.deepEqual(temper.materials?.[2], { name: 'mug of seafoam', qty: 2, note: 'dropped from seafury cyclops in ocean of tears' })
  // The imbued-gem table in columns J and K belongs to no step.
  assert.ok(l.asides?.some((a) => a.col === 'J' && a.cells[0] === 'Rose quartz' && a.cells[1] === 'Erolissi Marr'))
  assert.ok(!JSON.stringify(l.steps).includes('Erolissi'))
  assert.equal(l.alternates.length, 1)
  assert.equal(l.alternates[0].item, 'Steel Arrowheads')
  assert.equal(l.alternates[0].note, 'requires following Karana')
  assert.equal(l.alternates[0].materials[1].name, 'Mark of Karana')
  assert.equal(l.alternates[0].materials[1].returned, true)
})

test('Fletching nests three deep, and Pottery keeps the bound it cannot read', () => {
  const arrows = ladder('Fletching').ladder.steps.find((s) => s.item === 'Mithril Champion Arrows')!
  const fletchings = arrows.materials.find((m) => m.name === 'Mithril Fletchings')!
  const knife = fletchings.materials!.find((m) => m.name === 'Mithril Working Knife')!
  assert.deepEqual(knife.materials!.map((m) => m.name), ['Water Flask', 'Hilt Mold', 'Dagger Blade Mold', 'Small Brick of Mithril'])
  assert.equal(fletchings.note, 'fletching')
  const idol = ladder('Pottery').ladder.steps.at(-1)!
  assert.deepEqual([idol.from, idol.to, idol.range, idol.item, idol.note], [189, undefined, '189 - see side', 'Unfired idol', 'XXX'])
})

test('every tradeskill tab of the fixture parses with no refusal and nothing unparsed', () => {
  const steps: Record<string, number> = {}
  for (const tab of ['Alchemy', 'Baking', 'Blacksmithing', 'Brewing', 'Fletching', 'Jewelcrafting', 'Pottery', 'Tailoring', 'Tinkering']) {
    const { ladder: l, refusals } = ladder(tab)
    assert.deepEqual(refusals, [], tab)
    assert.equal(l.unparsed, undefined, tab)
    steps[tab] = l.steps.length + l.alternates.length
  }
  assert.deepEqual(steps, { Alchemy: 6, Baking: 6, Blacksmithing: 10, Brewing: 6, Fletching: 6, Jewelcrafting: 16, Pottery: 7, Tailoring: 11, Tinkering: 5 })
})

test('a tab with no Leveling row, or a step with no item, is a layout refusal', () => {
  assert.match(parseLadder([['Notes:'], ['1 - 5', 'Thing']], 'tab').refusals[0].message, /no "Leveling:" row/)
  const bad = parseLadder([['Leveling:'], ['1 - 5']], 'tab')
  assert.equal(bad.refusals[0].kind, 'layout')
  assert.match(bad.refusals[0].message, /names no item/)
})

test('Welcome gives the credit, the version and the date; Overview its two sections', () => {
  assert.deepEqual(readWelcome(fixtureGrid('Welcome')), {
    author: 'Zakarsis Moonstalker - Iksar Monk / Druid / Enchanter',
    server: 'Neriak',
    version: '1.8 (wip)',
    lastUpdate: '11/19/26'
  })
  const overview = readOverview(fixtureGrid('Overview'))
  assert.deepEqual(overview.map((s) => [s.heading, s.lines.length]), [['Notes', 5], ['Stats', 6]])
})

// ---- the .ods reader ---------------------------------------------------------------------------------------

test('the .ods fixture opens with node:zlib alone: nine tables, no formula, no link', () => {
  const book = readOds(files.get('kornerstore.ods')!)
  assert.deepEqual(book.tables.map((t) => t.name), ['Lets_get_Crafting!', 'Alchemy', 'Baking', 'Blacksmithing', 'Brewing', 'Fletching', 'Jewel_Crafting', 'Pottery', 'Tailoring'])
  assert.deepEqual(book.formulas, [])
  assert.deepEqual(book.links, [])
  // Trailing cells and rows repeated 16,384 and a million times are not kept.
  assert.ok(book.tables.every((t) => t.rows.length < 100 && t.rows.every((r) => r.length < 12)))
})

test('repeat counts are capped, entities decoded, formulas and links flagged, comments left out', () => {
  const cell = (inner: string, attrs = ''): string => `<table:table-cell${attrs}>${inner}</table:table-cell>`
  const xml = `<office:spreadsheet><table:table table:name="T &amp; U">
    <table:table-row>${cell('<text:p>a &lt; b</text:p>')}${cell('<text:p>x</text:p>', ' table:number-columns-repeated="3"')}<table:table-cell table:number-columns-repeated="16384"/></table:table-row>
    <table:table-row table:number-rows-repeated="1048576"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>
    <table:table-row>${cell('<text:p>4</text:p>', ' table:formula="of:=2+2"')}${cell('<text:p><text:a xlink:href="x">click</text:a></text:p>')}${cell('<office:annotation><text:p>hidden</text:p></office:annotation><text:p>seen</text:p><text:p>two</text:p>')}</table:table-row>
    <table:table-row table:number-rows-repeated="1048576"><table:table-cell/></table:table-row>
  </table:table></office:spreadsheet>`
  const book = parseOdsContent(xml)
  assert.equal(book.tables[0].name, 'T & U')
  const rows = book.tables[0].rows
  assert.deepEqual(rows[0], ['a < b', 'x', 'x', 'x'])
  assert.equal(rows.length, 258, 'one row, 256 kept of a million blank ones, one row; trailing blanks dropped')
  assert.deepEqual(rows.at(-1), ['4', 'click', 'seen\ntwo'])
  assert.deepEqual(book.formulas, [{ table: 'T & U', row: 258, col: 1 }])
  assert.deepEqual(book.links, [{ table: 'T & U', row: 258, col: 2 }])
})

test('bytes that are no spreadsheet are refused: a web page, another kind of zip, no content.xml, one that inflates too far', () => {
  const mimetype = { name: 'mimetype', data: bytesOf(ODS_MIME), store: true }
  const refused = (bytes: Uint8Array, why: RegExp): void => {
    assert.throws(() => readOds(bytes), (e: unknown) => e instanceof PullRefusal && e.kind === 'response' && why.test(e.message))
  }
  refused(bytesOf('<!DOCTYPE html><html><body>Sign in</body></html>'), /not a zip/)
  refused(zipOf([{ name: 'word/document.xml', data: bytesOf('<w:document/>') }]), /not an OpenDocument spreadsheet/)
  refused(zipOf([mimetype, { name: 'styles.xml', data: bytesOf('<x/>') }]), /no content\.xml/)
  // A few kilobytes that inflate past the cap: the reader stops instead of holding them.
  refused(zipOf([mimetype, { name: 'content.xml', data: new Uint8Array(MAX_CONTENT_XML_BYTES + 1) }]), /does not inflate, or is over/)
  assert.equal(readOds(odsOf('<table:table table:name="A"><table:table-row><table:table-cell><text:p>ok</text:p></table:table-cell></table:table-row></table:table>')).tables[0].rows[0][0], 'ok')
})

// ---- the recipe book -----------------------------------------------------------------------------------------

const book = readOds(files.get('kornerstore.ods')!)
const recipes = (table: string) => {
  const grid = trimGrid(book.tables.find((t) => t.name === table)!.rows)
  return parseRecipeTable(takeCredit(grid).rows, table, foldTradeskill(table))
}

test('Jewel Crafting: trivial 146 Gold Malachite Bracelet, its bar from Amber in North Freeport at a loc', () => {
  const { list, refusals } = recipes('Jewel_Crafting')
  assert.deepEqual(refusals, [])
  const bracelet = list.recipes.find((r) => r.item === 'Gold Malachite Bracelet')!
  assert.equal(bracelet.trivial, 146)
  assert.deepEqual(bracelet.materials[0], { name: 'Enchanted Gold Bar', merchant: 'Amber', zone: 'North Freeport', loc: '-176, 207, 17' })
  assert.deepEqual(bracelet.materials[1], { name: 'Malachite', merchant: 'Jade', zone: 'North Freeport', loc: '-179,197, 3' })
  assert.deepEqual(bracelet.notes, ['Can use regular gold bars but sells for less'])
  assert.deepEqual(list.notes, ['Enchanting bars requires several levels in enchanter class'])
  // What is not a merchant stays as the author wrote it.
  const tiara = list.recipes.find((r) => r.item === 'Platinum Blue Diamond Tiara')!
  assert.deepEqual(tiara.materials[1], { name: 'Blue Diamond', sourceText: 'Dropped(Plane of Hate)' })
  assert.deepEqual(tiara.notes, ['Magical'])
  assert.deepEqual(list.unparsed, ['K7: i'], 'a stray cell beside the table is kept, not dropped')
})

test('Tailoring: trivial 222 Fleeting Quiver has four materials, each with what the guide says of its source', () => {
  const { list } = recipes('Tailoring')
  const quiver = list.recipes.find((r) => r.item === 'Fleeting Quiver')!
  assert.equal(quiver.trivial, 222)
  assert.deepEqual(quiver.materials, [
    { name: 'High Quality Lion Skin', zone: 'North Karana', sourceText: 'Highland Lions', notes: ['Bring Track....'] },
    { name: 'Fleeting Quiver Pattern', merchant: 'Klok Walrot', zone: 'New Sebi', loc: '286, -54' },
    { name: 'Griffon Feathers', zone: 'North Karana has the most', sourceText: 'Any griffon' },
    { name: 'Aviak Egg Oil', sourceText: 'Crafted (See Brewing)' }
  ])
  // A row holding only more about the source belongs to the material above it.
  assert.deepEqual(list.recipes[0].materials[0], {
    name: 'Spider Silk',
    qty: 2,
    zone: 'Popular spot is LGuk spiders undead side',
    sourceText: 'Most Spiders',
    notes: ['Popular Spots in EK with a spawn on a hill to West']
  })
  // A recipe of another tradeskill, under a heading, keeps both.
  const extract = list.recipes.find((r) => r.item === 'Evergreen Extract')!
  assert.deepEqual([extract.trivial, extract.tradeskill, extract.section], [36, 'Alchemy', 'Dark Green Dye crafting'])
  assert.deepEqual(extract.materials[1], { name: 'Empty Vial', merchant: 'Ulka', zone: 'Rathe Mountains', loc: '1734, 1288', notes: ['Go to buy when you farm bears for reinforced medicine bag'] })
})

test('several items under one level each become a recipe; remarks and tools are told apart', () => {
  const { list } = recipes('Baking')
  const filleted = list.recipes.filter((r) => r.item.startsWith('Filleted '))
  assert.deepEqual(filleted.map((r) => [r.trivial, r.item, r.materials.length]), [[143, 'Filleted Bear', 2], [143, 'Filleted Lion', 2], [143, 'Filleted Mammoth', 2], [143, 'Filleted Wolf', 2]])
  assert.deepEqual(filleted[0].materials[1], { name: 'Bear Meat', zone: 'Northwest Bear Hill Rathe Mountains', sourceText: 'Farmed' })
  const knife = list.recipes.find((r) => r.item === 'Filleting Knife')!
  assert.deepEqual([knife.trivial, knife.notes, knife.section], [76, ['Reusable'], 'Blacksmithing reusables required / Recipes for those provided below'])
  assert.deepEqual(list.unparsed, ['Pottery | Mixing Bowl (2 Steps)'])
  const fletching = recipes('Fletching').list
  const heads = fletching.recipes.find((r) => r.item === 'Mithril Arrow Heads')!
  assert.deepEqual([heads.trivial, heads.tradeskill], [42, 'Blacksmithing'])
  assert.deepEqual(heads.materials[0], { name: 'File', returned: true, sourceText: 'Crafted (Blacksmithing)' })
  const fletchings = fletching.recipes.find((r) => r.item === 'Mithril Fletchings')!
  assert.deepEqual([fletchings.trivial, fletchings.notes], [34, ["Feir'Dal Fletching Kit", 'Buy kit at Merchant Niwiny']])
})

test('the credit line is taken out of every table and kept as the credit', () => {
  assert.deepEqual(readCredit('Created by Myztikal on Halas!'), { credit: 'Created by Myztikal on Halas!', author: 'Myztikal', server: 'Halas' })
  const counts: Record<string, number> = {}
  for (const t of book.tables) {
    const grid = trimGrid(t.rows)
    assert.ok(JSON.stringify(grid).includes('Created by Myztikal'), `${t.name} carries the credit line`)
    const { rows, credit } = takeCredit(grid)
    assert.equal(credit?.author, 'Myztikal')
    assert.ok(!JSON.stringify(rows).includes('Created by'))
    const skill = foldTradeskill(t.name)
    if (skill === undefined) continue
    const { list, refusals } = parseRecipeTable(rows, t.name, skill)
    assert.deepEqual(refusals, [], t.name)
    assert.ok(!JSON.stringify(list).includes('Created by'))
    counts[skill] = list.recipes.length
  }
  assert.deepEqual(counts, { Alchemy: 6, Baking: 21, Blacksmithing: 9, Brewing: 4, Fletching: 8, Jewelcrafting: 7, Pottery: 2, Tailoring: 11 })
})

test('a table whose headings moved is a layout refusal, so no column is read as another', () => {
  const { refusals } = parseRecipeTable([['', 'Alchemy'], ['', 'Level', 'Item', 'Stuff']], 'table "Alchemy"')
  assert.deepEqual(refusals.map((r) => r.kind), ['layout', 'layout'])
})
