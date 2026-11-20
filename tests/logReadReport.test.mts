// The "Reading log..." report (fork #9): what the box says, in which order the causes win, when it
// shows, and that no path with the player's Windows user name reaches the screen.
// `src/shared/logReadReport.ts` is pure, so every case is a literal facts object.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LOG_READ_SLOW_MS,
  LOG_READ_STALL_MS,
  composeLogReadReport,
  logReadLines,
  scrubPaths,
  type LogReadFacts,
  type LogReadWait
} from '../src/shared/logReadReport'
import { LOG_READ_WORDS } from '../src/shared/logReadWords'

const NOW = 1_800_000_000_000
const LOG = 'C:\\Users\\Jeremy\\EverQuest\\Logs\\eqlog_Primitive_freeport.txt'
const HOME = 'C:\\Users\\Jeremy'
const MB = 1024 * 1024

/** A healthy read two seconds in: engine up, connected, folding, offset moving. */
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
    health: { status: 'folding', at: NOW - 400, since: NOW - 2_000 },
    fold: { offset: 148.8 * MB, logSize: 412.3 * MB, events: 1_571_003, pct: 36.09 },
    logSize: null,
    lastOffset: 148.8 * MB,
    movedAt: NOW - 400,
    waitingSince: NOW - 2_000,
    error: null,
    probe: null,
    lastCombatRead: null,
    link: null,
    tooLarge: null,
    ...over
  }
}

/** The keeper of main's connection, two retries in. */
function link(over: Partial<NonNullable<LogReadFacts['link']>> = {}): NonNullable<LogReadFacts['link']> {
  return { tries: 2, of: 5, nextAt: NOW + 1_000, gaveUp: false, lastReason: 'ECONNREFUSED', everConnected: false, ...over }
}

function waitOf(over: Partial<LogReadFacts>): LogReadWait {
  return composeLogReadReport(facts(over)).wait
}

const NO_BINARY = { kind: 'no-binary', attempts: 0, detail: null }
const FOLD_ENDED = { step: 'fold', code: null, detail: 'the engine reports idle after an accepted attach', at: NOW, said: [] } as const

// ---- 1. the decision order ---------------------------------------------------------------------

test('each wait is reached by the facts that mean it', () => {
  assert.equal(waitOf({ logPath: null }), 'noCharacter')
  assert.equal(waitOf({ supervisor: 'absent' }), 'engineMissing')
  assert.equal(waitOf({ fault: { kind: 'exited', attempts: 3, detail: null } }), 'engineFailing')
  assert.equal(waitOf({ supervisor: 'backoff' }), 'engineStarting')
  assert.equal(waitOf({ connection: 'failed', link: link() }), 'connecting')
  assert.equal(waitOf({ connection: 'failed', link: link({ gaveUp: true }) }), 'notConnected')
  assert.equal(
    waitOf({ health: null, error: { step: 'attach', code: 'badParams', detail: 'badParams: no such log', at: NOW, said: [] } }),
    'attachRefused'
  )
  assert.equal(
    waitOf({ error: { step: 'health', code: null, detail: 'timeout', at: NOW, said: [] } }),
    'notAnswering'
  )
  assert.equal(waitOf({}), 'reading')
  assert.equal(waitOf({ readiness: 'ok', health: { status: 'live', at: NOW, since: NOW } }), 'ok')
})

test('A MISSING ENGINE WINS OVER EVERYTHING BELOW IT', () => {
  const wait = waitOf({
    fault: NO_BINARY,
    supervisor: 'absent',
    connection: null,
    error: FOLD_ENDED,
    health: { status: 'idle', at: NOW, since: NOW },
    probe: { bytes: null, problem: 'missing', pendingMs: null }
  })
  assert.equal(wait, 'engineMissing')
  assert.equal(waitOf({ fault: NO_BINARY }), 'engineMissing', 'the fault alone says it')
})

test('a read that ended is named by what main found when it looked at the file', () => {
  const idle = { status: 'idle', at: NOW, since: NOW }
  assert.equal(waitOf({ health: idle, probe: { bytes: null, problem: 'missing', pendingMs: null } }), 'logMissing')
  assert.equal(waitOf({ error: FOLD_ENDED, probe: { bytes: null, problem: 'unreadable', pendingMs: null } }), 'logUnreadable')
  assert.equal(waitOf({ health: idle, probe: { bytes: 5 * MB, problem: null, pendingMs: null } }), 'readerStopped')
  assert.equal(waitOf({ error: FOLD_ENDED, probe: null }), 'readerStopped')
})

