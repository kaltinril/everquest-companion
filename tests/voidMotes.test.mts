// WHERE A VOID MOTE GOES (owner asks, 2026-11-18 and 2026-11-19): `shared/planner/itemSupply.ts`
// prices how fast copies of an item come in, `shared/planner/voidMotes.ts` ranks the worn items a
// Void-Touched Potential could lift, and `features/gear/voidMotePrefs.ts` holds the tab's words.
// Hand-built pages shaped after the real ones: the rules are what is pinned, not today's corpus.
// The owner's own examples are tests by name (plans/2026-11-19-void-mote-ranking.md).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceIndex, sourceItemKey } from '../src/shared/itemSources'
import type { MobEntry } from '../src/shared/mobTypes'
import type { GearRow } from '../src/shared/planner/gear'
import type { PlannerInventoryHost } from '../src/shared/planner/inventorySlots'
import { SUPPLY, itemSupply, mobKey, raidFactsOf, type ItemSupply } from '../src/shared/planner/itemSupply'
import { procSeatSwings } from '../src/shared/planner/rules'
import { supplyContextOf } from '../src/shared/planner/supplyContext'
import type { EquipSlot, PlanSlotId } from '../src/shared/planner/types'
import {
  MOTE_RULES,
  isMoteReady,
  moteAdvice,
  moteGate,
  moteHours,
  motePlan,
  moteUnranked,
  planMotesOn,
  sortMoteAdvice
} from '../src/shared/planner/voidMotes'
import {
  DEFAULT_MOTE_PREFS,
  moteChangesText,
  moteCopiesText,
  moteGainText,
  moteGateText,
  moteHoursText,
  motePlanLine,
  moteSourceText,
  moteSourceTitle,
  moteTargetLabel,
  moteUnrankedText,
  sanitizeMotePrefs
} from '../src/renderer/src/features/gear/voidMotePrefs'
import { seatIsLive } from '../src/renderer/src/features/character/socketRecommend'

// ---- the pages ----------------------------------------------------------------------------------

/** `n` loot names, the listed ones first. */
const loot = (n: number, ...named: string[]): string[] => [...named, ...Array.from({ length: n - named.length }, (_, i) => `Other ${String(i)}`)]
/** A catalog page: its name, `zone|level`, and its loot list. */
const mob = (name: string, at: string, drops: string[], over: Partial<MobEntry> = {}): MobEntry => ({
  page: name,
  name,
  level: at.split('|')[1] ?? '',
  zones: [at.split('|')[0] ?? ''],
  drops,
  ...over
})

const FEAR = ['Slime Blood of Cazic-Thule', 'Shield of Rainbow Hues']
const MOBS: MobEntry[] = [
  mob('Innoruuk', 'Plane of Hate|60', loot(16, 'Bloodstar Pendant')),
  mob('a forsaken revenant', 'Plane of Hate|51', loot(29, 'Indicolite Vambraces')),
  mob('Dread', 'Plane of Fear|55', loot(18, ...FEAR)),
  mob('Fright', 'Plane of Fear|55', loot(18, ...FEAR)),
  mob('Terror', 'Plane of Fear|55', loot(16, ...FEAR)),
  mob('Lord Rikantus Everling', 'Nektropos Castle|65', loot(5, "Blood's Unity")),
  // A dungeon's trash with a long list: the owner's "Rare drop from random trash in an instance".
  mob('a ghoul knight', 'Lower Guk|45', loot(30, 'Rare Trash Blade'), { loc: [{ ns: 0, ew: 0, pct: 100 }, { ns: 1, ew: 1, pct: 100 }] }),
  mob('Discarded Experiment', 'Lake Nerius|48', ['Earring of Experimentation']),
  // The owner's "many kinds of skeleton in many zones".
  mob('a skeleton', 'Najena|20', loot(3, 'Bone Chip Ring')),
  mob('a decaying skeleton', 'Befallen|8', loot(3, 'Bone Chip Ring')),
  mob('a dusty skeleton', 'Unrest|25', loot(3, 'Bone Chip Ring')),
  mob('an orc centurion', 'Crushbone|8', loot(3, 'Crushbone Belt')),
  mob('a kerran tiger spahi', 'Kerra Isle|30', loot(5, 'Heretic Insurrection Orders')),
  mob('a kerran amir', 'Kerra Isle|32', loot(5, 'Desecrated Kejaar Totem'))
]

