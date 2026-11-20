// logReadReport.ts (main) - gathers what main knows about the log read (fork #9). The decision
// and the words are shared/logReadReport.ts; this file only collects. The full log path never
// crosses IPC.
//
// SYNCHRONOUS, AND IT NEVER WAITS ON THE DISK. It used to await an open of the log on every ask;
// main's look at the file is `logProbe.ts` now, which is read here without waiting.

import { app } from 'electron'
import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { getActiveCharacter } from './session'
import { engineClientFacts } from './dataServer/engineClientHost'
import { engineSupervisorStatus } from './dataServer/engineHost'
import { engineLaunchSay } from './dataServer/engineLaunchState'
import { logReadFacts } from './dataServer/logReadState'
import { createLogProbe, worthALook } from './logProbe'
import { composeLogReadReport, type LogReadReport } from '../shared/logReadReport'

/** The log's size in bytes, by opening it for reading: what the engine has to be able to do. */
async function openedSize(path: string): Promise<number> {
  const file = await open(path, 'r')
  try {
    return (await file.stat()).size
  } finally {
    await file.close()
  }
}

/** Main's one look at the log file, shared by everything that asks. */
export const logProbe = createLogProbe({ open: openedSize, now: () => Date.now() })

/** Is main's own open of the active log out right now? Its answer will change the status. */
export function logProbePending(): boolean {
  const logPath = getActiveCharacter()?.logPath ?? null
  return logPath !== null && logProbe.pending(logPath)
}

export function buildLogReadReport(): LogReadReport {
  const logPath = getActiveCharacter()?.logPath ?? null
  const say = engineLaunchSay()
  const client = engineClientFacts()
  const notes = logReadFacts()
  const now = Date.now()
  if (logPath !== null && worthALook(notes, now)) logProbe.look(logPath)
  return composeLogReadReport({
    ...notes,
    now,
    appVersion: app.getVersion(),
    logPath,
    home: homedir(),
    supervisor: engineSupervisorStatus(),
    fault: say.fault,
    connection: client.connection,
    link: client.link,
    readiness: client.readiness,
    fold: say.fold,
    logSize: client.logSize,
    probe: logPath === null ? null : logProbe.last(logPath)
  })
}
