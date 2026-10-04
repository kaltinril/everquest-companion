// main/logArchive/actions.ts — WHAT THE LOG ARCHIVE CARD CAN ASK FOR (steps 2.1 to 2.5, 3.2, 3.5, 3.6, 5.5).
//
// Every action checks the switch first and refuses while it is off; nothing here runs unless the
// player clicked for it. One action at a time. Each returns the outcome in plain words and the
// card's whole state afterwards.
//
// The engine ships with the app, so the app version names the parser that produced a segment.

import { app } from 'electron'
import { existsSync, statfsSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { engineRequest, engineServeReadiness } from '../dataServer/engineClientHost'
import { characterId } from '../log/config'
import { getActiveCharacter } from '../session'
import { getLogArchivePrefs, logArchiveOn, setLogArchivePrefs } from '../storeLogArchive'
import { HELD_TEXT, type DumpAdvice, type LogArchiveReply, type LogArchiveStatus, type SegmentRow } from '../../shared/logArchive/panel'
import { driveOf, rotateBlockers } from '../../shared/logArchive/preflight'
import type { Segment } from '../../shared/logArchive/segment'
import { archiveName, backupLog, sweepTemp } from './backup'
import { captureSegment, type CaptureDeps } from './capture'
import { liveHistory, logArchiveDir } from './liveHistory'
import { readLogPrefix } from './logPrefix'
import { refoldWithApp } from './refoldActions'
import { refreshSegment, sweepRefreshLeftovers } from './refresh'
import { readJournal, recoverRotation, restoreLog, rotateLog, type RotateDeps } from './rotate'
import { listSegments, writeSegment } from './segmentStore'

let busy: string | null = null

function attached(): { character: string; logPath: string } | null {
  const c = getActiveCharacter()
  return c === null ? null : { character: characterId(c), logPath: c.logPath }
}

const captureDeps: CaptureDeps = {
  on: () => logArchiveOn(),
  attached,
  health: async () => engineRequest('session.health', {}),
  snapshot: async (module) => {
    try {
      const r = await engineRequest('module.snapshot', { module })
      return r.module === module ? { seq: r.seq, state: r.state } : null
    } catch {
      return null
    }
  },
  readPrefix: readLogPrefix,
  producedBy: () => ({ app: app.getVersion(), engine: app.getVersion() })
}

const rotateDeps: RotateDeps = {
  backup: backupLog,
  readPrefix: readLogPrefix,
  writeSegment,
  readSegment: (dir, id) => listSegments(dir).segments.find((s) => s.id === id) ?? null
}

function freeBytes(dir: string): number | null {
  try {
    const s = statfsSync(existsSync(dir) ? dir : dirname(dir))
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

function row(s: Segment): SegmentRow {
  return {
    id: s.id,
    state: s.state,
    firstStamp: s.log.firstStamp,
    lastStamp: s.log.lastStamp,
    logBytes: s.log.bytes,
    gzBytes: s.archiveGzBytes ?? null,
    archivePath: s.archivePath,
    gapLines: s.gapLines ?? 0,
    app: s.producedBy.app,
    olderEngine: s.producedBy.engine !== app.getVersion()
  }
}

/** Step 2.5: when were the inventory and faction dumps last written, beside the log's last write. */
function dumpAdvice(logPath: string, logModified: number): DumpAdvice {
  const stem = basename(logPath).replace(/^eqlog_/i, '').replace(/\.txt$/i, '')
  const root = dirname(dirname(logPath))
  const mtime = (kind: string): number | null => {
    const p = join(root, `${stem}-${kind}.txt`)
    return existsSync(p) ? statSync(p).mtimeMs : null
  }
  const inventoryMs = mtime('Inventory')
  const factionsMs = mtime('Factions') ?? mtime('Faction')
  const stale = [inventoryMs, factionsMs].some((t) => t === null || t < logModified - 24 * 3600_000)
  return { inventoryMs, factionsMs, stale }
}

function liveLog(a: { logPath: string } | null): LogArchiveStatus['live'] {
  if (a === null || !existsSync(a.logPath)) return null
  const st = statSync(a.logPath)
  return { path: a.logPath, bytes: st.size, modifiedMs: st.mtimeMs }
}

function newestSealed(rows: SegmentRow[]): string | null {
  const sealed = rows.filter((r) => r.state === 'sealed').sort((x, y) => x.lastStamp.localeCompare(y.lastStamp))
  return sealed.length > 0 ? sealed[sealed.length - 1].id : null
}

/** The card's whole state. Reads the folder only while the switch is on. */
export function logArchiveStatus(): LogArchiveStatus {
  const dir = logArchiveDir()
  const on = getLogArchivePrefs().enabled
  const a = attached()
  const base: LogArchiveStatus = {
    enabled: on,
    dir,
    live: liveLog(a),
    segments: [],
    newestSealedId: null,
    held: [],
    skipped: [],
    dumps: null,
    rotateBlockers: [],
    busy
  }
  return on ? fillOn(base, dir, a) : base
}

function fillOn(base: LogArchiveStatus, dir: string, a: { character: string; logPath: string } | null): LogArchiveStatus {
  const listing = listSegments(dir, a?.character)
  const ctx = liveHistory.status()
  base.segments = listing.segments.map(row).sort((x, y) => x.firstStamp.localeCompare(y.firstStamp))
  base.newestSealedId = newestSealed(base.segments)
  base.held = (ctx?.held ?? []).map((h) => ({ id: h.id, text: HELD_TEXT[h.reason] }))
  base.skipped = listing.skipped
  base.dumps = base.live !== null ? dumpAdvice(base.live.path, base.live.modifiedMs) : null
  base.rotateBlockers = rotateBlockers({
    on: true,
    hasLog: base.live !== null,
    engineLive: engineServeReadiness().ok,
    sameDrive: a === null || driveOf(a.logPath) === driveOf(dir),
    freeBytes: freeBytes(dir),
    logBytes: base.live?.bytes ?? 0,
    interrupted: readJournal(dir) !== null,
    busy: busy !== null
  })
  return base
}

function reply(ok: boolean, message: string): LogArchiveReply {
  return { ok, message, status: logArchiveStatus() }
}

/** Run one action at a time, behind the switch. */
async function exclusive(label: string, fn: () => LogArchiveReply | Promise<LogArchiveReply>): Promise<LogArchiveReply> {
  if (!logArchiveOn()) return reply(false, 'Keep log history is off.')
  if (busy !== null) return reply(false, `Busy: ${busy}.`)
  busy = label
  try {
    return await fn()
  } catch (err) {
    return reply(false, (err as Error).message)
  } finally {
    busy = null
  }
}

/** The switch. Turning it on or off changes what the tabs show, so the merge context is reset. */
export function setLogArchiveEnabled(enabled: boolean): LogArchiveReply {
  setLogArchivePrefs({ enabled })
  liveHistory.forgetHistoryContext()
  return reply(true, enabled ? 'Keep log history is on.' : 'Keep log history is off. Your archives stay where they are.')
}

/** Steps 2.1 and 2.2: capture, then a verified compressed copy. The live log is only read. */
export function backupNow(): Promise<LogArchiveReply> {
  return exclusive('backing up the log', async () => {
    const dir = logArchiveDir()
    sweepTemp(dir)
    const cap = await captureSegment(captureDeps)
    if (!cap.ok) return reply(false, `Not backed up: ${cap.reason}.`)
    const s = cap.segment
    writeSegment(dir, s)
    const logPath = attached()?.logPath ?? ''
    const name = archiveName(basename(logPath), s.log.firstStamp, s.log.lastStamp)
    const b = await backupLog({ source: logPath, bytes: s.log.bytes, expectSha256: s.log.sha256, dir, name })
    if (!b.ok) return reply(false, `Not backed up: ${b.reason}. The capture is kept and can be backed up again.`)
    writeSegment(dir, {
      ...s,
      state: 'backed-up',
      archivePath: b.path,
      archiveSource: { bytes: b.bytes, sha256: b.sha256 },
      archiveGzBytes: b.gzBytes
    })
    return reply(true, `Backed up ${b.bytes.toLocaleString()} bytes to ${b.path}.`)
  })
}

/** Step 2.3: seal a backed-up segment so its history may be shown. */
export function keepHistory(id: string): Promise<LogArchiveReply> {
  return exclusive('keeping history', () => {
    const dir = logArchiveDir()
    const s = rotateDeps.readSegment(dir, id)
    if (s === null) return reply(false, 'That backup was not found.')
    if (s.state !== 'backed-up') return reply(false, s.state === 'sealed' ? 'That history is already kept.' : 'Back it up first.')
    writeSegment(dir, { ...s, state: 'sealed' })
    liveHistory.noteSealedThisAttach(id)
    return reply(true, 'Kept. It shows on the tabs once your current log no longer contains it.')
  })
}

/** Step 3.5: archive the live log and start a fresh one. The card has confirmed with the player. */
export function rotateNow(): Promise<LogArchiveReply> {
  return exclusive('archiving the log', async () => {
    const blockers = logArchiveStatus().rotateBlockers.filter((b) => !b.startsWith('Another'))
    if (blockers.length > 0) return reply(false, blockers.join(' '))
    const a = attached()
    if (a === null) return reply(false, 'No character log is attached.')
    const cap = await captureSegment(captureDeps)
    if (!cap.ok) return reply(false, `Not archived: ${cap.reason}. Nothing has changed.`)
    const dir = logArchiveDir()
    const r = await rotateLog(a.logPath, dir, cap.segment, rotateDeps)
    if (!r.ok) return reply(false, r.logTouched ? `Interrupted: ${r.reason}` : `Not archived: ${r.reason}`)
    liveHistory.noteSealedThisAttach(r.segment.id)
    const gap = r.segment.gapLines ?? 0
    const extra = gap > 0 ? ` ${gap} line(s) written during the move are in the archive but not in the totals.` : ''
    return reply(true, `Archived to ${r.segment.archivePath ?? dir}. Your history is kept.${extra}`)
  })
}

/** Step 3.6: put the newest archived log back in front of the live one, then restart the app. */
export function restoreNow(id: string): Promise<LogArchiveReply> {
  return exclusive('putting a log back', async () => {
    const dir = logArchiveDir()
    const a = attached()
    if (a === null) return reply(false, 'No character log is attached.')
    const mine = listSegments(dir, a.character).segments.filter((s) => s.state === 'sealed')
    const newest = mine.sort((x, y) => y.log.lastStamp.localeCompare(x.log.lastStamp))[0]
    if (newest?.id !== id) return reply(false, 'Only the newest archived log can be put back.')
    const r = await restoreLog(a.logPath, dir, newest)
    if (!r.ok) return reply(false, `Not put back: ${r.reason}`)
    writeSegment(dir, { ...newest, state: 'backed-up' })
    // The engine is following a short log that just became a long one; only a fresh launch folds
    // it from the start. The card told the player the app restarts.
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 1500).unref()
    return reply(true, 'Your log is back in one piece. The app restarts now to read it.')
  })
}

/** Step 5.5: refold an older segment's archive with this build and swap the new totals in. */
export function refreshHistory(id: string): Promise<LogArchiveReply> {
  return exclusive('refreshing a history', async () => {
    const r = await refreshSegment(logArchiveDir(), id, {
      refold: (s) => refoldWithApp(s, true),
      producedBy: captureDeps.producedBy
    })
    if (!r.ok) return reply(false, `Not refreshed: ${r.reason}.`)
    liveHistory.forgetHistoryContext()
    const what = r.changed.length === 0 ? 'Nothing in it changed.' : `Updated: ${r.changed.join(', ')}.`
    return reply(true, `Refreshed with this version. ${what}`)
  })
}

/** Step 3.4, at launch before the engine attaches. Never throws. */
export async function recoverLogArchiveAtLaunch(note: (line: string) => void): Promise<void> {
  try {
    const dir = logArchiveDir()
    if (!existsSync(dir)) return
    sweepTemp(dir)
    sweepRefreshLeftovers(dir)
    const done = await recoverRotation(dir, rotateDeps)
    if (done !== null) note(`log archive: ${done}`)
  } catch (err) {
    note(`log archive: launch check failed: ${(err as Error).message}`)
  }
}