const SOURCES = buildSourceIndex(MOBS)
const CTX = supplyContextOf(
  {
    mobs: MOBS,
    respawns: [
      { key: 'discarded experiment', page: 'Discarded Experiment', text: '12 min', seconds: 720 },
      { key: 'lord rikantus everling', page: 'Lord Rikantus Everling', text: '~15 minutes', seconds: 900 }
    ],
    targets: [
      { name: 'Innoruuk', category: 'Plane of Hate', match: ['Innoruuk, the Prince of Hate', 'Innoruuk'], zone: 'Plane of Hate' },
      ...['Dread', 'Fright', 'Terror', 'Cazic Thule'].map((name) => ({ name, category: 'Plane of Fear', match: [name], zone: 'Plane of Fear' })),
      { name: 'Eye of Veeshan', category: 'Plane of Sky', match: ['Eye of Veeshan'], zone: 'Plane of Sky — Island 8' },
      { name: 'Lord Nagafen', category: 'Open World', match: ['Lord Nagafen'], zone: "Nagafen's Lair" }
    ],
    quests: [{ name: 'This Means Warrr', rewards: [{ name: 'Talisman of Kejaar Kerrath' }], requiredItems: ['Heretic Insurrection Orders', 'Desecrated Kejaar Totem'] }],
    sky: [
      {
        name: 'Ranger Test of Ranged Attack',
        reward: 'Windstriker',
        items: [
          { name: 'Shimmering Pearl', who: ['EoV'], where: 'Island 8', count: 1 },
          { name: 'Wind Rune Heda', who: ['random drop — any Plane of Sky mob'], where: 'Plane of Sky', count: 1 }
        ]
      }
    ],
    groups: {}
  },
  SOURCES
)

const supplyOf = (name: string, crafted = false): ItemSupply => itemSupply({ key: sourceItemKey(name), playerCrafted: crafted }, SOURCES.get(sourceItemKey(name)) ?? [], CTX)

/** A gear row with the supply the build would give it. */
function gear(name: string, over: Partial<GearRow> = {}): GearRow {
  const key = name.toLowerCase()
  const supply = supplyOf(name, over.playerCrafted === true)
  return {
    key,
    name,
    searchKey: key,
    slots: ['CHEST'],
    classes: [],
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: { AC: 30 },
    effects: [],
    ...(supply.roads === 0 ? {} : { supply }),
    ...over
  }
}

const CELLS = ['CHEST', 'LEGS', 'ARMS', 'HEAD', 'FEET', 'HANDS'] as const

function worn(rows: readonly GearRow[], tiers: readonly (number | undefined)[]): { hosts: PlannerInventoryHost[]; byKey: Map<string, GearRow> } {
  const hosts = rows.map((r, i) => {
    const host: PlannerInventoryHost = { slot: CELLS[i] ?? 'ANY1', name: r.name, key: r.key }
    const tier = tiers[i]
    if (tier !== undefined) host.tier = tier
    return host
  })
  return { hosts, byKey: new Map(rows.map((r) => [r.key, r])) }
}

const OPTS = { target: 'AC', classes: [] } as const
const perWeek = (name: string): number => supplyOf(name).perWeek ?? Number.NaN

// ---- how fast copies come in --------------------------------------------------------------------

test('raidFactsOf and mobKey: match names and a page suffix fold, and only a zone the roster names a category after is a raid zone', () => {
  const raid = raidFactsOf([
    { name: 'Thunder Spirit Princess', category: 'Plane of Sky', match: ['a thunder spirit princess'], zone: 'Plane of Sky — Island 1' },
    { name: 'Lord Nagafen', category: 'Open World', match: ['Lord Nagafen'], zone: "Nagafen's Lair" }
  ])
  assert.ok(raid.mobs.has('thunder spirit princess'), 'the leading article is folded')
  assert.deepEqual([...raid.zones], ['plane of sky'], 'the island suffix is cut; a dragon lair is not a raid zone')
  assert.equal(mobKey('Cazic Thule (God)'), 'cazic thule', 'the item page writes the god with a suffix the roster lacks')
})

