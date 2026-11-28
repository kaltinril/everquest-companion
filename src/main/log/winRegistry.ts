// winRegistry.ts — the READ-ONLY Win32 registry calls discovery makes, through koffi.
//
// Discovery (log/discovery.ts) asks the registry three questions: the mount table's value names
// (`HKLM\SYSTEM\MountedDevices`), the mapped network drives (`HKCU\Network` subkeys) and the
// install paths under the Uninstall and Daybreak/SOE keys; installedFonts.ts asks a fourth (the
// Fonts key's value names). This module is the whole of that surface: open a key for reading,
// list its subkeys, list its value names, read one string value, close it.
//
// WHY koffi AND NOT A REGISTRY PACKAGE. These reads went through `native-reg` (JOS-184), a
// registry-only N-API binding last published in 2022. koffi is already in the tree for the same
// kind of in-process Win32 read (presenceNative.ts, processSample.ts, shot/fontAtlas.ts), ships
// its prebuilt binary the same way (no install script, `.npmrc` ignore-scripts holds), and calls
// advapi32 directly, so one native dependency left the build. The calls below are the ones
// native-reg's C++ made, with the same arguments:
//
//   * RegOpenKeyExW with the access mask the CALLER passes (discovery: KEY_READ | KEY_WOW64_64KEY,
//     exactly what it passed native-reg). KEY_READ is the right every user holds on these keys;
//     nothing here asks for write, create or delete access, so there is no new permission need
//     and no elevation (verified non-elevated on the owner's machine).
//   * RegEnumKeyExW / RegEnumValueW in an index loop until ERROR_NO_MORE_ITEMS. The buffers are
//     the registry's own maxima (a key name is at most 255 characters, a value name 16,383), so
//     ERROR_MORE_DATA cannot happen; native-reg sized them per key with RegQueryInfoKeyW, which
//     gives the same names.
//   * RegGetValueW with RRF_RT_ANY and no RRF_NOEXPAND: a REG_EXPAND_SZ comes back EXPANDED, as it
//     did from native-reg's `getValue`. Only REG_SZ and REG_EXPAND_SZ are decoded; any other type
//     reads as null, which discovery's `eqInstallPathValue` already turned a non-string into.
//
// ERRORS have native-reg's shape, so discovery's wrappers did not change: `openKey` answers null
// for a missing key and THROWS for any other failure (a denied ACL), the enumerations throw on a
// failed call, `getString` answers null for a missing value. Loading THROWS when koffi or
// advapi32 cannot be loaded; discovery catches that once and runs without the registry.
//
// Loaded in MAIN, lazily, by discovery's `registry()`: the reasoning processSample.ts gives for
// main applies here (main is never terminated mid-call, which is the koffi hazard the worker rule
// is about; a load failure is an ordinary throw). Nothing here writes.

import type { LibraryHandle } from 'koffi'

/** A registry key handle: a pointer-sized integer (koffi `intptr`). Opaque to callers. */
export type Hkey = number | bigint

export interface WinRegistry {
  readonly HKLM: Hkey
  readonly HKCU: Hkey
  /** KEY_READ (0x20019): query values, enumerate subkeys, notify, read control. */
  readonly KEY_READ: number
  /** Ask for the 64-bit registry view regardless of the caller's bitness. */
  readonly KEY_WOW64_64KEY: number
  /** Open `path` below `parent`. Null when the key does not exist; THROWS on any other failure. */
  openKey(parent: Hkey, path: string, access: number): Hkey | null
  /** The key's subkey names. THROWS on a failed enumeration. */
  enumKeyNames(key: Hkey): string[]
  /** The key's value names. THROWS on a failed enumeration. */
  enumValueNames(key: Hkey): string[]
  /**
   * A REG_SZ or REG_EXPAND_SZ value (expanded) of `key`, or null when the value is absent or of
   * another type. THROWS on any other failure.
   */
  getString(key: Hkey, name: string): string | null
  closeKey(key: Hkey): void
}

// The predefined hives as the pointer-sized values Windows defines them as: (HKEY)(LONG)0x8000000N,
// i.e. sign-extended, so 0xFFFFFFFF80000002 on x64 — which as a signed intptr is -0x7FFFFFFE.
const HKEY_CURRENT_USER = -0x7fffffff
const HKEY_LOCAL_MACHINE = -0x7ffffffe

const ERROR_SUCCESS = 0
const ERROR_FILE_NOT_FOUND = 2
const ERROR_NO_MORE_ITEMS = 259

const REG_SZ = 1
const REG_EXPAND_SZ = 2
/** RRF_RT_ANY: no type restriction; without RRF_NOEXPAND a REG_EXPAND_SZ is expanded. */
const RRF_RT_ANY = 0x0000ffff

