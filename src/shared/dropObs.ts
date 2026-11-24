// shared/dropObs.ts — what the Settings card "Send loot to the wiki's drop database" is told
// (main/dropObs/service.ts answers; docs/community/requirements/drop-db-submit.md).

export interface DropObsStatus {
  /** The switch. Nothing is sent while it is off. */
  enabled: boolean
  /** The Bot password's user name (`Name@Label`), '' when none is saved. */
  username: string
  hasPassword: boolean
  /** False when this machine cannot encrypt a saved password; saving is refused then. */
  encryptionAvailable: boolean
  /** Loot the wiki has not been sent yet; null when the loot cannot be read right now. */
  ready: number | null
  /** Events in the batch waiting for a definite answer. */
  inFlight: number
  delivered: number
  /** Events the wiki refused or found in conflict, kept here for review. */
  kept: number
  lastError: string | null
  /** Why sending is stopped until the player fixes it; null when it is not. */
  stopped: string | null
  /** Epoch ms of the next try after a failure; 0 when none is waiting. */
  nextAttemptAt: number
  lastSuccessAt: number
}

export interface DropObsReply {
  ok: boolean
  message: string
  status: DropObsStatus
}

export const BOT_PASSWORDS_URL = 'https://eqlwiki.com/Special:BotPasswords'
export const DROP_DATABASE_URL = 'https://eqlwiki.com/Special:DropDatabase'
