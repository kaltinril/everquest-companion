// spellUpgradeCategory.ts — WHICH MOTE-TIER CATEGORY A DB ROW FILES UNDER, read once for the
// Spellbook row and the spell page alike.
//
// ONE READER FOR THE ROW AND THE PAGE, and it exists because the two used to disagree. The row
// (`levelUnlocks.ts writeSpellFacts`) asked the computed metrics whether the spell damages or
// heals; the page (`spellDetail.ts tierBaseFor`) asked a regex over the effect text instead, and
// the wiki's verbs are wider than any regex: `Decrease Current Hit Points by 71` matched neither
// pattern, so Blast of Frost was a nuke on its row and a debuff on its page, where the ladder then
// said its damage never grows. 67 spells disagreed (measured 2026-09-25): 38 buffs the page filed
// as HoTs, five nukes as debuffs, seven debuffs as DoTs.
//
// THE METRICS ARE THE WITNESS for damage and healing, because they are the one reader that has
// already reconciled the wiki's lines with the client's slots - a spell whose page states no
// hitpoint line at all but whose client row does is damage on both surfaces, and a regex over the
// page could never say so. Everything else is the row's own words: `spellType` for the nature (the
// vocabulary `spellDb.ts` owns), the parsed duration, the wiki's `Permanent`, and the two effect
// verbs the metrics have no opinion on.
//
// A separable overlay in the `spellEffectClass.ts` / `rainSpells.ts` family: delete it and the
// catalog is unchanged. Its own file because `spellDb.ts` is at the tree's line ceiling.

import type { SpellEntry } from '../../shared/types'
import type { SpellMetrics } from '../../shared/spellMetrics'
import { classifyUpgrade, type UpgradeCategory } from '../../shared/spellUpgrade'
import { spellNature } from './spellDb'

/** The `classifyUpgrade` facts for one DB row, with the metrics already computed for it. */
export function upgradeCategoryFor(
  s: SpellEntry,
  metrics: SpellMetrics | undefined
): UpgradeCategory {
  const effects = s.effects ?? []
  return classifyUpgrade({
    beneficial: spellNature(s.spellType) === 'beneficial',
    hasDuration: (s.durationMs ?? 0) > 0,
    permanent: /permanent/i.test(s.durationText ?? ''),
    damage: (metrics?.damage ?? 0) > 0,
    heal: (metrics?.heal ?? 0) > 0,
    charm: effects.some((e) => /^(Charm|Mesmeriz)/i.test(e)),
    pet: effects.some((e) => /^Summon Pet/i.test(e))
  })
}