test('a fold whose offset has not grown for a minute is stalled, and not a second sooner', () => {
  assert.equal(waitOf({ movedAt: NOW - LOG_READ_STALL_MS }), 'stalled')
  assert.equal(waitOf({ movedAt: NOW - LOG_READ_STALL_MS + 1 }), 'reading')
  assert.equal(waitOf({ movedAt: null }), 'reading', 'no mark yet is not a stall')
  // Only a FOLDING engine can stall: a live one has nothing left to read.
  assert.equal(
    waitOf({ readiness: 'ok', health: { status: 'live', at: NOW, since: NOW }, movedAt: NOW - LOG_READ_STALL_MS }),
    'ok'
  )
})

test('a live engine whose last combat read went unserved is not answering', () => {
  const live = { readiness: 'ok', health: { status: 'live', at: NOW, since: NOW } }
  const r = composeLogReadReport(
    facts({ ...live, lastCombatRead: { unserved: 'the engine did not answer in time', why: 'timedOut', at: NOW, since: NOW } })
  )
  assert.equal(r.wait, 'notAnswering')
  assert.equal(r.lastError, 'the engine did not answer in time')
  assert.equal(waitOf({ ...live, lastCombatRead: { unserved: null, why: null, at: NOW, since: null } }), 'ok')
})

// ---- 1b. the connection is reopened, and a reply can be too large (fork #9) --------------------

test('A CONNECTION THAT IS NOT UP IS `connecting` WHILE ITS KEEPER IS STILL TRYING', () => {
  // Every state the client can be in short of ready, with the keeper still at work.
  for (const connection of ['connecting', 'failed', 'closed', null]) {
    const r = composeLogReadReport(facts({ connection, link: link(), waitingSince: NOW }))
    assert.equal(r.wait, 'connecting', `${String(connection)} was called something else`)
    assert.equal(r.show, false, 'a reconnect in progress is not a failure yet')
  }
  // No keeper yet (the launch's client is still being made) is not a failure either.
  assert.equal(waitOf({ connection: null, link: null }), 'connecting')
  // It still shows once the wait has run long, like any other.
  const slow = composeLogReadReport(facts({ connection: 'failed', link: link(), waitingSince: NOW - LOG_READ_SLOW_MS }))
  assert.equal(slow.show, true)
  assert.equal(LOG_READ_WORDS[slow.wait], 'Connecting to the data engine.')
})

test('ONCE THE KEEPER GAVE UP IT IS `notConnected`, AND THE BOX SHOWS AT ONCE', () => {
  const r = composeLogReadReport(
    facts({ connection: 'failed', link: link({ tries: 5, gaveUp: true, nextAt: null }), waitingSince: NOW })
  )
  assert.equal(r.wait, 'notConnected')
  assert.equal(r.show, true)
  assert.equal(r.lastError, 'connect: ECONNREFUSED (gave up after 5 tries)')
  assert.equal(r.engine, 'running, connection failed, reading')
})

test('the try count is in the Engine row and in the Last error row', () => {
  const trying = composeLogReadReport(facts({ connection: 'failed', health: null, link: link() }))
  assert.equal(trying.engine, 'running, connecting (try 2 of 5)')
  assert.equal(trying.lastError, 'connect: ECONNREFUSED (try 2 of 5)')

  // The first connect of a launch is not a retry, and has no reason to give yet.
  const first = composeLogReadReport(
    facts({ connection: 'connecting', health: null, link: link({ tries: 0, lastReason: null, nextAt: null }) })
  )
  assert.equal(first.engine, 'running, connecting')
  assert.equal(first.lastError, null)

  // Given up for a reason a retry cannot change: no count to quote.
  const fatal = composeLogReadReport(
    facts({
      connection: 'failed',
      health: null,
      link: link({ tries: 0, gaveUp: true, lastReason: 'protocolMismatch: the engine speaks protocol 9, this build speaks 1' })
    })
  )
  assert.equal(fatal.lastError, 'connect: protocolMismatch: the engine speaks protocol 9, this build speaks 1 (gave up)')
})

