// aaArchetypeClasses.ts — which classes have each Archetype AA (the wiki's Archetype table names
// none), from the owner's `/alternateadv list` runs on 2026-11-25: WAR + MNK + each other class in
// turn (docs/community/agent/MEASURED.md, "Archetype AAs by class"). Hand-written; pure.
//
// THE UNCERTAINTY IS KEPT, NOT GUESSED. Every run had WAR and MNK, so the ten AAs in every run belong
// to WAR or MNK, and which of the two is not split yet; another class may have them too (no run
// without WAR and MNK was made). An AA in only some runs is not WAR's or MNK's: it is exactly the
// third class's of those runs.

import type { ClassAbbr } from './classCombo'

export const AA_ARCHETYPE_SOURCE = { by: 'game', date: '2026-11-25', where: "the game's /alternateadv list" } as const

/** In every run: WAR or MNK has each (not yet split); other classes may have them too. */
export const WAR_OR_MNK_UNSPLIT: readonly string[] = [
  'Point Blank Fire', 'Finishing Blow', 'Improved Bash', 'Ambidexterity', 'Double Riposte',
  'Physical Enhancement', 'Acrobatics', 'Rampage', 'Intimidation', 'Burst of Power'
]

const CASTER = ['Mastery of the Past', 'Spell Casting Deftness', 'Quick Damage', 'Spell Casting Reinforcement', 'Mental Clarity', 'Destructive Fury', 'Fury of Magic', 'Persistent Casting', 'Mnemonic Retention']

/** What each class adds beyond the ten, run by run (WAR and MNK add nothing beyond them). */
// prettier-ignore
export const ARCHETYPE_BY_CLASS: Readonly<Record<Exclude<ClassAbbr, 'WAR' | 'MNK'>, readonly string[]>> = {
  SHM: [...CASTER, 'Healing Adept', 'Healing Gift', 'Spell Casting Mastery', 'Mass Group Buff', 'Pet Affinity', 'Master of All', 'Healing Boon', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  SHD: [...CASTER, 'Pet Affinity', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  WIZ: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Exodus', 'Master of All', "Companion's Discipline"],
  NEC: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Mass Group Buff', 'Innate Invis to Undead', 'Mend Companion', 'Pet Affinity', 'Master of All', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  PAL: [...CASTER, 'Healing Adept', 'Healing Gift', 'Mass Group Buff', 'Healing Boon'],
  RNG: [...CASTER, 'Healing Adept', 'Healing Gift', 'Mass Group Buff', 'Innate Camouflage', 'Critical Affliction', 'Destructive Cascade'],
  ROG: ["Thief's Intuition"],
  DRU: [...CASTER, 'Healing Adept', 'Healing Gift', 'Spell Casting Mastery', 'Mass Group Buff', 'Exodus', 'Innate Camouflage', 'Pet Affinity', 'Master of All', 'Healing Boon', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  ENC: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Mass Group Buff', 'Pet Affinity', 'Master of All', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  MAG: [...CASTER, 'Spell Casting Mastery', 'Spell Casting Subtlety', 'Mass Group Buff', 'Mend Companion', 'Pet Affinity', 'Master of All', "Companion's Discipline"],
  BRD: ['Mastery of the Past', 'Spell Casting Deftness', 'Quick Damage', 'Mental Clarity', 'Destructive Fury', 'Fury of Magic', "Thief's Intuition", 'Critical Affliction', 'Destructive Cascade', 'Persistent Casting', "Companion's Discipline", 'Mnemonic Retention'],
  BST: [...CASTER, 'Healing Adept', 'Healing Gift', 'Mass Group Buff', 'Mend Companion', 'Pet Affinity', 'Critical Affliction', 'Destructive Cascade', "Companion's Discipline"],
  BER: [],
  CLR: [...CASTER, 'Healing Adept', 'Healing Gift', 'Spell Casting Mastery', 'Mass Group Buff', 'Innate Invis to Undead', 'Master of All', 'Healing Boon', 'Critical Affliction']
}

/** `mine`: one of the classes has it; `mayApply`: maybe (WAR or MNK unsplit, or never measured); `other`: none of them has it. */
export type ArchetypeFit = 'mine' | 'mayApply' | 'other'

const fold = (s: string): string => s.toLowerCase().replace(/['’]/g, '').trim()
const UNSPLIT = new Set(WAR_OR_MNK_UNSPLIT.map(fold))
const BY_CLASS = new Map(Object.entries(ARCHETYPE_BY_CLASS).map(([c, names]) => [c, new Set(names.map(fold))]))
const MEASURED = new Set([...UNSPLIT, ...[...BY_CLASS.values()].flatMap((s) => [...s])])

/** Whether these classes have an Archetype AA, as the runs measured it. */
export function archetypeFit(name: string, classes: readonly ClassAbbr[]): ArchetypeFit {
  const f = fold(name)
  if (UNSPLIT.has(f)) return classes.includes('WAR') || classes.includes('MNK') ? 'mine' : 'mayApply'
  if (!MEASURED.has(f)) return 'mayApply'
  return classes.some((c) => BY_CLASS.get(c)?.has(f) === true) ? 'mine' : 'other'
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
