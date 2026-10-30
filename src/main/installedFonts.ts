// installedFonts.ts — the fonts installed on this PC, for the overlay font pick (overlay polish;
// owner, 2026-10-29). Read from Windows' own font table in the registry (the machine's and this
// user's), in-process through the same binding EverQuest discovery uses: no network, no permission
// prompt, no font file opened. Empty off Windows or without the binding, and the pick then offers
// the default alone.

import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { fontFamiliesFromRegistry } from '../shared/overlayFont'
import { registryValueNames } from './log/discovery'

const FONTS_KEY = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'

let cached: string[] | null = null

/** Installed font family names, sorted; read once per launch. */
function installedFonts(): string[] {
  if (cached === null) {
    const names = [...(registryValueNames('HKLM', FONTS_KEY) ?? []), ...(registryValueNames('HKCU', FONTS_KEY) ?? [])]
    cached = fontFamiliesFromRegistry(names)
  }
  return cached
}

export function registerInstalledFontsIpc(): void {
  ipcMain.handle(IPC.fontsList, () => installedFonts())
}
