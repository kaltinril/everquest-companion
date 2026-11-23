// The overlay recover hotkey (overlay polish; owner, 2026-10-29): its key rules
// (shared/overlayHotkey.ts), that it is off until the player sets one, and that it is the only
// system-wide key the app registers (the capture's "avoid C" ruling stands, shotCapture.test.mts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { acceleratorOf, hotkeyProblem, makeRecoverHotkey, type RecoverHotkey } from '../src/shared/overlayHotkey.ts'

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
  assert.ok(code.includes("load: () => settingsStore.get('overlayRecoverHotkey')"), 'the saved key is the one read at start')
  const fake = fakeKeys({ saved: undefined })
  fake.hotkey.start()
  assert.deepEqual(fake.calls, [], 'nothing saved: nothing is taken and nothing is written')
  assert.deepEqual(fake.hotkey.get(), { hotkey: null })
})

/** The system's keys and the settings store, as the key's owner sees them, with a call log. */
function fakeKeys(opts: { saved: unknown; taken?: string[] }): { hotkey: RecoverHotkey; calls: string[]; taken: Set<string> } {
  const calls: string[] = []
  const taken = new Set(opts.taken ?? [])
  const hotkey = makeRecoverHotkey({
    register: (accel) => {
      calls.push(`register ${accel}`)
      return !taken.has(accel)
    },
    unregister: (accel) => calls.push(`unregister ${accel}`),
    load: () => opts.saved,
    save: (accel) => calls.push(`save ${accel}`),
    clear: () => calls.push('clear')
  })
  return { hotkey, calls, taken }
}

test('a saved key that is free at start is taken again, with nothing to say', () => {
  const { hotkey, calls } = fakeKeys({ saved: 'Ctrl+Alt+R' })
  hotkey.start()
  assert.deepEqual(hotkey.get(), { hotkey: 'Ctrl+Alt+R' })
  assert.equal(calls[0], 'register Ctrl+Alt+R')
  assert.ok(!calls.includes('clear'))
})

test('a saved key another program holds at start is off, kept, and Preferences is told why', () => {
  const { hotkey, calls } = fakeKeys({ saved: 'Ctrl+Alt+R', taken: ['Ctrl+Alt+R'] })
  hotkey.start()
  const answer = hotkey.get()
  assert.equal(answer.hotkey, null, 'the key is not in force')
  assert.match(answer.message ?? '', /Ctrl\+Alt\+R/)
  assert.match(answer.message ?? '', /another program/)
  assert.doesNotMatch(answer.message ?? '', /[–—]/)
  assert.deepEqual(calls, ['register Ctrl+Alt+R'], 'the saved key is neither cleared nor rewritten')
  assert.deepEqual(hotkey.get(), answer, 'and it is said every time Preferences asks')
})

test('the reason goes away with the state it describes', () => {
  const picked = fakeKeys({ saved: 'Ctrl+Alt+R', taken: ['Ctrl+Alt+R'] })
  picked.hotkey.start()
  assert.deepEqual(picked.hotkey.set('Ctrl+Alt+O'), { hotkey: 'Ctrl+Alt+O' })
  assert.deepEqual(picked.hotkey.get(), { hotkey: 'Ctrl+Alt+O' })
  assert.ok(picked.calls.includes('save Ctrl+Alt+O'))

  const off = fakeKeys({ saved: 'Ctrl+Alt+R', taken: ['Ctrl+Alt+R'] })
  off.hotkey.start()
  assert.deepEqual(off.hotkey.set(null), { hotkey: null })
  assert.ok(off.calls.includes('clear'), 'turning it off forgets the saved key')
  assert.deepEqual(off.hotkey.get(), { hotkey: null })
})

