// spellStats.ts — WHAT A SPELL GRANTS, read off the wiki's own effect lines
// (docs/plans/spell-upgrades-and-loadout.md §3.2).
//
// ============================================================================
// THE DEFECT THIS EXISTS TO FIX
// ============================================================================
// The owner's ask, verbatim (2026-09-10): *"allow spells to be looked at, because right now spells
// and exaltations don't really tell me WHAT it does, it just says the name of the spell which isn't
// helpful on how much stats or what it does."*
//
// He is right, and the reason is on the record. `spellEffectClass.ts` classifies an effect line and
// its own header says it *"deliberately reads no MAGNITUDES"*, with a good argument for that at the
// time (nobody had asked, and inventing an unchecked taxonomy is how the name-stem era shipped four
// defects). `spellMetrics.ts` then read the ONE magnitude somebody had asked for - hitpoints - and
// stopped there, on the same discipline. So today no module in this tree can answer "how much STR
// does Talisman of Altuna give", and every surface that draws a buff draws its name.
//
// This is the reader for the rest of them. It is the THIRD deletable layer over the same scrape, in
// the family `spellScale.ts` and `wornFocus.ts` belong to: `spells.json` records what the wiki said,
// and everything derived from it lives where it can be deleted without taking the scrape with it.
//
// ============================================================================
// TWO SHAPES, AND THEY ARE THE TWO `parseHpLine` ALREADY HANDLES
// ============================================================================
// Deliberately not a new grammar. `shared/spellMetrics.ts parseHpLine` reads
// `Decrease Hitpoints by 272 (L18) to 333 (L34)` and its flat twin, and the whole beneficial half
// of the catalog is written in exactly those two shapes with a different noun in the middle:
//
//     Increase STR by 25                                    <- flat
//     Increase AC by 7 (L19) to 14 (L65)                    <- a level ramp
//     Increase Attack Speed by 47% (L39) to 50% (L44)       <- a ramp in percent
//     Decrease Spell Mana Cost by 15% to 30%                <- a RANGE, and not a ramp (see below)
//
// MEASURED over the committed catalog, 2026-09-10 (2,006 spells; 1,078 `Beneficial`; 2,066
// beneficial effect lines):
//
//   * 727 lines (35%) match the two SHAPES above, under 58 distinct stat nouns.
//   * 702 of those carry a noun this file's alias table knows, and are read. The leaders are AC (84),
//     STR (52), Attack Speed (46), Damage Shield (46), Hitpoints (40), HP when cast (38),
//     Max Hitpoints (34), ATK (27), AGI (24), Fire Resist (23).
//   * THE 25-LINE GAP IS DELIBERATE, ENUMERATED, AND BELONGS TO SOMEBODY ELSE. `Current HP` (2),
//     `Current Hit Points` (1), `Current Mana` (2), `HP regen` (1) and `MP regen` (1) are
//     `spellMetrics.ts`'s units, and reading them here would double-count. `Magnification` (10),
//     `Player Size` (3) and `Pet Size` (1) are cosmetic. `Faction` (4) is not a combat stat. Adding
//     any of them is a one-line change once somebody has a use for it - which is the bar, rather
//     than chasing a coverage percentage.
//   * The 1,339 lines that match no shape at all are overwhelmingly NOT stat lines: `Limit …` focus
//     qualifiers (the largest single group, and already owned by `wornFocus.ts`), `… per tick` regen
//     lines, `Summon Item:`, `Illusion:`, `Ultravision(N)`, `Cancel Magic(N)`, `Add Melee Proc:`. A
//     line this file returns null for is usually a line that belongs to somebody else, which is why
//     null is quiet rather than counted as a failure.
//
// `tests/spellStats.test.mts` RE-MEASURES those numbers against the committed bytes on every run, so
// a scrape that changes shape fails loudly instead of quietly parsing less.
//
// ============================================================================
// THE ALIAS FOLD IS A TABLE, NOT A MATCHER
// ============================================================================
// The wiki writes one stat several ways - `STR` and `Strength`, `AC` and `Armor Class`,
// `Max Hitpoints` and `Max HP`, `Attack Speed` and `Melee Haste`, `Hitpoints` and `Hit points`,
// `WIS` and `Wisdom`. Those are RENAMES, and world-model law 12 is explicit that a cross-source
// rename is knowledge and never a fuzzy match: a closest-match would eventually fold `Max HP` and
// `Max Mana` together, or `ATK` and `AC`, and the failure would be silent. So the table below is
// hand-authored, every row verified by reading both spells, and a noun that is not in it yields
// null. SILENCE IS NOT ZERO (law 1): a spell whose grant we could not read grants nothing we can
// state, which is a different claim from granting nothing.
//
// AND A PERCENT IS NOT A POINT. `Increase Attack Speed by 47%` and `Increase STR by 20` are not
// summable, and the type says so rather than leaving it to each caller's good intentions. Nothing
// in this tree may add them.
//
// Pure, dependency-free, node-testable, RELATIVE value imports (the shared/ house rule).

