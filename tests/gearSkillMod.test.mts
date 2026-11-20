// GEAR TAB - the SKILL MOD column (owner, 2026-11-20: "there are things that improve fishing skill,
// baking skill, etc and those should be searchable on the gear tab like STR or WIS as a column").
//
// WHAT IS PINNED HERE:
//
//   1. THE PARSER (`shared/planner/skillMod.ts`) reads every shape the committed corpus states -
//      the strings below are the wiki's own, copied - wherever the phrase sits in a flag entry, for
//      any skill name. A mod with no readable percent (`Skill Mod: ?`) reads as nothing.
//   2. THE INDEX carries the answer on the row (`GearRow.skillMods`), absent when there is none, and
//      no flag in the corpus that states a number is dropped. Counts are floors (corpusFloor.mts).
//   3. THE COLUMN behaves like a stat's: pickable, stored, sortable both ways with absent last, and
//      a threshold token (`skillmod>0`) narrows to it. Its cell is the item's words, and it takes two
//      numeric columns' room.
//   4. A SEARCH reaches the skill by name through the haystack text (`skill mod fishing`).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import type { GearRow } from '../src/shared/planner/gear'
import {
  parseSkillMods,
  skillModPercent,
  skillModSearchText,
  skillModText,
  skillModsText,
  skillModsTitle
} from '../src/shared/planner/skillMod'
import {
  CORE_COLUMNS,
  PICKABLE_COLUMNS,
  columnLabel,
  columnUnits,
  columnsFor,
  defaultColumnPx,
  gearCellText,
  gearCellTitle,
  gearTableLayout,
  maxPercentColumns,
  numericColumnWidth,
  numericUnits,
  sortWithin,
  statText,
  visibleColumns
} from '../src/renderer/src/features/gear/gearColumns'
import {
  DEFAULT_GEAR_FILTERS,
  filterGearRows,
  parseGearQuery,
  readsDerivedOpts,
  scaleAll,
  sortGearRows,
  sortValue,
  type GearFilters,
  type GearSort
} from '../src/renderer/src/features/gear/gearFilter'
import { sanitizeColumns, sanitizeWidths, toggleColumn } from '../src/renderer/src/features/gear/gearPrefs'
import { sanitizeGearSort } from '../src/renderer/src/features/gear/areaMemory'
import { assertCorpusFloor } from './corpusFloor.mts'

// =================================================================================
// 1. THE PARSER
// =================================================================================

test('the parser reads every shape the corpus states - skill, percent, and the cap when there is one', () => {
  assert.deepEqual(parseSkillMods(['Skill Mod: Fishing +5% (10 Max)']), [{ skill: 'Fishing', percent: 5, cap: 10 }])
  assert.deepEqual(parseSkillMods(['Skill Mod: Fishing +2% (4 Max)']), [{ skill: 'Fishing', percent: 2, cap: 4 }])
  assert.deepEqual(parseSkillMods(['Skill Mod: Fishing 5%']), [{ skill: 'Fishing', percent: 5 }], 'a bare 5% is +5')
  assert.deepEqual(parseSkillMods(['Skill Mod: Baking +5%']), [{ skill: 'Baking', percent: 5 }])
  // Any skill, not only a tradeskill - and a name of two words stays whole.
  assert.deepEqual(parseSkillMods(['Skill Mod: Pick Lock +2% (8 Max)']), [{ skill: 'Pick Lock', percent: 2, cap: 8 }])
  // The flags as the pages carry them: the mod is one entry among others, and the rest say nothing.
  assert.deepEqual(parseSkillMods(['Attunable', 'Placeable', 'Quest', 'Skill Mod: Fishing +5% (10 Max)']), [
    { skill: 'Fishing', percent: 5, cap: 10 }
  ])
  assert.deepEqual(parseSkillMods(['Magic Item', 'No Drop']), [])
  assert.deepEqual(parseSkillMods([]), [])
})

