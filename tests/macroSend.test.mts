// Sending a set to a character file, the pure half: the [Socials] section replaced with every
// other byte kept, what blocks a send, and the names of the two copies (fork #11, P2).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupsOf, lastCopyName, listedBackups, originalCopyName, parseBackupName, planBackup, planLastCopy } from '../src/shared/macros/backups'
import { diffSetAgainstFile } from '../src/shared/macros/sets'
import { parseSocials, pickCharacterFiles } from '../src/shared/macros/socials'
import { outsideSocials, replaceSocials, sameOutsideSocials, socialsAfterSend } from '../src/shared/macros/socialsWrite'
import type { GameMacro } from '../src/shared/macros/types'
import { readGameMacros, unsavable } from '../src/shared/macros/unsavable'

const BEFORE = ['[Defaults]', 'Mouse=1', '', '[HotButtons]', 'Page1Button9=E13,@-1,0000000000000000,0,,', 'Page1Button10=a=b,c=d,,', '']
const SOCIALS = [
  '[Socials]',
  'Page2Button4Line1=/say brought back',
  'Page1Button1Name=Built in',
  'Page1Button1Color=2',
  'Page2Button1Name=NeckTurnin',
  'Page2Button1Color=0',
  'Page1Button1Line1=/who',
  'Page2Button4Name=broughtback',
  'Page2Button4Color=13'
]
const AFTER = ['', '', '[HotButtons2]', 'Page2Button1Name=NotAMacro', 'Page1Button1=E14,@-1,0,0,,', '', '']

const SET: GameMacro[] = [
  { page: 2, button: 2, name: 'Assist', color: 3, lines: ['/assist Brannoc', '', '/attack on'] },
  { page: 3, button: 12, name: 'Café', color: 19, lines: ['/g a=b, c'] }
]
const SET_KEYS = [
  'Page2Button2Name=Assist',
  'Page2Button2Color=3',
  'Page2Button2Line1=/assist Brannoc',
  'Page2Button2Line3=/attack on',
  'Page3Button12Name=Café',
  'Page3Button12Color=19',
  'Page3Button12Line1=/g a=b, c'
]
const PAGE1_KEYS = ['Page1Button1Name=Built in', 'Page1Button1Color=2', 'Page1Button1Line1=/who']
const PAGE1: GameMacro = { page: 1, button: 1, name: 'Built in', color: 2, lines: ['/who'] }

for (const [label, eol] of [
  ['CRLF', '\r\n'],
  ['LF', '\n']
] as const) {
  test(`${label}: only the section changes; page 1 is kept ahead of the new keys`, () => {
    const file = [...BEFORE, ...SOCIALS, ...AFTER].join(eol)
    const out = replaceSocials(file, SET)
    assert.equal(out, [...BEFORE, '[Socials]', ...PAGE1_KEYS, ...SET_KEYS, ...AFTER].join(eol))
    assert.equal(out.startsWith(BEFORE.join(eol) + eol), true)
    assert.equal(out.endsWith(eol + AFTER.join(eol)), true)
    assert.equal(sameOutsideSocials(file, out), true)
    assert.deepEqual(parseSocials(out), [PAGE1, ...SET])
    assert.deepEqual(parseSocials(out), socialsAfterSend(file, SET))
  })
}

test('an empty set leaves the header and page 1; sending twice changes nothing more', () => {
  const file = [...BEFORE, ...SOCIALS, ...AFTER].join('\r\n')
  const emptied = replaceSocials(file, [])
  assert.equal(emptied, [...BEFORE, '[Socials]', ...PAGE1_KEYS, ...AFTER].join('\r\n'))
  const once = replaceSocials(file, SET)
  assert.equal(replaceSocials(once, SET), once)
})