test('the link-s reason is scrubbed like every other text from outside', () => {
  const r = composeLogReadReport(
    facts({
      connection: 'failed',
      link: link({ lastReason: `EPERM: could not open C:\\Users\\Jeremy\\AppData\\x \u2014 while reading ${LOG}` })
    })
  )
  assert.equal(r.lastError, 'connect: EPERM: could not open ~\\AppData\\x - while reading eqlog_Primitive_freeport.txt (try 2 of 5)')
  assert.doesNotMatch(JSON.stringify(r), /jeremy|Users/i)
})

test('with the connection up, an old connect error is not the last error any more', () => {
  const old = { step: 'connect', code: null, detail: 'ECONNREFUSED', at: NOW - 9_000, said: [] } as const
  const up = composeLogReadReport(facts({ error: old, link: link({ tries: 1, everConnected: true }) }))
  assert.equal(up.wait, 'reading')
  assert.equal(up.lastError, null)
  // Without a keeper to quote, the recorded error still speaks while the connection is down.
  assert.equal(composeLogReadReport(facts({ connection: 'failed', error: old })).lastError, 'connect: ECONNREFUSED')
})

const LIVE = { readiness: 'ok', health: { status: 'live', at: NOW, since: NOW } }
const TOO_LARGE_PHRASE = { unserved: 'the reply was too large to show', why: 'tooLarge', at: NOW, since: NOW }
const TIMED_OUT = { unserved: 'the engine did not answer in time', why: 'timedOut', at: NOW, since: NOW }

test('A FIGHT LIST TOO LARGE TO SHOW IS NAMED, even though the last combat read also went unserved', () => {
  const refused = { op: 'combat.snapshot', module: null, chars: 71.2 * MB, refused: true, limit: 64 * MB, at: NOW }
  const r = composeLogReadReport(facts({ ...LIVE, tooLarge: refused, lastCombatRead: TOO_LARGE_PHRASE, waitingSince: NOW }))
  assert.equal(r.wait, 'replyTooLarge')
  assert.equal(LOG_READ_WORDS[r.wait], 'The fight list is too large for the app to show.')
  assert.equal(r.show, true, 'waiting longer will not change it')
  assert.equal(r.lastError, 'read: the reply was 71.2 MB, over the 64.0 MB limit')

  const unshown = { ...refused, chars: 40.1 * MB, refused: false, limit: 32 * MB }
  assert.equal(
    composeLogReadReport(facts({ ...LIVE, tooLarge: unshown, lastCombatRead: TOO_LARGE_PHRASE })).lastError,
    'read: the reply was 40.1 MB, over the 32.0 MB the app can show'
  )
})

test('a reply too large is not the wait when it is not what the meter is missing', () => {
  const fights = { op: 'combat.snapshot', module: null, chars: 71.2 * MB, refused: true, limit: 64 * MB, at: NOW }
  const loot = { ...fights, op: 'module.snapshot', module: 'loot' }
  // The meter was served: the too-large fight list was main-s own (the archive asks for every fight).
  assert.equal(waitOf({ ...LIVE, tooLarge: fights, lastCombatRead: { unserved: null, why: null, at: NOW, since: null } }), 'ok')
  assert.equal(waitOf({ ...LIVE, tooLarge: fights }), 'ok')
  // A module-s reply is too large and the meter went unserved for another reason.
  const r = composeLogReadReport(facts({ ...LIVE, tooLarge: loot, lastCombatRead: TIMED_OUT }))
  assert.equal(r.wait, 'notAnswering')
  // The size is still on the Last error row: it is the newest thing that went wrong.
  assert.equal(r.lastError, 'read: the reply was 71.2 MB, over the 64.0 MB limit')
  // While the log is still being read, the read is the wait.
  assert.equal(waitOf({ tooLarge: fights, lastCombatRead: TOO_LARGE_PHRASE }), 'reading')
})