test('a mod with no readable percent reads as NOTHING - absent, never a zero', () => {
  // The corpus's seventh page (Singed Armature Rod) states exactly this.
  assert.deepEqual(parseSkillMods(['Lore Equipped', 'No Trade', 'Skill Mod: ?']), [])
  assert.deepEqual(parseSkillMods(['Skill Mod: Fishing']), [], 'a skill with no number')
  assert.deepEqual(parseSkillMods(['Skill Mod: 5%']), [], 'a number with no skill')
  // The name never crosses a colon, so an unknown mod cannot borrow the NEXT fact's number.
  assert.deepEqual(parseSkillMods(['Skill Mod: ? Weight Reduction: 60% Capacity: 6']), [])
})

test('the phrase is found WHEREVER it sits in a flag entry, and more than once', () => {
  // One entry can hold several facts (a container page: `Weight Reduction: 60% Capacity: 6 ...`).
  assert.deepEqual(
    parseSkillMods(['Weight Reduction: 60% Capacity: 6 Skill Mod: Fishing +5% (10 Max) Size Capacity: MEDIUM Items: Arrows']),
    [{ skill: 'Fishing', percent: 5, cap: 10 }]
  )
  assert.deepEqual(parseSkillMods(['Skill Mod: Fishing +5% (10 Max) Skill Mod: Baking 3%']), [
    { skill: 'Fishing', percent: 5, cap: 10 },
    { skill: 'Baking', percent: 3 }
  ])
  assert.deepEqual(parseSkillMods(['Skill Mod: Fishing +5%', 'Skill Mod: Brewing +1% (2 Max)']), [
    { skill: 'Fishing', percent: 5 },
    { skill: 'Brewing', percent: 1, cap: 2 }
  ])
})

test('spelling noise folds: case, spacing, a sign, a decimal, a skill that starts with a digit', () => {
  assert.deepEqual(parseSkillMods(['skill mod:  Fishing   +5 %  ( 10 max )']), [{ skill: 'Fishing', percent: 5, cap: 10 }])
  assert.deepEqual(parseSkillMods(['Skill Mod: Tailoring -3%']), [{ skill: 'Tailoring', percent: -3 }])
  assert.deepEqual(parseSkillMods(['Skill Mod: Alchemy +2.5%']), [{ skill: 'Alchemy', percent: 2.5 }])
  assert.deepEqual(parseSkillMods(['Skill Mod: 1H Slashing +4%']), [{ skill: '1H Slashing', percent: 4 }])
  assert.deepEqual(parseSkillMods(['Skill Mod: Hand-to-Hand +3% (6 Max)']), [{ skill: 'Hand-to-Hand', percent: 3, cap: 6 }])
  assert.deepEqual(parseSkillMods(['Skill Mod: Sense  Traps 15%']), [{ skill: 'Sense Traps', percent: 15 }])
})

test('the words: a cell says `Fishing +5%`, the hover adds the cap, the sort reads the largest percent', () => {
  const pole = parseSkillMods(['Skill Mod: Fishing +5% (10 Max)'])
  assert.equal(skillModText(pole[0]), 'Fishing +5%')
  assert.equal(skillModsText(pole), 'Fishing +5%')
  assert.equal(skillModsTitle(pole), 'Fishing +5% (10 Max)')
  assert.equal(skillModText({ skill: 'Fishing', percent: 5 }), 'Fishing +5%', 'a bare 5% is shown signed')
  assert.equal(skillModsTitle([{ skill: 'Baking', percent: 5 }]), 'Baking +5%', 'no cap stated, none shown')
  assert.equal(skillModText({ skill: 'Tailoring', percent: -3 }), 'Tailoring -3%')
  const two = parseSkillMods(['Skill Mod: Fishing +2% (4 Max) Skill Mod: Baking +5%'])
  assert.equal(skillModsText(two), 'Fishing +2%, Baking +5%')
  assert.equal(skillModPercent(two), 5)
  assert.equal(skillModPercent([]), undefined)
  assert.equal(skillModPercent(undefined), undefined)
  assert.equal(skillModsText(undefined), '')
  // The haystack holds the NAME only: a number is a threshold's question, never a substring's.
  assert.equal(skillModSearchText(two), 'skill mod fishing skill mod baking')
  assert.equal(skillModSearchText(undefined), '')
})

