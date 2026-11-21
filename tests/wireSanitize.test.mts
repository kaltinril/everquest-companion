// THE SHARED TEXT SANITIZER (src/shared/sanitizeText.ts) — the character classes, pinned code
// point by code point.
//
// `sanitizeOneLine` is what stands between text the app did not write (a line of the game's log
// in an alert capture, an error message on its way into errors.log) and whatever renders it.
// An escape sequence must leave whole, a control character must not survive, and text that
// renders as nothing must not either.
//
// (This suite also covered the feedback and usage-analytics wire: the multi-line and tabbed
// normalizers, the reject predicate, the telemetry schema's no-free-text pin and the owner-side
// row mappers. Those services were removed on 2026-11-20 and their tests went with them.)
//
// No Electron, no network, no fixtures: this suite NEVER SKIPS.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeOneLine, stripAnsi } from '../src/shared/sanitizeText'

/** Written as codes, never as literals: a control character pasted into a source file is a
 *  character nobody reviewing the diff can see. */
const ch = (code: number): string => String.fromCharCode(code)
const ESC = ch(0x1b)
const BEL = ch(0x07)
const NUL = ch(0x00)
const ST = `${ESC}\\`

test('stripAnsi removes whole escape sequences, payload and all', () => {
  const table: [string, string, string][] = [
    ['CSI colour', `${ESC}[31mred${ESC}[0m`, 'red'],
    ['CSI erase-display', `${ESC}[2Jgone`, 'gone'],
    ['CSI with intermediates', `${ESC}[?25lhidden`, 'hidden'],
    ['OSC set-title, BEL-terminated', `${ESC}]0;pwned${BEL}after`, 'after'],
    ['OSC set-title, ST-terminated', `${ESC}]0;pwned${ST}after`, 'after'],
    ['OSC 52 clipboard write', `${ESC}]52;c;bWFsaWNl${BEL}after`, 'after'],
    ['DCS', `${ESC}Pq#0;2;0;0;0${ST}after`, 'after'],
    ['APC', `${ESC}_payload${ST}after`, 'after'],
    ['Fe next-line', `${ESC}Eafter`, 'after'],
    ['Fs full reset', `${ESC}cafter`, 'after'],
    ['nF charset select', `${ESC}(Bafter`, 'after'],
    // A CSI truncated at the end of the string has no final byte, so arms 1-3 all miss and the
    // catch-all takes it. The ESC never survives, which is the only property that matters.
    ['a truncated CSI still loses its ESC', `${ESC}[`, '']
  ]
  for (const [name, sent, want] of table) assert.equal(stripAnsi(sent), want, name)
  // and text that merely LOOKS like an escape (no ESC) is left completely alone
  assert.equal(stripAnsi('[31m is how you write it'), '[31m is how you write it')
})

test('sanitizeOneLine folds TAB/LF/CR to a single space and deletes the rest', () => {
  assert.equal(sanitizeOneLine('a\nb'), 'a b')
  assert.equal(sanitizeOneLine('a\r\nb'), 'a b') // CRLF is ONE break, so ONE space
  assert.equal(sanitizeOneLine('a\rb'), 'a b')
  assert.equal(sanitizeOneLine('a\tb'), 'a b')
  assert.equal(sanitizeOneLine(`a${NUL}b`), 'ab')
  assert.equal(sanitizeOneLine(`${ESC}[31ma${ESC}[0m`), 'a')
  // the point of the fold: a value cannot forge an extra line
  assert.equal(sanitizeOneLine('win32\nplatform: linux').includes('\n'), false)
})

test('sanitizeOneLine deletes every other control and every invisible, and nothing beside them', () => {
  // every C0 that is not TAB/LF/CR, DEL, and the C1 block
  for (const code of [0x00, 0x01, 0x07, 0x08, 0x0b, 0x0c, 0x1f, 0x7f, 0x80, 0x9b, 0x9f]) {
    assert.equal(sanitizeOneLine(`a${ch(code)}b`), 'ab', `U+${code.toString(16)} must go`)
  }
  // ESC is the one that takes a hostage: `ESC b` IS an escape sequence, so the `b` goes with it.
  // That is the correct reading of the byte stream, and it is why the ANSI pass runs first.
  assert.equal(sanitizeOneLine(`a${ESC}b`), 'a')
  assert.equal(sanitizeOneLine(`a${ESC}`), 'a')
  // the invisible / reordering class, boundaries included
  for (const code of [0x200b, 0x200f, 0x2028, 0x202e, 0x2060, 0x2064, 0x2066, 0x2069, 0xfeff]) {
    assert.equal(sanitizeOneLine(`a${ch(code)}b`), 'ab', `U+${code.toString(16)} must go`)
  }
  // NEIGHBOURS OF THE CLASSES STAY. These are real characters people type, and a sanitizer that
  // eats them is a sanitizer that corrupts text.
  for (const code of [0x20, 0x7e, 0xa0, 0x2010, 0x2027, 0x202f, 0x2065, 0x206a]) {
    assert.equal(sanitizeOneLine(`a${ch(code)}b`), `a${ch(code)}b`, `U+${code.toString(16)} must stay`)
  }
  // it is IDEMPOTENT — running it twice is running it once
  const nasty = `${ESC}]0;t${BEL}a\r\nb${ch(0x202e)}${NUL}`
  assert.equal(sanitizeOneLine(sanitizeOneLine(nasty)), sanitizeOneLine(nasty))
  // and a clean line is returned completely unchanged — the sanitizer is not a rewriter
  const clean = '[Sat Aug 01 13:00:28 2026] You slash a gnoll for 137 points of damage.'
  assert.equal(sanitizeOneLine(clean), clean)
})