test('itemSupply: a raid target is one kill a week, its chance its loot list, and it is marked hard', () => {
  const s = supplyOf('Bloodstar Pendant')
  assert.deepEqual([s.kind, s.from, s.kills, s.chance, s.hard], ['raid', 'Innoruuk', SUPPLY.raidKillsPerWeek, 0.125, ['raid']])
  // 2 drops a kill over 16 items, one +4 copy (16), halved for a raid: 1 experience a week.
  assert.equal(s.perWeek, 1)
})

test('itemSupply: what a page does not state is assumed at its default and listed', () => {
  const trash = supplyOf('Indicolite Vambraces')
  assert.equal(trash.kind, 'raidZone', 'a mob inside a raid zone that is no target')
  assert.deepEqual(trash.assumed, ['spawn'], 'its page lists no spawn points')
  const camp = supplyOf('Crushbone Belt')
  assert.deepEqual(camp.assumed, ['respawn', 'spawn'])
  assert.equal(supplyOf('Earring of Experimentation').assumed, undefined, 'a named mob with a stated respawn assumes nothing')
  assert.equal(supplyOf('Earring of Experimentation').respawn, 720)
})

test('itemSupply: a mob far over the level cap, and one with a hand-listed mechanic, is slower to farm (Lord Rick)', () => {
  const s = supplyOf("Blood's Unity")
  assert.deepEqual(s.hard, ['level', 'mechanics'])
  // 1 in 5 over 80 kills a week at +4 is 256; level 65 divides by 4 and the mechanic by 2.
  assert.equal(s.perWeek, 32)
})

test('itemSupply: a quest reward is as fast as its slowest part, and each copy is +0', () => {
  const farmed = supplyOf('Talisman of Kejaar Kerrath')
  assert.deepEqual([farmed.kind, farmed.from], ['quest', 'This Means Warrr'])
  // One part: 0.4 over 5 items, 24 kills an hour over 20 hours: 38.4 turn-ins a week, 1 each.
  assert.equal(farmed.perWeek, 38.4)
  const sky = supplyOf('Windstriker')
  assert.deepEqual([sky.kind, sky.hard], ['quest', ['raid']], 'its slowest part is an island boss: one kill a week')
  assert.ok((sky.perWeek ?? 1) < 0.1, String(sky.perWeek))
})

test('itemSupply: crafted is counted at +0 a copy, and no stated road claims nothing', () => {
  const crafted = supplyOf('Fine Plate Helm', true)
  assert.deepEqual([crafted.kind, crafted.assumed], ['crafted', ['source']])
  assert.deepEqual(supplyOf('Nobody Lists This'), { kind: 'unknown', roads: 0, assumed: ['source'] })
})

test("THE OWNER'S ORDER OF SCARCITY: a weekly raid boss's drop, then a raid zone's trash, then a rare drop from a dungeon's trash, then a named camp, then a common drop from many mobs", () => {
  const order = ['Bloodstar Pendant', 'Indicolite Vambraces', 'Rare Trash Blade', 'Earring of Experimentation', 'Bone Chip Ring']
  const rates = order.map(perWeek)
  for (let i = 1; i < rates.length; i++) assert.ok((rates[i - 1] ?? 0) < (rates[i] ?? 0), `${order[i - 1] ?? ''} ${String(rates[i - 1])} < ${order[i] ?? ''} ${String(rates[i])}`)
  assert.equal(supplyOf('Bone Chip Ring').roads, 3, 'every mob that drops it adds to the supply')
})

// ---- hours, and the tier gate -------------------------------------------------------------------

test('moteHours: the tier over copies plus the share of ordinary motes; no stated road counts motes alone', () => {
  // +7 is 128 experience; motes bring 4.55 an hour and one item's share of them is a twentieth.
  assert.deepEqual(moteHours(7, undefined), { hours: 562.6, road: 'motes' })
  assert.deepEqual(moteHours(7, { kind: 'unknown', roads: 0 }), { hours: 562.6, road: 'motes' })
  const farm = moteHours(7, supplyOf('Earring of Experimentation'))
  assert.equal(farm.road, 'copies')
  assert.ok(farm.hours < 2, String(farm.hours))
  assert.ok(moteHours(9, undefined).hours > moteHours(8, undefined).hours * 2, 'each tier costs more than twice the last')
})

