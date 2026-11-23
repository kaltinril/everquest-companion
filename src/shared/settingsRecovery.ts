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

const NOTICE_KINDS: readonly unknown[] = ['recovered', 'restored-backup', 'reset']

/** A stored value, as the notice it should be; null for anything else. */
function storedNotice(v: unknown): SettingsRecoveryNotice | null {
  if (typeof v !== 'object' || v === null) return null
  const { kind, title, text } = v as Partial<SettingsRecoveryNotice>
  if (!NOTICE_KINDS.includes(kind) || typeof title !== 'string' || typeof text !== 'string') return null
  return { kind: kind as SettingsRecoveryNotice['kind'], title, text }
}

/** Where a notice waits until the player has closed it (the settings store, in main). */
export interface RecoveryNoticePorts {
  load: () => unknown
  save: (notice: SettingsRecoveryNotice) => void
  clear: () => void
}

export interface RecoveryNoticeHolder {
  get: () => SettingsRecoveryNotice | null
  /** The player closed it: it is not shown again, on this launch or the next. */
  seen: () => void
}

/**
 * The notice to show, kept until the player closes it. The launch that did the recovery may never
 * open the main window (started and quit from the tray), and the next launch finds a healthy file,
 * so the words are stored. A store that refuses the write costs only that: the notice still shows
 * on this launch.
 */
export function holdRecoveryNotice(fresh: SettingsRecoveryNotice | null, ports: RecoveryNoticePorts): RecoveryNoticeHolder {
  let notice = fresh ?? storedNotice(ports.load())
  if (fresh !== null) {
    try {
      ports.save(fresh)
    } catch {
      // Shown this launch all the same.
    }
  }
  return {
    get: () => notice,
    seen: () => {
      notice = null
      try {
        ports.clear()
      } catch {
        // Closed for this launch; a later launch may show it once more.
      }
    }
  }
}
