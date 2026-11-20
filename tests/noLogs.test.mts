// The no-logs screen (fork #9, phase R3). An empty character list hid every tab even while a
// character was attached and being read, and the screen gave one piece of advice ("turn logging
// on") for a folder that does not exist, a folder Windows would not list, and an empty folder.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { folderVerdict, lookedIn, relistOnFocus, showsNoLogs } from '../src/renderer/src/lib/noLogs'
import type { CharacterRef } from '../src/shared/types'

const AYE: CharacterRef = { name: 'Aye', server: 'freeport', logPath: 'D:\\EQ\\Logs\\eqlog_Aye_freeport.txt' }

test('THE SCREEN NEVER COVERS AN ATTACHED CHARACTER, whatever the list says', () => {
  // The list came back empty (the folder dropped out, or was read before the log existed) while
  // the app is reading this character's log: the tabs stay.
  assert.equal(showsNoLogs([], AYE), false, 'an empty list hid every tab over a character being read')
  assert.equal(showsNoLogs([AYE], AYE), false)
})

test('it shows only with no character AND an empty list', () => {
  assert.equal(showsNoLogs([], null), true)
  // Logs exist and none is picked: the title bar's picker is the answer, not this screen.
  assert.equal(showsNoLogs([AYE], null), false)
})

test('THE LIST IS READ AGAIN WHEN THE WINDOW COMES BACK TO THE FRONT, and a failed read changes nothing', async () => {
  let focus: () => void = () => undefined
  let removed = false
  const target = {
    addEventListener: (_type: 'focus', listener: () => void) => {
      focus = listener
    },
    removeEventListener: (_type: 'focus', listener: () => void) => {
      removed = listener === focus
    }
  }
  const answers: (CharacterRef[] | Error)[] = [[AYE], new Error('main threw'), []]
  const applied: CharacterRef[][] = []
  const list = (): Promise<CharacterRef[]> => {
    const next = answers.shift()
    return next instanceof Error || next === undefined ? Promise.reject(next ?? new Error('no answer')) : Promise.resolve(next)
  }
  const stop = relistOnFocus(target, list, (characters) => applied.push(characters))
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(applied, [], 'nothing is read until the window is focused')

  focus()
  await settle()
  assert.deepEqual(applied, [[AYE]], 'a list that was empty at launch stayed empty until restart')
  focus()
  await settle()
  assert.deepEqual(applied, [[AYE]], 'a read that failed emptied the list')

  // An answer that lands after the window let go is dropped.
  focus()
  stop()
  await settle()
  assert.deepEqual(applied, [[AYE]])
  assert.equal(removed, true)
})

test('THE VERDICT: a missing folder, an unreadable folder and an empty folder are three answers', () => {
  assert.equal(folderVerdict({ readable: 'missing', characterCount: 0 }), 'missing')
  assert.equal(folderVerdict({ readable: 'unreadable', characterCount: 0 }), 'unreadable')
  assert.equal(folderVerdict({ readable: 'ok', characterCount: 0 }), 'empty')
  assert.equal(folderVerdict({ readable: 'ok', characterCount: 3 }), 'found')
  // A count left over from an earlier look does not outvote a read that failed.
  assert.equal(folderVerdict({ readable: 'unreadable', characterCount: 3 }), 'unreadable')
  assert.equal(folderVerdict({ readable: 'missing', characterCount: 3 }), 'missing')
})

test('THE FOLDER IS NAMED WITHOUT THE WINDOWS USER NAME', () => {
  assert.equal(lookedIn('C:\\Users\\Jeremy\\Games\\EverQuest Legends\\Logs'), 'Looked in ~\\Games\\EverQuest Legends\\Logs.')
  // A name with a space in it goes whole, not only its first word.
  assert.equal(lookedIn('c:/users/Jeremy Smith/EQ/Logs'), 'Looked in ~/EQ/Logs.')
  // A folder outside any user's is named whole: it is where the player has to look.
  assert.equal(lookedIn('D:\\Games\\EverQuest Legends\\Logs'), 'Looked in D:\\Games\\EverQuest Legends\\Logs.')
  // The machine's shared folder is not a person: the default install lives there.
  const shared = 'C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends\\Logs'
  assert.equal(lookedIn(shared), `Looked in ${shared}.`)
  assert.doesNotMatch(lookedIn(shared), /[\u2013\u2014]/)
})
