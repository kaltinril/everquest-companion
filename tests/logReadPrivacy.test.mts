// What may reach the screen from outside text (fork #9, phase R2): an engine stderr line is
// scrubbed BEFORE it is cut, a launch fault's detail loses its program path, and the machine's
// shared folders are not printed as the player's own home.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  composeLogReadReport,
  scrubFault,
  scrubPaths,
  type LogReadFacts
} from '../src/shared/logReadReport'

const NOW = 1_800_000_000_000
const LOG = 'C:\\Users\\Jane\\EverQuest\\Logs\\eqlog_Primitive_freeport.txt'
const HOME = 'C:\\Users\\Jane'

function facts(over: Partial<LogReadFacts> = {}): LogReadFacts {
  return {
    now: NOW,
    appVersion: '1.0.0-test.52',
    logPath: LOG,
    home: HOME,
    supervisor: 'ready',
    fault: null,
    connection: 'ready',
    readiness: 'notLive',
    health: { status: 'idle', at: NOW, since: NOW },
    fold: null,
    logSize: null,
    lastOffset: null,
    movedAt: null,
    waitingSince: NOW - 2_000,
    error: null,
    probe: null,
    lastCombatRead: null,
    link: null,
    tooLarge: null,
    ...over
  }
}

test('A STDERR LINE IS SCRUBBED BEFORE IT IS CUT, so a path near the cut still loses the user name', () => {
  // 400 characters, with the log path straddling character 200: cut first, the path's tail is gone,
  // the log-path rule no longer matches and the folder names in front of the cut are printed.
  const lead = 'x'.repeat(150)
  const line = `${lead} could not read ${LOG}: ${'y'.repeat(180)}`
  assert.ok(line.length >= 400)
  const r = composeLogReadReport(
    facts({ error: { step: 'fold', code: null, detail: 'idle', at: NOW, said: [line] } })
  )
  const shown = r.engineSaid[0]
  assert.ok(shown.startsWith(`${lead} could not read eqlog_Primitive_freeport.txt: yyy`), shown)
  assert.equal(shown.length, 201, 'cut to 200 characters, with the ellipsis that says so')
  assert.ok(shown.endsWith('…'))
  assert.doesNotMatch(JSON.stringify(r), /Jane|Users|EverQuest\\\\Logs/)
})

test('a short stderr line is not cut and gets no ellipsis', () => {
  const r = composeLogReadReport(
    facts({ error: { step: 'fold', code: null, detail: 'idle', at: NOW, said: ['[engined] read ended'] } })
  )
  assert.deepEqual(r.engineSaid, ['[engined] read ended'])
})

test("A LAUNCH FAULT'S DETAIL LOSES ITS PROGRAM PATH before the failure card is told", () => {
  const fault = {
    kind: 'spawn-failed',
    attempts: 2,
    detail: 'C:\\Users\\Jane\\AppData\\Local\\Programs\\eq\\resources\\engined.exe: spawn EPERM'
  } as const
  assert.deepEqual(scrubFault(fault, LOG, HOME), {
    kind: 'spawn-failed',
    attempts: 2,
    detail: '~\\AppData\\Local\\Programs\\eq\\resources\\engined.exe: spawn EPERM'
  })
  // The log path in an engine's last word becomes its base name, as everywhere else.
  assert.equal(
    scrubFault({ kind: 'exited', attempts: 1, detail: `panicked reading ${LOG}` }, LOG, HOME)?.detail,
    'panicked reading eqlog_Primitive_freeport.txt'
  )
  assert.equal(scrubFault(null, LOG, HOME), null, 'a launch that reached ready has no fault')
  const silent = { kind: 'no-binary', attempts: 0, detail: null } as const
  assert.deepEqual(scrubFault(silent, null, HOME), silent, 'no detail is no detail')
})

test("THE MACHINE'S SHARED FOLDERS ARE LEFT AS WRITTEN: they are not the player's home", () => {
  const eq = 'C:\\Users\\Public\\Daybreak Game Company\\EverQuest'
  assert.equal(scrubPaths(eq, null, HOME), eq)
  assert.equal(scrubPaths('c:/users/public/x', null, HOME), 'c:/users/public/x')
  assert.equal(scrubPaths('C:\\Users\\Default\\NTUSER.DAT', null, HOME), 'C:\\Users\\Default\\NTUSER.DAT')
  assert.equal(scrubPaths('C:\\Users\\All Users\\x', null, HOME), 'C:\\Users\\All Users\\x')
  assert.equal(scrubPaths('in C:\\Users\\Public and on', null, HOME), 'in C:\\Users\\Public and on')
  assert.equal(scrubPaths('C:\\Users\\Public', null, HOME), 'C:\\Users\\Public')
  // A person's folder still goes, also one that merely starts like a shared one.
  assert.equal(scrubPaths('C:\\Users\\Jane\\x', null, ''), '~\\x')
  assert.equal(scrubPaths('C:\\Users\\Publican\\x', null, ''), '~\\x')
  assert.equal(scrubPaths('D:\\Users\\Defaulter\\x', null, ''), '~\\x')
})
