// THE RESIST FAMILY: ONE PREPOSITION AND TWO PLACEHOLDERS, MEASURED ON A SECOND LOG.
//
// One family of the corrections overlay, in its own file for the reason `spellCorrectionsHealing.ts`
// is in its own file: `spellCorrectionsList.ts` carries a code-mass ceiling and was one entry short
// of it. READ THAT FILE'S HEADER FIRST — the evidence bar, the drift classes and the idempotence
// rules are stated there and every entry below is held to them. `spellCorrections.ts` is the
// mechanism; this list is appended to the same pass.
//
// THE EVIDENCE LOG is the owner's `eqlog_Drywrought_oggok.txt` — 2,983,842 lines, whole-log,
// read-only, measured 2026-09-25 — a second character on a second account, and the first log to
// hold enough resist casts to attribute the family the `cast` way. "N/M casts" below means N of
// the M `You begin casting <Spell>.` lines are followed by the replacement shape within 10 lines;
// the remainder landed on a group member, whose third-person line is a different sentence.
//
// TWO DEFECTS, NEITHER OF THEM NEW IN KIND:
//
//   THE PREPOSITION. The wiki's self landing for all five resists is `You feel resistant FROM <x>.`
//   and the game prints `You feel resistant TO <x>.` — the same drift class as the swarm line that
//   opened the list, and the wiki disagreeing with itself inside one row, because the same rows'
//   third-person half already says `Someone is resistant to <x>.`. Resist Magic was corrected on
//   the first log (2 lines); this log holds hundreds for each of the other four and ZERO of the
//   wiki form. What it cost: no self bar ever OPENED for Resist Fire, Cold, Poison or Disease.
//
//   THE PLACEHOLDER. `Your resist fire fades.` and `Your resist magic fades.` are the spell's NAME
//   read back with a verb on the end, not sentences the game has ever printed — the scrape-stub
//   drift class, wearing a plausible-looking sentence rather than `You .`. The other three
//   resists carry the real shape verbatim (`Your cold resistance fades.`), and `Resistance to
//   Magic` — the NPC-only twin, `classes: None` — carries the magic one verbatim, so the DB is
//   its own witness and the attribution is `db`. What the placeholder cost is worse than a
//   missing bar: `Your fire resistance fades.` fell through to `Fade`'s generic ` fades.` suffix
//   and was classified as a LANDING — `buffApply` of Fade on a target called "Your fire
//   resistance" — and `Your magic resistance fades.` resolved only to the NPC row, so Resist
//   Magic was never a candidate and neither self bar could ever clear.
//
// AFTER THIS the magic wear-off sentence is SHARED by Resist Magic and Resistance to Magic, which
// is world-model law 3's ordinary case (one sentence per spell FAMILY) and what the shared-message
// machinery exists for — `Largo's Melodic Binding` in the main list is the precedent. The
// `messageOverlay.baseline.json` carries none of the six sentences below, so no overlay verdict
// moves.
//
// ENDURE FIRE AND ITS SIBLINGS ARE NOT IN THIS STATE. `You feel protected from fire.` and `Your
// endurance to fire fades.` are what the game prints, and they are untouched.

import type { SpellCorrection } from './spellCorrections'

export const RESIST_FAMILY_CORRECTIONS: readonly SpellCorrection[] = [
  {
    spells: ['Resist Fire'],
    field: 'msgCastOnYou',
    from: 'You feel resistant from fire.',
    to: 'You feel resistant to fire.',
    attribution: 'cast',
    evidence:
      'Resist Fire 7/26 casts; owner log 294 lines of the `to` form, 0 of the `from` form (2026-09-25).'
  },
  {
    spells: ['Resist Cold'],
    field: 'msgCastOnYou',
    from: 'You feel resistant from cold.',
    to: 'You feel resistant to cold.',
    attribution: 'cast',
    evidence:
      'Resist Cold 5/24 casts; owner log 277 lines of the `to` form, 0 of the `from` form (2026-09-25).'
  },
  {
    spells: ['Resist Poison'],
    field: 'msgCastOnYou',
    from: 'You feel resistant from poison.',
    to: 'You feel resistant to poison.',
    attribution: 'cast',
    evidence:
      'Resist Poison 4/23 casts; owner log 262 lines of the `to` form, 0 of the `from` form (2026-09-25).'
  },
  {
    spells: ['Resist Disease'],
    field: 'msgCastOnYou',
    from: 'You feel resistant from disease.',
    to: 'You feel resistant to disease.',
    attribution: 'cast',
    evidence:
      'Resist Disease 1/10 casts; owner log 99 lines of the `to` form, 0 of the `from` form (2026-09-25).'
  },
  {
    spells: ['Resist Fire'],
    field: 'msgWearsOff',
    from: 'Your resist fire fades.',
    to: 'Your fire resistance fades.',
    attribution: 'db',
    evidence:
      'Resist Cold, Poison and Disease carry `Your <element> resistance fades.` verbatim. Owner log: 100 lines of `Your fire resistance fades.`, 0 of `Your resist fire fades.` (2026-09-25).'
  },
  {
    spells: ['Resist Magic'],
    field: 'msgWearsOff',
    from: 'Your resist magic fades.',
    to: 'Your magic resistance fades.',
    attribution: 'db',
    evidence:
      'Resistance to Magic carries `Your magic resistance fades.` verbatim. Owner log: 99 lines of `Your magic resistance fades.`, 0 of `Your resist magic fades.` (2026-09-25).'
  }
]
