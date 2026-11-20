// THE WIRES OF PHASE R4 THAT A UNIT CANNOT RUN (fork #9). The recovery, the look after live and
// the turn are leaves with tests of their own; what joins them to the app sits in files that
// import Electron. So the joins are read from source with the comments taken out, the instrument
// `logReadPokes.test.mts` uses on the same files. A join that is dropped fails nothing else: the
// app simply stops recovering, in silence.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const HOST = '../src/main/dataServer/engineClientHost.ts'
const ENGINE_HOST = '../src/main/dataServer/engineHost.ts'
const SUPERVISOR = '../src/main/dataServer/supervisor.ts'
const MAIN_REPORT = '../src/main/logReadReport.ts'
const IPC_ENGINE = '../src/main/ipc/engine.ts'

/** The body of a function declaration, to its closing brace at column 0. */
function body(source: string, signature: RegExp): string {
  const start = signature.exec(source)
  assert.ok(start, `${String(signature)} is gone`)
  const rest = source.slice(start.index)
  const end = rest.indexOf('\n}')
  assert.ok(end > 0)
  return rest.slice(0, end)
}

test('THE HOST SAYS EVERY EDGE OF A READ: a launch, a turn, live, ended', () => {
  const host = code(HOST)
  // Every turn, from the one place the turn advances: nothing armed may fire into a new read.
  assert.match(body(host, /function bumpGen\(\): number \{/), /noteReadEdge\('turn', null\)/)
  assert.match(host, /noteLogReadConnection\(Date\.now\(\)\)\s*noteReadEdge\('launch', null\)/)
  const probe = body(host, /async function attachAndProbe\(mine: number\): Promise<void> \{/)
  assert.match(probe, /sawHealth\(l, health\)\s*if \(health\.status === 'live'\) noteReadEdge\('live', target\)/)
  // The ended edge comes AFTER the error is recorded: the recovery may replace it with its own.
  assert.match(
    probe,
    /noteLogReadError\(why === 'ended' \? 'fold' : 'health', detail, Date\.now\(\)\)\s*if \(why === 'ended'\) noteReadEdge\('ended', target\)/
  )
  assert.doesNotMatch(probe, /noteReadEdge\('ended', target\)[\s\S]*noteLogReadError\(/)
})

test('THE SUPERVISOR-S PROBE ANSWERS REACH THE LOOK AFTER LIVE, which asks on the turn and the live log', () => {
  assert.match(code(SUPERVISOR), /onHealthy: \(health, first\) => \{ this\.deps\.onHealth\?\.\(health\); if \(first\) this\.reachedReady\(l, announce, health\) \}/)
  assert.match(code(ENGINE_HOST), /onHealth: noteSupervisorHealth/)
  const host = code(HOST)
  assert.match(body(host, /export function noteSupervisorHealth\(/), /afterLive\.probed\(health\.status\)/)
  const watch = /createAfterLiveWatch\(\{([\s\S]*?)\n\}\)/.exec(host)
  assert.ok(watch, 'the host no longer builds the look after live')
  assert.match(watch[1], /liveOn: \(\) => engineLiveOn/)
  assert.match(watch[1], /turn: \(\) => gen/)
  assert.match(watch[1], /ask: \(\) => engineRequest\('session\.health', \{\}\)/, 'the confirm is on main-s own connection')
  assert.match(watch[1], /ended: readStoppedAfterLive/)
})

test('A READ THAT STOPPED AFTER LIVE: new turn, windows told, attach forgotten, reason recorded, THEN the edge', () => {
  const stopped = body(code(HOST), /function readStoppedAfterLive\(\): void \{/)
  assert.match(
    stopped,
    /bumpGen\(\)\s*pushWorldChanged\(\)\s*l\.attachedTo = null\s*noteEngineReadEnded\(\)\s*noteLogReadError\('fold', 'the engine stopped reading after it was live', Date\.now\(\)\)\s*noteReadEdge\('endedAfterLive', was\)/
  )
  // The log is read BEFORE the turn clears it.
  assert.match(stopped, /const was = engineLiveOn[\s\S]*?bumpGen\(\)/)
})

test('THE RECOVERY IS BOUND: the real probe, the real re-attach, the status told, and both listeners', () => {
  const report = code(MAIN_REPORT)
  const bound = /createLogReadRecovery\(\{([\s\S]*?)\n\}\)/.exec(report)
  assert.ok(bound, 'nothing builds the recovery')
  // `since` must reach the probe, and the answer's time must come back: an answer the probe kept
  // from before a read ended would otherwise decide what is done about that end.
  assert.match(bound[1], /look: \(path, since\) => \{\s*logProbe\.look\(path, since\)/)
  assert.match(bound[1], /last: \(path\) => logProbe\.last\(path\)/)
  assert.match(bound[1], /answeredAt: \(path\) => logProbe\.answeredAt\(path\)/)
  assert.match(bound[1], /reattach: reattachEngineLog/)
  assert.match(bound[1], /stopped: \(line\) => \{\s*noteLogReadError\('fold', line, Date\.now\(\)\)/)
  assert.match(bound[1], /timer: unrefTimer/, 'a watch must never keep the app alive')
  assert.match(bound[1], /changed: \(\) => \{\s*status\.poke\(\)/)
  const start = body(report, /export function startLogReadStatus\(\): void \{/)
  // The probe has ONE listener: the publisher and the recovery are both told from it.
  assert.equal((report.match(/logProbe\.onSettled\(/g) ?? []).length, 1)
  assert.match(start, /logProbe\.onSettled\(\(\) => \{\s*status\.poke\(\)\s*recovery\.probed\(\)/)
  assert.match(start, /onReadEdge\(\(edge, logPath\) => \{\s*recovery\.edge\(edge, logPath\)/)
  assert.match(report, /watchingFile: recovery\.watching\(\)/, 'the Try line no longer follows the watch')
})

test('TRY AGAIN TELLS THE RECOVERY A PERSON ASKED, only when the press did something', () => {
  const ipc = code(IPC_ENGINE)
  assert.match(
    ipc,
    /ipcMain\.handle\(IPC\.logReadTryAgain, \(\) => \{\s*if \(tryLogReadAgain\(\) === null\) return\s*noteReadEdge\('manual', null\)\s*noteLogReadTouched\(\)/
  )
})
