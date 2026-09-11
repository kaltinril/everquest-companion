// stackGroundTruth — THE GAME'S OWN VERDICTS, as a regression corpus.
//
// ============================================================================
// WHERE THIS CAME FROM
// ============================================================================
// The owner read the Loadout tab's recommended buff set and did not believe it (2026-09-10):
// *"are you sure all these spells are not going to overlap each-other?"* He was right not to, and
// then he did the thing that settles it - he went and cast them:
//
//     "i just went and cast a whole bunch of spells so you can see that most of them are blocked,
//      read the logs from the last 30+ spells i cast"
//
// EverQuest names both halves when it refuses a buff:
//
//     Your Dexterity spell did not take hold. (Blocked by Harnessing of Spirit.)
//
// So his log holds 40 distinct pairs that the GAME says cannot both stand, with no inference, no
// wiki, and no model in between. That is the strongest evidence this repo has about stacking, and
// it is worth more than any amount of reasoning about EQEmu's source - which is what it overturned.
//
// ============================================================================
// WHAT IT CAUGHT
// ============================================================================
// `checkStackConflict` was a faithful port of EQEmu's lockstep slot walk: slot i against slot i.
// Against these 40 pairs it scored badly, because two spells from different lines keep the same
// effect in different slots - Celerity's haste is in slot 1 and Spirit Quickening's in slot 4, so
// the two were never compared and the engine called them compatible. The Loadout tab was
// recommending two haste buffs, two run speeds and four separate STR buffs at once.
//
// `contestPass` now matches BY EFFECT wherever it sits, and that rule catches all 40 of these.
//
// ============================================================================
// AND WHAT IT DOES NOT CATCH, WHICH IS WHY THIS FILE ALSO HOLDS NEGATIVES
// ============================================================================
// Effect-matching is an OVER-approximation, and the same session proves it: Guardian blocks
// Protect, Turtle Skin and Shifting Shield - the shaman AC line - but Inner Fire, which also
// carries AC, landed while Guardian was up. So "both spells state AC" is not sufficient, and the
// real discriminator is a spell line this client file does not appear to state anywhere (field 85
// is each spell's own id, not a shared group; checked 2026-09-10).
//
// THE ERROR DIRECTION IS THE SAFE ONE AND THAT IS THE WHOLE ARGUMENT FOR SHIPPING IT. A false
// positive makes the Loadout tab recommend FEWER buffs than a player could really run. A false
// negative - what the lockstep walk produced - tells him to keep up a buff the game will refuse,
// and rejects a real buff in its favour. The first is a missed opportunity; the second is wrong
// advice. `KNOWN_FALSE_POSITIVES` pins the one we know about so it cannot grow silently.
//
// ============================================================================
// IT NEEDS THE CLIENT FILE, AND SKIPS WITHOUT IT
// ============================================================================
// `resistBaseline.test.mts`' arrangement exactly, including the env override. The PAIRS below are
// game text out of the owner's own log and are committed; `spells_us.txt` is Daybreak's file, is
// never committed, and is read from whatever install the machine running the tests has.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parseSpellsUs } from '../src/main/resist/spellsUsParse'
import { spellCanonKey } from '../src/shared/spellKey'
import { stackView, spellsConflict, type StackSpellView } from '../src/shared/spellStack'
import type { SpellResistTable } from '../src/shared/resistTypes'

const SPELLS_US =
  process.env.EQ_SPELLS_US ??
  'C:/Users/Public/Daybreak Game Company/Installed Games/EverQuest Legends/spells_us.txt'
const HAVE_CLIENT = existsSync(SPELLS_US)
const skip = !HAVE_CLIENT && 'no client spells_us.txt'

let table: SpellResistTable | null = null
function view(name: string): StackSpellView | null {
  table ??= parseSpellsUs(readFileSync(SPELLS_US, 'latin1'))
  const row = table[spellCanonKey(name)]
  if (!row?.slots) return null
  return stackView({
    id: row.id,
    name,
    goodEffect: row.goodEffect ?? false,
    targetType: row.targetType,
    durationFormula: row.durationFormula ?? 0,
    durationValue: row.durationValue ?? 0,
    song: row.song ?? false,
    slots: row.slots
  })
}

/** The caster level both sides are read at. He was 50; every one of these is a level-50 reading. */
const LEVELS = { worn: 50, cast: 50 }

/**
 * `[worn, cast]` - the game refused `cast` because `worn` was already up.
 *
 * Every one is a `did not take hold. (Blocked by ...)` line from the owner's log, deduped and
 * sorted. Nothing here is inferred.
 */