// =================================================================================
// 2. THE INDEX, OVER THE COMMITTED CORPUS
// =================================================================================

const file = itemsJson as unknown as ItemDbFile
const rows = buildGearIndex(file).rows
const SKILL_MOD_FLAG = /skill\s*mod/i

test('no skill mod the corpus states with a NUMBER is dropped by the parser', () => {
  const unread: string[] = []
  const pages = new Set<string>()
  for (const entry of Object.values(file.items)) {
    for (const flag of entry.stats?.flags ?? []) {
      if (!SKILL_MOD_FLAG.test(flag)) continue
      pages.add(entry.page)
      if (parseSkillMods([flag]).length === 0) unread.push(flag)
    }
  }
  // Measured 2026-11-20: 7 pages state one, and the one left unread is `Skill Mod: ?`.
  console.log('skill mod pages', pages.size, 'unread', unread)
  assertCorpusFloor(pages.size, 7, 'pages stating a skill mod')
  assert.deepEqual(unread.filter((flag) => /\d/.test(flag)), [], 'a flag that states a number must parse')
})

test('a gear row carries its skill mods exactly when its flags state one, and absent otherwise', () => {
  const withMods = rows.filter((r) => r.skillMods !== undefined)
  for (const r of rows) {
    const read = parseSkillMods(r.flags)
    if (read.length === 0) assert.equal(r.skillMods, undefined, `${r.name} states none`)
    else assert.deepEqual(r.skillMods, read, `${r.name} carries what its flags state`)
  }
  // Measured 2026-11-20: six rows (five Fishing or Baking, one Pick Lock).
  console.log('skill mod rows', withMods.map((r) => `${r.name}: ${skillModsTitle(r.skillMods)} [${r.slots.join(' ')}]`))
  assertCorpusFloor(withMods.length, 6, 'gear rows with a skill mod')
  assert.ok(withMods.some((r) => r.skillMods?.some((m) => m.skill === 'Fishing') === true), 'a Fishing mod is on the tab')
  // The Gear tab lists equippable items only. A page with a readable mod and no slot would be left
  // out; printed so a refresh that adds one shows it (measured 2026-11-20: none).
  const rowNames = new Set(rows.map((r) => r.name.toLowerCase()))
  const notRows = Object.values(file.items)
    .filter((entry) => parseSkillMods(entry.stats?.flags ?? []).length > 0 && !rowNames.has((entry.name ?? entry.page).toLowerCase()))
    .map((entry) => entry.page)
  console.log('skill mod pages that are not gear rows', [...new Set(notRows)])
})

// =================================================================================
// FIXTURES - the corpus's own six pages and its unknown one, as rows
// =================================================================================

function row(name: string, flags: string[], over: Partial<GearRow> = {}): GearRow {
  const skillMods = parseSkillMods(flags)
  return {
    key: name.toLowerCase(),
    name,
    // The table's own widening (`gearData.toRow`): the name, then `skill mod <skill>` per mod.
    searchKey: `${name} ${skillModSearchText(skillMods)}`.toLowerCase(),
    slots: ['PRIMARY'],
    classes: [],
    races: ['ALL'],
    flags,
    quest: false,
    playerCrafted: false,
    stats: {},
    effects: [],
    ...(skillMods.length === 0 ? {} : { skillMods }),
    ...over
  }
}