test('a file that ends inside the section, with and without a last line break', () => {
  const open = ['[HotButtons]', 'Page1Button9=E13', '[Socials]', 'Page2Button1Name=old'].join('\r\n')
  assert.equal(replaceSocials(open, SET), ['[HotButtons]', 'Page1Button9=E13', '[Socials]', ...SET_KEYS].join('\r\n'))
  assert.equal(replaceSocials(open + '\r\n', SET), ['[HotButtons]', 'Page1Button9=E13', '[Socials]', ...SET_KEYS, ''].join('\r\n'))
  const headerOnly = '[HotButtons]\nPage1Button9=E13\n[Socials]'
  assert.equal(replaceSocials(headerOnly, SET), ['[HotButtons]', 'Page1Button9=E13', '[Socials]', ...SET_KEYS].join('\n'))
  for (const text of [open, open + '\r\n', headerOnly]) assert.equal(sameOutsideSocials(text, replaceSocials(text, SET)), true)
})

test('no section: one is added at the end, after a line break', () => {
  const closed = '[HotButtons]\r\nPage1Button9=E13\r\n'
  assert.equal(replaceSocials(closed, SET), closed + ['[Socials]', ...SET_KEYS, ''].join('\r\n'))
  const open = '[HotButtons]\nPage1Button9=E13'
  assert.equal(replaceSocials(open, SET), open + '\n' + ['[Socials]', ...SET_KEYS, ''].join('\n'))
  // No line break anywhere: the game's CRLF.
  assert.equal(replaceSocials('', SET), ['[Socials]', ...SET_KEYS, ''].join('\r\n'))
  assert.equal(replaceSocials('[HotButtons]', []), '[HotButtons]\r\n[Socials]\r\n')
  for (const text of [closed, open, '', '[HotButtons]']) {
    const out = replaceSocials(text, SET)
    assert.equal(sameOutsideSocials(text, out), true)
    assert.deepEqual(parseSocials(out), SET)
  }
})

test('two sections: the first is rewritten, the later one removed, its page 1 kept', () => {
  const file = [
    '[Socials]',
    'Page2Button1Name=first',
    '',
    '[HotButtons]',
    'Page1Button9=E13',
    '[SOCIALS] ',
    'Page1Button1Name=Built in',
    'Page1Button1Color=2',
    'Page1Button1Line1=/who',
    'Page2Button1Name=second',
    '',
    '[Last]',
    'x=1',
    ''
  ].join('\r\n')
  const out = replaceSocials(file, SET)
  assert.equal(out, ['[Socials]', ...PAGE1_KEYS, ...SET_KEYS, '', '[HotButtons]', 'Page1Button9=E13', '', '[Last]', 'x=1', ''].join('\r\n'))
  assert.equal(outsideSocials(file), ['', '[HotButtons]', 'Page1Button9=E13', '', '[Last]', 'x=1', ''].join('\r\n'))
  assert.equal(sameOutsideSocials(file, out), true)
  assert.deepEqual(parseSocials(out), socialsAfterSend(file, SET))
})

test('a line in the section that is not a macro key is kept; blank lines between keys are not', () => {
  const file = ['[Socials]', '; my note', 'Page2Button1Name=old', '', 'Other=1', 'Page2Button1Line1=/sit', '[Next]'].join('\n')
  assert.equal(replaceSocials(file, [SET[0]]), ['[Socials]', '; my note', 'Other=1', ...SET_KEYS.slice(0, 4), '[Next]'].join('\n'))
})

test('a change outside the section is seen', () => {
  const file = [...BEFORE, ...SOCIALS, ...AFTER].join('\r\n')
  const out = replaceSocials(file, SET)
  assert.equal(sameOutsideSocials(file, out.replace('E13', 'E14')), false)
  assert.equal(sameOutsideSocials(file, out + '\r\n'), false)
  assert.equal(sameOutsideSocials('[HotButtons]\r\nA=1', '[HotButtons]\r\nA=1[Socials]\r\n'), false)
})

test('the diff leaves page 1 of the file alone', () => {
  const file = parseSocials([...BEFORE, ...SOCIALS, ...AFTER].join('\r\n'))
  assert.equal(file.some((m) => m.page === 1), true)
  assert.deepEqual(
    diffSetAgainstFile(SET, file).map((d) => [d.page, d.button, d.kind]),
    [
      [2, 1, 'removed'],
      [2, 2, 'added'],
      [2, 4, 'removed'],
      [3, 12, 'added']
    ]
  )
  assert.deepEqual(diffSetAgainstFile([], [PAGE1]), [])
})

