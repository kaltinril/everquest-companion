// The Tradeskills workbench's "Gear that raises this skill" (owner, 2026-11-20: "recommended to
// the person if they are on tradeskills looking at fishing 'hey go get the angler hat or the
// fishing rod etc'"): the fold in src/shared/tradeskillGear.ts, on a fixture and on the committed
// Gear index.
//
// WHAT IS PINNED HERE:
//   1. WHICH rows a tradeskill lists: a row whose skill mod names it, any spelling folded by
//      `tradeskillOf`; a mod for another skill, a mod that lowers the skill and a row with no mod
//      are left out.
//   2. THE ORDER: largest percent first, then the higher cap, then the name.
//   3. THE ERA VERDICT is injected, and what it hides is counted.
//   4. THE GEAR SEARCH the panel's link sends is the text the Gear tab's haystack holds.
//   5. THE WORDS on screen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import { skillModSearchText, type SkillMod } from '../src/shared/planner/skillMod'
import {
  SKILL_GEAR_HEADING,
  skillGear,
  skillGearHeldText,
  skillGearHiddenText,
  skillGearModText,
  skillGearSearch,
  skillGearSlots,
  type SkillGearRow
} from '../src/shared/tradeskillGear'
import { TRADESKILLS, tradeskillOf } from '../src/shared/tradeskills'
import { assertCorpusFloor } from './corpusFloor.mts'

const row = (name: string, skillMods: SkillMod[] | undefined, slots: string[] = ['PRIMARY']): SkillGearRow =>
  ({ key: name.toLowerCase(), name, slots, ...(skillMods === undefined ? {} : { skillMods }) }) as SkillGearRow

// The corpus's own rows of 2026-11-20, as the Gear index states them.
const POLE = row('Collapsible Fishing Pole', [{ skill: 'Fishing', percent: 5, cap: 10 }])
const FINERY = row("Angler's Finery", [{ skill: 'Fishing', percent: 5 }], ['HEAD'])
const BAIT = row('Catch-A-Lot Bait', [{ skill: 'Fishing', percent: 2, cap: 4 }], ['AMMO'])
const ULIORN = row("Uliorn's Fishing Pole", [{ skill: 'Fishing', percent: 2, cap: 4 }])
const CHOPPER = row('Worn Corpse Chopper', [{ skill: 'Baking', percent: 5 }])
const LOCKPICKS = row('Mechanized Lockpicks', [{ skill: 'Pick Lock', percent: 2, cap: 8 }])
const CROWN = row('Crown of King Tranix', undefined, ['HEAD'])
const ALL = [CROWN, ULIORN, POLE, CHOPPER, BAIT, LOCKPICKS, FINERY]

const names = (lines: readonly { row: SkillGearRow }[]): string[] => lines.map((l) => l.row.name)

test('a tradeskill lists the rows whose skill mod names it: largest percent, then the higher cap, then the name', () => {
  const fishing = skillGear(ALL, 'Fishing')
  assert.deepEqual(names(fishing.lines), ['Collapsible Fishing Pole', "Angler's Finery", 'Catch-A-Lot Bait', "Uliorn's Fishing Pole"])
  assert.equal(fishing.eraHidden, 0)
  assert.deepEqual(names(skillGear(ALL, 'Baking').lines), ['Worn Corpse Chopper'])
  assert.deepEqual(fishing.lines[0]?.mod, { skill: 'Fishing', percent: 5, cap: 10 })
})

test('a tradeskill nothing raises has no lines and no search: the panel draws nothing', () => {
  const none = skillGear(ALL, 'Tailoring')
  assert.deepEqual(none.lines, [])
  assert.equal(none.search, '')
  assert.deepEqual(skillGear([], 'Fishing').lines, [])
  // Pick Lock is a skill, not a tradeskill: its item is on no workbench.
  for (const t of TRADESKILLS) assert.ok(!names(skillGear(ALL, t).lines).includes('Mechanized Lockpicks'), t)
})

test('the skill name is folded like a recipe word, and a mod that lowers the skill is not a recommendation', () => {
  const ring = row('Jeweler Ring', [{ skill: 'Jewelry Making', percent: 3 }], ['FINGER'])
  const loupe = row('Loupe', [{ skill: 'jewelcrafting', percent: 4 }], ['RANGE'])
  const cursed = row('Cursed Thimble', [{ skill: 'Tailoring', percent: -3 }], ['FINGER'])
  const jewel = skillGear([ring, loupe, cursed], 'Jewelcrafting')
  assert.deepEqual(names(jewel.lines), ['Loupe', 'Jeweler Ring'])
  assert.deepEqual(skillGear([ring, loupe, cursed], 'Tailoring').lines, [])
  // The search is the first line's own spelling: that is what the Gear haystack holds for it.
  assert.equal(jewel.search, 'skill mod jewelcrafting')
})

