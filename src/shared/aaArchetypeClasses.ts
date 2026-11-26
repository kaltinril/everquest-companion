// aaArchetypeClasses.ts — which classes have each Archetype AA (the wiki's Archetype table names
// none), from the owner's `/alternateadv list` runs on 2026-11-25: WAR + MNK + each other class in
// turn (docs/community/agent/MEASURED.md, "Archetype AAs by class"). Hand-written; pure.
//
// THE UNCERTAINTY IS KEPT, NOT GUESSED. Those runs all had WAR and MNK, so ten AAs showed in every one.
// A fresh character's runs then split them (ENC WIZ, ENC WAR, ENC MNK, WIZ MAG): WAR's and MNK's lists
// below. A class measured only beside WAR and MNK may still have some of those nine as well, unless
// Daybreak's notes say so (Rampage rank 2: WAR and BER, 2026-10-22; Point Blank Fire: RNG, ROG, MNK,
// BER, 2026-09-22). Physical Enhancement showed in every combo measured, so it counts for everyone.

import type { ClassAbbr } from './classCombo'

export const AA_ARCHETYPE_SOURCE = { by: 'game', date: '2026-11-25', where: "the game's /alternateadv list" } as const

/** The melee nine WAR and MNK carry between them; a class measured only beside them may have some too. */
export const WAR_OR_MNK_UNSPLIT: readonly string[] = [
  'Point Blank Fire', 'Finishing Blow', 'Improved Bash', 'Ambidexterity', 'Double Riposte',
  'Acrobatics', 'Rampage', 'Intimidation', 'Burst of Power'
]

/** In every combo measured (20 runs). */
export const IN_EVERY_RUN: readonly string[] = ['Physical Enhancement']

/** Classes measured without WAR and MNK beside them, so their lists hold none of the nine for sure. */
const MEASURED_ALONE: ReadonlySet<ClassAbbr> = new Set<ClassAbbr>(['WIZ', 'MAG', 'ENC'])

const CASTER = ['Mastery of the Past', 'Spell Casting Deftness', 'Quick Damage', 'Spell Casting Reinforcement', 'Mental Clarity', 'Destructive Fury', 'Fury of Magic', 'Persistent Casting', 'Mnemonic Retention']

/** Each class's Archetype AAs as measured (Physical Enhancement aside). */
// prettier-ignore
export const ARCHETYPE_BY_CLASS: Readonly<Record<ClassAbbr, readonly string[]>> = {
  WAR: ['Finishing Blow', 'Improved Bash', 'Ambidexterity', 'Double Riposte', 'Rampage', 'Burst of Power'],
  MNK: ['Point Blank Fire', 'Finishing Blow', 'Ambidexterity', 'Double Riposte', 'Acrobatics', 'Intimidation'],
  SHM: [...CASTER, 'Healing Adept', 'Healing Gift', 'Spell Casting Mastery', 'Mass Group Buff', 'Pet Affinity', 'Master of All', 'Healing Boon', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  SHD: [...CASTER, 'Pet Affinity', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  WIZ: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Exodus', 'Master of All', "Companion's Discipline"],
  NEC: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Mass Group Buff', 'Innate Invis to Undead', 'Mend Companion', 'Pet Affinity', 'Master of All', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  PAL: [...CASTER, 'Healing Adept', 'Healing Gift', 'Mass Group Buff', 'Healing Boon'],
  RNG: [...CASTER, 'Healing Adept', 'Healing Gift', 'Mass Group Buff', 'Innate Camouflage', 'Critical Affliction', 'Destructive Cascade', 'Point Blank Fire'],
  ROG: ["Thief's Intuition", 'Point Blank Fire'],
  DRU: [...CASTER, 'Healing Adept', 'Healing Gift', 'Spell Casting Mastery', 'Mass Group Buff', 'Exodus', 'Innate Camouflage', 'Pet Affinity', 'Master of All', 'Healing Boon', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  ENC: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Mass Group Buff', 'Pet Affinity', 'Master of All', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  MAG: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Mass Group Buff', 'Mend Companion', 'Pet Affinity', 'Master of All', "Companion's Discipline"],
  BRD: ['Mastery of the Past', 'Spell Casting Deftness', 'Quick Damage', 'Mental Clarity', 'Destructive Fury', 'Fury of Magic', "Thief's Intuition", 'Critical Affliction', 'Destructive Cascade', 'Persistent Casting', "Companion's Discipline", 'Mnemonic Retention'],
  BST: [...CASTER, 'Healing Adept', 'Healing Gift', 'Mass Group Buff', 'Mend Companion', 'Pet Affinity', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  BER: ['Rampage', 'Point Blank Fire'],
  CLR: [...CASTER, 'Healing Adept', 'Healing Gift', 'Spell Casting Mastery', 'Mass Group Buff', 'Innate Invis to Undead', 'Master of All', 'Healing Boon', 'Critical Affliction']
}

/** `mine`: one of the classes has it; `mayApply`: maybe (WAR or MNK unsplit, or never measured); `other`: none of them has it. */
export type ArchetypeFit = 'mine' | 'mayApply' | 'other'

const fold = (s: string): string => s.toLowerCase().replace(/['’]/g, '').trim()
const UNSPLIT = new Set(WAR_OR_MNK_UNSPLIT.map(fold))
const EVERYONE = new Set(IN_EVERY_RUN.map(fold))
const BY_CLASS = new Map(Object.entries(ARCHETYPE_BY_CLASS).map(([c, names]) => [c, new Set(names.map(fold))]))
const MEASURED = new Set([...UNSPLIT, ...EVERYONE, ...[...BY_CLASS.values()].flatMap((s) => [...s])])

/** Whether these classes have an Archetype AA, as the runs measured it. */
export function archetypeFit(name: string, classes: readonly ClassAbbr[]): ArchetypeFit {
  const f = fold(name)
  if (EVERYONE.has(f)) return 'mine'
  if (!MEASURED.has(f)) return 'mayApply'
  if (classes.some((c) => BY_CLASS.get(c)?.has(f) === true)) return 'mine'
  // One of the nine: a class seen only beside WAR and MNK may have it too.
  return UNSPLIT.has(f) && classes.some((c) => c !== 'WAR' && c !== 'MNK' && !MEASURED_ALONE.has(c)) ? 'mayApply' : 'other'
}

/** The rows the Archetype tab shows: the classes' own, then the ones that may apply. A rank held always shows. */
export function archetypeRows<R extends { row: { name: string }; rank: number }>(rows: readonly R[], classes: readonly ClassAbbr[]): { mine: R[]; mayApply: R[] } {
  const out: { mine: R[]; mayApply: R[] } = { mine: [], mayApply: [] }
  for (const r of rows) {
    const fit = r.rank > 0 ? 'mine' : archetypeFit(r.row.name, classes)
    if (fit !== 'other') out[fit].push(r)
  }
  return out
}
