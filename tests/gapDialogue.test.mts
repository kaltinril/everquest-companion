// A new NPC page's Copy carries the whole conversation (owner, 2026-11-21, of Malloy the Songbird: "We
// should be building up the full interaction chain with these guys"). The lines are the owner's log.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dialogueText, mergeDialogue, orderedTurns, type Dialogue } from '../src/shared/gapDialogue'
import { merchantDescription } from '../src/shared/gapMerchantDescription'
import type { GapRow } from '../src/shared/gaps'

const NAME = 'Malloy the Songbird'
const HAIL = 'Hello, Drywrought! I am Malloy the Songbird. Are you just [traveling] through, or would you like to hear a song of my [adventures]?'
const MALLOY: Dialogue = {
  hail: [HAIL],
  // In the log's order: the second visit's branch comes after the first's, and a re-said keyword is one turn.
  asked: [
    { said: 'Plane of Music', lines: ['With harmonic winds blowing across the demi-plane...'] },
    { said: 'farmstead', lines: ["Would you mind leaving already? I don't like people.", 'Our farm is bright and cheery, O, how I treasure it so.', 'From each grain planted to the rain that falls...'] },
    { said: 'traveling', lines: ['Very well, then, good luck to you on your travels.'] },
    { said: 'adventures', lines: ['Ah, excellent!  Would you like to hear about my [childhood] or would you like to hear how I was sent to the Hall of the [Realm of Heroes]?'] },
    { said: 'childhood', lines: ['I was born Malloy Birtonel on a farm. My parents struggled to keep the [farmstead] going.'] },
    { said: 'Realm of Heroes', lines: ['I was sent to the Realm of Heroes by a [vision of loveliness].'] },
    { said: 'vision of loveliness', lines: ['I found myself in the [Plane of Music] where a concert was performed in my presence.'] }
  ]
}

const row = (extra: object): GapRow =>
  ({ domain: 'mob', name: NAME, kinds: ['hailed'], count: 1, first: '', last: '', details: { samples: [] }, greeting: HAIL, ...extra }) as unknown as GapRow

test('the keywords follow each other from the hail, depth first in the order they are printed', () => {
  assert.deepEqual(
    orderedTurns(MALLOY.hail, MALLOY.asked).map((t) => t.said),
    ['traveling', 'adventures', 'childhood', 'farmstead', 'Realm of Heroes', 'vision of loveliness', 'Plane of Music']
  )
})

test('a say that words the keyword its own way still follows it; a say nothing leads to comes after, in log order', () => {
  const asked = [
    { said: 'who are you', lines: ['Nobody.'] },
    { said: 'What Dark Truth?', lines: ['The [real truth] is more interesting.'] },
    { said: 'What is the real truth?', lines: ['A theory of mine.'] }
  ]
  assert.deepEqual(
    orderedTurns(['The Seekers of the [Dark Truth].'], asked).map((t) => t.said),
    ['What Dark Truth?', 'What is the real truth?', 'who are you']
  )
})

test("Copy on a new page writes the whole talk in the wiki's layout, the player as ____", () => {
  const text = merchantDescription(row({ dialogue: MALLOY }), { ownNames: ['Drywrought'] })?.text ?? ''
  assert.ok(text.startsWith(`You say, 'Hail, ${NAME}'\n\n${NAME} says, 'Hello, ____! I am`), text)
  assert.ok(text.includes(`You say, 'traveling'\n\n${NAME} says, 'Very well`), text)
  assert.ok(text.includes(`You say, 'farmstead'\n\n${NAME} says, 'Would you mind leaving already? I don't like people.'\n\n${NAME} says, 'Our farm is bright`), text)
  assert.ok(text.includes('[Realm of Heroes]'), 'keywords as printed')
  assert.ok(!text.includes('Drywrought'))
  assert.equal(text.match(/You say, /g)?.length, 8, 'the hail and seven keywords')
})

test('a greeting alone keeps the form it always had; a page that exists and a generic mob get no talk', () => {
  assert.equal(merchantDescription(row({ greeting: 'Hi.' }), {})?.text, `:You say, 'Hail ${NAME}'\n\n${NAME} says, 'Hi.'`)
  assert.equal(merchantDescription(row({ domain: 'merchant', dialogue: MALLOY }), { isMob: () => true }), undefined)
  assert.equal(merchantDescription(row({ name: 'a kobold', dialogue: MALLOY }), {}), undefined)
})

test('a hail answered too late for the dialogue still opens the talk from the greeting', () => {
  const text = dialogueText(NAME, { hail: [], asked: [{ said: 'adventures', lines: ['Ah.'] }] }, HAIL, (l) => l)
  assert.ok(text.startsWith(`You say, 'Hail, ${NAME}'\n\n${NAME} says, '${HAIL}'\n\nYou say, 'adventures'`), text)
})

test("the player's name is masked in their own says too: the page is public", () => {
  const talk: Dialogue = { hail: ['Hello.'], asked: [{ said: 'Drywrought seeks adventures', lines: ['Ah.'] }] }
  const text = merchantDescription(row({ greeting: 'Hello.', dialogue: talk }), { ownNames: ['Drywrought'] })?.text ?? ''
  assert.ok(text.includes("You say, '____ seeks adventures'"), text)
  assert.ok(!text.includes('Drywrought'), text)
})

test('two logs join: every keyword either heard, each with its fullest answer', () => {
  const older: Dialogue = { hail: [HAIL], asked: [{ said: 'farmstead', lines: ['a', 'b', 'c'] }, { said: 'childhood', lines: ['old'] }] }
  const newer: Dialogue = { hail: [HAIL], asked: [{ said: 'Farmstead', lines: ['a'] }, { said: 'childhood', lines: ['new'] }, { said: 'traveling', lines: ['t'] }] }
  assert.deepEqual(mergeDialogue(older, newer), {
    hail: [HAIL],
    asked: [{ said: 'Farmstead', lines: ['a', 'b', 'c'] }, { said: 'childhood', lines: ['new'] }, { said: 'traveling', lines: ['t'] }]
  })
  assert.equal(mergeDialogue(older, undefined), older)
  assert.equal(mergeDialogue(undefined, newer), newer)
})
