// Friends online from /who (competitor quick wins; owner, 2026-10-29): listing lines read from the
// log (rows as tests/logScrub.test.mts and the engine's roster_who.rs know them), folded into one
// listing, and the friend list matched against it (shared/whoFriends.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addFriend,
  EMPTY_WHO_FOLD,
  foldWho,
  friendsSeen,
  readFriends,
  readWhoResult,
  removeFriend,
  seenFriendNames,
  WHO_LINE_REGEX,
  whoLine,
  type WhoFold
} from '../src/shared/whoFriends.ts'

const T = '[Tue Jul 28 14:11:26 2026] '
const LISTING = [
  `${T}Players in EverQuest Legends:`,
  `${T}---------------------------`,
  `${T}[ANONYMOUS] Brash `,
  `${T}[3 WAR/NEC] Redlola (Human)  ZONE: West Commonlands (commons)  `,
  `${T}[50 SHD/WIZ/ENC] Rodrigo (Wood Elf) <M E S S> ZONE: New Sebilis Expedition (newsebexp)  `,
  `${T} AFK [8 WAR/MNK] Newbie (Human)  ZONE: Qeynos Hills (qeytoqrg)`,
  `${T}* RIP * [3 CLR/DRU] Ehle's corpse (Dark Elf)  ZONE: West Commonlands (commons)  `,
  `${T}There are 5 players in EverQuest Legends.`
]

function run(lines: readonly string[], at = 1000, fold: WhoFold = EMPTY_WHO_FOLD): WhoFold {
  return lines.reduce((f, line) => foldWho(f, line, at).fold, fold)
}

test('a listing\'s lines: header, rows (anonymous, AFK, guild, corpse), footer; chat is nothing', () => {
  assert.deepEqual(whoLine(LISTING[0]), { kind: 'header', source: 'who' })
  assert.equal(whoLine(LISTING[1]), null)
  assert.deepEqual(whoLine(LISTING[2]), { kind: 'row', name: 'Brash' })
  assert.deepEqual(whoLine(LISTING[4]), { kind: 'row', name: 'Rodrigo' })
  assert.deepEqual(whoLine(LISTING[5]), { kind: 'row', name: 'Newbie' })
  assert.deepEqual(whoLine(LISTING[6]), { kind: 'row', name: 'Ehle' })
  assert.deepEqual(whoLine(LISTING[7]), { kind: 'footer' })
  assert.deepEqual(whoLine(`${T}There is 1 player in EverQuest Legends.`), { kind: 'footer' })
  assert.deepEqual(whoLine(`${T}Friends currently on EverQuest Legends:`), { kind: 'header', source: 'friends' })
  for (const chat of [
    `${T}Grynn tells the group, '[50 WAR/NEC/ENC] Grynn ZONE: build'`,
    `${T}You say, 'Players in EverQuest Legends:'`,
    'Players in EverQuest Legends:'
  ]) {
    assert.equal(whoLine(chat), null, chat)
  }
})

test('the engine trigger passes every listing line and no chat line', () => {
  const re = new RegExp(WHO_LINE_REGEX, 'i')
  for (const line of LISTING.filter((l) => !l.includes('----'))) assert.match(line, re)
  assert.doesNotMatch(`${T}Grynn tells the group, '[50 WAR/NEC/ENC] Grynn'`, re)
})

test('one /who folds into one listing stamped with its header', () => {
  const f = run(LISTING)
  assert.deepEqual(f.current, { at: 1000, names: ['Brash', 'Redlola', 'Rodrigo', 'Newbie', 'Ehle'], source: 'who' })
  assert.equal(f.closed, true)
})

test('the next /who replaces it; a row long after with no header starts its own listing', () => {
  const first = run(LISTING)
  const second = run([`${T}Players in EverQuest Legends:`, `${T}[50 WAR/NEC/ENC] Grynn (Werewolf)  ZONE: Halas (halas)`], 9000, first)
  assert.deepEqual(second.current?.names, ['Grynn'])
  assert.equal(second.current?.at, 9000)
  const orphan = run([`${T}[50 WAR] Solo (Human)  ZONE: Halas (halas)`], 20_000, second)
  assert.deepEqual(orphan.current, { at: 20_000, names: ['Solo'], source: 'who' })
})

test('a /who that found nobody is an empty listing, not the old one', () => {
  const first = run(LISTING)
  const none = run([`${T}There are no players in EverQuest Legends that match those who filters.`], 60_000, first)
  assert.deepEqual(none.current, { at: 60_000, names: [], source: 'who' })
})

test('the friend list: typed names as the game spells them, no repeats, seen ones first', () => {
  let friends = addFriend([], 'grynn')
  friends = addFriend(friends, ' Rodrigo ')
  friends = addFriend(friends, 'GRYNN')
  friends = addFriend(friends, 'not a name')
  assert.deepEqual(friends, ['Grynn', 'Rodrigo'])
  const last = run(LISTING).current
  assert.deepEqual(friendsSeen(friends, last), [
    { name: 'Rodrigo', seen: true },
    { name: 'Grynn', seen: false }
  ])
  assert.deepEqual(seenFriendNames(friends, last), ['Rodrigo'])
  assert.deepEqual(seenFriendNames(friends, null), [])
  assert.deepEqual(removeFriend(friends, 'Grynn'), ['Rodrigo'])
})

test('stored values are validated on the way back in', () => {
  assert.deepEqual(readFriends('["grynn","Grynn",3,"x y"]'), ['Grynn'])
  assert.deepEqual(readFriends('nope'), [])
  assert.deepEqual(readWhoResult('{"at":5,"names":["A",1],"source":"friends"}'), { at: 5, names: ['A'], source: 'friends' })
  assert.equal(readWhoResult('null'), null)
  assert.equal(readWhoResult(undefined), null)
})
