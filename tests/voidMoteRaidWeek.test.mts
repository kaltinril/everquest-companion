// THE RAID WEEK IN THE VOID MOTE HOURS (tester Malkil, 2026-11-23, relayed by the owner: "I don't
// think it's taking into consideration that multiple mobs can drop it ... raids can be run once a
// day, with the first raid each week dropping multiple items from [Lord Nagafen, Lady Vox,
// Cazic-Thule, Innoruuk, Master Yael] and only a single item on subsequent runs. Also, Slime Blood
// is a special case in which it has an increased chance to drop from minibosses in Fear on
// subsequent runs after the first each week").
//
// Checked against the owner's logs first (plans/2026-11-19-void-mote-ranking.md, 2026-11-23): every
// listed dropper was already summed, but Cazic-Thule was counted twice under two spellings; later
// kills in a week at D4 gave Cazic-Thule 1, 2 and 0 items; Dread, Fright and Terror gave Slime Blood
// on 8 of 9 later-week D4 kills and on 1 of 15 week-first kills (the owner's own loot lines).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ItemSource } from '../src/shared/itemSources'
import type { MobEntry } from '../src/shared/mobTypes'
import { RERUN_BOSSES, RERUN_FAVOURS, SUPPLY, itemSupply } from '../src/shared/planner/itemSupply'
import { supplyContextOf } from '../src/shared/planner/supplyContext'
import { MOTE_RULES, moteGate, moteHours } from '../src/shared/planner/voidMotes'
import { moteSourceText } from '../src/renderer/src/features/gear/voidMotePrefs'

const loot = (n: number, ...named: string[]): string[] => [...named, ...Array.from({ length: n - named.length }, (_, i) => `Other ${String(i)}`)]
const mob = (page: string, name: string, drops: string[]): MobEntry => ({ page, name, level: '55', zones: ['Plane of Fear'], drops })

const SLIME = 'Slime Blood of Cazic-Thule'
const SHIELD = 'Shield of Rainbow Hues'
const MOBS: MobEntry[] = [
  mob('Cazic-Thule (God)', 'Cazic Thule', loot(18, SHIELD)),
  mob('Dread', 'Dread', loot(18, SLIME, SHIELD)),
  mob('A dracoliche', 'a dracoliche', loot(12, SHIELD))
]
const CTX = supplyContextOf(
  {
    mobs: MOBS,
    respawns: [],
    targets: [
      { name: 'Cazic Thule', category: 'Plane of Fear', match: ['Cazic Thule', 'Cazic-Thule'], zone: 'Plane of Fear' },
      { name: 'Dread', category: 'Plane of Fear', match: ['Dread'], zone: 'Plane of Fear' },
      { name: 'A dracoliche', category: 'Plane of Fear', match: ['a dracoliche'], zone: 'Plane of Fear' }
    ],
    quests: [],
    sky: [],
    groups: {}
  },
  new Map()
)

const FEAR = ['Plane of Fear']
/** The catalog's road (with its page) and the item page's road for the same god. */
const CAZIC: ItemSource = { mob: 'Cazic Thule', zones: FEAR, mobPage: 'Cazic-Thule (God)' }
const CAZIC_GOD: ItemSource = { mob: 'Cazic Thule (God)', zones: FEAR }
const DREAD: ItemSource = { mob: 'Dread', zones: FEAR, mobPage: 'Dread' }
const DRACO: ItemSource = { mob: 'a dracoliche', zones: FEAR, mobPage: 'A dracoliche' }

const supply = (name: string, sources: ItemSource[]) => itemSupply({ key: name.toLowerCase(), playerCrafted: false }, sources, CTX)

test('the constants are named and default to daily', () => {
  assert.equal(SUPPLY.lockoutRerunsPerWeek, 6, 'the week has seven days; the first kill is the full-loot one')
  assert.equal(SUPPLY.lockoutRerunDrops, 1)
  assert.deepEqual([...RERUN_BOSSES].sort(), ['cazic thule', 'innoruuk', 'lady vox', 'lord nagafen', 'master yael'])
  assert.deepEqual(RERUN_FAVOURS.map((f) => [f.item, [...f.mobs]]), [['slime blood of cazic-thule', ['dread', 'fright', 'terror']]])
})

test('every road is summed once: one mob under two spellings is one road', () => {
  const once = supply(SHIELD, [CAZIC])
  const twice = supply(SHIELD, [CAZIC, CAZIC_GOD])
  assert.equal(twice.roads, 1, 'the catalog writes Cazic Thule, the item page Cazic Thule (God)')
  assert.equal(twice.perWeek, once.perWeek)
  assert.equal(supply(SHIELD, [CAZIC, DREAD, DRACO]).roads, 3, 'different mobs still add')
})

test("one of the five raid bosses: the week's first kill is full loot, and each later kill, up to daily, one drop from its own table", () => {
  const s = supply(SHIELD, [CAZIC])
  // First kill: 2 drops over 18 items. Six later kills: 1 over 18 each. A +4 copy is 16, halved for a raid.
  const expected = ((2 / 18) * SUPPLY.raidKillsPerWeek + (1 / 18) * SUPPLY.lockoutRerunsPerWeek) * 16 / 2
  assert.equal(s.perWeek, Math.round(expected * 1000) / 1000)
  assert.deepEqual([s.kills, s.rerun], [7, 0.056])
  assert.equal(moteSourceText(s), 'Raid boss: weekly kill, 1 in 9; daily repeats, 1 in 18')
})

test('a raid mob that is not one of the five keeps its one weekly kill', () => {
  const s = supply(SHIELD, [DRACO])
  assert.deepEqual([s.kills, s.rerun, s.perWeek], [1, undefined, Math.round((2 / 12) * 8 * 1000) / 1000])
  assert.equal(supply(SHIELD, [DREAD]).rerun, undefined, "a Fear miniboss's later kill favours Slime Blood, not the shield")
})

test("Slime Blood: Fear's minibosses' later kills in the week drop it at the measured rate", () => {
  const s = supply(SLIME, [DREAD])
  const fav = RERUN_FAVOURS[0]?.chance ?? 0
  assert.equal(fav, 8 / 9, '8 of 9 later-week D4 kills, owner logs Oct 15 to Oct 29')
  assert.equal(s.perWeek, Math.round(((2 / 18) + fav * SUPPLY.lockoutRerunsPerWeek) * 8 * 1000) / 1000)
  assert.equal(moteSourceText(s), 'Raid boss: weekly kill, 1 in 9; daily repeats, 89% of kills')
  assert.ok(moteHours(7, s).hours < moteHours(7, supply(SHIELD, [DREAD])).hours / 5, 'far quicker than a shield from the same mob')
})

test("the owner's rules are unchanged: +7 floor, the +5/+6 exception for scarce copies only", () => {
  assert.equal(MOTE_RULES.minTier, 7)
  assert.equal(MOTE_RULES.rareMinTier, 5)
  const slime = supply(SLIME, [DREAD])
  assert.equal(moteGate(6, slime), 'early')
  assert.equal(moteGate(7, slime), 'pick')
})