test('ANOTHER FIGHT LIST BEING TOO LARGE DOES NOT MAKE A SLOW METER READ `replyTooLarge`', () => {
  // The archive asks combat.snapshot for every fight: main reads its 40 MB reply, which is over
  // what a window may be handed, while the meter's own small read only missed its 2 s wait.
  const archive = { op: 'combat.snapshot', module: null, chars: 40.1 * MB, refused: false, limit: 32 * MB, at: NOW }
  const r = composeLogReadReport(facts({ ...LIVE, tooLarge: archive, lastCombatRead: TIMED_OUT, waitingSince: NOW }))
  assert.equal(r.wait, 'notAnswering', 'the meter was called too large because some other fight list was')
  assert.equal(r.show, false, 'a slow read is not shown at once')
  // Every other reason the meter can go unserved for is the same: only its own reply decides.
  for (const why of ['refused', 'guess', 'notLive', null]) {
    const read = { unserved: 'some other reason', why, at: NOW, since: NOW }
    assert.equal(waitOf({ ...LIVE, tooLarge: archive, lastCombatRead: read }), 'notAnswering')
  }
  // The meter-s own reply too large, with a module-s reply the newest one recorded since.
  const loot = { ...archive, op: 'module.snapshot', module: 'loot' }
  assert.equal(waitOf({ ...LIVE, tooLarge: loot, lastCombatRead: TOO_LARGE_PHRASE }), 'replyTooLarge')
  // A too-large verdict left over from the last read of the log is not this one-s.
  assert.equal(waitOf({ ...LIVE, tooLarge: null, lastCombatRead: TOO_LARGE_PHRASE }), 'notAnswering')
})

// ---- 2. when the box shows ---------------------------------------------------------------------

test('A HEALTHY READ SHOWS NOTHING UNDER 15 s AND THE BOX AT 15 s', () => {
  assert.equal(composeLogReadReport(facts({ waitingSince: NOW - LOG_READ_SLOW_MS + 1 })).show, false)
  assert.equal(composeLogReadReport(facts({ waitingSince: NOW - LOG_READ_SLOW_MS })).show, true)
  assert.equal(composeLogReadReport(facts({ waitingSince: null })).show, false, 'an unknown wait is not a long one')
})

test('A DEAD READ SHOWS AT ONCE', () => {
  const dead: Partial<LogReadFacts>[] = [
    { supervisor: 'absent' },
    { fault: { kind: 'unhealthy', attempts: 3, detail: null } },
    { error: { step: 'attach', code: null, detail: 'refused', at: NOW, said: [] } },
    { error: FOLD_ENDED, probe: { bytes: null, problem: 'missing', pendingMs: null } },
    { error: FOLD_ENDED, probe: { bytes: null, problem: 'unreadable', pendingMs: null } },
    { error: FOLD_ENDED },
    { movedAt: NOW - LOG_READ_STALL_MS }
  ]
  for (const over of dead) {
    const r = composeLogReadReport(facts({ ...over, waitingSince: NOW }))
    assert.equal(r.show, true, `${r.wait} waited for the slow clock`)
  }
})

test('an engine that is answering never asks for the box itself', () => {
  const r = composeLogReadReport(
    facts({ readiness: 'ok', health: { status: 'live', at: NOW, since: NOW }, waitingSince: NOW - 3_600_000 })
  )
  assert.equal(r.wait, 'ok')
  assert.equal(r.show, false)
})

// ---- 3. no path leaves with the user's name in it ----------------------------------------------

test('SCRUB: the log path becomes its base name in every spelling', () => {
  const spellings = [
    LOG,
    'C:/Users/Jeremy/EverQuest/Logs/eqlog_Primitive_freeport.txt',
    'c:\\users\\JEREMY\\everquest\\logs\\EQLOG_primitive_FREEPORT.TXT',
    'C:\\Users\\Jeremy/EverQuest\\Logs/eqlog_Primitive_freeport.txt'
  ]
  for (const spelling of spellings) {
    const out = scrubPaths(`the ingest of ${spelling} ended: Access is denied. (os error 5)`, LOG, HOME)
    assert.equal(out, 'the ingest of eqlog_Primitive_freeport.txt ended: Access is denied. (os error 5)')
  }
})

test('SCRUB: the home directory and any other user folder become ~', () => {
  assert.equal(scrubPaths('C:\\Users\\Jeremy\\AppData\\Roaming\\eq\\state', LOG, HOME), '~\\AppData\\Roaming\\eq\\state')
  assert.equal(scrubPaths('c:/users/jeremy/AppData/x', LOG, HOME), '~/AppData/x')
  assert.equal(scrubPaths('D:\\Users\\Someone Else\\x', LOG, HOME).includes('Someone'), false)
  assert.equal(scrubPaths('open /Users/jeremy/Library/x failed', null, ''), 'open ~/Library/x failed')
  for (const out of [
    scrubPaths(`a ${LOG} b C:\\Users\\Jeremy\\x c:/USERS/JEREMY/y`, LOG, HOME),
    scrubPaths('C:\\Users\\Jeremy\\Documents', null, '')
  ]) {
    assert.doesNotMatch(out, /jeremy/i)
  }
})

