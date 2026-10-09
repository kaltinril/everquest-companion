// conColor.test.mts — the con card's standing line (upstream issue #75): the con colour a difficulty
// clause means, and the faction rung, as both card paths build them.
//
// The table is the measurement in `src/shared/conColor.ts`'s header; these pin its reading and its
// refusals, so a clause gaining a colour is a decision someone makes in that table, not a drift.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CON_COLOR_HEX, CON_COLOR_LABEL, conColorOf } from '../src/shared/conColor'
import { conCardStanding } from '../src/shared/conCard'
import { CONSIDER_FACTION_RUNGS } from '../src/shared/considerFaction'

test('the seven measured clauses read gray through red, in the order the levels put them', () => {
  const ladder = [
    ['You could probably win this fight.', 'gray'],
    ["You would probably win this fight... it's not certain though.", 'green'],
    ['looks kind of dangerous.', 'lightBlue'],
    ['it appears to be quite formidable.', 'blue'],
    ['looks like quite a gamble.', 'white'],
    ['looks like it would wipe the floor with you!', 'yellow'],
    ['what would you like your tombstone to say?', 'red']
  ] as const
  for (const [clause, color] of ladder) assert.equal(conColorOf(clause), color, clause)
  assert.deepEqual(Object.keys(CON_COLOR_LABEL), ladder.map(([, c]) => c))
  assert.deepEqual(Object.keys(CON_COLOR_HEX), ladder.map(([, c]) => c))
})

test('the gendered clauses and stray whitespace fold onto the same colour', () => {
  assert.equal(conColorOf('he appears to be quite formidable.'), 'blue')
  assert.equal(conColorOf('She appears to be quite formidable.'), 'blue')
  assert.equal(conColorOf('looks like he would wipe the floor with you!'), 'yellow')
  assert.equal(conColorOf('  looks  like quite a gamble.  '), 'white')
})

test('a clause the measurement could not pair gets no colour, never a guessed one', () => {
  for (const clause of [
    'looks like a reasonably safe opponent.',
    'looks quite risky, but might be worth a try.',
    'looks kind of risky, but you might win.',
    'looks kind of risky... you might win.   ',
    'a sentence no log has ever printed'
  ]) {
    assert.equal(conColorOf(clause), undefined, clause)
  }
})

test('the standing carries the rung, the verbatim clause and the colour it means', () => {
  assert.deepEqual(conCardStanding('scowls', 'what would you like your tombstone to say?'), {
    faction: 'scowls',
    difficulty: 'what would you like your tombstone to say?',
    conColor: 'red'
  })
  // An unmeasured clause still reaches the card in words, with no colour beside it.
  assert.deepEqual(conCardStanding('amiably', 'looks like a reasonably safe opponent.'), {
    faction: 'amiably',
    difficulty: 'looks like a reasonably safe opponent.'
  })
})

test('a rung the ladder does not name is dropped, and an absent line gives an empty standing', () => {
  // It crosses a socket under serve: a string is checked against the ladder, never cast.
  assert.deepEqual(conCardStanding('adores you', 'looks like quite a gamble.'), {
    difficulty: 'looks like quite a gamble.',
    conColor: 'white'
  })
  assert.deepEqual(conCardStanding(undefined, undefined), {})
  assert.deepEqual(conCardStanding('', '   '), {})
  for (const { faction } of CONSIDER_FACTION_RUNGS) {
    assert.equal(conCardStanding(faction, undefined).faction, faction)
  }
})
