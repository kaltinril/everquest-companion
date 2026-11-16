// THE COLUMN CORRECTIONS — the seventh and eighth drift classes, split out of
// `spellCorrectionsList.ts` at its measured 400-code-line ceiling (JOS-528), along the seam the
// architecture already cut for the sixth: a drift class that is not about a SENTENCE gets its own
// file, the way `spellCorrectionsPolarity.ts` holds the polarity family. The evidence bar, the
// idempotence triangle and the `rowsFor` write rules are `spellCorrectionsList.ts`'s and
// `spellCorrections.ts`'s; nothing about an entry is decided here.
//
// THE WRONG LEVEL (the seventh, JOS-415): `classes` is the wiki's other column, the one
// `shared/spellLevels.ts` reads into (class, level) pairs and `buildLevelUnlocks` turns into
// "new at this level" cards. Its defect shape is a duplicate pair of wiki pages that disagree,
// which is why a classes correction writes EVERY row of its name — half a correction leaves the
// phantom card exactly where it was.
//
// THE WRONG EFFECT LINE (the eighth, JOS-528): `effects` is the wiki's numbered slot list, and
// `shared/spellMetrics.ts` reads its `per tick` marker to decide whether damage arrives over
// time. A correction here replaces ONE element of the list, first row, `from` required — see the
// field-union doc in `spellCorrections.ts`.

import type { SpellCorrection } from './spellCorrections'

