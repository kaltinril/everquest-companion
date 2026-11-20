// THE WIRES A UNIT CANNOT RUN (fork #9, phase R2). The log-read status is pushed, so a fact that
// moves without poking the publisher leaves every window on a stale sentence, in silence. The
// files that poke import Electron (`windows.ts`) and cannot be loaded here, so the wiring is read
// from their source with the comments taken out: the instrument `serveDeltaArm.test.mts` uses on
// the same files, for the same reason.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { IPC } from '../src/shared/ipc'

const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const LAUNCH_STATE = '../src/main/dataServer/engineLaunchState.ts'
const HOST = '../src/main/dataServer/engineClientHost.ts'
const TURN = '../src/main/dataServer/attachTurn.ts'
const WIRING = '../src/main/dataServer/engineClientWiring.ts'
const ENGINE_HOST = '../src/main/dataServer/engineHost.ts'
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

test('THE LAUNCH STATE POKES WHEN IT CHANGES: `set` calls noteLogReadTouched after the change', () => {
  const set = body(code(LAUNCH_STATE), /function set\(next: EngineLaunchSay\): void \{/)
  assert.match(set, /if \(same\(say, next\)\) return/, 'an unchanged state must stay silent')
  assert.match(set, /say = next[\s\S]*noteLogReadTouched\(\)/, 'the status never hears the launch state move')
})

test('THE CONNECTION STATE POKES: the listener is registered once per client, with the others', () => {
  const wiring = code(WIRING)
  assert.match(wiring, /client\.onState\(\(\) => \{\s*if \(host\.current\(\)\) noteLogReadTouched\(\)\s*\}\)/)
  // Once per client, never once per connect: the connection is reopened under the same client.
  const host = code(HOST)
  assert.equal((host.match(/wireEngineClient\(/g) ?? []).length, 1)
  assert.doesNotMatch(host, /client\.onState\(/, 'a second state listener in the host would run per reconnect')
})

test('the link keeper pokes: the host hands it the same call', () => {
  const link = /openEngineLink\(\{([\s\S]*?)\n {2}\}\)/.exec(code(HOST))
  assert.ok(link, 'the host no longer opens the link')
  assert.match(link[1], /changed: noteLogReadTouched/)
})

test('a new turn says which log it is for, so the wait restarts only on another log', () => {
  const bump = body(code(HOST), /function bumpGen\(\): number \{/)
  assert.match(bump, /noteLogReadTurn\(Date\.now\(\), attachTarget\(\)\)/)
})

test('A READ THAT ENDED, AND AN APP WITH NO CHARACTER, DROP THE BAR', () => {
  const host = code(HOST)
  assert.match(
    host,
    /if \(why === 'ended'\) \{\s*l\.attachedTo = null\s*noteEngineReadEnded\(\)\s*\}/,
    'the catch-up bar stays frozen over a read that stopped'
  )
  const rebuilt = body(host, /function onWorldRebuilt\(character: CharacterRef \| null\): void \{/)
  assert.match(rebuilt, /if \(tsWorldPath === null\) \{[\s\S]*?noteEngineReadEnded\(\)[\s\S]*?return/)
  const ended = body(code(LAUNCH_STATE), /export function noteEngineReadEnded\(\): void \{/)
  assert.match(ended, /if \(say\.fault !== null\) return/, 'it must not take a standing failure card down')
  assert.match(ended, /set\(\{ phase: 'starting', fold: null, fault: null \}\)/)
})

test('an attach error carries the engine-s code, so a timeout is not called a refusal', () => {
  // The attach moved to `attachTurn.ts` (phase R4): the turn hands over the code, the host records it.
  assert.match(code(TURN), /deps\.noteError\(describeErr\(err\), err instanceof EngineError \? err\.code : null\)/)
  assert.match(code(HOST), /noteError: \(detail, code\) => \{\s*noteLogReadError\('attach', detail, Date\.now\(\), code\)/)
})

test('THE TURN IS RUN BY attachTurn.ts, with the host-s own turn, connection and go-live edge handed in', () => {
  const host = code(HOST)
  const probe = body(host, /async function attachAndProbe\(mine: number\): Promise<void> \{/)
  assert.match(probe, /await runAttachTurn\(\{/)
  assert.match(probe, /mine: \(\) => gen === mine/, 'the turn is asked, never captured')
  assert.match(probe, /defines: \(\) => pushAllDefines\(mine\)/)
  assert.match(probe, /getAttached: \(\) => l\.attachedTo/)
  assert.match(probe, /stateDir: \(\) => attachStateDir\(\{ serving: true,/, 'the artifact handover left the attach')
  assert.match(probe, /saw: \(health\) => \{\s*sawHealth\(l, health\)/, 'the go-live edge is no longer fed')
  // The bar and the archive are told by the callback the turn calls for an ACCEPTED attach only.
  assert.match(probe, /const refolded = liveHistory\.engineAttaching\(\)\s*return \(\) => \{\s*noteEngineFolding\(\)\s*refolded\(\)/)
  // One sender of the attach, and it is not this file.
  assert.doesNotMatch(host.replace(/attach: \(params\) => l\.client\.request\('session\.attach', params\)/, ''), /'session\.attach'/)
  const turn = code(TURN)
  // The handover comes before the request object exists; the defines before any attach.
  assert.match(turn, /const stateDir = deps\.stateDir\(\)\s*const clock = deps\.clock\(\)\s*const taken = deps\.attaching\(\)[\s\S]*?await deps\.attach\(/)
  assert.match(turn, /await deps\.defines\(\)\s*if \(!deps\.mine\(\)\) return[\s\S]*?sendAttach\(turn\)/)
  assert.match(turn, /if \(deps\.getAttached\(\) !== deps\.target && !\(await sendAttach\(turn\)\)\) return/)
  assert.match(turn, /if \(result\.accepted && \(mine \|\| deps\.wanted\(\) === deps\.target\)\) taken\(\)/)
  assert.match(probe, /wanted: attachTarget/)
})

test('the supervisor-s edges poke, and its fault is scrubbed before the card is told', () => {
  const host = code(ENGINE_HOST)
  assert.match(host, /onFault: \(fault\) => \{\s*noteEngineFault\(scrubFault\(fault, [^\n]*\)\)\s*noteLogReadTouched\(\)/)
  assert.match(host, /onPid: \(pid\) => \{[\s\S]*?noteLogReadTouched\(\)\s*\},/)
  assert.doesNotMatch(host, /noteEngineFault\(fault\)/, 'the unscrubbed fault is back')
})

test('THE STATUS GOES TO EVERY WINDOW, and both preloads listen for it', () => {
  assert.match(code(MAIN_REPORT), /sendToEveryWindow\(IPC\.onLogReadReport, report\)/)
  assert.match(code(MAIN_REPORT), /onLogReadChange\(\(\) => \{\s*status\.poke\(\)/)
  assert.match(code(MAIN_REPORT), /logProbe\.onSettled\(\(\) => \{\s*status\.poke\(\)/)
  assert.match(code(IPC_ENGINE), /startLogReadStatus\(\)/, 'nothing starts the publisher')
  // The trap: a channel added to one preload and not the other leaves overlays without the status.
  for (const preload of ['../src/preload/engine.ts', '../src/preload/overlay.ts']) {
    const source = code(preload)
    assert.match(source, /ipcRenderer\.on\(IPC\.onLogReadReport, listener\)/, `${preload} does not listen`)
    assert.match(source, /ipcRenderer\.removeListener\(IPC\.onLogReadReport, listener\)/, `${preload} never lets go`)
    assert.match(source, /ipcRenderer\.invoke\(IPC\.logReadReport\)/, `${preload} cannot read the status on mount`)
  }
  assert.notEqual(IPC.onLogReadReport, IPC.logReadReport, 'the push and the read share a channel name')
})

// ---- the Try again button ------------------------------------------------------------------------

test('TRY AGAIN IS BOUND TO THE THREE REAL VERBS, reads the wait that was last pushed, and is main-window only', () => {
  const ipc = code(IPC_ENGINE)
  const bound = /createTryAgain\(\{([\s\S]*?)\n\}\)/.exec(ipc)
  assert.ok(bound, 'the handler is no longer built from createTryAgain')
  assert.match(bound[1], /wait: \(\) => lastLogReadReport\(\)\.wait/)
  assert.match(bound[1], /relaunch: retryEngineSupervisor/)
  assert.match(bound[1], /reconnect: reconnectEngineClient/)
  assert.match(bound[1], /reattach: reattachEngineLog/)
  assert.match(ipc, /ipcMain\.handle\(IPC\.logReadTryAgain, /)
  assert.match(code('../src/preload/engine.ts'), /ipcRenderer\.invoke\(IPC\.logReadTryAgain\)/)
  // An overlay does not act on the engine: it is told the status and nothing more.
  assert.doesNotMatch(code('../src/preload/overlay.ts'), /logReadTryAgain/)
})

test('THE BAND DRAWS WHERE THE READ IS: the row two Try lines send the player to look at', () => {
  // React cannot be loaded here. Which waits get the row, and its words, are `bandPosition`
  // (tests/logReadWords.test.mts); this pins that the band asks it and prints the answer.
  const band = code('../src/renderer/src/components/LogReadBand.tsx')
  assert.match(band, /const position = waiting \? bandPosition\(report\) : null/)
  assert.match(band, /position !== null && \([\s\S]*?data-testid="log-read-band-position"[\s\S]*?\{position\.label\}: \{position\.value\}/)
})

test('a re-read is a new turn that forgets the attach, and with no connection it reconnects instead', () => {
  const reattach = body(code(HOST), /export function reattachEngineLog\(\): void \{/)
  assert.match(reattach, /if \(l\.client\.state !== 'ready'\) \{\s*l\.link\.reopen\(\)\s*return\s*\}/)
  assert.match(reattach, /const mine = bumpGen\(\)[\s\S]*l\.attachedTo = null\s*void attachAndProbe\(mine\)/)
  // Windows that were being served are told, as on every other edge that replaces the world.
  assert.match(reattach, /const wasServing = engineLiveOn !== null[\s\S]*if \(wasServing\) pushWorldChanged\(\)/)
  const reconnect = body(code(HOST), /export function reconnectEngineClient\(\): void \{/)
  assert.match(reconnect, /live\?\.link\.reopen\(\)/, 'a connection that is up and silent is left as it is')
})