import { GEAR_STAT_KEYS, type GearStatKey } from './planner/gear'

// =================================================================================================
// THE VOCABULARY
// =================================================================================================

/**
 * A stat a spell can grant.
 *
 * THE FIRST NINETEEN ARE `GearStatKey` MEMBERS, spelled identically on purpose: a buff's +20 STR and
 * a bracer's +8 STR are the same stat, and the Loadout tab scores both through the same
 * `planner/roleWeights.ts` table. `assertGearKeysAreSpellKeys` below is a compile-time proof that
 * the two vocabularies have not drifted.
 *
 * The rest are spell-only. The gear corpus states no movement speed and no spell haste, so those
 * keys simply never appear on an item, and `roleWeights.ts` never has to have an opinion about them.
 */
export type SpellStatKey =
  | GearStatKey
  // -- SPELL-ONLY, in the gear vocabulary's own SCREAMING_SNAKE so one table can hold both --------
  /** `Increase Movement Speed by 55%` - always a percent. SoW, the wolf forms. */
  | 'MOVEMENT_SPEED'
  /**
   * `Increase Haste v2 by 20%` - the OVERHASTE slot, SPA 98, and NOT a spelling of `HASTE`.
   *
   * Separate because the game treats it as a separate slot: an overhaste STACKS on top of an
   * ordinary haste rather than competing with it (`SE_ATTACKSPEED2` sits beside `SE_ATTACKSPEED` in
   * EQEmu's stacking tables, and both are handled). Folding the two onto one key would make
   * `grantsShareASlot` flag a pair the game is perfectly happy to run together, which is the exact
   * failure that flag exists to avoid.
   */
  | 'HASTE_V2'
  /** `Increase Spell Haste by 18%` - a percent, and a different thing from melee haste. */
  | 'SPELL_HASTE'
  /** `Increase Damage Shield by 31` - points returned per melee hit taken. */
  | 'DAMAGE_SHIELD'
  /**
   * `Increase HP when cast by 238 (L44) to 250 (L50)` - the one-off heal a max-HP buff also does.
   *
   * Kept apart from `HP` deliberately: Talisman of Altuna states BOTH lines, and folding them would
   * double the buff's apparent HP. `spellStatGrants` returns them as two grants for the same reason.
   */
  | 'HP_ON_CAST'
  /** `Increase Absorb Damage by 300` - a melee rune. */
  | 'ABSORB_DAMAGE'
  /** `Increase Absorb Magic Damage by 300` - the spell-only rune, a different slot. */
  | 'ABSORB_MAGIC_DAMAGE'
  /** `Decrease Stamina Loss by 20` - a benefit spelled as a decrease. */
  | 'STAMINA_LOSS'
  /** `Increase Spell Duration by 10%`. */
  | 'SPELL_DURATION'
  /** `Increase Spell Range by 50%`. */
  | 'SPELL_RANGE'
  /** `Increase Effective Casting Level by 2`. */
  | 'CASTING_LEVEL'
  /** `Decrease Poison Counter by 36` - how much of a poison a cure strips. Same for the other two. */
  | 'POISON_COUNTER'
  | 'DISEASE_COUNTER'
  | 'CURSE_COUNTER'
  /** `Increase Agro Multiplier by 100%` - what a taunt buff does. */
  | 'AGGRO_MULT'
  /** `Increase Chance to Hit by 5%`. */
  | 'CHANCE_TO_HIT'
  /** `Increase Chance to Reflect Spell by 5%`. */
  | 'REFLECT_SPELL'

/**
 * The alias table: every spelling the catalog uses, folded to one key.
 *
 * KEYED BY THE LOWERCASED NOUN exactly as the wiki writes it, minus the surrounding
 * `Increase ... by` / `Decrease ... by`. Add a row only after reading a spell that uses the
 * spelling - an entry invented from a guess is indistinguishable from a correct one until it
 * silently folds two stats together.
 *
 * TWO FOLDS ARE WORTH STATING OUT LOUD BECAUSE THEY LOOK LIKE MISTAKES AND ARE NOT:
 *
 *   `Hitpoints` AND `Max Hitpoints` BOTH GO TO `HP`. The gear vocabulary's `HP` is a maximum (an
 *   item's `HP: +45` raises your pool), and every flat `Increase Hitpoints by N` on a buff page in
 *   this catalog does the same thing. The genuinely different quantity - the one-off heal a max-HP
 *   buff also delivers - is spelled `HP when cast` by the wiki and gets its own key above.
 *
 *   `Attack Speed` AND `Melee Haste` BOTH GO TO `HASTE`, WHICH IS A GEAR KEY. That is the point: a
 *   bracer's `HASTE: +41%` and Celerity's `Increase Attack Speed by 47%` are the same stat, so the
 *   Loadout tab can score a buff and an item through the one `planner/roleWeights.ts` table instead
 *   of two that agree until somebody edits one.
 */