test("THE OWNER'S RULE: an item below +7 is not recommended, however scarce a raid drop it is", () => {
  const raidDrop = supplyOf('Bloodstar Pendant')
  assert.equal(moteGate(6, raidDrop), 'early')
  assert.equal(moteGate(5, raidDrop), 'early')
  assert.equal(moteGate(7, raidDrop), 'pick')
  assert.equal(moteGate(6, undefined), 'early', 'no stated source is not evidence of scarcity')
  assert.equal(moteGate(9, supplyOf('Bone Chip Ring')), 'pick', 'the gate is the tier; the score ranks it low')
})

test("THE OWNER'S EXCEPTION: the Plane of Sky ranger bow is allowed at +5 or +6, and no lower", () => {
  const bow = supplyOf('Windstriker')
  assert.ok((bow.perWeek ?? 1) <= MOTE_RULES.rarePerWeek)
  assert.equal(moteGate(5, bow), 'rare')
  assert.equal(moteGate(6, bow), 'rare')
  assert.equal(moteGate(4, bow), 'early')
  assert.equal(moteGate(6, supplyOf('Talisman of Kejaar Kerrath')), 'early', 'a quest whose parts farm quickly is not the exception')
})

// ---- the advice ---------------------------------------------------------------------------------

test('moteAdvice: one row per worn item below +10, read at the tier its name states', () => {
  const plate = gear('Plate', { stats: { AC: 30, STR: 20 } })
  const { hosts, byKey } = worn([plate, gear('Capped'), gear('Unknown To Corpus')], [3, 10, 2])
  byKey.delete('unknown to corpus')
  const list = moteAdvice(hosts, byKey, OPTS)
  assert.equal(list.length, 1, 'a +10 item and an item the corpus does not know are left out')
  const [a] = list
  assert.ok(a)
  // Worn on the chest: the +4 Proc socket is not named there (the Proc test below).
  assert.deepEqual([a.tier, a.copies, a.gate, a.opens], [3, 8, 'early', undefined])
  // floor(30 + 30 * 3 / 10) = 39 at +3, floor(30 + 30 * 4 / 10) = 42 at +4 (itemUpgrade's primary rule)
  assert.equal(a.gain, 3)
  assert.deepEqual(a.changes, [
    { key: 'AC', from: 39, to: 42 },
    { key: 'STR', from: 26, to: 28 }
  ])
  assert.equal(a.supply, undefined, 'no page lists it')
})

test('moteAdvice: the score is the gain times the hours, and a stat the item lacks scores nothing', () => {
  const { hosts, byKey } = worn([gear('Bloodstar Pendant'), gear('Late', { stats: { STR: 20 } })], [8, 8])
  const [a, none] = moteAdvice(hosts, byKey, OPTS)
  assert.ok(a && none)
  assert.equal(a.score, Math.round(a.gain * a.hours * 1000) / 1000)
  assert.deepEqual([none.gain, none.score], [0, 0])
})

test('moteAdvice: a Proc socket is named only where a proc can fire (the Exaltations tab offers none elsewhere)', () => {
  /** What the row of one item worn in `cell` at `tier` says the next tier opens. */
  const opens = (cell: PlanSlotId, tier: number, slots: EquipSlot[]): string | undefined => {
    const row = gear(`Worn in ${cell}`, { slots })
    const host: PlannerInventoryHost = { slot: cell, name: row.name, key: row.key, tier }
    const [advice] = moteAdvice([host], new Map([[row.key, row]]), OPTS)
    assert.ok(advice)
    return advice.opens
  }
  assert.equal(opens('CHEST', 3, ['CHEST']), undefined, 'nothing swings a breastplate')
  assert.equal(opens('FINGER2', 3, ['FINGER']), undefined)
  assert.equal(opens('PRIMARY', 3, ['PRIMARY', 'SECONDARY']), 'Proc')
  assert.equal(opens('SECONDARY', 3, ['SECONDARY']), 'Proc')
  assert.equal(opens('ANY1', 3, ['SECONDARY']), undefined, 'an off-hand item in an Any Slot cell is in no hand')
  assert.equal(opens('CHEST', 2, ['CHEST']), 'Worn', 'the other sockets are named on every cell')
  assert.equal(opens('CHEST', 4, ['CHEST']), undefined, 'no socket opens above +4')
  // One rule, read by both tabs: the seat the Exaltations tab offers a proc for.
  for (const slot of ['PRIMARY', 'SECONDARY', 'CHEST', 'EAR', null] as const) {
    assert.equal(seatIsLive({ type: 'Proc', slot }), procSeatSwings(slot), String(slot))
  }
  assert.deepEqual([procSeatSwings('PRIMARY'), procSeatSwings('SECONDARY'), procSeatSwings('RANGE'), procSeatSwings(null)], [true, true, false, false])
})