test('an item with several mods is listed once per tradeskill, by its largest mod for that one', () => {
  const both = row('Kitchen Rod', [
    { skill: 'Fishing', percent: 2, cap: 4 },
    { skill: 'Baking', percent: 5 },
    { skill: 'Fishing', percent: 3 }
  ])
  assert.deepEqual(skillGear([both], 'Fishing').lines.map((l) => l.mod), [{ skill: 'Fishing', percent: 3 }])
  assert.deepEqual(skillGear([both], 'Baking').lines.map((l) => l.mod), [{ skill: 'Baking', percent: 5 }])
})

test('the era verdict is injected: a hidden item leaves the list and is counted', () => {
  const eraOnly = skillGear(ALL, 'Fishing', (r) => r.name === "Angler's Finery" || r.name === 'Worn Corpse Chopper')
  assert.deepEqual(names(eraOnly.lines), ['Collapsible Fishing Pole', 'Catch-A-Lot Bait', "Uliorn's Fishing Pole"])
  assert.equal(eraOnly.eraHidden, 1, 'only the hidden item that raises THIS tradeskill is counted')
  const all = skillGear(ALL, 'Baking', () => true)
  assert.deepEqual(all.lines, [])
  assert.equal(all.eraHidden, 1)
  assert.equal(all.search, '', 'nothing listed, nothing to search for')
})

test('the Gear search the link sends is the text the Gear haystack holds for the row', () => {
  const fishing = skillGear(ALL, 'Fishing')
  assert.equal(fishing.search, 'skill mod fishing')
  for (const line of fishing.lines) {
    assert.ok(skillModSearchText(line.row.skillMods).includes(fishing.search), `${line.row.name} is reached by "${fishing.search}"`)
  }
  assert.equal(skillGearSearch('Pick Lock'), 'skill mod pick lock')
})

test('the words on screen: the mod without the skill name, the slots, held or not, what the era hid', () => {
  assert.equal(skillGearModText({ skill: 'Fishing', percent: 5, cap: 10 }), '+5% (10 Max)')
  assert.equal(skillGearModText({ skill: 'Baking', percent: 5 }), '+5%')
  assert.equal(skillGearModText({ skill: 'Pick Lock', percent: 2, cap: 8 }), '+2% (8 Max)', 'a two-word skill name is taken off whole')
  assert.equal(skillGearSlots(FINERY), 'HEAD')
  assert.equal(skillGearSlots(row('Two Slot', [], ['PRIMARY', 'SECONDARY'])), 'PRIMARY SECONDARY')
  assert.equal(skillGearSlots(row('No Slot', [], [])), '')
  assert.equal(skillGearHeldText(0), 'not held')
  assert.equal(skillGearHeldText(2), 'you have 2')
  assert.equal(skillGearHiddenText(0), null)
  assert.equal(skillGearHiddenText(3), '3 out of era, hidden')
  assert.equal(SKILL_GEAR_HEADING, 'Gear that raises this skill')
})

test('on the committed Gear index: every tradeskill mod lands on its workbench, in order, and Fishing has gear', () => {
  const rows = buildGearIndex(itemsJson as unknown as ItemDbFile).rows
  let listed = 0
  for (const tradeskill of TRADESKILLS) {
    const found = skillGear(rows, tradeskill)
    listed += found.lines.length
    for (const [i, line] of found.lines.entries()) {
      assert.equal(tradeskillOf(line.mod.skill), tradeskill, `${line.row.name} names ${tradeskill}`)
      assert.ok(line.mod.percent > 0, `${line.row.name} raises the skill`)
      const before = found.lines[i - 1]
      if (before !== undefined) assert.ok(before.mod.percent >= line.mod.percent, `${tradeskill}: ${before.row.name} is not under ${line.row.name}`)
    }
    assert.equal(found.search === '', found.lines.length === 0, `${tradeskill}: a search exactly when there are lines`)
  }
  // Every row whose mod names a tradeskill with a positive percent is on exactly one or more lists.
  const expected = rows.filter((r) => (r.skillMods ?? []).some((m) => tradeskillOf(m.skill) !== undefined && m.percent > 0)).length
  const fishing = skillGear(rows, 'Fishing')
  console.log('tradeskill gear', TRADESKILLS.map((t) => `${t}: ${skillGear(rows, t).lines.map((l) => `${l.row.name} ${skillGearModText(l.mod)} [${skillGearSlots(l.row)}]`).join('; ')}`).filter((s) => !s.endsWith(': ')))
  // Measured 2026-11-20: five rows (four Fishing, one Baking).
  assertCorpusFloor(expected, 5, 'gear rows whose skill mod names a tradeskill')
  assert.ok(listed >= expected, 'none is dropped')
  assertCorpusFloor(fishing.lines.length, 4, 'gear that raises Fishing')
})
