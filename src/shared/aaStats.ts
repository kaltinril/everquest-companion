// aaStats.ts — "What your AAs give you": each stat the AAs move, its total and the AAs that add to it
// (owner, 2026-11-25: "some sort of summary on stat changes ... the stats and then changes that are
// provided"). Pure: board rows (shared/aaBoard.ts) in, groups of stat lines out.
//
// A line adds the held rank's value of each AA that feeds it (shared/aaEffects.ts), only where the
// combo can use the AA. A value this cannot read as a number says "see text" instead of a guess. The
// race lines (Half Elf caps and resists, Iksar HP regen and AC) and the class reincarnation passives
// are Special rows, so they count for every combo.

import type { AaBoardRow } from './aaBoard'
import { aaEffectNumber, aaEffectValue } from './aaEffects'

/** [the AA's row key, -1 when the value lowers the stat, which number of the value]. */
type Part = readonly [key: string, sign?: -1 | 1, which?: number]

export interface AaStatDef {
  group: string
  stat: string
  unit: string
  parts: readonly Part[]
}

const RACE = (r: string): string => `Race Reincarnation: ${r}`
const CLASS = (c: string): string => `Class Reincarnation: ${c}`

const def = (group: string, stat: string, unit: string, parts: readonly Part[]): AaStatDef => ({ group, stat, unit, parts })

// prettier-ignore
export const AA_STAT_DEFS: readonly AaStatDef[] = [
  def('Attributes', 'All 7 attributes', '', [['Innate Eminence']]),
  def('Attributes', 'Stat cap', '', [[RACE('Half Elf')], [RACE('Human')]]),
  def('Resists', 'Cold, disease, fire, magic, poison', '', [['Innate Spell Resistance'], [RACE('Half Elf')]]),
  def('Resists', 'Fear resist', '%', [['Fear Resistance'], [RACE('Dwarf')]]),
  def('Resists', 'Charm resist', '%', [['Adamant Will'], [RACE('Gnome')]]),
  def('Resists', 'Stun resist', '%', [[RACE('Ogre')]]),
  def('Resists', 'Cold damage taken', '%', [[RACE('Barbarian'), -1]]),
  def('Resists', 'Fire damage taken', '%', [[RACE('Dark Elf'), -1]]),
  def('Resists', 'Magic damage taken', '%', [[RACE('High Elf'), -1]]),
  def('Health and regen', 'Base HP', '%', [['Natural Durability']]),
  def('Health and regen', 'HP regen', '', [['Innate Regeneration'], [RACE('Iksar')], [RACE('Troll')], [RACE('Froglok')]]),
  def('Health and regen', 'HP regen, share of max HP a tick', '%', [["Warrior's Endurance"]]),
  def('Health and regen', 'Endurance regen', '', [['Circular Breathing'], [RACE('Kerran')]]),
  def('Health and regen', 'Mana regen', '', [['Mental Clarity'], [RACE('Erudite')], ['Unbound Clarity']]),
  def('Defense', 'AC soft cap', '%', [['Combat Stability'], ['Physical Enhancement']]),
  def('Defense', 'Melee avoidance', '%', [['Combat Agility'], ['Physical Enhancement']]),
  def('Defense', 'Base AC', '', [[RACE('Iksar'), 1, 1]]),
  def('Defense', 'Dodge', '%', [[CLASS('Monk')]]),
  def('Defense', 'Melee damage taken', '%', [[CLASS('Warrior'), -1], ['Innate Fighters Tenacity', -1]]),
  def('Defense', 'Endure stuns', '%', [['Steadfast Will']]),
  def('Offense', 'Melee crit chance', '%', [['Combat Fury'], ['Unbound Fury']]),
  def('Offense', 'Melee crit damage', '%', [['Unbound Wrath']]),
  def('Offense', 'Flurry', '%', [['Burst of Power']]),
  def('Offense', 'Haste', '%', [['Unbound Alacrity']]),
  def('Offense', 'Dual wield', '%', [['Ambidexterity']]),
  def('Offense', 'Double riposte', '%', [['Double Riposte']]),
  def('Offense', 'Damage and healing', '%', [['Banestrike']]),
  def('Offense', 'Melee damage', '%', [['Reincarnation: Completionist']]),
  def('Offense', 'Attack power', '', [["Hunter's Attack Power"]]),
  def('Offense', 'Chance to hit', '%', [[CLASS('Ranger')]]),
  def('Offense', 'Skill attack damage', '%', [[CLASS('Rogue')]]),
  def('Offense', 'Lifetap damage', '%', [[CLASS('Shadow Knight')], ['Unbound Drain']]),
  def('Offense', 'Endurance costs', '%', [[CLASS('Berserker'), -1]]),
  def('Casting', 'Nuke crit chance', '%', [['Fury of Magic'], ['Unbound Destruction'], ['Unbound Nature']]),
  def('Casting', 'Nuke crit damage', '%', [['Destructive Fury']]),
  def('Casting', 'DoT crit chance', '%', [['Critical Affliction'], ['Unbound Affliction']]),
  def('Casting', 'DoT crit damage', '%', [['Destructive Cascade'], ['Unbound Cascade']]),
  def('Casting', 'Mana cost', '%', [['Spell Casting Mastery']]),
  def('Casting', 'Buff mana cost', '%', [[CLASS('Shaman'), -1]]),
  def('Casting', 'Heal mana cost', '%', [[CLASS('Cleric'), -1]]),
  def('Casting', 'Nuke mana cost', '%', [[CLASS('Wizard'), -1]]),
  def('Casting', 'DoT mana cost', '%', [[CLASS('Necromancer'), -1]]),
  def('Casting', 'Detrimental mana cost', '%', [[CLASS('Enchanter'), -1]]),
  def('Casting', 'Cast time', '%', [[CLASS('Druid'), -1]]),
  def('Casting', 'Buff duration', '%', [['Spell Casting Reinforcement']]),
  def('Casting', 'Extra spell gems', '', [['Mnemonic Retention']]),
  def('Casting', 'Finish a cast when stunned', '%', [['Persistent Casting'], ['Unbound Versatility']]),
  def('Healing', 'Heal power', '%', [['Healing Adept'], ['Innate Divine Healing'], ['Unbound Life']]),
  def('Healing', 'Heal double-heal chance', '%', [['Healing Gift'], ['Unbound Boon']]),
  def('Healing', 'HoT double-heal chance', '%', [['Healing Boon']]),
  def('Healing', 'Incoming heals', '%', [[CLASS('Paladin')]]),
  def('Utility', 'Pet damage', '%', [[CLASS('Magician')]]),
  def('Utility', "Pet's attack delay", '%', [[CLASS('Beastlord'), -1]]),
  def('Utility', 'Movement speed', '%', [[CLASS('Bard')]]),
  def('Utility', 'Item weight', '%', [['Packrat']]),
  def('Utility', 'Storage slots', '', [['Full Potential']]),
  def('Utility', 'Loadout slots', '', [['Widened Perception']]),
  def('Utility', 'Tradeskills past 200', '', [['Crafting Mastery']]),
  def('Utility', 'Forage cap', '', [['Foraging']])
]

