/**
 * log-archive-refold-trial.mts — STEP 5.4, RUN FOR REAL (docs/plans/log-archive).
 *
 * NOT PART OF THE SUITE: the name does not end `.e2e.mts`. It runs on a COPY of a log in a temp
 * install with its own settings folder, so no player's files are touched:
 *
 *   LOG_ARCHIVE_TRIAL_LOG=<a log, or a copy of one; the name must start eqlog_<Char>_<server>> \
 *   LOG_ARCHIVE_TRIAL_TABLES=<EverQuest folder, for spells_us*.txt and dbstr_us.txt; optional> \
 *   EQ_ENGINE_BIN=<engined.exe; optional> node --import tsx tests/e2e/log-archive-refold-trial.mts
 *
 * One app run: fold the log, turn Keep log history on, back it up (a segment with an archive), then
 * ask the developer's refold trial to fold the archive in a second engine and compare every module.
 * With tables named, it folds twice: without the client's tables beside the staged log, and with.
 */

import type { Page } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { buildIfStale } from './build.mjs'
import { check, note, reportRun } from './appHarness.mjs'
import { launchApp, mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { settleEngineServing } from './engineSteps.mjs'
import type { RefoldTrialReport } from '../../src/shared/logArchive/refoldCompare'

const SOURCE = process.env.LOG_ARCHIVE_TRIAL_LOG
const TABLES = process.env.LOG_ARCHIVE_TRIAL_TABLES

function stage(): { installDir: string; logPath: string } {
  if (SOURCE === undefined || !existsSync(SOURCE)) throw new Error('set LOG_ARCHIVE_TRIAL_LOG to a log or a copy of one')
  const installDir = mkdtempSync(join(tmpdir(), 'log-archive-refold-'))
  mkdirSync(join(installDir, 'Logs'))
  const stem = /^(eqlog_[^.]+)/i.exec(basename(SOURCE))?.[1] ?? 'eqlog_Trial_server'
  const logPath = join(installDir, 'Logs', `${stem}.txt`)
  copyFileSync(SOURCE, logPath)
  for (const t of ['spells_us.txt', 'spells_us_str.txt', 'dbstr_us.txt']) {
    if (TABLES !== undefined && existsSync(join(TABLES, t))) copyFileSync(join(TABLES, t), join(installDir, t))
  }
  return { installDir, logPath }
}

function call<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ([f, a]) => {
    const api = window.eq as unknown as Record<string, (...x: unknown[]) => Promise<unknown>>
    return api[f as string](...(a as unknown[])) as Promise<never>
  }, [fn, args] as const) as Promise<T>
}

function report(label: string, r: RefoldTrialReport): void {
  note(`${label}: ${r.message} captured by ${r.capturedBy?.engine ?? '?'}, refolded by ${r.running}; ` +
    `${r.bytes.toLocaleString()} bytes, staged in ${String(r.stageMs)} ms, folded in ${String(r.foldMs)} ms, ` +
    `${r.events.toLocaleString()} events, ${String(r.tables)} table(s)`)
  for (const v of r.verdicts) note(`  ${v.module}: ${v.detail}`)
  check(`${label}: the refold ran`, r.ok, r.message)
  const differ = r.verdicts.filter((v) => !v.same).map((v) => v.module)
  check(`${label}: every module matches`, r.verdicts.length > 0 && differ.length === 0, differ.join(', '))
}

async function main(): Promise<void> {
  buildIfStale()
  const { installDir, logPath } = stage()
  const userData = makeUserData()
  note(`staged ${statSync(logPath).size.toLocaleString()} bytes at ${logPath}`)
  const env: Record<string, string> = {}
  if (process.env.EQ_ENGINE_BIN !== undefined) env.EQ_ENGINE_BIN = process.env.EQ_ENGINE_BIN
  const began = Date.now()
  const run = await launchApp({ installDir, userData, env })
  try {
    const page = await mainWindow(run.app)
    const served = await settleEngineServing(run.app, 600_000)
    note(`engine ${served ? 'serving' : 'NOT serving'} after ${((Date.now() - began) / 1000).toFixed(0)} s`)
    await call(page, 'setLogArchiveEnabled', true)
    const backed = await call<{ ok: boolean; message: string; status: { segments: { id: string }[] } }>(page, 'logArchiveBackup')
    check('backup succeeds', backed.ok, backed.message)
    const id = backed.status.segments[0]?.id ?? ''
    report('without tables', await call<RefoldTrialReport>(page, 'logArchiveRefoldTrial', id, false))
    if (TABLES !== undefined) report('with tables', await call<RefoldTrialReport>(page, 'logArchiveRefoldTrial', id, true))
  } finally {
    await run.close()
    await removeUserData(userData)
    await removeUserData(installDir)
  }
  reportRun()
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