const STAT_ALIASES: Readonly<Record<string, SpellStatKey>> = {
  // -- attributes --------------------------------------------------------------------------------
  str: 'STR',
  strength: 'STR',
  sta: 'STA',
  stamina: 'STA',
  agi: 'AGI',
  agility: 'AGI',
  dex: 'DEX',
  dexterity: 'DEX',
  wis: 'WIS',
  wisdom: 'WIS',
  int: 'INT',
  intelligence: 'INT',
  cha: 'CHA',
  charisma: 'CHA',
  // -- defence -----------------------------------------------------------------------------------
  ac: 'AC',
  'armor class': 'AC',
  // -- pools. See the header note on why `Hitpoints` and `Max Hitpoints` are one key. -------------
  hitpoints: 'HP',
  'hit points': 'HP',
  hp: 'HP',
  'max hitpoints': 'HP',
  'max hit points': 'HP',
  'max hp': 'HP',
  'hp when cast': 'HP_ON_CAST',
  mana: 'MP',
  'max mana': 'MP',
  // -- offence -----------------------------------------------------------------------------------
  atk: 'ATTACK',
  attack: 'ATTACK',
  'atk power': 'ATTACK',
  'attack speed': 'HASTE',
  'melee haste': 'HASTE',
  'haste v2': 'HASTE_V2',
  'movement speed': 'MOVEMENT_SPEED',
  'spell haste': 'SPELL_HASTE',
  'damage shield': 'DAMAGE_SHIELD',
  'absorb damage': 'ABSORB_DAMAGE',
  'absorb magic damage': 'ABSORB_MAGIC_DAMAGE',
  'stamina loss': 'STAMINA_LOSS',
  'spell duration': 'SPELL_DURATION',
  'spell range': 'SPELL_RANGE',
  'effective casting level': 'CASTING_LEVEL',
  'agro multiplier': 'AGGRO_MULT',
  'aggro multiplier': 'AGGRO_MULT',
  'chance to hit': 'CHANCE_TO_HIT',
  'chance to reflect spell': 'REFLECT_SPELL',
  // -- cures -------------------------------------------------------------------------------------
  'poison counter': 'POISON_COUNTER',
  'disease counter': 'DISEASE_COUNTER',
  'curse counter': 'CURSE_COUNTER',
  // -- resists. `MR` is the catalog's own one-off abbreviation, verified on the page it appears on.
  'fire resist': 'SV_FIRE',
  'cold resist': 'SV_COLD',
  'magic resist': 'SV_MAGIC',
  mr: 'SV_MAGIC',
  'poison resist': 'SV_POISON',
  'disease resist': 'SV_DISEASE',
  'all resists': 'SV_ALL',
  'resist all': 'SV_ALL'
}

/**
 * COMPILE-TIME PROOF that every gear stat is a spell stat.
 *
 * `GearStatKey` is the vocabulary `planner/roleWeights.ts` scores, and the Loadout tab's whole
 * argument is that a buff and a bracer are scored by the same table. If somebody widens
 * `GearStatKey` and this file does not follow, this assignment stops compiling - which is the only
 * moment anybody would notice, and a great deal better than a buff's new stat scoring zero forever.
 */
const gearKeysAreSpellKeys: readonly SpellStatKey[] = GEAR_STAT_KEYS
void gearKeysAreSpellKeys

// =================================================================================================
// THE PARSE
// =================================================================================================

/**
 * A level ramp, as the wiki states it: this much at this level, rising to that much at that one.
 *
 * CLAMPED AT BOTH ENDS AND NEVER EXTRAPOLATED, which is `spellMetrics.ts rampAt`'s rule and its
 * reason: the wiki's ramp is a statement about a BAND, so a reader below the low level sees the low
 * figure rather than a number nobody claimed, and a reader above the high one sees the high figure.
 */
export interface SpellStatRamp {
  loAmount: number
  loLevel: number
  hiAmount: number
  hiLevel: number
}