test('unsavable: what blocks a send, each named with its slot', () => {
  const ok: GameMacro = { page: 2, button: 1, name: 'Assist', color: 3, lines: ['/assist', '', '', '', '/attack on'] }
  assert.deepEqual(unsavable([ok, { ...ok, button: 2, name: 'Café ÿ', lines: ['/say a=b\tc'] }]), [])
  assert.deepEqual(unsavable([]), [])
  const codes = (m: GameMacro): string[] => unsavable([m]).map((p) => p.code)
  assert.deepEqual(codes({ ...ok, name: '' }), ['name-empty'])
  assert.deepEqual(codes({ ...ok, name: '  ' }), ['name-empty'])
  assert.deepEqual(codes({ ...ok, lines: ['1', '2', '3', '4', '5', '6'] }), ['too-many-lines'])
  assert.deepEqual(codes({ ...ok, lines: ['1', '2', '3', '4', '5', '', ''] }), [])
  assert.deepEqual(codes({ ...ok, name: 'a\nb' }), ['line-break'])
  assert.deepEqual(codes({ ...ok, lines: ['/say x\ry'] }), ['line-break'])
  assert.deepEqual(codes({ ...ok, lines: ['/say ’'] }), ['bad-character'])
  assert.deepEqual(codes({ ...ok, name: 'smile \u{1f600}' }), ['bad-character'])
  assert.deepEqual(codes({ ...ok, color: 1.5 }), ['bad-color'])
  for (const page of [0, 1, 11, 2.5]) assert.deepEqual(codes({ ...ok, page }), ['bad-slot'])
  for (const button of [0, 13, -1]) assert.deepEqual(codes({ ...ok, button }), ['bad-slot'])
  assert.deepEqual(codes({ ...ok, page: 10, button: 12 }), [])
  assert.deepEqual(
    unsavable([ok, ok]).map((p) => p.code),
    ['duplicate-slot']
  )
  assert.equal(unsavable([{ ...ok, name: '' }])[0].text, 'Page 2, button 1 has no name.')
  assert.equal(unsavable([{ ...ok, lines: ['’'] }])[0].text, 'Page 2, button 1 has a character the game file cannot hold: ’')
})

test('a savable set reads back as it was sent, through latin1 bytes', () => {
  const file = [...BEFORE, ...SOCIALS, ...AFTER].join('\r\n')
  assert.deepEqual(unsavable(SET), [])
  const bytes = Buffer.from(replaceSocials(file, SET), 'latin1')
  assert.deepEqual(parseSocials(bytes.toString('latin1')), [PAGE1, ...SET])
})

test('macros from outside: a list of them is read, anything else is not', () => {
  const extra = { ...SET[0], id: 'x' }
  assert.deepEqual(readGameMacros([extra]), [SET[0]])
  assert.deepEqual(readGameMacros([]), [])
  for (const bad of [null, 'x', {}, [null], [{ ...SET[0], lines: [1] }], [{ ...SET[0], page: '2' }], [{ ...SET[0], name: undefined }]]) {
    assert.equal(readGameMacros(bad), null)
  }
})

const INI = 'Drywrought_oggok_LO1.ini'
const ORIGINAL = 'Drywrought_oggok_LO1.ini.companion-original-2026-11-20.bak'
const LAST_1 = 'Drywrought_oggok_LO1.ini.companion-last-2026-11-21_090503.bak'
const LAST_2 = 'Drywrought_oggok_LO1.ini.companion-last-2026-11-22_235959.bak'
// Other people's files, and another character's copies: never this file's, never removed.
const FOREIGN = [
  'Drywrought_oggok_LO1.ini.bak',
  'Drywrought_oggok_LO1.bak',
  'Drywrought_oggok_LO1.ini.before-copy-2026-10-18',
  'Drywrought_oggok_LO1_Backup_1.ini',
  'UI_Drywrought_oggok_LO1.ini',
  'Other_oggok_LO1.ini.companion-original-2026-01-01.bak',
  'Other_oggok_LO1.ini.companion-last-2026-01-01_000000.bak',
  'Drywrought_oggok_LO1.ini.companion-last-2026-11-21.bak',
  'Drywrought_oggok_LO1.ini.companion-original-2026-11-20_090503.bak'
]