const POLE = row('Collapsible Fishing Pole', ['Attunable', 'Placeable', 'Quest', 'Skill Mod: Fishing +5% (10 Max)'])
const FINERY = row("Angler's Finery", ['Attunable', 'Skill Mod: Fishing 5%'], { slots: ['HEAD'], stats: { STA: 17, AGI: -8, CHA: -8, SV_COLD: 10 } })
const BAIT = row('Catch-A-Lot Bait', ['Skill Mod: Fishing +2% (4 Max)'], { slots: ['AMMO'] })
const ULIORN = row("Uliorn's Fishing Pole", ['Magic Item', 'No Drop', 'Skill Mod: Fishing +2% (4 Max)'], { stats: { DEX: 3, STA: 2, INT: 3 } })
const CHOPPER = row('Worn Corpse Chopper', ['No Trade', 'Skill Mod: Baking +5%'], { skill: '1H Slashing', stats: { DMG: 7, DELAY: 23 } })
const LOCKPICKS = row('Mechanized Lockpicks', ['Attunable', 'Placeable', 'Skill Mod: Pick Lock +2% (8 Max)'])
const ROD = row('Singed Armature Rod', ['Lore Equipped', 'No Trade', 'Skill Mod: ?'], { stats: { HP: 5, DMG: 7, DELAY: 30 } })
const CROWN = row('Crown of King Tranix', [], { slots: ['HEAD'], stats: { AC: 13, CHA: 15 } })
const ALL = [CROWN, ULIORN, POLE, ROD, CHOPPER, BAIT, LOCKPICKS, FINERY]

function filters(over: Partial<GearFilters> = {}): GearFilters {
  return { ...DEFAULT_GEAR_FILTERS, eraOnly: false, ...over }
}
const names = (list: readonly GearRow[]): string[] => list.map((r) => r.name)
const found = (text: string): string[] => names(filterGearRows(ALL, filters({ text }))).sort()

// =================================================================================
// 3. THE COLUMN: PICKED, STORED, DRAWN, SORTED
// =================================================================================

test('SKILL MOD is in the picker beside the stats, and a stored pick, sort and width of it survive', () => {
  assert.ok(PICKABLE_COLUMNS.includes('SKILL_MOD'))
  assert.equal(PICKABLE_COLUMNS[PICKABLE_COLUMNS.indexOf('WEIGHT') + 1], 'SKILL_MOD', 'after the stat vector')
  assert.equal(PICKABLE_COLUMNS[PICKABLE_COLUMNS.length - 1], 'BIS', 'and BIS still closes the list')
  assert.equal(columnLabel('SKILL_MOD'), 'SKILL MOD')
  assert.deepEqual(sanitizeColumns(['AC', 'SKILL_MOD']), ['AC', 'SKILL_MOD'])
  assert.deepEqual(toggleColumn([...CORE_COLUMNS], 'SKILL_MOD'), [...CORE_COLUMNS, 'SKILL_MOD'], 'in vocabulary order')
  assert.deepEqual(sanitizeGearSort({ key: 'SKILL_MOD', dir: 'desc' }), { key: 'SKILL_MOD', dir: 'desc' })
  assert.deepEqual(sanitizeWidths({ SKILL_MOD: 140 }), { SKILL_MOD: 140 })
  assert.equal(readsDerivedOpts('SKILL_MOD'), false, 'the haste knob does not move it')
})

test('the cell is the item`s own words, the hover adds the cap, and a row that states none is blank', () => {
  assert.equal(gearCellText(POLE, 'SKILL_MOD'), 'Fishing +5%')
  assert.equal(gearCellTitle(POLE, 'SKILL_MOD'), 'Fishing +5% (10 Max)')
  assert.equal(gearCellText(FINERY, 'SKILL_MOD'), 'Fishing +5%')
  assert.equal(gearCellText(CHOPPER, 'SKILL_MOD'), 'Baking +5%')
  assert.equal(gearCellText(LOCKPICKS, 'SKILL_MOD'), 'Pick Lock +2%')
  assert.equal(gearCellText(CROWN, 'SKILL_MOD'), '', 'blank is "states none"')
  assert.equal(gearCellTitle(CROWN, 'SKILL_MOD'), undefined)
  assert.equal(gearCellText(ROD, 'SKILL_MOD'), '', 'an unknown mod (`Skill Mod: ?`) is not a stated one')
  // Every other column is unchanged: the number the sort reads, through `statText`.
  assert.equal(gearCellText(CROWN, 'AC'), statText(13, 'AC'))
  assert.equal(gearCellText(CHOPPER, 'RATIO'), statText(sortValue(CHOPPER, 'RATIO'), 'RATIO'))
  assert.equal(gearCellText(POLE, 'AC'), '')
  assert.equal(gearCellTitle(CROWN, 'AC'), undefined, 'a number needs no hover')
})

