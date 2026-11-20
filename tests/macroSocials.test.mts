// The game's [Socials] section as text, and which game-folder names are character files (fork #11).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { characterFileKey, parseSocials, pickCharacterFiles, renderSocials } from '../src/shared/macros/socials'
import type { GameMacro } from '../src/shared/macros/types'

// Keys out of slot order, a slot with gaps between its lines, neighbours before and after.
const FILE = [
  '[HotButtons]',
  'Page1Button9=E13,@-1,0000000000000000,0,,',
  'Page2Button1Name=NotAMacro',
  '[Socials]',
  'Page2Button4Line1=/say brought back',
  'Page2Button2Name=Enchant Electru',
  'Page2Button2Color=0',
  'Page2Button2Line5=/cast 1',
  'Page2Button2Line1=/pause 72,/cast 1',
  'Page2Button1Name=NeckTurnin',
  'Page2Button1Color=0',
  'Page2Button1Line1=explore the island',
  'Page2Button4Name=broughtback',
  'Page2Button4Color=13',
  'Page3Button1Color=4',
  '[Defaults]',
  'Page2Button9Name=AlsoNotAMacro',
  'Page2Button9Line1=/sit'
]

const EXPECTED: GameMacro[] = [
  { page: 2, button: 1, name: 'NeckTurnin', color: 0, lines: ['explore the island'] },
  { page: 2, button: 2, name: 'Enchant Electru', color: 0, lines: ['/pause 72,/cast 1', '', '', '', '/cast 1'] },
  { page: 2, button: 4, name: 'broughtback', color: 13, lines: ['/say brought back'] }
]

test('keys in any order, sorted by slot, a missing line is an empty line', () => {
  assert.deepEqual(parseSocials(FILE.join('\r\n')), EXPECTED)
})

test('LF reads the same as CRLF', () => {
  assert.deepEqual(parseSocials(FILE.join('\n')), EXPECTED)
})

test('the sections around [Socials] are ignored, and a slot with only a colour is empty', () => {
  const names = parseSocials(FILE.join('\r\n')).map((m) => m.name)
  assert.ok(!names.includes('NotAMacro'))
  assert.ok(!names.includes('AlsoNotAMacro'))
  assert.equal(parseSocials(FILE.join('\r\n')).some((m) => m.page === 3), false)
})

test('a file with no [Socials] section has no macros', () => {
  assert.deepEqual(parseSocials('[HotButtons]\r\nPage1Button1=E13\r\n'), [])
  assert.deepEqual(parseSocials(''), [])
})

test('the section header is case folded and a later key wins', () => {
  const text = '[SOCIALS]\nPage2Button1Name=one\nPage2Button1Name=two\nPage2Button1Color=x'
  assert.deepEqual(parseSocials(text), [{ page: 2, button: 1, name: 'two', color: 0, lines: [] }])
})

test('rendered in the game form: CRLF, slot order, empty lines left out', () => {
  const text = renderSocials([EXPECTED[2], EXPECTED[1]])
  assert.equal(
    text,
    [
      '[Socials]',
      'Page2Button2Name=Enchant Electru',
      'Page2Button2Color=0',
      'Page2Button2Line1=/pause 72,/cast 1',
      'Page2Button2Line5=/cast 1',
      'Page2Button4Name=broughtback',
      'Page2Button4Color=13',
      'Page2Button4Line1=/say brought back',
      ''
    ].join('\r\n')
  )
})

test('parse(render(x)) is x', () => {
  assert.deepEqual(parseSocials(renderSocials(EXPECTED)), EXPECTED)
  assert.deepEqual(parseSocials(renderSocials([])), [])
  // A line break inside a value cannot survive an ini line; it is written as a space.
  const broken = renderSocials([{ page: 2, button: 1, name: 'a\nb', color: 1, lines: ['/say x\r\ny'] }])
  assert.deepEqual(parseSocials(broken), [{ page: 2, button: 1, name: 'a b', color: 1, lines: ['/say x y'] }])
})

test('character files: every character and loadout, not the UI files, not the backups', () => {
  const picked = pickCharacterFiles([
    'UI_Brannoc_teshfal_LO1.ini',
    'Brannoc_teshfal_LO1.ini',
    'Brannoc_teshfal_LO1_Backup_1.ini',
    'Brannoc_teshfal_LO1.ini.before-copy-2026-10-18',
    'brannoc_teshfal_lo2.INI',
    'Aldwyn_teshfal_LO1.ini',
    'teshacct_characters.ini',
    'eqclient.ini',
    'Brannoc_teshfal.ini'
  ])
  assert.deepEqual(picked, [
    { file: 'Aldwyn_teshfal_LO1.ini', character: 'Aldwyn', server: 'teshfal', loadout: 1 },
    { file: 'Brannoc_teshfal_LO1.ini', character: 'Brannoc', server: 'teshfal', loadout: 1 },
    { file: 'brannoc_teshfal_lo2.INI', character: 'brannoc', server: 'teshfal', loadout: 2 }
  ])
  assert.equal(characterFileKey(picked[1]), 'brannoc_teshfal_lo1')
  assert.equal(characterFileKey(picked[2]), 'brannoc_teshfal_lo2')
})