test('moteUnranked: a worn item the item data does not know is named, not dropped in silence', () => {
  const { hosts, byKey } = worn([gear('Plate'), gear('Capped'), gear('Unknown To Corpus')], [3, 10, 8])
  assert.deepEqual(moteUnranked(hosts, byKey), [], 'every worn item has its row')
  byKey.delete('unknown to corpus')
  assert.deepEqual(
    moteUnranked(hosts, byKey).map((h) => [h.key, h.tier]),
    [['unknown to corpus', 8]]
  )
  assert.equal(moteAdvice(hosts, byKey, OPTS).length, 1, 'the ranked list still leaves it out')
  byKey.delete('capped')
  assert.equal(moteUnranked(hosts, byKey).length, 1, 'an unknown item at +10 can take no mote, so it is not listed')
  assert.deepEqual(moteUnranked(hosts, new Map()), [], 'item data with nothing in it is unread, not a list of unknown items')
})

test('moteAdvice: a focus target scores through the role model, and the class gate decides what counts', () => {
  const { hosts, byKey } = worn([gear('Robe', { stats: { INT: 30 } })], [7])
  const [caster] = moteAdvice(hosts, byKey, { target: 'dd', classes: ['WIZ'] })
  const [melee] = moteAdvice(hosts, byKey, { target: 'dd', classes: ['WAR'] })
  assert.ok(caster && melee)
  assert.ok(caster.gain > 0, 'INT is a wizard mana stat')
  assert.equal(melee.gain, 0, 'INT is nothing to a warrior')
})

// ---- the order, and the owner's examples by name ------------------------------------------------

const names = (rows: readonly GearRow[], tiers: readonly number[]): string[] => {
  const { hosts, byKey } = worn(rows, tiers)
  return sortMoteAdvice(moteAdvice(hosts, byKey, OPTS), 'recommended').map((a) => a.name)
}

test("THE OWNER'S EXAMPLE: a weekly raid boss's drop outranks a rare drop from an instance's trash at the same tier", () => {
  assert.deepEqual(names([gear('Rare Trash Blade'), gear('Bloodstar Pendant')], [8, 8]), ['Bloodstar Pendant', 'Rare Trash Blade'])
  assert.deepEqual(names([gear('Indicolite Vambraces'), gear('Bloodstar Pendant')], [8, 8]), ['Bloodstar Pendant', 'Indicolite Vambraces'], "and a raid zone's trash drop")
  // The source outweighs one tier (review, 2026-11-19): the first cut let ordinary motes swamp the
  // copies, so Hate's trash armour at +9 led every raid boss's drop at +8, where the owner spent none on it.
  assert.deepEqual(names([gear('Indicolite Vambraces'), gear('Bloodstar Pendant')], [9, 8]), ['Bloodstar Pendant', 'Indicolite Vambraces'], 'even a tier lower')
})

test("THE OWNER'S EXAMPLE: a common drop from many mobs in many zones ranks lowest", () => {
  const rows = [gear('Bone Chip Ring'), gear('Earring of Experimentation'), gear('Rare Trash Blade'), gear('Bloodstar Pendant')]
  assert.equal(names(rows, [8, 8, 8, 8]).at(-1), 'Bone Chip Ring')
})