/** ONE thing a spell grants. */
export interface SpellStatGrant {
  key: SpellStatKey
  /**
   * The magnitude AT THE LEVEL ASKED FOR, sign included - positive for a grant, negative for a
   * penalty (the catalog's own `Decrease` lines, which a beneficial spell does carry:
   * `Decrease Stamina Loss by 20` is a benefit spelled as a decrease, and `Decrease AC by 5` on a
   * form spell is a real cost).
   */
  amount: number
  /** True where the wiki wrote a `%`. A percent and a point are never summed. */
  percent: boolean
  /** Present where the line was a ramp, so a surface can state the band as well as the figure. */
  ramp?: SpellStatRamp
  /** The line this was read from, verbatim, so a card can show its working. */
  line: string
}

/**
 * `Increase|Decrease <noun> by <n>[%]` with an optional `(L<a>) to <m>[%] (L<b>)` ramp tail.
 *
 * ANCHORED AT BOTH ENDS on purpose. An unanchored match would happily read the magnitude out of the
 * middle of a `Limit …` qualifier line, which is `wornFocus.ts`'s data and means something entirely
 * different - `Increase Spell Damage by 1% to 20%` is a focus RANGE, not a stat grant, and the
 * anchor plus the alias table are what keep the two apart.
 */
const STAT_LINE =
  /^(Increase|Decrease) (.+?) by (-?\d+)(%?)(?: \(L(\d+)\) to (-?\d+)(%?) \(L(\d+)\))?$/

/**
 * Read one effect line, or null.
 *
 * NULL IS THE COMMON CASE and it is quiet: two thirds of the catalog's beneficial lines belong to
 * another reader (a focus qualifier, a per-tick regen, a summon, an illusion). A caller that wants
 * to know how much of the catalog it is failing to read asks the test, not the parser.
 *
 * A `per tick` line is REFUSED EXPLICITLY rather than by falling off the anchor, because it very
 * nearly matches and reading it here would double-count against `spellMetrics.ts`, which already
 * owns regen and states it in its own units.
 */
export function parseStatLine(line: string): Omit<SpellStatGrant, 'amount'> & {
  flat?: number
} | null {
  const text = line.trim()
  if (/ per tick$/i.test(text)) return null
  const m = STAT_LINE.exec(text)
  if (m === null) return null
  const key = STAT_ALIASES[m[2].trim().toLowerCase()]
  if (key === undefined) return null
  const sign = m[1] === 'Decrease' ? -1 : 1
  const percent = m[4] === '%' || m[7] === '%'
  const lo = sign * Number(m[3])
  if (!Number.isFinite(lo)) return null
  if (m[5] === undefined) return { key, percent, line: text, flat: lo }
  const hi = sign * Number(m[6])
  const loLevel = Number(m[5])
  const hiLevel = Number(m[8])
  if (!Number.isFinite(hi) || !Number.isFinite(loLevel) || !Number.isFinite(hiLevel)) return null
  // A ramp whose levels run backwards is a page we cannot read, not a ramp to reverse for it.
  if (hiLevel < loLevel) return null
  return {
    key,
    percent,
    line: text,
    ramp: { loAmount: lo, loLevel, hiAmount: hi, hiLevel }
  }
}

/**
 * A ramp read at a level: linear between the two stated points, CLAMPED outside them.
 *
 * Integer-floored toward the low end the way the game's own magnitude formulas do, and returning the
 * stated endpoints exactly at the stated levels so a card and the wiki page agree at the two places
 * a reader is most likely to check.
 */
export function rampAt(ramp: SpellStatRamp, level: number): number {
  if (level <= ramp.loLevel) return ramp.loAmount
  if (level >= ramp.hiLevel) return ramp.hiAmount
  const span = ramp.hiLevel - ramp.loLevel
  if (span <= 0) return ramp.hiAmount
  const step = ((ramp.hiAmount - ramp.loAmount) * (level - ramp.loLevel)) / span
  return ramp.loAmount + Math.trunc(step)
}

/**
 * EVERY GRANT A SPELL STATES, at one level.
 *
 * Order is the wiki's own effect order, preserved: the page lists the headline effect first and a
 * surface that re-sorted them would put a form spell's illusion above the STR it is actually cast
 * for. Duplicate keys are NOT merged - a spell that states the same stat twice said so, and folding
 * the two would be this file inventing arithmetic nobody asked it to do.
 */