test('it sorts by the percent both ways, name breaks ties, and a row that states none is LAST either way', () => {
  assert.equal(sortValue(POLE, 'SKILL_MOD'), 5)
  assert.equal(sortValue(BAIT, 'SKILL_MOD'), 2)
  assert.equal(sortValue(CROWN, 'SKILL_MOD'), undefined)
  assert.equal(sortValue(ROD, 'SKILL_MOD'), undefined)
  const desc: GearSort = { key: 'SKILL_MOD', dir: 'desc' }
  assert.deepEqual(names(sortGearRows(ALL, desc)), [
    "Angler's Finery",
    'Collapsible Fishing Pole',
    'Worn Corpse Chopper',
    'Catch-A-Lot Bait',
    'Mechanized Lockpicks',
    "Uliorn's Fishing Pole",
    'Crown of King Tranix',
    'Singed Armature Rod'
  ])
  assert.deepEqual(names(sortGearRows(ALL, { key: 'SKILL_MOD', dir: 'asc' })), [
    'Catch-A-Lot Bait',
    'Mechanized Lockpicks',
    "Uliorn's Fishing Pole",
    "Angler's Finery",
    'Collapsible Fishing Pole',
    'Worn Corpse Chopper',
    'Crown of King Tranix',
    'Singed Armature Rod'
  ])
  // The plus-state does not move it: no page states how a tier changes a skill mod.
  const scaled = scaleAll(ALL, { full: 5, fraction: 0 })
  assert.deepEqual(scaled.map((r) => sortValue(r, 'SKILL_MOD')), ALL.map((r) => sortValue(r, 'SKILL_MOD')))
})

test('it takes TWO numeric columns` room, in both layouts, and the sums still add up', () => {
  assert.equal(columnUnits('SKILL_MOD'), 2)
  assert.equal(columnUnits('STR'), 1)
  const picked = columnsFor(['AC', 'HP', 'SKILL_MOD'], { key: 'AC', dir: 'desc' })
  assert.equal(numericUnits(picked), 4)
  const pct = (s: string): number => Number(s.replace('%', ''))
  const px = (s: string): number => Number(s.replace('px', ''))

  // Percentage mode: twice a numeric share, and the numeric columns together stay in their budget
  // (what `gearColumnPrefs.test.mts` sums for the plain columns, with the wide one in the sum).
  const percent = gearTableLayout(numericUnits(picked), true)
  assert.equal(percent.mode, 'percent')
  assert.equal(pct(percent.wide), 2 * pct(percent.numeric))
  assert.equal(numericColumnWidth(percent, 'SKILL_MOD'), percent.wide)
  assert.equal(numericColumnWidth(percent, 'AC'), percent.numeric)
  const identity = [percent.wish, percent.slot, percent.classes, percent.zone, percent.zoneLevel, percent.mob, percent.owned]
  const stated = [...picked.map((c) => numericColumnWidth(percent, c.key)), ...identity].reduce((sum, w) => sum + pct(w), 0)
  assert.ok(stated <= 85, `the item column keeps its share: ${String(stated)}% stated`)

  // Pixel mode: twice the pixels, and the table's floor counts it twice.
  const core = columnsFor([...CORE_COLUMNS, 'SKILL_MOD'], { key: 'AC', dir: 'desc' })
  assert.equal(numericUnits(core), CORE_COLUMNS.length + 2)
  assert.ok(numericUnits(core) > maxPercentColumns(true), 'the core plus it is past the percentage line with the drop trio drawn')
  const pixel = gearTableLayout(numericUnits(core), true)
  assert.equal(pixel.mode, 'pixel')
  assert.equal(px(pixel.wide), 2 * px(pixel.numeric))
  assert.equal(gearTableLayout(numericUnits(core), true, false).mode, 'percent', 'and inside it with the trio off')
  assert.equal(defaultColumnPx('SKILL_MOD'), 2 * defaultColumnPx('STR'), 'a dragged table gives it the same double room')
})