test("WHAT THE OWNER SPENT MOTES ON (inferred from the log): Blood's Unity, Talisman of Kejaar Kerrath, Slime Blood of Cazic-Thule and Shield of Rainbow Hues each outrank a common farmable piece, for a stated reason", () => {
  const reasons: Record<string, ItemSupply['kind']> = {
    "Blood's Unity": 'camp',
    'Talisman of Kejaar Kerrath': 'quest',
    'Slime Blood of Cazic-Thule': 'raid',
    'Shield of Rainbow Hues': 'raid'
  }
  for (const [name, kind] of Object.entries(reasons)) {
    assert.deepEqual(names([gear('Crushbone Belt'), gear(name)], [7, 7]), [name, 'Crushbone Belt'], name)
    assert.equal(supplyOf(name).kind, kind, name)
  }
  assert.deepEqual(supplyOf("Blood's Unity").hard, ['level', 'mechanics'], 'a camp, but a level 65 mob with a listed mechanic')
  assert.ok(moteSourceText(supplyOf('Talisman of Kejaar Kerrath')).includes('copies come at +0'))
  assert.equal(moteSourceText(supplyOf('Slime Blood of Cazic-Thule')), 'Raid boss: weekly kill, 1 in 8')
})

test('sortMoteAdvice: a "not yet" row sits below every ready row in the recommended order, and no gain sinks in all three', () => {
  const rows = [gear('Early Big', { stats: { AC: 300 } }), gear('Bloodstar Pendant'), gear('No Gain', { stats: { STR: 30 } })]
  const { hosts, byKey } = worn(rows, [4, 8, 9])
  const list = moteAdvice(hosts, byKey, OPTS)
  assert.deepEqual(sortMoteAdvice(list, 'recommended').map((a) => a.name), ['Bloodstar Pendant', 'Early Big', 'No Gain'])
  assert.deepEqual(sortMoteAdvice(list, 'gain').map((a) => a.name), ['Early Big', 'Bloodstar Pendant', 'No Gain'])
  assert.deepEqual(sortMoteAdvice(list, 'effort').map((a) => a.name), ['Bloodstar Pendant', 'Early Big', 'No Gain'])
  assert.equal(list[0]?.name, 'Early Big', 'the input is not reordered')
  assert.deepEqual(list.map(isMoteReady), [false, true, false])
})

// ---- the week's plan ----------------------------------------------------------------------------

test("THE OWNER'S PRACTICE: all three of the week's motes can land on one item, each tier weighed again", () => {
  const { hosts, byKey } = worn([gear('Slime Blood of Cazic-Thule'), gear('Crushbone Belt'), gear('Bloodstar Pendant', { stats: { AC: 10 } })], [7, 7, 7])
  const plan = motePlan(hosts, byKey, OPTS)
  assert.deepEqual(plan.map((s) => [s.name, s.tier]), [
    ['Slime Blood of Cazic-Thule', 7],
    ['Slime Blood of Cazic-Thule', 8],
    ['Slime Blood of Cazic-Thule', 9]
  ])
  assert.equal(planMotesOn(plan, 'CHEST'), 3)
  assert.equal(motePlanLine(plan), 'This week: Slime Blood of Cazic-Thule +7→+10')
})

test('motePlan: a finished item frees the next mote, and two can land on the second item', () => {
  const { hosts, byKey } = worn([gear('Slime Blood of Cazic-Thule'), gear('Bloodstar Pendant')], [9, 8])
  const plan = motePlan(hosts, byKey, OPTS)
  assert.deepEqual(plan.map((s) => [s.name, s.tier]), [
    ['Slime Blood of Cazic-Thule', 9],
    ['Bloodstar Pendant', 8],
    ['Bloodstar Pendant', 9]
  ])
  assert.equal(motePlanLine(plan), 'This week: Slime Blood of Cazic-Thule +9→+10 · Bloodstar Pendant +8→+10')
})

test("THE OWNER'S WORDS: \"I wouldn't use it on a crushbone belt\": a common piece below +7 never takes a mote, and the rest are held", () => {
  const { hosts, byKey } = worn([gear('Crushbone Belt', { stats: { AC: 300 } }), gear('Bloodstar Pendant')], [3, 9])
  const plan = motePlan(hosts, byKey, OPTS)
  assert.deepEqual(plan.map((s) => s.name), ['Bloodstar Pendant'], 'one mote finishes the pendant; the belt takes none')
  assert.equal(motePlanLine(plan), 'This week: Bloodstar Pendant +9→+10 · hold 2')
  const none = worn([gear('Crushbone Belt')], [3])
  assert.deepEqual(motePlan(none.hosts, none.byKey, OPTS), [])
  assert.equal(motePlanLine([]), 'Nothing you wear is ready for a mote yet: hold them')
})