export interface AaStatFrom {
  key: string
  /** The name the line shows: "Half Elf line" for a reincarnation line. */
  name: string
  /** The AA's part of the total; null when its value is not a number ("see text"). */
  n: number | null
}

export interface AaStatLine {
  stat: string
  unit: string
  total: number
  /** An AA feeds it whose value this cannot read. */
  seeText: boolean
  from: AaStatFrom[]
}

export interface AaStatGroup {
  group: string
  lines: AaStatLine[]
}

/** "Half Elf line" for a reincarnation row, else its key. */
export function aaStatName(key: string): string {
  return key.replace(/^(Class|Race) Reincarnation: (.+)$/, '$2 line')
}

const round = (n: number): number => Math.round(n * 100) / 100

function statLine(d: AaStatDef, byKey: ReadonlyMap<string, AaBoardRow>): AaStatLine {
  const from: AaStatFrom[] = []
  for (const [key, sign = 1, which = 0] of d.parts) {
    const b = byKey.get(key)
    if (b === undefined || !b.usable || b.r.rank === 0) continue
    const n = aaEffectNumber(aaEffectValue(b.effect, b.r.rank), which)
    from.push({ key, name: aaStatName(key), n: n === null ? null : sign < 0 ? -Math.abs(n) : n })
  }
  const total = round(from.reduce((s, f) => s + (f.n ?? 0), 0))
  return { stat: d.stat, unit: d.unit, total, seeText: from.some((f) => f.n === null), from }
}

const keyed = (board: readonly AaBoardRow[]): Map<string, AaBoardRow> => {
  const out = new Map<string, AaBoardRow>()
  // A usable row wins a shared key (Quick Evacuation is a Druid and a Wizard row).
  for (const b of board) if (!out.has(b.r.key) || (b.usable && b.r.rank > 0)) out.set(b.r.key, b)
  return out
}

/** The stat lines with something feeding them, in groups: only what the board's usable AAs add. */
export function aaStatTotals(board: readonly AaBoardRow[], defs: readonly AaStatDef[] = AA_STAT_DEFS): AaStatGroup[] {
  const now = keyed(board)
  const groups: AaStatGroup[] = []
  for (const d of defs) {
    const line = statLine(d, now)
    if (line.from.length === 0) continue
    const group = groups.find((g) => g.group === d.group)
    if (group === undefined) groups.push({ group: d.group, lines: [line] })
    else group.lines.push(line)
  }
  return groups
}

/** A signed amount with its unit: "+10", "-9%". */
export function aaSigned(n: number, unit: string): string {
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${String(Math.abs(round(n)))}${unit}`
}
