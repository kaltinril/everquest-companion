// logReadReport.ts (main) - gathers what main knows about the log read (fork #9). The decision
// and the words are shared/logReadReport.ts; this file only collects. The full log path never
// crosses IPC.
//
// SYNCHRONOUS, AND IT NEVER WAITS ON THE DISK. It used to await an open of the log on every ask;
// main's look at the file is `logProbe.ts` now, which is read here without waiting.
//
// It also binds the publisher (`logReadStatus.ts`) to Electron: the report built here is what is
// pushed to every window when it changes.

import { app } from 'electron'
import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { logInfo } from './errorLog'
import { getActiveCharacter } from './session'
import { engineClientFacts, reattachEngineLog } from './dataServer/engineClientHost'
import { engineSupervisorStatus } from './dataServer/engineHost'
import { engineLaunchSay } from './dataServer/engineLaunchState'
import { logReadFacts, noteLogReadError, onLogReadChange } from './dataServer/logReadState'
import { onReadEdge } from './dataServer/readEdges'
import { createLogProbe, worthALook } from './logProbe'
import { createLogReadRecovery } from './logReadRecovery'
import { createLogReadStatus } from './logReadStatus'
import { sendToEveryWindow } from './windows'
import { IPC } from '../shared/ipc'
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
function logProbePending(): boolean {
  const logPath = getActiveCharacter()?.logPath ?? null
  return logPath !== null && logProbe.pending(logPath)
}

/** A timer that is never the reason this process stays alive. */
function unrefTimer(run: () => void, ms: number): () => void {
  const handle = setTimeout(run, ms)
  handle.unref()
  return (): void => {
    clearTimeout(handle)
  }
}

/** THE PUBLISHER, bound: composed here, sent to the main window and every overlay. */
const status = createLogReadStatus({
  build: buildLogReadReport,
  send: (report) => {
    sendToEveryWindow(IPC.onLogReadReport, report)
  },
  timer: unrefTimer,
  now: () => Date.now(),
  defer: queueMicrotask,
  pending: logProbePending
})

/** THE RECOVERY, bound (phase R4): what the app tries by itself when a read ends. */
const recovery = createLogReadRecovery({
  look: (path, since) => {
    logProbe.look(path, since)
  },
  last: (path) => logProbe.last(path),
  answeredAt: (path) => logProbe.answeredAt(path),
  reattach: reattachEngineLog,
  stopped: (line) => {
    noteLogReadError('fold', line, Date.now())
  },
  timer: unrefTimer,
  now: () => Date.now(),
  note: (line) => {
    logInfo(`[everquest-companion] ${line}`)
  },
  changed: () => {
    status.poke()
  }
})

/**
 * Start pushing the status, and start hearing the read's edges. Once, from the IPC registration:
 * before any window exists, so the first thing a window reads is already the pushed state, and
 * before the engine is started, so no edge is missed.
 */
export function startLogReadStatus(): void {
  onLogReadChange(() => {
    status.poke()
  })
  // ONE listener on the probe, and both readers of it are told here.
  logProbe.onSettled(() => {
    status.poke()
    recovery.probed()
  })
  onReadEdge((edge, logPath) => {
    recovery.edge(edge, logPath)
  })
  status.start()
}

/** The report every window was last sent: what the player was looking at when a button was pressed. */
export function lastLogReadReport(): LogReadReport {
  return status.last() ?? buildLogReadReport()
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
    probe: logPath === null ? null : logProbe.last(logPath),
    watchingFile: recovery.watching()
  })
}