// ---- the stored choice and the words ------------------------------------------------------------

test('sanitizeMotePrefs: each field falls back alone, and garbage is the default', () => {
  assert.deepEqual(sanitizeMotePrefs(null), DEFAULT_MOTE_PREFS)
  assert.deepEqual(sanitizeMotePrefs('open'), DEFAULT_MOTE_PREFS)
  // `open` is a field of the old Gear-tab panel's stored value: read past, never kept.
  assert.deepEqual(sanitizeMotePrefs({ open: true, target: 'tank', order: 'effort' }), { target: 'tank', order: 'effort' })
  assert.deepEqual(sanitizeMotePrefs({ open: true, target: 'WEIGHT', order: 'best' }), { target: 'balanced', order: 'recommended' })
  assert.equal(sanitizeMotePrefs({ target: 'SV_FIRE' }).target, 'SV_FIRE')
})

test('the tab words: target names, the gain, the changes, the copies and the hours', () => {
  assert.equal(moteTargetLabel('dps2h'), '2H DPS')
  assert.equal(moteTargetLabel('SV_FIRE'), 'SV FIRE')
  assert.equal(moteGainText({ gain: 11.52 }, 'tank'), '+11.5')
  assert.equal(moteGainText({ gain: 4 }, 'AC'), '+4')
  assert.equal(moteGainText({ gain: 0 }, 'AC'), '', 'no gain is a blank cell')
  const changes = [
    { key: 'AC', from: 66, to: 70 },
    { key: 'SV_VOID', to: 1 },
    { key: 'WEIGHT', from: 1.5, to: 0.8 }
  ] as const
  assert.equal(moteChangesText({ changes: [...changes] }), 'AC 66→70 · SV VOID -→1 · WEIGHT 1.5→0.8')
  assert.equal(moteCopiesText({ copies: 1 }), '1 copy')
  assert.equal(moteCopiesText({ copies: 1024 }), '1,024 copies')
  assert.equal(moteHoursText({ hours: 5.1 }), '5.1 h')
  assert.equal(moteHoursText({ hours: 1189.6 }), '1,190 h')
})

test('the tab words: the source, what it assumed, and why a row is not yet a pick', () => {
  assert.equal(moteSourceText(undefined), 'Not listed')
  assert.equal(moteSourceText(supplyOf('Earring of Experimentation')), 'Camp: every kill, 12 min respawn')
  assert.equal(moteSourceText(supplyOf("Blood's Unity")), 'Camp: 1 in 5, 15 min respawn, hard fight')
  assert.equal(moteSourceText(supplyOf('Indicolite Vambraces')), 'Raid zone: 1 in 71')
  assert.equal(moteSourceTitle(undefined), 'No page lists where it comes from, so only ordinary motes are counted')
  assert.equal(moteSourceTitle(supplyOf('Bone Chip Ring')), `a skeleton: about ${String(perWeek('Bone Chip Ring'))} experience a week over 3 sources; respawn, spawn points assumed`)
  assert.equal(moteGateText({ gate: 'early', gain: 3 }), 'Below +7: ordinary motes get it there')
  assert.equal(moteGateText({ gate: 'rare', gain: 3 }), 'Below +7, but copies barely exist')
  assert.equal(moteGateText({ gate: 'pick', gain: 3 }), '')
  assert.equal(moteGateText({ gate: 'pick', gain: 0 }), 'No gain for your target')
})

test('the tab words: the worn items left off the list are named with the reason', () => {
  assert.equal(moteUnrankedText([]), '', 'nothing skipped is no line')
  const { hosts } = worn([gear('Unknown To Corpus'), gear('No Tier Stated')], [8, undefined])
  assert.equal(moteUnrankedText(hosts.slice(0, 1)), 'Not ranked: Unknown To Corpus +8 (not in the item data)')
  assert.equal(moteUnrankedText(hosts), 'Not ranked: Unknown To Corpus +8, No Tier Stated (not in the item data)')
})