/** Registry maxima, in UTF-16 code units INCLUDING the terminator. */
const MAX_KEY_NAME_CHARS = 256
const MAX_VALUE_NAME_CHARS = 16384

type Win32Fn = (...args: unknown[]) => unknown

function fail(call: string, status: unknown): Error {
  return new Error(`${call} failed: ${String(status)}`)
}

/** Open advapi32 and declare the five calls. THROWS if koffi or any of it cannot be loaded. */
export function loadWinRegistry(): WinRegistry {
  // Required lazily and inside the caller's try, so a build or a machine where koffi cannot even
  // be resolved degrades the same way one where the DLL will not map does.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi') as { load(name: string): LibraryHandle }
  const advapi32 = koffi.load('advapi32.dll')
  const bind = (prototype: string): Win32Fn => advapi32.func(prototype) as Win32Fn

  const RegOpenKeyExW = bind(
    'int32 __stdcall RegOpenKeyExW(intptr hKey, str16 subKey, uint32 options, uint32 sam, _Out_ intptr *result)'
  )
  const RegCloseKey = bind('int32 __stdcall RegCloseKey(intptr hKey)')
  const RegEnumKeyExW = bind(
    'int32 __stdcall RegEnumKeyExW(intptr hKey, uint32 index, _Out_ void *name, _Inout_ uint32 *nameChars, void *reserved, void *cls, void *clsChars, void *lastWrite)'
  )
  const RegEnumValueW = bind(
    'int32 __stdcall RegEnumValueW(intptr hKey, uint32 index, _Out_ void *name, _Inout_ uint32 *nameChars, void *reserved, void *type, void *data, void *dataBytes)'
  )
  const RegGetValueW = bind(
    'int32 __stdcall RegGetValueW(intptr hKey, str16 subKey, str16 value, uint32 flags, _Out_ uint32 *type, _Out_ void *data, _Inout_ uint32 *dataBytes)'
  )

  // One scratch buffer per kind of name. Every enumeration finishes before it returns, so the
  // recursive install-path walk never has two in flight.
  function enumerator(fn: Win32Fn, call: string, cap: number): (key: Hkey) => string[] {
    const buf = Buffer.alloc(cap * 2)
    const chars = [0]
    return (key) => {
      const out: string[] = []
      for (let index = 0; ; index++) {
        chars[0] = cap
        const status = fn(key, index, buf, chars, null, null, null, null)
        if (status === ERROR_NO_MORE_ITEMS) break
        if (status !== ERROR_SUCCESS) throw fail(call, status)
        out.push(buf.toString('utf16le', 0, chars[0] * 2))
      }
      return out
    }
  }

  return {
    HKLM: HKEY_LOCAL_MACHINE,
    HKCU: HKEY_CURRENT_USER,
    KEY_READ: 0x20019,
    KEY_WOW64_64KEY: 0x0100,

    openKey(parent, path, access) {
      const result: Hkey[] = [0]
      const status = RegOpenKeyExW(parent, path, 0, access, result)
      if (status === ERROR_FILE_NOT_FOUND) return null
      if (status !== ERROR_SUCCESS) throw fail('RegOpenKeyExW', status)
      return result[0]
    },

    enumKeyNames: enumerator(RegEnumKeyExW, 'RegEnumKeyExW', MAX_KEY_NAME_CHARS),
    enumValueNames: enumerator(RegEnumValueW, 'RegEnumValueW', MAX_VALUE_NAME_CHARS),

    getString(key, name) {
      const type = [0]
      const bytes = [0]
      let status = RegGetValueW(key, null, name, RRF_RT_ANY, type, null, bytes)
      if (status === ERROR_FILE_NOT_FOUND) return null
      if (status !== ERROR_SUCCESS) throw fail('RegGetValueW', status)
      if (type[0] !== REG_SZ && type[0] !== REG_EXPAND_SZ) return null
      // The size asked for first is pessimistic (room for a terminator, and for an expansion).
      const data = Buffer.alloc(bytes[0])
      status = RegGetValueW(key, null, name, RRF_RT_ANY, type, data, bytes)
      if (status !== ERROR_SUCCESS) throw fail('RegGetValueW', status)
      if (type[0] !== REG_SZ && type[0] !== REG_EXPAND_SZ) return null
      let s = data.toString('utf16le', 0, bytes[0] - (bytes[0] % 2))
      // RegGetValueW null-terminates; drop that one terminator, as native-reg's parseString did.
      if (s.endsWith('\0')) s = s.slice(0, -1)
      return s
    },

    closeKey(key) {
      RegCloseKey(key)
    }
  }
}
