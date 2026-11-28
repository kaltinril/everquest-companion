// The app's hotkeys as a set (owner, 2026-11-27: "add a toggle button to turn the mouse overlay
// features on/off ... Should go in a hotkeys area"): one owner per action, a store key per action,
// no two actions on one key (shared/overlayHotkey.ts makeHotkeyBoard), and the cursor overlay's
// on/off key flipping the stored master switch both ways (shared/presencePrefs.ts flipCursorOverlay).
// One key's own rules: overlayHotkey.test.mts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  HOTKEY_ACTIONS,
  type HotkeyAction,
  type HotkeyBoard,
  isHotkeyAction,
  makeHotkeyBoard,
  sameAccelerator
} from '../src/shared/overlayHotkey.ts'
import { type CursorRingPrefs, DEFAULT_CURSOR_RING, flipCursorOverlay, normalizeCursorRing } from '../src/shared/presencePrefs.ts'

/** A fake system (keys held by other programs, keys the app holds) and one store with a key per action. */
function fakeBoard(opts: { saved?: Partial<Record<HotkeyAction, unknown>>; taken?: string[] } = {}): {
  board: HotkeyBoard
  store: Map<string, unknown>
  held: Map<string, HotkeyAction>
} {
  const store = new Map<string, unknown>(Object.entries(opts.saved ?? {}))
  const taken = new Set(opts.taken ?? [])
  const held = new Map<string, HotkeyAction>()
  const portsFor = (action: HotkeyAction) => ({
    // Like Windows: a key anyone holds, this app included, cannot be taken again.
    register: (accel: string) => {
      if (taken.has(accel) || held.has(accel)) return false
      held.set(accel, action)
      return true
    },
    unregister: (accel: string) => {
      held.delete(accel)
    },
    load: () => store.get(action),
    save: (accel: string) => {
      store.set(action, accel)
    },
    clear: () => {
      store.delete(action)
    }
  })
  const board = makeHotkeyBoard({ recover: portsFor('recover'), cursorToggle: portsFor('cursorToggle') })
  return { board, store, held }
}

test('both actions are listed, recover first, and a stray name is no action', () => {
  assert.deepEqual([...HOTKEY_ACTIONS], ['recover', 'cursorToggle'])
  assert.equal(isHotkeyAction('cursorToggle'), true)
  assert.equal(isHotkeyAction('toString'), false)
  assert.equal(isHotkeyAction(undefined), false)
})

test('each action has its own key, saved under its own store key, both off until set', () => {
  const { board, store, held } = fakeBoard()
  board.start()
  assert.deepEqual(board.get(), { recover: { hotkey: null }, cursorToggle: { hotkey: null } })
  assert.deepEqual(board.set('cursorToggle', 'Ctrl+Alt+M').answer, { hotkey: 'Ctrl+Alt+M' })
  assert.deepEqual(board.set('recover', 'Ctrl+Alt+R').answer, { hotkey: 'Ctrl+Alt+R' })
  assert.equal(store.get('cursorToggle'), 'Ctrl+Alt+M')
  assert.equal(store.get('recover'), 'Ctrl+Alt+R')
  assert.equal(held.get('Ctrl+Alt+M'), 'cursorToggle', 'the press runs the cursor action')
  // Turning one off leaves the other alone.
  const reply = board.set('recover', null)
  assert.deepEqual(reply.hotkeys, { recover: { hotkey: null }, cursorToggle: { hotkey: 'Ctrl+Alt+M' } })
  assert.equal(store.has('recover'), false)
  assert.equal(store.get('cursorToggle'), 'Ctrl+Alt+M')
})

test('both saved keys are taken again at start', () => {
  const { board } = fakeBoard({ saved: { recover: 'Ctrl+Alt+R', cursorToggle: 'Ctrl+Alt+M' } })
  board.start()
  assert.deepEqual(board.get(), { recover: { hotkey: 'Ctrl+Alt+R' }, cursorToggle: { hotkey: 'Ctrl+Alt+M' } })
})

test('a key the other action holds is refused, with that action named, and nothing changes', () => {
  const { board, store, held } = fakeBoard()
  board.set('recover', 'Ctrl+Alt+R')
  board.set('cursorToggle', 'Ctrl+Alt+M')
  const reply = board.set('cursorToggle', 'Ctrl+Alt+R')
  assert.equal(reply.answer.hotkey, 'Ctrl+Alt+M', 'the old key keeps working')
  assert.equal(reply.answer.message, 'Ctrl+Alt+R is already the Bring overlays back key. Pick another key.')
  assert.doesNotMatch(reply.answer.message ?? '', /[–—]/)
  assert.equal(held.get('Ctrl+Alt+R'), 'recover', 'the recover key was never let go')
  assert.equal(store.get('cursorToggle'), 'Ctrl+Alt+M')
  // The same key written another way is still the same key.
  assert.match(board.set('cursorToggle', 'Alt+Control+R').answer.message ?? '', /Bring overlays back/)
  // And the other way round.
  assert.match(board.set('recover', 'Ctrl+Alt+M').answer.message ?? '', /Cursor overlay on\/off/)
})

