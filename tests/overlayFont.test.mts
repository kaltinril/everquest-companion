// The overlay font pick (overlay polish; owner, 2026-10-29): the installed families read from
// Windows' font table value names, the CSS a pick draws with, and that every overlay panel reads
// the pick instead of a fixed stack (shared/overlayFont.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { cleanFontFamily, fontFamiliesFromRegistry, OVERLAY_DEFAULT_STACK, OVERLAY_FONT, overlayFontStack } from '../src/shared/overlayFont.ts'

test('families from the registry font table: faces fold, bitmap fonts drop, pairs split', () => {
  const names = [
    'Arial (TrueType)',
    'Arial Bold (TrueType)',
    'Arial Bold Italic (TrueType)',
    'Arial Black (TrueType)',
    'Cambria & Cambria Math (TrueType)',
    'Segoe UI Semibold (TrueType)',
    'Bahnschrift (OpenType)',
    'Courier 10,12,15',
    'Modern (All res)',
    'MS Sans Serif 8,10,12,14,18,24',
    'Evil"; } body { x (TrueType)',
    'arial italic (TrueType)'
  ]
  assert.deepEqual(fontFamiliesFromRegistry(names), ['Arial', 'Arial Black', 'Bahnschrift', 'Cambria', 'Cambria Math', 'Segoe UI Semibold'])
})

test('no pick draws the default; a pick is quoted with the default behind it', () => {
  assert.equal(overlayFontStack(null), '')
  assert.equal(overlayFontStack(''), '')
  assert.equal(overlayFontStack('Comic Sans MS'), `"Comic Sans MS", ${OVERLAY_DEFAULT_STACK}`)
  // Nothing that could close the quote or the declaration gets into CSS.
  assert.equal(overlayFontStack('x"; color: red'), '')
  assert.equal(cleanFontFamily('a{b}'), undefined)
  assert.equal(OVERLAY_FONT, `var(--eqc-overlay-font, ${OVERLAY_DEFAULT_STACK})`)
})

test('every overlay panel reads the pick, none a fixed Inter stack', () => {
  const dir = new URL('../src/renderer/src/overlay/', import.meta.url)
  for (const name of readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
    const code = readFileSync(new URL(name, dir), 'utf8')
    assert.doesNotMatch(code, /['"`][^'"`]*Inter, "Segoe UI"/, name)
  }
  assert.match(readFileSync(new URL('main.tsx', dir), 'utf8'), /installOverlayFont\(\)/)
})