export function spellStatGrants(
  effects: readonly string[] | undefined,
  level: number
): SpellStatGrant[] {
  if (effects === undefined) return []
  const out: SpellStatGrant[] = []
  for (const line of effects) {
    const p = parseStatLine(line)
    if (p === null) continue
    const amount = p.ramp !== undefined ? rampAt(p.ramp, level) : (p.flat ?? 0)
    const grant: SpellStatGrant = { key: p.key, amount, percent: p.percent, line: p.line }
    if (p.ramp !== undefined) grant.ramp = p.ramp
    out.push(grant)
  }
  return out
}

// =================================================================================================
// DISPLAY
// =================================================================================================

/** What a player calls the stat. One place; the chip, the column header and the tooltip share it. */
export const SPELL_STAT_LABEL: Partial<Record<SpellStatKey, string>> = {
  AC: 'AC',
  STR: 'STR',
  STA: 'STA',
  AGI: 'AGI',
  DEX: 'DEX',
  WIS: 'WIS',
  INT: 'INT',
  CHA: 'CHA',
  HP: 'HP',
  MP: 'Mana',
  ATTACK: 'ATK',
  HASTE: 'Haste',
  SV_FIRE: 'Fire resist',
  SV_COLD: 'Cold resist',
  SV_MAGIC: 'Magic resist',
  SV_POISON: 'Poison resist',
  SV_DISEASE: 'Disease resist',
  SV_ALL: 'All resists',
  MOVEMENT_SPEED: 'Run speed',
  HASTE_V2: 'Overhaste',
  SPELL_HASTE: 'Spell haste',
  DAMAGE_SHIELD: 'Damage shield',
  HP_ON_CAST: 'HP on cast',
  ABSORB_DAMAGE: 'Rune',
  ABSORB_MAGIC_DAMAGE: 'Magic rune',
  STAMINA_LOSS: 'Stamina loss',
  SPELL_DURATION: 'Spell duration',
  SPELL_RANGE: 'Spell range',
  CASTING_LEVEL: 'Casting level',
  POISON_COUNTER: 'Poison cure',
  DISEASE_COUNTER: 'Disease cure',
  CURSE_COUNTER: 'Curse cure',
  AGGRO_MULT: 'Aggro',
  CHANCE_TO_HIT: 'Accuracy',
  REFLECT_SPELL: 'Spell reflect'
}

/**
 * The label, or the key itself.
 *
 * PARTIAL BY DESIGN: `SpellStatKey` includes every `GearStatKey`, and a dozen of those (`DMG`,
 * `DELAY`, `BACKSTAB`, `WEIGHT`, the endurance trio, the exotic saves) belong to weapons and armour
 * and are spellings no spell effect line has ever used. Naming them here would be inventing
 * player-facing copy for rows that cannot occur; falling back to the key is the honest answer if one
 * ever does.
 */
export function spellStatLabel(key: SpellStatKey): string {
  return SPELL_STAT_LABEL[key] ?? key
}

/**
 * One grant as a short string: `STR +25`, `Haste +47%`, `Stamina loss -20`.
 *
 * NO EM DASHES and a normal minus sign (AGENTS.md, UI conventions) - this is user-facing copy.
 */
export function spellStatText(g: SpellStatGrant): string {
  const sign = g.amount >= 0 ? '+' : '-'
  return `${spellStatLabel(g.key)} ${sign}${String(Math.abs(g.amount))}${g.percent ? '%' : ''}`
}

/**
 * DO TWO GRANTS COMPETE FOR THE SAME SLOT?
 *
 * The cheap half of the stacking question, and the ONLY half answerable without the player's own
 * `spells_us.txt` (docs/plans/spell-upgrades-and-loadout.md §3.3, the "flagged" tier). Two spells
 * that both state Movement Speed will not both stand - Spirit of Wolf and Spirit of Bih`Li are the
 * owner's own example - and saying so is a true statement about the wiki's own words.
 *
 * IT IS NOT A STACKING VERDICT AND MUST NEVER BE PRINTED AS ONE. It cannot say which spell wins, it
 * cannot see a blocking directive, it does not know that bard songs stack alongside non-songs, and
 * it will flag two spells the game is perfectly happy to run together. The copy that draws it says
 * "only one of these will stand, and telling you which needs your EverQuest spell file"; the exact
 * answer is `spellStack.ts` and arrives with the client table.
 */
export function grantsShareASlot(
  a: readonly SpellStatGrant[],
  b: readonly SpellStatGrant[]
): SpellStatKey[] {
  const mine = new Set(a.map((g) => g.key))
  const shared: SpellStatKey[] = []
  const seen = new Set<SpellStatKey>()
  for (const g of b) {
    if (mine.has(g.key) && !seen.has(g.key)) {
      seen.add(g.key)
      shared.push(g.key)
    }
  }
  return shared
}
