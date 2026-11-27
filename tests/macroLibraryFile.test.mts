// macros.json (the Macros tab's library, src/main/ipc/macros.ts): a read that fails for any reason
// but "the file is not there" is not an empty library. The load fails, so the tab shows its "could
// not be loaded" line, and no save may replace the file the app could not read (2026-11-27 audit,
// macros-1). A missing file is still a fresh, empty library that saves as usual.

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'eqc-macrolib-'))
const STUB = 'eqc-stub:electron'
// The game folder is found through the settings store (electron-store); this file never needs it.
const CONFIG_STUB = 'eqc-stub:log-config'
const handlers = new Map<string, (...args: unknown[]) => unknown>()
;(globalThis as { __eqcMacroHandlers?: typeof handlers }).__eqcMacroHandlers = handlers
registerHooks({
  resolve: (spec, ctx, next) => {
    if (spec === 'electron') return { url: STUB, format: 'commonjs', shortCircuit: true }
    if (spec === '../log/config' && ctx.parentURL?.endsWith('/ipc/macros.ts')) return { url: CONFIG_STUB, format: 'commonjs', shortCircuit: true }
    return next(spec, ctx)
  },
  load: (url, ctx, next) =>
    url === CONFIG_STUB
      ? { format: 'commonjs', shortCircuit: true, source: 'module.exports = { resolveActiveCharacter: () => null }' }
      : url === STUB
      ? {
          format: 'commonjs',
          shortCircuit: true,
          source: `module.exports = { app: { getPath: () => ${JSON.stringify(userData)}, isPackaged: false, getVersion: () => '0.0.0', on() {} }, ipcMain: { handle(ch, fn) { globalThis.__eqcMacroHandlers.set(ch, fn) } } }`
        }
      : next(url, ctx)
})

after(() => rmSync(userData, { recursive: true, force: true }))

// The read of macros.json fails the way a sharing lock (antivirus, OneDrive) makes it fail, while a
// rename over it would still go through: the case where the library was lost.
const require = createRequire(import.meta.url)
const fsp = require('node:fs/promises') as typeof import('node:fs/promises')
const realReadFile = fsp.readFile
let failWith: string | null = null
;(fsp as { readFile: unknown }).readFile = ((path: unknown, ...rest: unknown[]) => {
  if (failWith !== null && typeof path === 'string' && path.endsWith('macros.json')) {
    return Promise.reject(Object.assign(new Error(`${failWith}: macros.json`), { code: failWith }))
  }
  return (realReadFile as (...a: unknown[]) => unknown)(path, ...rest)
}) as typeof fsp.readFile
syncBuiltinESMExports()

const { IPC } = await import('../src/shared/ipc.ts')
const { emptyLibrary } = await import('../src/shared/macros/library.ts')
const { registerMacrosIpc } = await import('../src/main/ipc/macros.ts')
registerMacrosIpc()

const file = join(userData, 'macros.json')
const load = (): Promise<unknown> => handlers.get(IPC.macrosLoad)!({}) as Promise<unknown>
const save = (library: unknown): Promise<boolean> => handlers.get(IPC.macrosSave)!({}, library) as Promise<boolean>

beforeEach(() => {
  failWith = null
})

test('a read that fails with EBUSY: the load fails, and no save replaces macros.json', async () => {
  const kept = '{"the player":"forty macros"}'
  writeFileSync(file, kept)
  failWith = 'EBUSY'
  await assert.rejects(load())
  // The lock clears; the renderer would not save after a failed load, but a save that arrives
  // anyway (or before any load) must still not write over a file that could not be read.
  assert.equal(await save(emptyLibrary()), false)
  failWith = 'EPERM'
  assert.equal(await save(emptyLibrary()), false)
  assert.equal(readFileSync(file, 'utf8'), kept)
})

test('a missing macros.json is a fresh, empty library that saves', async () => {
  rmSync(file, { force: true })
  failWith = null
  assert.deepEqual(await load(), emptyLibrary())
  assert.equal(await save(emptyLibrary()), true)
  assert.ok(existsSync(file))
})