test('the derived seed never draws it: a sort on it with nothing picked falls to a drawn column', () => {
  const bySkill: GearSort = { key: 'SKILL_MOD', dir: 'desc' }
  assert.deepEqual(visibleColumns(bySkill).map((c) => c.key), [...CORE_COLUMNS])
  assert.deepEqual(sortWithin(bySkill, columnsFor(null, bySkill)), { key: 'AC', dir: 'desc' })
  // Picked, it is drawn and its sort stands.
  const picked = columnsFor(['AC', 'SKILL_MOD'], bySkill)
  assert.deepEqual(picked.map((c) => c.key), ['AC', 'SKILL_MOD'])
  assert.equal(sortWithin(bySkill, picked), bySkill)
})

// =================================================================================
// 4. NARROWING: THE THRESHOLD TOKEN AND THE SEARCH WORDS
// =================================================================================

test('`skillmod>0` keeps the items with a skill mod, and absent fails every operator', () => {
  assert.deepEqual(parseGearQuery('skillmod>0 skill_mod>=5').thresholds, [
    { key: 'SKILL_MOD', op: '>', value: 0 },
    { key: 'SKILL_MOD', op: '>=', value: 5 }
  ])
  assert.deepEqual(found('skillmod>0'), [
    "Angler's Finery",
    'Catch-A-Lot Bait',
    'Collapsible Fishing Pole',
    'Mechanized Lockpicks',
    "Uliorn's Fishing Pole",
    'Worn Corpse Chopper'
  ])
  assert.deepEqual(found('skill_mod>=5'), ["Angler's Finery", 'Collapsible Fishing Pole', 'Worn Corpse Chopper'])
  // The Crown and the unknown Rod state no percent, so "under 5%" is not a fact about them (law 1).
  assert.deepEqual(found('skillmod<5'), ['Catch-A-Lot Bait', 'Mechanized Lockpicks', "Uliorn's Fishing Pole"])
})

test('a search word reaches the SKILL: by its name, or every skill mod at once', () => {
  // `fishing` finds the hat as well as the poles - the name alone would have missed it.
  assert.deepEqual(found('fishing'), ["Angler's Finery", 'Catch-A-Lot Bait', 'Collapsible Fishing Pole', "Uliorn's Fishing Pole"])
  assert.deepEqual(found('baking'), ['Worn Corpse Chopper'])
  assert.deepEqual(found('pick lock'), ['Mechanized Lockpicks'])
  assert.deepEqual(found('skill mod'), names(ALL.filter((r) => r.skillMods !== undefined)).sort())
  assert.deepEqual(found('skill mod fishing'), found('fishing'), 'all four state a Fishing mod')
  assert.deepEqual(found('SKILL MOD Baking'), ['Worn Corpse Chopper'], 'case does not matter')
  // The unknown mod and the plain crown answer no skill search.
  assert.ok(!found('skill mod').includes('Singed Armature Rod'))
  // Words and the threshold compose in one box, ANDed.
  assert.deepEqual(found('fishing skillmod>=5'), ["Angler's Finery", 'Collapsible Fishing Pole'])
  assert.deepEqual(found('pole skillmod<5'), ["Uliorn's Fishing Pole"])
})