export const COLUMN_CORRECTIONS: readonly SpellCorrection[] = [
  // The wiki has two pages for this spell — pageid 46874, titled `Leech`, `{{Classic Era}}`,
  // `* [[Necromancer]] - Level 9`, and pageid 50162, titled `Leach`, `{{Paineel Era}}`,
  // `* [[Necromancer]] - Level 12 Recourse Effect` — and BOTH set `spellname = Leach`, so the
  // scrape files two rows under one name. Every other field the two share is identical (mana 72,
  // cast 2.40, recast 10.00, the same `Decrease Hitpoints by 8 per tick` slot, the same four
  // vendors in the same four zones), which is what makes them one spell rather than two. The
  // level-12 row is the one that is wrong.
  {
    spells: ['Leach'],
    field: 'classes',
    from: '* Necromancer - Level 12 Recourse Effect',
    to: '* Necromancer - Level 9',
    attribution: 'db',
    evidence:
      'Reported 6AT44D (v1.5.0): `For a necro, on level up to level 12. Shows Leach beting a spell. But leach was learned at lvl 9 for a necro.` Checked against EQ LEGENDS data, not classic EQ: eqlwiki`s own Necromancer spell list places the spell ONCE, at Level 9, as `Leach NEC(9)` linking the page titled `Leech`; its Level 12 rows are Bind Affinity, Convoke Shadow and Lifedraw, and no row anywhere in that list links the page titled `Leach`. The DB is its own witness twice over: our other row for this name already says `* Necromancer - Level 9` (so this correction reports satisfied on it), and the level-12 page`s own description reads `6 ticks @L9 to 9 ticks @L15` while its duration row says `7 ticks @L12` — the page contradicts itself about the floor. `Level 12 Recourse Effect` is a note the wiki hung on the classes bullet; shared/spellLevels.ts`s SEGMENT regex reads the number and ignores the trailing words, which is correct behaviour on a line that is wrong. Blast radius: buildLevelUnlocks emitted a second Leach row at NEC 12 and the panel drew a card there; with both rows at NEC 9 the renderer`s fold-by-name draws one card at 9 and none at 12. spellClasses is unchanged (both rows already said Necromancer).'
  },
  // The Leach shape exactly: two wiki pages under one `spellname`, and the one that is wrong is a
  // live-EQ copy that pre-dates the Legends re-tier.
  {
    spells: ['Swift Like The Wind'],
    field: 'classes',
    from: '* Enchanter - Level 49',
    to: '* Enchanter - Level 47',
    attribution: 'db',
    evidence:
      'Reported 01M0T4RJCRZRFTFZ6W717T2W14 (v1.9.0): `hi see the spell swift like the wind for enchanter at both 47 and 49. it`s only at 47. thanks!` The wiki holds two pages that both set `spellname = Swift Like The Wind` (checked 2026-08-28): pageid 48049, `* Enchanter - Level 47`, recast 1.50, duration `16 Min` — the Legends page — and pageid 49816, `* Enchanter - Level 49`, recast 2.25, duration `15.7 minutes @L49 to 16 minutes @L50`, which is live EQ`s level-scaled figure for its L49 enchanter haste, copied before the re-tier. eqlwiki`s own Enchanter spell index carries the spell ONCE, in its ==Level 47== section, linking the 48049 page; no index row places it at 49. Blast radius: buildLevelUnlocks drew a phantom card at ENC 49; with both rows at 47 the renderer`s fold-by-name draws one card at 47. Duration is untouched (both rows already parse to 960000 ms) and no message moves.'
  },
  // The eighth class's one entry. `shared/spellMetrics.ts` reads the slot list`s `per tick`
  // marker to decide whether damage arrives over time, so a DoT whose slot line omits the marker
  // files as direct damage: wrong tab, and a total counted once instead of once per tick.
  {
    spells: ['Vengeance of the Wild'],
    field: 'effects',
    from: 'Decrease Hit Points between 121 and 132',
    to: 'Decrease Hit Points between 121 and 132 per tick',
    attribution: 'db',
    evidence:
      'Reported 01M0V24TW8FP3WFS38AFGN1HDH (v1.9.0): `Vengeance of the Wild is not showing as a DoT and the damage listed does not match the actual DoT damage (likely because its is not being seen as a DoT?)` The page is its own witness (pageid fetched 2026-08-28): its description reads `causing between 122 and 131 damage every six seconds for 30s` and its duration row `5 ticks`, while its slot line alone omits the rate marker. The DB is the family witness: 138 detrimental rows with a duration carry `per tick` on their Decrease-Hitpoints line verbatim, and every other no-marker row with a duration (censused 2026-08-28: the root families, Fire, Ice, Flame Song of Ro, Stone Spider Stun) is genuinely front-loaded damage riding a root/resist/stun duration — Vengeance of the Wild is the sole row whose own description contradicts its slot. The numbers 121/132 are the slot`s and stay: the description`s 122/131 is the page disagreeing with itself by one, and a correction fixes the marker, not the wiki`s arithmetic. Blast radius: spellMetrics reads perTick true, so bestSpells moves the spell from the DD tab to the DoT tab and its total becomes per-tick x 5 ticks (126.5 midpoint -> 632.5) with dps over the 30 s cycle; the parser is untouched (DoT damage attribution is log-shape driven); spellEffectClass`s heal families are untouched (this is a Decrease line).'
  },
  // Two levels the game's patch notes moved and the wiki pages still state the old way (read
  // 2026-11-15). The owner's client file agrees with the patch notes on both.
  {
    spells: ['Lifespike'],
    field: 'classes',
    from: '* Necromancer - Level 3 (Autogranted) * Shadow Knight - Level 8',
    to: '* Necromancer - Level 3 (Autogranted) * Shadow Knight - Level 5',
    attribution: 'db',
    evidence:
      'Patch notes 2026-08-18: `The Lifespike spell has been moved from level 8 to level 5 for Shadowknights`, in the same note that adds Lifebite at Shadow Knight 10 and Necromancer 8, which the catalog already carries. The owner`s client file (spell 502) states Shadow Knight 5 and Necromancer 3. Blast radius: the unlock card moves from Shadow Knight 8 to 5; no message or figure moves.'
  },
  {
    spells: ['Enchant Steel'],
    field: 'classes',
    from: '* Enchanter - Level 46',
    to: '* Enchanter - Level 21',
    attribution: 'db',
    evidence:
      'Patch notes 2026-06-29: `Reduced the usable level of the following Enchanter spells: Enchant Clay to level 7. Enchant Steel to level 21.` The catalog already carries Enchant Clay at 7; the Enchant Steel page still states 46. The owner`s client file (spell 1892) states Enchanter 21. Blast radius: the unlock card moves from Enchanter 46 to 21, and its place on the enchant line with it.'
  },
  // Two slot lines the stat reader cannot read, so the buff set scored both spells at nothing
  // (owner report 2026-11-15, Loadout buff set for a Shadow Knight).
  {
    spells: ['Grim Aura'],
    field: 'effects',
    from: 'Increase ATK by 5 to 10 (L10)',
    to: 'Increase ATK by 5 (L1) to 10 (L10)',
    attribution: 'db',
    evidence:
      'The page (pageid 50145) states the ramp without its low level. Siphon Strength (pageid 50143) writes the same magnitude in the full form, `Decrease STR by 5 (L1) to 10 (L10)`, and the owner`s client file gives both spells the same slot shape: base 5, formula 101 (base + level / 2), max 10, which is 5 at level 1 and 10 at level 10. Blast radius: the stat reader yields ATK, read as 10 from level 10 up; no message moves.'
  },
  {
    spells: ['Shieldskin'],
    field: 'effects',
    from: 'UNKNOWN CALC 111 base 27 max 55 attrib Absorb Damage',
    to: 'Increase Absorb Damage by 27 (L16) to 55 (L21)',
    attribution: 'db',
    evidence:
      'The wiki`s slot line (pageid 50172) is its template`s failed formula output. The owner`s client file gives the slot as absorb damage, base 27, formula 111, max 55, and the page`s own description says the spell `absorbs 55 damage`. Formula 111 is base + 6 x (level - 16) in the emulator source, which reaches the 55 cap at level 21; the cap is the client`s and the page`s, the ramp under it is the emulator`s and unmeasured here. Blast radius: the stat reader yields a rune of 55 for every caster at 21 or above; no message moves.'
  }
]
