// The overlay recover hotkey (overlay polish; owner, 2026-10-29): its key rules
// (shared/overlayHotkey.ts), that it is off until the player sets one, and that it is the only
// system-wide key the app registers (the capture's "avoid C" ruling stands, shotCapture.test.mts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { acceleratorOf, hotkeyProblem } from '../src/shared/overlayHotkey.ts'

const press = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}): string | undefined =>
  acceleratorOf({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code, ...mods })

test('a press becomes an Electron accelerator, modifiers first', () => {
  assert.equal(press('KeyO', { ctrlKey: true, altKey: true }), 'Ctrl+Alt+O')
  assert.equal(press('F9', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+F9')
  assert.equal(press('Digit5', { metaKey: true }), 'Super+5')
  assert.equal(press('Numpad1', { altKey: true }), 'Alt+num1')
  // A modifier alone names no key yet.
  assert.equal(press('ControlLeft', { ctrlKey: true }), undefined)
})

test('the key needs Ctrl, Alt or Win: a key alone or with Shift is the game\'s', () => {
  assert.equal(hotkeyProblem('Ctrl+Alt+O'), undefined)
  assert.equal(hotkeyProblem('Super+5'), undefined)
  assert.match(hotkeyProblem('Shift+O') ?? '', /Ctrl, Alt or Win/)
  assert.match(hotkeyProblem('F9') ?? '', /Ctrl, Alt or Win/)
  assert.match(hotkeyProblem('Ctrl+Alt') ?? '', /one key/)
})

test('off until the player sets one: nothing is registered at start but the saved key', () => {
  const code = readFileSync(new URL('../src/main/overlayRecover.ts', import.meta.url), 'utf8')
  const register = [...code.matchAll(/globalShortcut\.register\(/g)]
  assert.equal(register.length, 1, 'one register call, in the setter')
  assert.match(code, /settingsStore\.get\('overlayRecoverHotkey'\)/)
  assert.match(code, /if \(typeof saved === 'string'\) setRecoverHotkey\(saved\)/)
})

test('the recover key is the only globalShortcut in the app', () => {
  const under = (dir: URL): URL[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? under(new URL(`${e.name}/`, dir)) : /\.tsx?$/.test(e.name) ? [new URL(e.name, dir)] : []
    )
  const users = ['main', 'preload', 'renderer', 'shared'].flatMap((dir) =>
    under(new URL(`../src/${dir}/`, import.meta.url)).filter((file) => {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      return /\bglobalShortcut\b/.test(code)
    })
  )
  assert.deepEqual(users.map((u) => u.pathname.replace(/^.*\/src\//, 'src/')), ['src/main/overlayRecover.ts'])
})