const BLOCKED: readonly (readonly [string, string])[] = [
  ['Bramblecoat', 'Barbcoat'],
  ['Call of Earth', 'Rage'],
  ['Cascading Darkness', 'Chloroplast'],
  ['Center', 'Courage'],
  ['Form of the Bear', 'Extended Regeneration'],
  ['Form of the Bear', 'Illusion: Skeleton'],
  ['Frenzy', 'Fleeting Fury'],
  ['Guardian', 'Protect'],
  ['Guardian', 'Shifting Shield'],
  ['Guardian', 'Turtle Skin'],
  ['Harnessing of Spirit', 'Deftness'],
  ['Harnessing of Spirit', 'Dexterity'],
  ['Harnessing of Spirit', 'Furious Strength'],
  ['Harnessing of Spirit', 'Infusion of Spirit'],
  ['Harnessing of Spirit', 'Raging Strength'],
  ['Harnessing of Spirit', 'Strength'],
  ['Harnessing of Spirit', 'Talisman of Altuna'],
  ['Harnessing of Spirit', 'Talisman of Tnarg'],
  ['Harnessing of Spirit', 'Talisman of the Beast'],
  ['Harnessing of Spirit', 'Tumultuous Strength'],
  ['Haste', 'Alacrity'],
  ['Haste', 'Quickness'],
  ['Ignite Blood', 'Chloroplast'],
  ['Illusion Benefit Dena', 'Spirit of Bih`Li'],
  ['Illusion Benefit Dena', 'Spirit of the Traveler'],
  ['Illusion: Dark Elf', 'Form of the Bear'],
  ['Rage', 'Fury'],
  ['Resist Fire', 'Endure Fire'],
  ['Resistance to Magic', 'Resist Magic'],
  ['Searing Arrow', 'Form of the Bear'],
  ['Share Wolf Form', 'Form of the Bear'],
  ['Share Wolf Form', 'Spirit of Bih`Li'],
  ['Sicken', 'Form of the Bear'],
  ['Skin like Rock', 'Protection of Wood'],
  ['Skin like Rock', 'Skin like Wood'],
  ['Spirit of Bih`Li', 'Spirit of the Shrew'],
  ['Spirit of Bih`Li', 'Spirit of the Traveler'],
  ['Spirit of Wolf', 'Spirit of the Traveler'],
  ['Stamina', 'Health'],
  ['Talisman of Jasinth', 'Resist Disease']
]

/**
 * Pairs the game demonstrably RAN TOGETHER in the same session.
 *
 * A negative is only admitted when the log proves BOTH halves: the second spell announced itself
 * landing, and the first was blocking something else within the minute, so it was certainly still
 * up. `Scale Skin` looked like a negative and is not in this list - it was INTERRUPTED, not
 * refused, which the log says in as many words and which is exactly the trap a careless reading of
 * "no block message" falls into.
 */
const STACKED: readonly (readonly [string, string])[] = [
  // Harnessing of Spirit was refusing nine stat buffs on either side of these two landing.
  ['Harnessing of Spirit', 'Glamour'],
  ['Harnessing of Spirit', 'Spirit of Bih`Li']
]

/**
 * KNOWN, MEASURED OVER-REPORTS - pairs the game ran together that effect-matching still calls a
 * conflict. See the header: the list exists so the number cannot grow without somebody saying so.
 */
const KNOWN_FALSE_POSITIVES: readonly (readonly [string, string])[] = [
  // Both carry AC. Guardian blocks the shaman AC LINE (Protect, Turtle Skin, Shifting Shield) and
  // Inner Fire is not in it - a distinction that needs a spell line, which this client file does
  // not state. `Inner Fire` landed at 18:58:17 with Guardian up.
  ['Guardian', 'Inner Fire']
]

test('every block the GAME issued is a conflict the engine sees', { skip }, () => {
  const missed: string[] = []
  const unknown: string[] = []
  for (const [worn, cast] of BLOCKED) {
    const a = view(worn)
    const b = view(cast)
    if (a === null || b === null) {
      unknown.push(`${cast} <- ${worn}`)
      continue
    }
    if (!spellsConflict(a, b, LEVELS)) missed.push(`${cast} <- ${worn}`)
  }
  assert.deepEqual(unknown, [], 'every one of these names should resolve against the client file')
  assert.deepEqual(missed, [], 'the game refused these; the engine must not call them compatible')
})

test('…and the pairs it ran together are not reported as conflicts', { skip }, () => {
  for (const [worn, cast] of STACKED) {
    const a = view(worn)
    const b = view(cast)
    assert.ok(a !== null && b !== null, `${worn} / ${cast} should resolve`)
    assert.equal(
      spellsConflict(a, b, LEVELS),
      false,
      `${cast} landed with ${worn} up, so they must not be called a conflict`
    )
  }
})

test('the known over-reports are STILL over-reports - this test fails when one is fixed', { skip }, () => {
  // Deliberately asserts the WRONG answer, so the day somebody narrows the rule this goes red and
  // makes them move the pair into `STACKED` rather than leaving a stale comment behind.
  for (const [worn, cast] of KNOWN_FALSE_POSITIVES) {
    const a = view(worn)
    const b = view(cast)
    assert.ok(a !== null && b !== null, `${worn} / ${cast} should resolve`)
    assert.equal(
      spellsConflict(a, b, LEVELS),
      true,
      `${worn} + ${cast} is a known over-report; if it now stacks, move it to STACKED`
    )
  }
})
