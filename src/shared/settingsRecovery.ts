// settingsRecovery.ts: what the player is told when the settings file was damaged at launch.
//
// Main moves a settings file that will not parse aside and recovers what it can
// (src/main/storeFile.ts). This maps that outcome to the one notice the main window shows, so a
// restore from an old backup or a reset to defaults is never mistaken for the app losing settings.

/** The fields of main's store-file outcome (`StoreFileMigration`) the notice is built from. */
export interface SettingsRecoveryFacts {
  /** Where the damaged file was moved. Absent when the file opened normally. */
  quarantinedPath?: string
  salvagedFrom?: 'torn-bytes' | 'backup'
  salvagedBackup?: { savedAtMs?: number }
  /** Whether the recovered settings reached the live file. */
  wrote: boolean
  readError?: string
}

export interface SettingsRecoveryNotice {
  kind: 'recovered' | 'restored-backup' | 'reset'
  title: string
  text: string
}

const longDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

/** The notice for this launch, or null when the settings file opened normally. */
export function settingsRecoveryNotice(
  facts: SettingsRecoveryFacts,
  formatDate: (ms: number) => string = longDate
): SettingsRecoveryNotice | null {
  const keptAt = facts.quarantinedPath
  if (keptAt === undefined || facts.readError !== undefined) return null
  const kept = `The damaged file is kept at ${keptAt}.`
  // Recovered settings that never reached the live file leave the app on defaults.
  if (facts.salvagedFrom === undefined || !facts.wrote) {
    return {
      kind: 'reset',
      title: 'Your settings were reset',
      text: `Your settings file was damaged and could not be recovered. The app started with default settings. ${kept}`
    }
  }
  if (facts.salvagedFrom === 'torn-bytes') {
    return {
      kind: 'recovered',
      title: 'Your settings file was repaired',
      text: 'Your settings file was damaged. All of your settings were recovered.'
    }
  }
  const savedAtMs = facts.salvagedBackup?.savedAtMs
  const source = savedAtMs === undefined ? 'an older copy' : `a copy saved on ${formatDate(savedAtMs)}`
  return {
    kind: 'restored-backup',
    title: 'Your settings were restored from an older copy',
    text: `Your settings file was damaged and could not be read. Your settings were restored from ${source}. Changes made after that are missing. ${kept}`
  }
}