test('copy names: local date, and the time on a last copy', () => {
  assert.equal(originalCopyName(INI, new Date(2026, 10, 20, 9, 5, 3)), ORIGINAL)
  assert.equal(lastCopyName(INI, new Date(2026, 10, 21, 9, 5, 3)), LAST_1)
  assert.equal(lastCopyName(INI, new Date(2026, 10, 22, 23, 59, 59)), LAST_2)
  assert.deepEqual(parseBackupName(ORIGINAL), { file: INI, kind: 'original', date: '2026-11-20', time: null })
  assert.deepEqual(parseBackupName(LAST_1), { file: INI, kind: 'last', date: '2026-11-21', time: '09:05:03' })
  for (const name of [INI, ...FOREIGN.slice(0, 5), FOREIGN[7], FOREIGN[8]]) assert.equal(parseBackupName(name), null)
  // A copy is never taken for a character file.
  assert.deepEqual(pickCharacterFiles([ORIGINAL, LAST_1, INI]).map((f) => f.file), [INI])
})

test('the plan across a first, second and third write', () => {
  const first = planBackup(INI, [INI, ...FOREIGN], new Date(2026, 10, 20, 9, 5, 3))
  assert.deepEqual(first, { original: null, lasts: [], create: ORIGINAL, kind: 'original', removeAfter: [] })

  const second = planBackup(INI, [INI, ORIGINAL, ...FOREIGN], new Date(2026, 10, 21, 9, 5, 3))
  assert.deepEqual(second, { original: ORIGINAL, lasts: [], create: LAST_1, kind: 'last', removeAfter: [] })

  const third = planBackup(INI, [LAST_1, INI, ...FOREIGN, ORIGINAL], new Date(2026, 10, 22, 23, 59, 59))
  assert.deepEqual(third, { original: ORIGINAL, lasts: [LAST_1], create: LAST_2, kind: 'last', removeAfter: [LAST_1] })
})

test('the plan never names a file that is not one of this ini’s copies', () => {
  const names = [INI, ORIGINAL, LAST_2, LAST_1, ...FOREIGN]
  const plan = planBackup(INI, names, new Date(2026, 10, 23, 1, 2, 3))
  assert.deepEqual(plan.removeAfter, [LAST_1, LAST_2])
  assert.deepEqual(backupsOf(INI, names), { originals: [ORIGINAL], lasts: [LAST_1, LAST_2] })
  assert.equal(listedBackups(INI, names).original?.name, ORIGINAL)
  assert.equal(listedBackups(INI, names).last?.name, LAST_2)
  assert.deepEqual(listedBackups(INI, [INI, ...FOREIGN]), { original: null, last: null })
  // Windows names are not case sensitive.
  assert.deepEqual(backupsOf('drywrought_OGGOK_lo1.INI', names).originals, [ORIGINAL])
})

test('a restore always makes a last copy, and never plans to remove the one it makes', () => {
  const now = new Date(2026, 10, 22, 23, 59, 59)
  assert.deepEqual(planLastCopy(INI, [INI, ORIGINAL, LAST_1], now), { original: ORIGINAL, lasts: [LAST_1], create: LAST_2, kind: 'last', removeAfter: [LAST_1] })
  assert.deepEqual(planLastCopy(INI, [INI, ORIGINAL, LAST_2], now).removeAfter, [])
  // A last copy with no original (the player removed it): a send makes a new original, removes nothing.
  assert.deepEqual(planBackup(INI, [INI, LAST_1], now), { original: null, lasts: [LAST_1], create: 'Drywrought_oggok_LO1.ini.companion-original-2026-11-22.bak', kind: 'original', removeAfter: [] })
})
