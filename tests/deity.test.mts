// R2's FOURTH CONDITION — deity (owner report, kaltinril 2026-09-11).
//
// *"apparently diety or religion is another condition we missed for the exaltations. scalp of the
// goul lord is an example that looks like it works on my friend Malkil, but it doesn't because of
// his diety"*.
//
// Two witnesses have to agree for this rule to work at all and they spell the gods differently:
// the game's achievements file writes `Cazic Thule` and `Tribunal`, the wiki writes `Cazic-Thule`
// and `[[The Tribunal]]`. Everything pinned below is a difference MEASURED between those two, or a
// format MEASURED on the committed corpus. `shared/planner/deity.ts` carries the argument for why
// this rule is checkable where the race rule beside it is not.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEITIES, deitiesOf, deityFits, deityKey, isDeity } from '../src/shared/planner/deity'
import { confirmedDeity, parseAchievementsDump } from '../src/shared/outputs/achievements'

test('the two witnesses fold onto one spelling', () => {
  // The wiki's side.
  assert.equal(deityKey('Cazic-Thule'), 'CAZIC THULE')
  assert.equal(deityKey('[[The Tribunal]]'), 'TRIBUNAL')
  assert.equal(deityKey('The Tribunal'), 'TRIBUNAL')
  // The achievements file's side, already in folded shape.
  assert.equal(deityKey('Cazic Thule'), 'CAZIC THULE')
  assert.equal(deityKey('Tribunal'), 'TRIBUNAL')
  // A name the game does not have is NOT repaired onto one it does (law 12: no fuzzy joins).
  assert.equal(deityKey('Xegony'), 'XEGONY')
  assert.equal(isDeity('XEGONY'), false)
  assert.equal(isDeity('CAZIC THULE'), true)
  assert.equal(DEITIES.length, 17, 'sixteen gods and Agnostic, from the game`s own unlock block')
})

test('the reported item reads the way the game states it', () => {
  // `Scalp of the Ghoul Lord`, verbatim from the committed corpus - the item Malkil could not use.
  const scalp = 'Lore Equipped, No Trade\n\nSlot: HEAD\n\nAC: 7\n\nCharisma: +4\n\nSize: Tiny WT: 0.4\n\nClass: WAR CLR SHD MNK ROG SHM NEC WIZ MAG ENC BST BER\n\nRace: ALL\n\nDieties: Bertoxxulous, Cazic-Thule, Innoruuk, Rallos Zek, Veeshan\n\nWorn Effect: Scalp of the Ghoul Lord'
  assert.deepEqual(deitiesOf(scalp), [
    'BERTOXXULOUS',
    'CAZIC THULE',
    'INNORUUK',
    'RALLOS ZEK',
    'VEESHAN'
  ])
})

test('…including the two pages that write the list with no separator at all', () => {
  // `Kejekan Smithy Hammer` and `Soulforge Hammer`. The names contain spaces (`Rallos Zek`), so no
  // split on whitespace can read this - only a scan of the closed vocabulary can.
  assert.deepEqual(deitiesOf('Deity: Bertoxxulous Cazic-Thule Innoruuk Rallos Zek'), [
    'BERTOXXULOUS',
    'CAZIC THULE',
    'INNORUUK',
    'RALLOS ZEK'
  ])
  // The slash form, and the wiki's own `Dieties` misspelling, both read.
  assert.deepEqual(deitiesOf('Dieties: The Tribunal / Rallos Zek'), ['TRIBUNAL', 'RALLOS ZEK'])
  // A god the game has never named survives as itself, to be reported by the build census.
  assert.deepEqual(deitiesOf('Deity: Xegony'), ['XEGONY'])
  // No line at all is the ordinary case and is NOT a restriction to nobody (law 1).
  assert.deepEqual(deitiesOf('Slot: HEAD\n\nAC: 7'), [])
  assert.deepEqual(deitiesOf(undefined), [])
})

test('both unknowns pass, because they are our ignorance and not a restriction', () => {
  const scalp = ['BERTOXXULOUS', 'CAZIC THULE', 'INNORUUK', 'RALLOS ZEK', 'VEESHAN']
  assert.equal(deityFits(scalp, 'CAZIC THULE'), true, 'the owner follows one of them')
  assert.equal(deityFits(scalp, 'TUNARE'), false, 'Malkil`s case: the item states gods, his is not one')
  assert.equal(deityFits(scalp, null), true, 'nobody has told us his deity - do not filter')
  assert.equal(deityFits([], 'TUNARE'), true, 'an item stating no deity restricts nobody')
})

test('the achievements dump names the one deity the character confirmed', () => {
  // The shape of the real `Untapped Potential: Deity` block: seventeen achievements, one complete.
  const block = [
    'Untapped Potential: Deity',
    'I\tDeity Unlock - Bertoxxulous',
    'I\t\tThis achievement will autocomplete if you chose to confirm your Deity as Bertoxxulous.',
    'C\tDeity Unlock - Cazic Thule',
    'C\t\tThis achievement will autocomplete if you chose to confirm your Deity as Cazic Thule.',
    'I\t\tThis achievement can be bypassed using a Deity Unlock Token.',
    'I\tDeity Unlock - Tunare',
    'I\t\tThis achievement will autocomplete if you chose to confirm your Deity as Tunare.'
  ].join('\n')
  assert.equal(confirmedDeity(parseAchievementsDump(block)), 'Cazic Thule')
  assert.equal(deityKey(confirmedDeity(parseAchievementsDump(block)) ?? ''), 'CAZIC THULE')

  // A file that confirms NOTHING says nothing - null, never a guess at the first unlocked one.
  const none = block.replace(/^C/gm, 'I')
  assert.equal(confirmedDeity(parseAchievementsDump(none)), null)

  // Two would be a contradiction. Nobody follows two gods, so the honest answer is that we do not
  // know which the file means (law 1) - and every consumer reads null as "do not filter".
  const two = block.replace('I\t\tThis achievement will autocomplete if you chose to confirm your Deity as Tunare.',
    'C\t\tThis achievement will autocomplete if you chose to confirm your Deity as Tunare.')
  assert.equal(confirmedDeity(parseAchievementsDump(two.replace('I\tDeity Unlock - Tunare', 'C\tDeity Unlock - Tunare'))), null)
})

// The committed corpus is the real witness for the parse, the way `plannerEraCorpus` is for era.
test('every deity the committed corpus states is one the game names', () => {
  const db = JSON.parse(readFileSync('src/main/data/items.json', 'utf8')) as {
    items: Record<string, { statsBlock?: string; stats?: { effects?: unknown[] } }>
  }
  const unknown = new Map<string, string>()
  let restricted = 0
  let donors = 0
  for (const [key, entry] of Object.entries(db.items)) {
    const deities = deitiesOf(entry.statsBlock)
    if (deities.length === 0) continue
    restricted++
    if ((entry.stats?.effects ?? []).length > 0) donors++
    for (const d of deities) if (!isDeity(d)) unknown.set(d, key)
  }
  // An unrecognised token BLOCKS rather than passes, so a new spelling would quietly make an item
  // unusable. This assertion is the tripwire, and `GearBuildStats.unknownDeityTokens` is its twin.
  assert.deepEqual([...unknown], [], 'a deity token the game does not name - check the fold')
  // The census, so a rescrape that changes the shape of the answer is visible rather than silent.
  assert.equal(restricted, 457, 'pages stating a deity line')
  assert.equal(donors, 20, 'of those, the effect-bearing ones - every possible exaltation donor')
})
