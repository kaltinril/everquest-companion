// spellFold.ts — ONE SPELL, ONE ROW, however many wiki pages carry it.
//
// The wiki lists a few spells twice (Skin Like Diamond, Dustdevil, Shock of Frost, Shield of Thorns
// (Spell)), and a surface that walks the catalog row by row then draws the same spell twice, under
// one React key, and counts it twice. The Spellbook's search and its ranked fold already fold by
// name (`bestSpellsSearch.ts`, `bestSpells.ts`); this is the same rule for the buff set and the
// upgrade plan: the first record's fields win - it is the same spell - and the class pairs merge.
//
// Pure: no React, no Electron.

import type { UnlockSpell } from './levelUnlocks'

/** Two records' (class, level) pairs as one: each class once, at the lower level either states. */
function mergeAt(a: UnlockSpell['at'], b: UnlockSpell['at']): UnlockSpell['at'] {
  const out = [...a]
  for (const p of b) {
    const i = out.findIndex((q) => q.cls === p.cls)
    if (i < 0) out.push(p)
    else if (p.level < out[i].level) out[i] = p
  }
  return out
}

/**
 * The catalog with each name once, case folded, in first-seen order. A spell listed once is the
 * catalog's own object; only a folded one is a copy.
 */
export function foldSpellsByName(spells: readonly UnlockSpell[]): UnlockSpell[] {
  const byName = new Map<string, UnlockSpell>()
  for (const spell of spells) {
    const key = spell.name.toLowerCase()
    const seen = byName.get(key)
    byName.set(key, seen === undefined ? spell : { ...seen, at: mergeAt(seen.at, spell.at) })
  }
  return [...byName.values()]
}
