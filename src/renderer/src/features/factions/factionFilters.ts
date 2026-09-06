// factions/factionFilters.ts — the work panel's class and slot filters, and the wishlist join.
// PURE (no React, no IPC), node-testable — the factionQuests.ts arrangement.
//
// THE CLASS TOKENS ARE WIKI PROSE, NOT A VOCABULARY (measured across the committed catalog,
// 2026-09-05): clean full names dominate ("Warrior" ×91, "Cleric" ×102), but the long tail holds
// every spelling a wiki editor ever chose — "Shadow Knight" / "Shadowknight" / "SK" / "SHD",
// three-letter "War"/"Cle"/"Pal", abbr runs in one cell ("WAR PAL RNG SHD BRD ROG"), and prose
// nobody can filter on ("?", "Melee", "All except INT casters", "All (Iksar Non-Caster)").
//
// SO THE FILTER IS INCLUSIVE ON AMBIGUITY, and that is the load-bearing decision: a quest whose
// tokens ALL resolve to real classes is filterable and hides honestly; a quest carrying anything
// this table cannot read is OPEN — it matches every class selection — because hiding a maybe
// hides real work, while showing one costs a glance. "All"/"Any" are the common open spellings
// and just the readable case of the same rule.
//
// THE SLOT FILTER reads the gear index (which knows every equippable's slots); its 'ANY' value
// deliberately includes quests with NO gear rewards at all — the filter narrows only when a slot
// is actually chosen, so the default view never hides faction work over a reward's category.

import type { ClassAbbr } from '@shared/classCombo'
import type { EquipSlot } from '@shared/planner/types'
import { ownershipKey } from '@shared/planner/ownership'
import type { FactionQuestRef, FactionWork } from './factionQuests'

/** Every spelling of a class the catalog has been measured to use, folded to the model's abbr. */
const TOKEN_TO_ABBR: Readonly<Record<string, ClassAbbr>> = {
  bard: 'BRD',
  brd: 'BRD',
  beastlord: 'BST',
  bst: 'BST',
  berserker: 'BER',
  ber: 'BER',
  cleric: 'CLR',
  cle: 'CLR',
  clr: 'CLR',
  druid: 'DRU',
  dru: 'DRU',
  enchanter: 'ENC',
  enc: 'ENC',
  magician: 'MAG',
  mag: 'MAG',
  monk: 'MNK',
  mnk: 'MNK',
  necromancer: 'NEC',
  nec: 'NEC',
  paladin: 'PAL',
  pal: 'PAL',
  ranger: 'RNG',
  rng: 'RNG',
  rogue: 'ROG',
  rog: 'ROG',
  'shadow knight': 'SHD',
  shadowknight: 'SHD',
  sk: 'SHD',
  shd: 'SHD',
  shaman: 'SHM',
  shm: 'SHM',
  warrior: 'WAR',
  war: 'WAR',
  wizard: 'WIZ',
  wiz: 'WIZ'
}

/** One token's classes, or null when it is not a clean class spelling (⇒ the quest goes OPEN). */
function tokenAbbrs(token: string): ClassAbbr[] | null {
  const t = token.trim().toLowerCase()
  const direct = TOKEN_TO_ABBR[t]
  if (direct !== undefined) return [direct]
  // An abbr RUN in one cell ("WAR PAL RNG SHD BRD ROG"): every word must resolve or none do.
  const words = t.split(/\s+/)
  if (words.length < 2) return null
  const out: ClassAbbr[] = []
  for (const w of words) {
    const a = TOKEN_TO_ABBR[w]
    if (a === undefined) return null
    out.push(a)
  }
  return out
}

/**
 * The classes a quest is FOR, or null when it is open to any selection — either stated openly
 * ("All", "Any") or stated in words this table cannot read (the header's inclusive rule).
 */
export function questClassAbbrs(classes: readonly string[] | undefined): Set<ClassAbbr> | null {
  if (classes === undefined || classes.length === 0) return null
  const out = new Set<ClassAbbr>()
  for (const token of classes) {
    const abbrs = tokenAbbrs(token)
    if (abbrs === null) return null
    for (const a of abbrs) out.add(a)
  }
  return out.size === 0 ? null : out
}

/** The slot filter's whole domain: a real slot, or the default that filters nothing. */
export type SlotFilter = EquipSlot | 'ANY'

export interface WorkFilters {
  /** empty = any class */
  classes: readonly ClassAbbr[]
  slot: SlotFilter
}

/** Is any narrowing actually selected? (What decides whether workless rows hide.) */
export function filtersActive(f: WorkFilters): boolean {
  return f.classes.length > 0 || f.slot !== 'ANY'
}

function matchesClasses(ref: FactionQuestRef, selected: readonly ClassAbbr[]): boolean {
  if (selected.length === 0) return true
  const set = questClassAbbrs(ref.classes)
  if (set === null) return true
  return selected.some((c) => set.has(c))
}

/** The reward-name fold — the wiki's trailing `*` off, then the corpus's own key. */
export function rewardKey(name: string): string {
  return ownershipKey(name.replace(/\*+$/, '').trim())
}

function matchesSlot(
  ref: FactionQuestRef,
  slot: SlotFilter,
  slotsByKey: ReadonlyMap<string, readonly EquipSlot[]>
): boolean {
  if (slot === 'ANY') return true
  for (const n of ref.rewards) {
    if (slotsByKey.get(rewardKey(n))?.includes(slot) === true) return true
  }
  return false
}

/**
 * One faction's work, narrowed. The RAISE and NEARBY lists take both filters (they are the
 * reward hunt); the LOWER list takes only the class filter — a cost you cannot incur is noise,
 * but a cost is a cost whatever slot its rewards fill.
 */
export function filterWork(
  work: FactionWork,
  f: WorkFilters,
  slotsByKey: ReadonlyMap<string, readonly EquipSlot[]>
): FactionWork {
  const hunts = (q: FactionQuestRef): boolean =>
    matchesClasses(q, f.classes) && matchesSlot(q, f.slot, slotsByKey)
  return {
    raise: work.raise.filter(hunts),
    lower: work.lower.filter((q) => matchesClasses(q, f.classes)),
    ...(work.homeZone === undefined ? {} : { homeZone: work.homeZone }),
    nearby: work.nearby.filter(hunts)
  }
}

/** The distinct wished reward names a work list grants (raising AND home-zone quests — a wished
 *  item is worth shouting about whichever page failed to quote its receipt). */
export function wishedRewards(work: FactionWork, wishKeys: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of [...work.raise, ...work.nearby]) {
    for (const n of q.rewards) {
      const key = rewardKey(n)
      if (seen.has(key) || !wishKeys.has(key)) continue
      seen.add(key)
      out.push(n.replace(/\*+$/, '').trim())
    }
  }
  return out
}