test('a key refused while the app runs leaves the old key working, and the answer says why', () => {
  const { hotkey, calls, taken } = fakeKeys({ saved: 'Ctrl+Alt+R' })
  hotkey.start()
  taken.add('Ctrl+Alt+O')
  const refused = hotkey.set('Ctrl+Alt+O')
  assert.equal(refused.hotkey, 'Ctrl+Alt+R')
  assert.equal(refused.message, 'Ctrl+Alt+O is taken by Windows or another program.')
  assert.ok(!calls.includes('unregister Ctrl+Alt+R'), 'the old key was never let go')
  assert.deepEqual(hotkey.get(), { hotkey: 'Ctrl+Alt+R' }, 'a refused pick leaves nothing to say later')
  // A new key is taken before the old one is let go.
  assert.deepEqual(hotkey.set('Ctrl+Alt+P'), { hotkey: 'Ctrl+Alt+P' })
  assert.deepEqual(calls.slice(-3), ['register Ctrl+Alt+P', 'unregister Ctrl+Alt+R', 'save Ctrl+Alt+P'])
  // A key that breaks the rules is refused before the system is asked.
  assert.match(hotkey.set('F9').message ?? '', /Ctrl, Alt or Win/)
  assert.ok(!calls.includes('register F9'))
})

test('a register call that throws is a refusal, not a crash', () => {
  const hotkey = makeRecoverHotkey({
    register: () => {
      throw new Error('bad accelerator')
    },
    unregister: () => undefined,
    load: () => 'Ctrl+Alt+R',
    save: () => undefined,
    clear: () => undefined
  })
  hotkey.start()
  assert.equal(hotkey.get().hotkey, null)
  assert.match(hotkey.set('Ctrl+Alt+O').message ?? '', /taken/)
})

test('Preferences shows the reason it is given when it opens', () => {
  const code = readFileSync(new URL('../src/renderer/src/features/preferences/OverlayRecoverSetting.tsx', import.meta.url), 'utf8')
  const get = code.slice(code.indexOf("overlayRecoverHotkey('get')"), code.indexOf('const set ='))
  assert.match(get, /setHotkey\(r\.hotkey\)/)
  assert.match(get, /setNote\(r\.message\)/)
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

test('a saved key that is off can be forgotten: the answer names it until it is gone', () => {
  const { hotkey, calls } = fakeKeys({ saved: 'Ctrl+Alt+R', taken: ['Ctrl+Alt+R', 'Ctrl+Alt+O'] })
  hotkey.start()
  assert.equal(hotkey.get().savedOff, 'Ctrl+Alt+R')
  // A refused pick changes nothing about the saved key, so the way to forget it stays.
  const refused = hotkey.set('Ctrl+Alt+O')
  assert.equal(refused.hotkey, null)
  assert.equal(refused.savedOff, 'Ctrl+Alt+R')
  assert.deepEqual(hotkey.set(null), { hotkey: null })
  assert.ok(calls.includes('clear'), 'the saved key is deleted')
  assert.deepEqual(hotkey.get(), { hotkey: null })
})

test('a key in force, or a new key taken over a saved one, names no saved key', () => {
  const free = fakeKeys({ saved: 'Ctrl+Alt+R' })
  free.hotkey.start()
  assert.equal(free.hotkey.get().savedOff, undefined)
  const replaced = fakeKeys({ saved: 'Ctrl+Alt+R', taken: ['Ctrl+Alt+R'] })
  replaced.hotkey.start()
  assert.equal(replaced.hotkey.set('Ctrl+Alt+O').savedOff, undefined)
  assert.equal(replaced.hotkey.get().savedOff, undefined)
})

test('Preferences offers to forget a saved key that is off', () => {
  const code = readFileSync(new URL('../src/renderer/src/features/preferences/OverlayRecoverSetting.tsx', import.meta.url), 'utf8')
  assert.equal(code.match(/setSavedOff\(r\.savedOff\)/g)?.length, 2, 'from the get answer and from the set answer')
  assert.match(code, /hotkey === null && savedOff !== undefined/)
  assert.match(code, /Forget \$\{savedOff\}/)
})
