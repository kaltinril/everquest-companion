// logReadReport.ts (main) - gathers what main knows about the log read and answers
// `engine:logReadReport` for the "Reading log..." panels (fork #9). The decision and the words are
// shared/logReadReport.ts; this file only collects. The full log path never crosses IPC.

import { app } from 'electron'
import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { getActiveCharacter } from './session'
import { engineClientFacts } from './dataServer/engineClientHost'
import { engineSupervisorStatus } from './dataServer/engineHost'
import { engineLaunchSay } from './dataServer/engineLaunchState'
import { logReadFacts } from './dataServer/logReadState'
import {
  composeLogReadReport,
  type LogReadFacts,
  type LogReadReport
} from '../shared/logReadReport'

/** Can this process open the log, and how big is it? A diagnostic on the failure path only: the
 *  engine owns log-file facts everywhere else. */
async function probeLog(path: string): Promise<NonNullable<LogReadFacts['probe']>> {
  try {
    const file = await open(path, 'r')
    try {
      return { bytes: (await file.stat()).size, problem: null }
    } finally {
      await file.close()
    }
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
    return { bytes: null, problem: missing ? 'missing' : 'unreadable' }
  }
}

export async function buildLogReadReport(): Promise<LogReadReport> {
  const logPath = getActiveCharacter()?.logPath ?? null
  const say = engineLaunchSay()
  const client = engineClientFacts()
  const notes = logReadFacts()
  // The file is opened here only when the read has ended or nothing has stated its size.
  const ended = notes.error?.step === 'fold' || notes.health?.status === 'idle'
  const unsized = say.fold === null && client.logSize === null
  const probe = logPath !== null && (ended || unsized) ? await probeLog(logPath) : null
  return composeLogReadReport({
    ...notes,
    now: Date.now(),
    appVersion: app.getVersion(),
    logPath,
    home: homedir(),
    supervisor: engineSupervisorStatus(),
    fault: say.fault,
    connection: client.connection,
    readiness: client.readiness,
    fold: say.fold,
    logSize: client.logSize,
    probe
  })
}