test('a saved key that is off since start still counts as held by its action', () => {
  const { board } = fakeBoard({ saved: { recover: 'Ctrl+Alt+R' }, taken: ['Ctrl+Alt+R'] })
  board.start()
  assert.equal(board.get().recover.savedOff, 'Ctrl+Alt+R')
  assert.match(board.set('cursorToggle', 'Ctrl+Alt+R').answer.message ?? '', /already the Bring overlays back key/)
})

test('two saved keys that match (a hand-edited file): the first keeps it, the second is off and says why', () => {
  const { board, store } = fakeBoard({ saved: { recover: 'Ctrl+Alt+R', cursorToggle: 'Ctrl+Alt+R' } })
  board.start()
  const state = board.get()
  assert.equal(state.recover.hotkey, 'Ctrl+Alt+R')
  assert.equal(state.cursorToggle.hotkey, null)
  assert.equal(state.cursorToggle.savedOff, 'Ctrl+Alt+R')
  assert.match(state.cursorToggle.message ?? '', /already the Bring overlays back key/)
  assert.doesNotMatch(state.cursorToggle.message ?? '', /comes back/, 'it will not come back by itself')
  assert.equal(store.get('cursorToggle'), 'Ctrl+Alt+R', 'kept, so the player can see and forget it')
})

test('accelerators compare by their parts, not their spelling', () => {
  assert.equal(sameAccelerator('Ctrl+Alt+M', 'Alt+Ctrl+M'), true)
  assert.equal(sameAccelerator('Control+Alt+m', 'Ctrl+Alt+M'), true)
  assert.equal(sameAccelerator('Super+5', 'Meta+5'), true)
  assert.equal(sameAccelerator('Ctrl+Alt+M', 'Ctrl+Shift+M'), false)
})

/** The cursor-ring store as main has it: patches merge and are normalized. */
function fakeRing(start: CursorRingPrefs): { read: () => CursorRingPrefs; apply: (p: Partial<CursorRingPrefs>) => CursorRingPrefs; writes: number } {
  let stored = start
  const fake = {
    writes: 0,
    read: () => stored,
    apply: (patch: Partial<CursorRingPrefs>) => {
      fake.writes++
      stored = normalizeCursorRing({ ...stored, ...patch })
      return stored
    }
  }
  return fake
}

test('the on/off key flips the stored master switch both ways and leaves every other field alone', () => {
  const ring = fakeRing({ ...DEFAULT_CURSOR_RING, enabled: false, sizePx: 80, colorHex: '#ff8800' })
  const on = flipCursorOverlay(ring.read, ring.apply)
  assert.equal(on.enabled, true)
  assert.equal(ring.read().enabled, true, 'stored, not only returned')
  assert.equal(on.sizePx, 80)
  assert.equal(on.colorHex, '#ff8800')
  const off = flipCursorOverlay(ring.read, ring.apply)
  assert.equal(off.enabled, false)
  assert.deepEqual(off, { ...on, enabled: false })
  assert.equal(ring.writes, 2, 'one write per press')
})

test('the hotkey and the Preferences switch go through one path, which starts or stops the effects', () => {
  const code = readFileSync(new URL('../src/main/ipc/presence.ts', import.meta.url), 'utf8')
  const apply = code.slice(code.indexOf('function applyCursorRing'), code.indexOf('export function toggleCursorOverlay'))
  assert.match(apply, /setCursorRing\(patch\)/)
  assert.match(apply, /refreshPresenceEffects\(\)/, 'the ring window, cursor poll and watcher follow the switch')
  assert.match(code, /flipCursorOverlay\(getCursorRing, applyCursorRing\)/, 'the hotkey')
  assert.match(code, /IPC\.cursorRingSet, \(_e, patch: unknown\) => applyCursorRing\(/, 'the switch')
  assert.match(code, /sendToMain\(IPC\.onCursorRingChanged, next\)/, 'the tab hears about a press')
  const hotkeys = readFileSync(new URL('../src/main/hotkeys.ts', import.meta.url), 'utf8')
  assert.match(hotkeys, /logInfo\('\[everquest-companion\]', `cursor overlay hotkey: turned/, 'a press is logged')
})

test('the Cursor overlay tab follows a press and shows the key, read-only, with a way to Hotkeys', () => {
  const dir = new URL('../src/renderer/src/features/preferences/', import.meta.url)
  const card = readFileSync(new URL('CursorRingSetting.tsx', dir), 'utf8')
  assert.match(card, /window\.eq\.onCursorRingChanged\(setPrefs\)/)
  assert.match(card, /useHotkey\('cursorToggle'\)/)
  assert.match(card, /'No on\/off key set'/)
  assert.doesNotMatch(card, /\bset\(/, 'the tab never sets the key')
  const view = readFileSync(new URL('PreferencesView.tsx', dir), 'utf8')
  assert.match(view, /cursorRingSection\(\(\) => onSection\('hotkeys'\)\)/)
  // The recover key stays in Overlays and is also in Hotkeys (owner, 2026-11-27).
  assert.match(view, /overlayRecoverItem,/)
  const hotkeys = readFileSync(new URL('HotkeysSetting.tsx', dir), 'utf8')
  assert.match(hotkeys, /<OverlayRecoverSetting testid="pref-hotkey-recover" \/>/)
  assert.match(hotkeys, /action="cursorToggle"/)
})