test('the report carries the base name only, and scrubs what the engine and the error said', () => {
  const r = composeLogReadReport(
    facts({
      health: { status: 'idle', at: NOW, since: NOW },
      error: {
        step: 'fold',
        code: null,
        detail: `could not read ${LOG}`,
        at: NOW,
        said: [`[engined] the ingest of ${LOG} ended: Access is denied.`, 'a line with \u2014 a long dash']
      },
      probe: { bytes: null, problem: 'unreadable', pendingMs: null }
    })
  )
  assert.equal(r.logFile, 'eqlog_Primitive_freeport.txt')
  assert.equal(r.lastError, 'read: could not read eqlog_Primitive_freeport.txt')
  assert.deepEqual(r.engineSaid, [
    '[engined] the ingest of eqlog_Primitive_freeport.txt ended: Access is denied.',
    'a line with - a long dash'
  ])
  assert.doesNotMatch(JSON.stringify(r), /jeremy|Users/i)
})

test('a launch fault says its last word as the last error, scrubbed', () => {
  const r = composeLogReadReport(
    facts({
      supervisor: 'backoff',
      fault: { kind: 'spawn-failed', attempts: 3, detail: 'C:\\Users\\Jeremy\\AppData\\Local\\eq\\engined.exe: EPERM' }
    })
  )
  assert.equal(r.wait, 'engineFailing')
  assert.equal(r.lastError, '~\\AppData\\Local\\eq\\engined.exe: EPERM')
})

// ---- 4. the rows -------------------------------------------------------------------------------

function row(lines: readonly { label: string; value: string }[], label: string): string | undefined {
  return lines.find((line) => line.label === label)?.value
}

test('THE ROWS OF A SLOW, HEALTHY READ', () => {
  const lines = logReadLines(composeLogReadReport(facts({ waitingSince: NOW - 42_000 })), NOW)
  assert.deepEqual(lines, [
    { label: 'Waiting on', value: 'Still reading your log.' },
    { label: 'Try', value: 'Nothing to do. Large logs take a while.' },
    { label: 'Log', value: 'eqlog_Primitive_freeport.txt, 412.3 MB' },
    { label: 'Read so far', value: '148.8 MB (36%), 1,571,003 events' },
    { label: 'Engine', value: 'running, connected, reading' },
    { label: 'Last error', value: 'none' },
    { label: 'Waiting', value: '42s' },
    { label: 'Version', value: '1.0.0-test.52' }
  ])
})

test('what was never measured is left out, never printed as 0', () => {
  const unmeasured = { health: null, fold: null, lastOffset: null, movedAt: null, waitingSince: null }
  const lines = logReadLines(
    composeLogReadReport(facts({ supervisor: 'starting', connection: null, ...unmeasured })),
    NOW
  )
  assert.equal(row(lines, 'Read so far'), undefined)
  assert.equal(row(lines, 'Waiting'), undefined)
  assert.equal(row(lines, 'Log'), 'eqlog_Primitive_freeport.txt', 'a size nobody stated is not a size')
  assert.equal(row(lines, 'Engine'), 'starting')
  for (const line of lines) assert.doesNotMatch(line.value, /\b0 B\b|\b0%|\b0 events/)
})

test('the size falls back to what the engine last stated, then to what main measured', () => {
  const base = { fold: null, health: { status: 'idle', at: NOW, since: NOW } }
  assert.equal(composeLogReadReport(facts({ ...base, logSize: 7 * MB })).logBytes, 7 * MB)
  assert.equal(
    composeLogReadReport(facts({ ...base, probe: { bytes: 9 * MB, problem: null, pendingMs: null } })).logBytes,
    9 * MB
  )
})

test('the Waiting row is counted by the reader-s own clock from when the wait began', () => {
  const r = composeLogReadReport(facts({ waitingSince: NOW - 42_000 }))
  assert.equal(r.waitingSince, NOW - 42_000)
  // No push is needed for it to move: the same report read a minute later.
  assert.equal(row(logReadLines(r, NOW + 60_000), 'Waiting'), '2m')
  // A clock a little behind main's never prints a negative wait.
  assert.equal(row(logReadLines(r, NOW - 50_000), 'Waiting'), '1s')
})
